/**
 * D-3 비고(진실의 출처) + 학교 신청자 관리 + xlsx 견적서 합성.
 *
 * 규칙:
 *   - items 의 product/quantity 는 비고가 진실의 출처
 *   - period 는 비고가 우선, 없으면 xlsx 의 매칭 항목으로 보강
 *   - user 는 학교 담당자명을 모든 행에 채움 (xlsx 에 user 컬럼이 없으므로)
 *   - applicantName/Phone 는 학교 신청자 관리 CSV 에서
 *   - quoteDate(YMD/YYMMDD) 는 xlsx 시트의 R5C3
 *   - 비고 항목 수 ≠ xlsx 항목 수 → row.fieldWarnings 에 불일치 경고
 *   - 비고 product 가 xlsx 어떤 행과도 매칭 안 되면 item.warnings push + row.hasEmpty=true
 */

import { findFullSchoolName, normalizeSchoolName } from "@/lib/school/normalize";
import {
  parseQuoteDate,
  type QuoteWorkbookResult,
} from "@/lib/xlsx/parseQuoteWorkbook";
import type { SchoolApplicantsResult } from "@/lib/csv/parseSchoolApplicants";
import type { SwRequestRow } from "@/lib/sw/types";
import type { SwRequestSettings } from "@/lib/firebase/firestore";

function loosenProduct(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]【】.\-_/]/g, "");
}

/**
 * 사용기간 텍스트의 끝에 붙은 "(N개월)" / "(N년)" / "(N주)" / "(N일)" 같은
 * 괄호 토큰을 다음 줄로 내림. 셀 안에서 임의 위치에 자동 줄바꿈되는 걸 방지.
 *   "25.09.25 - 26.03.24(6개월)" → "25.09.25 - 26.03.24\n(6개월)"
 *   "6개월" / "25.11.5 ~ 25.12.4" → 그대로
 */
function formatPeriodText(s: string): string {
  if (!s) return s;
  return s.replace(/\s*(\([^()]*?(?:개월|년|주|일)[^()]*?\))\s*$/, "\n$1");
}

export function enrichSwRequestRows(
  rows: SwRequestRow[],
  applicants: SchoolApplicantsResult,
  quotes: QuoteWorkbookResult,
  settings: SwRequestSettings,
): SwRequestRow[] {
  // 학교 풀네임 후보 풀: 신청자 CSV + xlsx 시트명 (중복은 정규화로 흡수)
  const fullPool: string[] = [];
  const seenNorm = new Set<string>();
  for (const fn of [...applicants.fullNames, ...quotes.fullNames]) {
    const norm = normalizeSchoolName(fn);
    if (norm && !seenNorm.has(norm)) {
      seenNorm.add(norm);
      fullPool.push(fn);
    }
  }

  return rows.map((row) => {
    const fieldWarnings = [...row.fieldWarnings];

    // 1. 학교 매칭
    let schoolName = row.schoolRaw;
    let matched = false;
    if (row.schoolRaw) {
      const full = findFullSchoolName(row.schoolRaw, fullPool);
      if (full) {
        schoolName = full;
        matched = true;
      } else {
        fieldWarnings.push(`학교명 매칭 실패: "${row.schoolRaw}"`);
      }
    }
    const norm = normalizeSchoolName(schoolName);

    // 2. 신청자 정보
    const appl = norm ? applicants.byNorm.get(norm) : undefined;
    const applicantName = appl?.applicantName ?? "";
    const applicantPhone = appl?.applicantPhone ?? "";
    if (matched && !appl) {
      fieldWarnings.push("학교 신청자 관리 CSV 에서 학교 미발견");
    } else if (matched && appl) {
      if (!applicantName) fieldWarnings.push("담당자명 누락");
      if (!applicantPhone) fieldWarnings.push("휴대폰 누락");
    }

    // 3. xlsx 견적서 매칭
    const quote = norm ? quotes.byNorm.get(norm) : undefined;
    const quoteDateRaw = quote?.quoteDateRaw ?? "";
    const { y, m, d, yymmdd } = parseQuoteDate(quoteDateRaw);

    if (matched && !quote) {
      fieldWarnings.push("견적서 시트 미발견");
    } else if (matched && quote && !yymmdd) {
      fieldWarnings.push("견적일자 파싱 실패");
    }

    // 4. items 보강 (비고가 진실의 출처, 1라이선스/행 단위로 unfold 됨)
    //    - user: xlsx 시트 우측 사용자 명단의 i번째 (없으면 담당자명 fallback)
    //    - period: 명단 U열 (실제 구독일자/기간) 우선 → 비고 M개월 fallback
    const items = row.items.map((it, i) => {
      const itemWarnings: string[] = [...it.warnings];
      const sheetUser = quote?.users[i];

      const user = it.user || sheetUser?.name || applicantName;

      let period = it.period;
      if (sheetUser && quote?.periodCellIsDate && sheetUser.periodCell) {
        period = sheetUser.periodCell;
      } else if (!period) {
        // 명단에 기간 없고 비고에도 없으면 좌측 견적서 표에서 product 매칭으로 보강
        if (quote) {
          const target = loosenProduct(it.product);
          const found =
            quote.items.find((qi) => loosenProduct(qi.product) === target) ||
            quote.items.find((qi) => {
              const a = loosenProduct(qi.product);
              return a.includes(target) || target.includes(a);
            });
          if (found?.period) period = found.period;
        }
      }

      // xlsx 시트는 있지만 i번째 사용자가 없는 경우 경고
      if (matched && quote && !sheetUser) {
        itemWarnings.push("xlsx 명단에 해당 순번 사용자 없음");
      }

      return {
        ...it,
        user,
        period: formatPeriodText(period),
        warnings: itemWarnings,
      };
    });

    // 5. 명단 수 vs 펼친 비고 항목 수 불일치 체크
    if (matched && quote && items.length !== quote.users.length) {
      fieldWarnings.push(
        `비고 펼침 ${items.length}건 vs 명단 ${quote.users.length}명 불일치`,
      );
    }

    const hasEmpty =
      !schoolName ||
      !applicantName ||
      items.length === 0 ||
      items.some((x) => !x.product || !x.quantity || x.warnings.length > 0);

    return {
      ...row,
      schoolName,
      applicantName,
      applicantPhone,
      applicantTarget: row.applicantTarget || settings.defaultTarget,
      quoteDateRaw,
      quoteY: y,
      quoteM: m,
      quoteD: d,
      quoteYymmdd: yymmdd,
      items,
      hasEmpty,
      fieldWarnings,
    };
  });
}

/**
 * 파일명 생성:
 *   {evidenceNo}_6. 소프트웨어 활용 희망 요청서_{학교}_{YYMMDD}.pdf
 * 슬래시는 전각 ／ 로 변환.
 */
export function makeSwRequestFilename(row: SwRequestRow): string {
  const safe = (s: string) => s.replace(/\//g, "／");
  const ev = row.evidenceNo || "미증빙";
  const school = safe(row.schoolName || "학교미상");
  const date = row.quoteYymmdd || "날짜미상";
  return `${ev}_6. 소프트웨어 활용 희망 요청서_${school}_${date}.pdf`;
}
