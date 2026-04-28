/**
 * 통합 CSV (소프트웨어 활용 요청서 기초자료 confirmed) 파서.
 *
 * 1행 = 1라이선스(사용자) 단위. 같은 (증빙번호, 학교) 그룹이 한 PDF에 묶인다.
 *
 * 예상 컬럼 (헤더 자동 매핑):
 *   신청일자 (견적일자) | 학교 | 신청자 | 신청자 연락처 | 이름 | 신청 품목 | 사용기간 | 수량 | 증빙번호 | 지급방법
 *
 * 그룹 내 신청자/연락처/신청일자가 다르면 fieldWarnings 에 기록.
 * 신청일자가 여러 개면 quoteDateOptions 에 모두 보존 → 편집 다이얼로그에서 드롭다운.
 */

import Papa from "papaparse";
import { parseQuoteDate } from "@/lib/xlsx/parseQuoteWorkbook";
import { groupItems } from "@/lib/sw/merge";
import type { SwLineItem, SwRequestRow } from "@/lib/sw/types";

type ColMap = {
  date: number;
  school: number;
  applicant: number;
  phone: number;
  user: number;
  product: number;
  period: number;
  quantity: number;
  evidence: number;
};

const HEADER_ALIASES: Record<keyof ColMap, string[]> = {
  date: ["신청일자", "견적일자"],
  school: ["학교"],
  applicant: ["신청자"],
  phone: ["연락처", "신청자 연락처"],
  user: ["이름", "사용자"],
  product: ["신청 품목", "품목"],
  period: ["사용기간"],
  quantity: ["수량"],
  evidence: ["증빙번호"],
};

function squish(s: string) {
  return s.replace(/\s+/g, "").toLowerCase();
}

function findColIndex(headers: string[], aliases: string[]): number {
  // 정확/부분 일치 (공백/대소문자 무시)
  const normHeaders = headers.map((h) => squish(h ?? ""));
  for (const a of aliases) {
    const na = squish(a);
    // 정확 매칭 먼저
    const exact = normHeaders.findIndex((h) => h === na);
    if (exact >= 0) return exact;
    // 부분 매칭
    const partial = normHeaders.findIndex((h) => h.includes(na));
    if (partial >= 0) return partial;
  }
  return -1;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const r = rows[i] ?? [];
    const has학교 = r.some((c) => (c ?? "").trim() === "학교");
    const has증빙 = r.some((c) => (c ?? "").includes("증빙번호"));
    if (has학교 && has증빙) return i;
  }
  return -1;
}

export type SwConfirmedParseResult = {
  rows: SwRequestRow[];
  /** 원본 데이터 행 수 (디버그/표시용) */
  totalSourceRows: number;
};

