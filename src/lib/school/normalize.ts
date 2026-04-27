/**
 * 학교명 정규화 + 매칭.
 * 비고("인천갈월초"), xlsx 시트("인천갈월초등학교"), 신청자 관리 CSV("인천갈월초등학교")
 * 사이의 표기 변형을 흡수해서 동일 학교를 찾는다.
 */

/** 공백·괄호·가운뎃점 등 잡문자 제거 */
function stripDecor(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/[·・･ㆍ]/g, "")
    .replace(/[()（）\[\]【】]/g, "")
    // 학교명에 이런 후행 토큰이 붙어있을 수 있음 (예: "엄정초등학교(충주)" → 괄호 제거 후 "엄정초등학교충주")
    // 단순 학교명 추출을 위해 접미 식별자 제거는 하지 않는다 (후속 매칭에서 prefix로 흡수)
    .replace(/[，,]/g, "")
    .trim();
}

/** 약칭 → 풀이름 (마지막 토큰 기준) */
function expandSuffix(s: string): string {
  // "여중$" → "여자중학교"
  if (/여중$/.test(s)) return s.replace(/여중$/, "여자중학교");
  if (/여고$/.test(s)) return s.replace(/여고$/, "여자고등학교");
  if (/남중$/.test(s)) return s.replace(/남중$/, "남자중학교");
  if (/남고$/.test(s)) return s.replace(/남고$/, "남자고등학교");
  // 일반 약칭
  if (/초$/.test(s)) return s.replace(/초$/, "초등학교");
  if (/중$/.test(s)) return s.replace(/중$/, "중학교");
  if (/고$/.test(s)) return s.replace(/고$/, "고등학교");
  return s;
}

/** 풀이름 후보 정규형 */
export function normalizeSchoolName(raw: string): string {
  if (!raw) return "";
  const stripped = stripDecor(raw);
  return expandSuffix(stripped);
}

/** 약형 후보 (앞부분 매칭용) — "초등학교"/"중학교"/"고등학교" 접미 제거 */
function shortenSuffix(s: string): string {
  return s
    .replace(/여자중학교$/, "여중")
    .replace(/여자고등학교$/, "여고")
    .replace(/남자중학교$/, "남중")
    .replace(/남자고등학교$/, "남고")
    .replace(/초등학교$/, "초")
    .replace(/중학교$/, "중")
    .replace(/고등학교$/, "고");
}

/**
 * candidates 중에서 raw 와 매칭되는 학교 풀네임을 찾는다.
 * 1) 정규화 정확 일치
 * 2) substring 매칭 (양방향) — "창영초"(→정규화 "창영초등학교") 가
 *    "인천창영초등학교" 의 substring 이면 매칭. 핵심 토큰 길이 ≥ 3 글자 가드.
 * 3) 단축형 substring (양방향) — short("창영초등학교")="창영초" 가
 *    short("인천창영초등학교")="인천창영초" 의 substring 이면 매칭.
 * 동률(여러 후보)이면 가장 짧은 candidate 선택 (가장 specific).
 */
export function findFullSchoolName(
  raw: string,
  candidates: string[],
): string | null {
  const normRaw = normalizeSchoolName(raw);
  if (!normRaw) return null;
  const normCands = candidates.map((c) => ({ raw: c, norm: normalizeSchoolName(c) }));

  // 1) exact
  const exact = normCands.find((c) => c.norm === normRaw);
  if (exact) return exact.raw;

  // 2) substring (full) — raw가 cand의 substring 또는 그 반대
  const MIN_LEN = 3;
  if (normRaw.length >= MIN_LEN) {
    const sub = normCands
      .filter((c) => c.norm.includes(normRaw) || normRaw.includes(c.norm))
      .sort((a, b) => a.norm.length - b.norm.length);
    if (sub.length > 0) return sub[0].raw;
  }

  // 3) substring (short form) — "창영초" ⊂ "인천창영초"
  const shortRaw = shortenSuffix(normRaw);
  if (shortRaw.length >= MIN_LEN) {
    const sub = normCands
      .map((c) => ({ raw: c.raw, norm: c.norm, short: shortenSuffix(c.norm) }))
      .filter((c) => c.short.includes(shortRaw) || shortRaw.includes(c.short))
      .sort((a, b) => a.norm.length - b.norm.length);
    if (sub.length > 0) return sub[0].raw;
  }

  return null;
}