export function parseSwConfirmedCsv(text: string): SwConfirmedParseResult {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows: string[][] = (parsed.data as unknown as string[][]).filter(
    (r): r is string[] => Array.isArray(r),
  );
  if (rows.length === 0) return { rows: [], totalSourceRows: 0 };

  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) return { rows: [], totalSourceRows: 0 };

  const headers = rows[headerIdx];
  const c: ColMap = {
    date: findColIndex(headers, HEADER_ALIASES.date),
    school: findColIndex(headers, HEADER_ALIASES.school),
    applicant: findColIndex(headers, HEADER_ALIASES.applicant),
    phone: findColIndex(headers, HEADER_ALIASES.phone),
    user: findColIndex(headers, HEADER_ALIASES.user),
    product: findColIndex(headers, HEADER_ALIASES.product),
    period: findColIndex(headers, HEADER_ALIASES.period),
    quantity: findColIndex(headers, HEADER_ALIASES.quantity),
    evidence: findColIndex(headers, HEADER_ALIASES.evidence),
  };
  if (c.school < 0 || c.evidence < 0) {
    return { rows: [], totalSourceRows: 0 };
  }

  type Group = {
    evidenceNo: string;
    schoolName: string;
    applicantNames: string[];
    applicantPhones: string[];
    quoteDates: string[];
    items: SwLineItem[];
  };

  const order: string[] = [];
  const groups = new Map<string, Group>();
  let totalSourceRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const ev = (r[c.evidence] ?? "").trim();
    const sch = (r[c.school] ?? "").trim();
    if (!ev && !sch) continue;
    totalSourceRows++;

    const key = `${ev}|${sch}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        evidenceNo: ev,
        schoolName: sch,
        applicantNames: [],
        applicantPhones: [],
        quoteDates: [],
        items: [],
      };
      groups.set(key, g);
      order.push(key);
    }
    const appl = c.applicant >= 0 ? (r[c.applicant] ?? "").trim() : "";
    const phone = c.phone >= 0 ? (r[c.phone] ?? "").trim() : "";
    const date = c.date >= 0 ? (r[c.date] ?? "").trim() : "";
    if (appl && !g.applicantNames.includes(appl)) g.applicantNames.push(appl);
    if (phone && !g.applicantPhones.includes(phone)) g.applicantPhones.push(phone);
    if (date && !g.quoteDates.includes(date)) g.quoteDates.push(date);

    const user = c.user >= 0 ? (r[c.user] ?? "").trim() : "";
    const product = c.product >= 0 ? (r[c.product] ?? "").trim() : "";
    const period = c.period >= 0 ? (r[c.period] ?? "").trim() : "";
    const qtyRaw = c.quantity >= 0 ? (r[c.quantity] ?? "").trim() : "";
    const qtyNum = parseInt(qtyRaw.replace(/[^\d]/g, ""), 10);
    const quantity = Number.isFinite(qtyNum) && qtyNum > 0 ? `${qtyNum}개` : "1개";

    g.items.push({
      user,
      product,
      quantity,
      period,
      warnings: [],
    });
  }

  const out: SwRequestRow[] = [];
  let rowIndex = 0;
  for (const key of order) {
    const g = groups.get(key)!;
    const fieldWarnings: string[] = [];

    if (g.applicantNames.length > 1) {
      fieldWarnings.push(`신청자 불일치: ${g.applicantNames.join(", ")}`);
    }
    if (g.applicantPhones.length > 1) {
      fieldWarnings.push(`연락처 불일치: ${g.applicantPhones.join(", ")}`);
    }
    if (g.quoteDates.length > 1) {
      fieldWarnings.push(
        `신청일자 ${g.quoteDates.length}종 — 편집에서 선택`,
      );
    }

    const applicantName = g.applicantNames[0] ?? "";
    const applicantPhone = g.applicantPhones[0] ?? "";
    const dateRaw = g.quoteDates[0] ?? "";
    const ymd = parseQuoteDate(dateRaw);

    if (!g.schoolName) fieldWarnings.push("학교명 없음");
    if (!applicantName) fieldWarnings.push("신청자 없음");
    if (!applicantPhone) fieldWarnings.push("연락처 없음");
    if (!dateRaw) fieldWarnings.push("신청일자 없음");
    else if (!ymd.yymmdd) fieldWarnings.push("신청일자 파싱 실패");
    if (!g.evidenceNo) fieldWarnings.push("증빙번호 없음");
    if (g.items.length === 0) fieldWarnings.push("항목 없음");
    else if (g.items.some((it) => !it.product)) fieldWarnings.push("일부 품목 누락");
    else if (g.items.some((it) => !it.period)) fieldWarnings.push("일부 사용기간 누락");
    else if (g.items.some((it) => !it.user)) fieldWarnings.push("일부 사용자 누락");

    const grouped = groupItems(g.items);
    const hasEmpty =
      !g.schoolName ||
      !applicantName ||
      !g.evidenceNo ||
      grouped.length === 0 ||
      grouped.some((x) => !x.product || !x.user);

    out.push({
      rowIndex: rowIndex++,
      evidenceNo: g.evidenceNo,
      schoolRaw: g.schoolName,
      schoolName: g.schoolName,
      applicantName,
      applicantPhone,
      applicantTarget: "", // sw-request-tool 에서 settings.defaultTarget 으로 후처리
      quoteDateRaw: dateRaw,
      quoteY: ymd.y,
      quoteM: ymd.m,
      quoteD: ymd.d,
      quoteYymmdd: ymd.yymmdd,
      items: grouped,
      hasEmpty,
      fieldWarnings,
      quoteDateOptions: g.quoteDates.length > 0 ? g.quoteDates : undefined,
    });
  }

  return { rows: out, totalSourceRows };
}
