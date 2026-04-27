import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { getFirebaseDb } from "./config";

/* ---------- Admin emails ---------- */

export async function getAdminEmails(): Promise<string[]> {
  const snap = await getDocs(collection(getFirebaseDb(), "admin_emails"));
  return snap.docs.map((d) => d.id);
}

export async function isAdmin(email: string): Promise<boolean> {
  const snap = await getDoc(doc(getFirebaseDb(), "admin_emails", email));
  return snap.exists();
}

export async function addAdminEmail(
  email: string,
  addedBy: string
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "admin_emails", email), {
    email,
    addedAt: serverTimestamp(),
    addedBy,
  });
}

export async function removeAdminEmail(email: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), "admin_emails", email));
}

/* ---------- Approval settings ---------- */

export type GroupSettings = {
  approver1Label: string;
  approver2Label: string;
  approver1ImageUrl: string;
  approver2ImageUrl: string;
  logoImageUrl: string;
};

export type ApprovalSettings = {
  groups: Record<string, GroupSettings>;
};

const DEFAULT_SETTINGS: ApprovalSettings = {
  groups: {
    ipf: { approver1Label: "팀장", approver2Label: "본부장", approver1ImageUrl: "", approver2ImageUrl: "", logoImageUrl: "" },
    dimi: { approver1Label: "사무국장", approver2Label: "대표이사", approver1ImageUrl: "", approver2ImageUrl: "", logoImageUrl: "" },
  },
};

export async function getApprovalSettings(): Promise<ApprovalSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "approval"));
  if (!snap.exists()) return DEFAULT_SETTINGS;
  const data = snap.data() as DocumentData;

  const rawGroups = data.groups ?? {};
  const mergedGroups: Record<string, GroupSettings> = {};
  for (const [gid, def] of Object.entries(DEFAULT_SETTINGS.groups)) {
    const saved = rawGroups[gid] ?? {};
    mergedGroups[gid] = { ...def, ...saved };
  }

  // Migrate: if old top-level approver1/approver2 imageUrl exists but groups don't have images,
  // copy them to all groups that have empty images
  const oldA1Url = (data.approver1 as Record<string, unknown>)?.imageUrl as string | undefined;
  const oldA2Url = (data.approver2 as Record<string, unknown>)?.imageUrl as string | undefined;
  for (const g of Object.values(mergedGroups)) {
    if (!g.approver1ImageUrl && oldA1Url) g.approver1ImageUrl = oldA1Url;
    if (!g.approver2ImageUrl && oldA2Url) g.approver2ImageUrl = oldA2Url;
  }

  return { groups: mergedGroups };
}

export async function saveApprovalSettings(
  settings: ApprovalSettings
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "approval"), settings, {
    merge: true,
  });
}

/* ---------- PDF layout settings ---------- */

export type PdfLayoutSettings = {
  page: {
    fontFamily: string;
    baseFontSize: number;
    baseLineHeight: number;
    marginMm: number;
  };
  border: {
    width: number;
    color: string;
  };
  title: {
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    marginBottom: number;
  };
  approval: {
    tableWidth: number;
    labelColWidth: number;
    labelColMinHeight: number;
    labelFontSize: number;
    labelCharGap: number;
    headerMinHeight: number;
    headerFontSize: number;
    headerPaddingV: number;
    headerPaddingH: number;
    signMinHeight: number;
    signPadding: number;
    drafterFontSize: number;
    placeholderFontSize: number;
    placeholderColor: string;
    signImageMaxHeight: number;
  };
  dataTable: {
    labelWidth: number;
    rowMinHeight: number;
    labelBgColor: string;
    labelPaddingV: number;
    labelPaddingH: number;
    labelFontSize: number;
    labelFontWeight: number;
    valuePaddingV: number;
    valuePaddingH: number;
    valueFontSize: number;
  };
  intro: {
    fontSize: number;
    marginTop: number;
    marginBottom: number;
  };
  purpose: {
    minHeight: number;
    padding: number;
    fontSize: number;
    lineHeight: number;
  };
  /** 소요경비 표 — 출장신청서 PDF 하단 추가 표 */
  expense: {
    /** 표 마진 (intro 위 영역에서) */
    marginTop: number;
    /** 좌측 "소요경비" 병합 셀 폭 */
    titleColWidth: number;
    /** 좌측 셀 글자 폰트 사이즈 */
    titleFontSize: number;
    /** 좌측 셀 글자 자간 */
    titleLetterSpacing: number;
    /** 좌측 셀 라인 간격 */
    titleLineHeight: number;
    /** "구분" 컬럼 폭 */
    categoryColWidth: number;
    /** "합계" 컬럼 폭 */
    totalColWidth: number;
    /** 표 헤더(구분/내용/합계) 행 높이 */
    headerRowHeight: number;
    /** 데이터 행 높이 */
    rowHeight: number;
    /** 헤더 폰트 사이즈 */
    headerFontSize: number;
    /** 본문 폰트 사이즈 */
    cellFontSize: number;
    /** 본문 패딩 */
    cellPaddingV: number;
    cellPaddingH: number;
    /** 헤더 / 좌측 셀 배경색 */
    labelBgColor: string;
    /** 검토 필요 강조 색상 (기타 / 비정상) */
    reviewColor: string;
  };
  logo: {
    enabled: boolean;
    width: number;
    height: number;
    marginRight: number;
    /** 좌우 오프셋(pt). 양수면 오른쪽으로 이동 */
    offsetX: number;
    /** 상하 오프셋(pt). 양수면 아래로 이동 */
    offsetY: number;
  };
  footer: {
    fontSize: number;
    fontWeight: number;
    marginTop: number;
  };
  placeholders: {
    emptyField: string;
    emptyFieldColor: string;
    dateFallback: string;
    dateFallbackColor: string;
    dateInvalid: string;
    dateInvalidColor: string;
    drafterEmpty: string;
    drafterEmptyColor: string;
    signEmpty: string;
    signEmptyColor: string;
  };
};

export const DEFAULT_PDF_LAYOUT: PdfLayoutSettings = {
  page: { fontFamily: "Pretendard", baseFontSize: 9.5, baseLineHeight: 1.4, marginMm: 20 },
  border: { width: 0.75, color: "#000000" },
  title: { fontSize: 25, fontWeight: 700, lineHeight: 1.15, marginBottom: 42 },
  approval: {
    tableWidth: 256,
    labelColWidth: 32,
    labelColMinHeight: 60,
    labelFontSize: 10,
    labelCharGap: 2,
    headerMinHeight: 30,
    headerFontSize: 9,
    headerPaddingV: 3,
    headerPaddingH: 2,
    signMinHeight: 33,
    signPadding: 2,
    drafterFontSize: 12,
    placeholderFontSize: 7.5,
    placeholderColor: "#333333",
    signImageMaxHeight: 23,
  },
  dataTable: {
    labelWidth: 100,
    rowMinHeight: 32,
    labelBgColor: "#E6E6E6",
    labelPaddingV: 5,
    labelPaddingH: 3,
    labelFontSize: 11,
    labelFontWeight: 500,
    valuePaddingV: 5,
    valuePaddingH: 7,
    valueFontSize: 11,
  },
  intro: { fontSize: 11, marginTop: 42, marginBottom: 42 },
  purpose: { minHeight: 112, padding: 6, fontSize: 11, lineHeight: 1.4 },
  expense: {
    marginTop: 24,
    titleColWidth: 32,
    titleFontSize: 10,
    titleLetterSpacing: 2,
    titleLineHeight: 1.2,
    categoryColWidth: 60,
    totalColWidth: 80,
    headerRowHeight: 24,
    rowHeight: 26,
    headerFontSize: 10,
    cellFontSize: 10,
    cellPaddingV: 4,
    cellPaddingH: 6,
    labelBgColor: "#E6E6E6",
    reviewColor: "#B45309",
  },
  logo: { enabled: true, width: 60, height: 60, marginRight: 8, offsetX: 0, offsetY: 0 },
  footer: { fontSize: 15, fontWeight: 700, marginTop: 42 },
  placeholders: {
    emptyField: "—",
    emptyFieldColor: "#DC2626",
    dateFallback: "YYYY. MM. DD",
    dateFallbackColor: "#DC2626",
    dateInvalid: "날짜 확인 불가",
    dateInvalidColor: "#DC2626",
    drafterEmpty: "(—)",
    drafterEmptyColor: "#DC2626",
    signEmpty: "(서명)",
    signEmptyColor: "#DC2626",
  },
};

function deepMerge<T extends Record<string, unknown>>(defaults: T, saved: Record<string, unknown>): T {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const defVal = defaults[key];
    const savedVal = saved[key];
    if (savedVal === undefined) continue;
    if (defVal !== null && typeof defVal === "object" && !Array.isArray(defVal) && typeof savedVal === "object" && savedVal !== null) {
      (result as Record<string, unknown>)[key] = deepMerge(defVal as Record<string, unknown>, savedVal as Record<string, unknown>);
    } else {
      (result as Record<string, unknown>)[key] = savedVal;
    }
  }
  return result;
}

export async function getPdfLayoutSettings(): Promise<PdfLayoutSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "pdfLayout"));
  if (!snap.exists()) return DEFAULT_PDF_LAYOUT;
  return deepMerge(DEFAULT_PDF_LAYOUT, snap.data() as Record<string, unknown>);
}

export async function savePdfLayoutSettings(
  settings: PdfLayoutSettings
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "pdfLayout"), settings);
}

/* ---------- 소명서 settings ---------- */

export const SEOMOK_LIST = [
  "인건비",
  "사업수당",
  "사업시설장비비",
  "사업활동비",
  "기타운영비",
  "일반관리비(간접비)",
] as const;

export type Seomok = (typeof SEOMOK_LIST)[number];

export const SUB_SEOMOK_LIST = [
  "내부인건비",
  "외부인건비",
  "사업수당",
  "장비/시설임차비",
  "외부 전문가 기술 활용비",
  "회의비",
  "소프트웨어활용비",
  "출장비",
  "인쇄/복사/슬라이드 제작비",
  "제세공과/수수료/공공요금",
  "우편요금/택배비",
  "일용직활용비",
  "기타경비",
  "일반관리비(간접비)",
] as const;

export type SubSeomok = (typeof SUB_SEOMOK_LIST)[number];

export type SomyeongSettings = {
  name: string;
  orgPosition: string;
  phone: string;
  birthdate: string;
  address: string;
  date: string;
  writerName: string;
  signatureImageUrl: string;
  recipient: string;
  seomokN: Record<string, number>;
};

export const DEFAULT_SOMYEONG_SETTINGS: SomyeongSettings = {
  name: "",
  orgPosition: "",
  phone: "",
  birthdate: "",
  address: "",
  date: "",
  writerName: "",
  signatureImageUrl: "",
  recipient: "한국과학창의재단 귀하",
  seomokN: Object.fromEntries(SEOMOK_LIST.map((s) => [s, 0])),
};

export async function getSomyeongSettings(): Promise<SomyeongSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "somyeong"));
  if (!snap.exists()) return DEFAULT_SOMYEONG_SETTINGS;
  const data = snap.data() as Record<string, unknown>;
  return {
    ...DEFAULT_SOMYEONG_SETTINGS,
    ...(data as Partial<SomyeongSettings>),
    seomokN: {
      ...DEFAULT_SOMYEONG_SETTINGS.seomokN,
      ...((data.seomokN as Record<string, number>) ?? {}),
    },
  };
}

export async function saveSomyeongSettings(
  settings: SomyeongSettings
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "somyeong"), settings);
}

/* ---------- 소명서 layout settings ---------- */

export type SomyeongLayoutSettings = {
  page: {
    fontFamily: string;
    baseFontSize: number;
    baseLineHeight: number;
    marginMm: number;
  };
  border: {
    width: number;
    color: string;
  };
  title: {
    fontSize: number;
    fontWeight: number;
    textAlign: "left" | "center" | "right";
    marginBottom: number;
  };
  sectionHeader: {
    fontSize: number;
    fontWeight: number;
    minHeight: number;
    bgColor: string;
  };
  infoTable: {
    labelWidth: number;
    rowMinHeight: number;
    labelBgColor: string;
    labelPaddingV: number;
    labelPaddingH: number;
    labelFontSize: number;
    labelFontWeight: number;
    valuePaddingV: number;
    valuePaddingH: number;
    valueFontSize: number;
    marginBottom: number;
  };
  detailSection: {
    paddingV: number;
    paddingH: number;
    fontSize: number;
    lineHeight: number;
    marginBottom: number;
  };
  divider: {
    marginTop: number;
    marginBottom: number;
  };
  attachSection: {
    titleFontSize: number;
    titleFontWeight: number;
    titleMarginBottom: number;
    fontSize: number;
    lineHeight: number;
    marginBottom: number;
  };
  closingText: {
    fontSize: number;
    textAlign: "left" | "center" | "right";
    marginTop: number;
    marginBottom: number;
  };
  dateText: {
    fontSize: number;
    textAlign: "left" | "center" | "right";
    marginBottom: number;
  };
  signature: {
    fontSize: number;
    signImageMaxHeight: number;
    marginBottom: number;
  };
  recipient: {
    fontSize: number;
    fontWeight: number;
    textAlign: "left" | "center" | "right";
  };
  placeholders: {
    emptyField: string;
    emptyFieldColor: string;
    signEmpty: string;
    signEmptyColor: string;
  };
};

export const DEFAULT_SOMYEONG_LAYOUT: SomyeongLayoutSettings = {
  page: { fontFamily: "Pretendard", baseFontSize: 10, baseLineHeight: 1.4, marginMm: 20 },
  border: { width: 0.75, color: "#000000" },
  title: { fontSize: 26, fontWeight: 700, textAlign: "center", marginBottom: 24 },
  sectionHeader: { fontSize: 10, fontWeight: 600, minHeight: 22, bgColor: "#E6E6E6" },
  infoTable: {
    labelWidth: 80,
    rowMinHeight: 26,
    labelBgColor: "#E6E6E6",
    labelPaddingV: 4,
    labelPaddingH: 4,
    labelFontSize: 9.5,
    labelFontWeight: 500,
    valuePaddingV: 4,
    valuePaddingH: 7,
    valueFontSize: 10,
    marginBottom: 16,
  },
  detailSection: { paddingV: 10, paddingH: 10, fontSize: 10, lineHeight: 1.6, marginBottom: 16 },
  divider: { marginTop: 0, marginBottom: 14 },
  attachSection: {
    titleFontSize: 10,
    titleFontWeight: 700,
    titleMarginBottom: 6,
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  closingText: { fontSize: 10, textAlign: "center", marginTop: 0, marginBottom: 20 },
  dateText: { fontSize: 11, textAlign: "center", marginBottom: 16 },
  signature: { fontSize: 10, signImageMaxHeight: 28, marginBottom: 10 },
  recipient: { fontSize: 11, fontWeight: 600, textAlign: "right" },
  placeholders: {
    emptyField: "—",
    emptyFieldColor: "#DC2626",
    signEmpty: "(서명 없음)",
    signEmptyColor: "#DC2626",
  },
};

export async function getSomyeongLayoutSettings(): Promise<SomyeongLayoutSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "somyeongLayout"));
  if (!snap.exists()) return DEFAULT_SOMYEONG_LAYOUT;
  return deepMerge(DEFAULT_SOMYEONG_LAYOUT, snap.data() as Record<string, unknown>);
}

export async function saveSomyeongLayoutSettings(
  settings: SomyeongLayoutSettings
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "somyeongLayout"), settings);
}

/* ---------- 출장복명서 settings ---------- */

export type ReturnApprovalCellType = "text" | "image" | "diagonal";

export type ReturnApprovalCell = {
  label: string;
  type: ReturnApprovalCellType;
  text: string;
  imageUrl: string;
  annotation: string;
};

/**
 * 이름별 결재라인 자동 매핑에 사용되는 서명 이미지 슬롯.
 * - manager: 채영지 (팀장 위치)
 * - director: 장인선 (본부장 위치, 본인 출장 시에도 사용)
 * - ceo: 김성윤 (대표이사 위치, 본인 출장 시에만 사용)
 */
export type ReturnSignatures = {
  manager: string;
  director: string;
  ceo: string;
};

export type ReturnSettings = {
  /** 셀 0(담당), 1(팀장), 2(본부장) 기본값 — 호환을 위해 유지하지만 이름 매핑 결과가 우선 적용됨 */
  approval: [ReturnApprovalCell, ReturnApprovalCell, ReturnApprovalCell];
  /** 이름 기반 자동 매핑용 서명 이미지 */
  signatures: ReturnSignatures;
};

export const DEFAULT_RETURN_SETTINGS: ReturnSettings = {
  approval: [
    { label: "담당", type: "text", text: "", imageUrl: "", annotation: "" },
    { label: "팀장", type: "diagonal", text: "", imageUrl: "", annotation: "" },
    { label: "본부장", type: "image", text: "", imageUrl: "", annotation: "" },
  ],
  signatures: { manager: "", director: "", ceo: "" },
};

export async function getReturnSettings(): Promise<ReturnSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "return"));
  if (!snap.exists()) return DEFAULT_RETURN_SETTINGS;
  const data = snap.data() as Record<string, unknown>;
  const rawApproval = (data.approval as unknown[]) ?? [];
  const approval = DEFAULT_RETURN_SETTINGS.approval.map((def, i) => ({
    ...def,
    ...((rawApproval[i] as Partial<ReturnApprovalCell>) ?? {}),
  })) as [ReturnApprovalCell, ReturnApprovalCell, ReturnApprovalCell];
  const rawSig = (data.signatures as Partial<ReturnSignatures>) ?? {};
  const signatures: ReturnSignatures = {
    ...DEFAULT_RETURN_SETTINGS.signatures,
    ...rawSig,
  };
  return { approval, signatures };
}

export async function saveReturnSettings(settings: ReturnSettings): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "return"), settings);
}

/* ---------- 출장복명서 layout ---------- */

export type ReturnLayoutSettings = {
  page: {
    fontFamily: string;
    baseFontSize: number;
    baseLineHeight: number;
    marginMm: number;
  };
  border: {
    width: number;
    color: string;
  };
  title: {
    fontSize: number;
    fontWeight: number;
    letterSpacing: number;
    marginBottom: number;
  };
  approval: {
    tableWidth: number;
    headerMinHeight: number;
    headerFontSize: number;
    headerBgColor: string;
    cellMinHeight: number;
    cellPadding: number;
    textFontSize: number;
    imageMaxHeight: number;
    annotationFontSize: number;
    annotationColor: string;
  };
  dataTable: {
    labelWidth: number;
    rowMinHeight: number;
    labelBgColor: string;
    labelFontSize: number;
    labelFontWeight: number;
    valueFontSize: number;
    valuePaddingV: number;
    valuePaddingH: number;
  };
  workContent: {
    minHeight: number;
    paddingV: number;
    paddingH: number;
    fontSize: number;
    lineHeight: number;
    indentPerDepth: number;
    depthMarkers: [string, string, string]; // depth 1/2/3 marker
    itemSpacing: number;
  };
  notes: {
    minHeight: number;
    paddingV: number;
    paddingH: number;
  };
  placeholders: {
    emptyField: string;
    emptyFieldColor: string;
    dateInvalid: string;
    dateInvalidColor: string;
  };
};

export const DEFAULT_RETURN_LAYOUT: ReturnLayoutSettings = {
  page: { fontFamily: "Pretendard", baseFontSize: 10, baseLineHeight: 1.4, marginMm: 18 },
  border: { width: 0.75, color: "#000000" },
  title: { fontSize: 30, fontWeight: 700, letterSpacing: 6, marginBottom: 18 },
  approval: {
    tableWidth: 200,
    headerMinHeight: 22,
    headerFontSize: 9,
    headerBgColor: "#F2F2F2",
    cellMinHeight: 50,
    cellPadding: 3,
    textFontSize: 10,
    imageMaxHeight: 38,
    annotationFontSize: 8,
    annotationColor: "#333333",
  },
  dataTable: {
    labelWidth: 90,
    rowMinHeight: 28,
    labelBgColor: "#E6E6E6",
    labelFontSize: 11,
    labelFontWeight: 600,
    valueFontSize: 10.5,
    valuePaddingV: 5,
    valuePaddingH: 8,
  },
  workContent: {
    minHeight: 280,
    paddingV: 8,
    paddingH: 10,
    fontSize: 10,
    lineHeight: 1.55,
    indentPerDepth: 14,
    depthMarkers: ["1.", "-", "-"],
    itemSpacing: 2,
  },
  notes: {
    minHeight: 50,
    paddingV: 5,
    paddingH: 8,
  },
  placeholders: {
    emptyField: "—",
    emptyFieldColor: "#DC2626",
    dateInvalid: "날짜 확인 불가",
    dateInvalidColor: "#DC2626",
  },
};

export async function getReturnLayoutSettings(): Promise<ReturnLayoutSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "returnLayout"));
  if (!snap.exists()) return DEFAULT_RETURN_LAYOUT;
  return deepMerge(DEFAULT_RETURN_LAYOUT, snap.data() as Record<string, unknown>);
}

export async function saveReturnLayoutSettings(
  settings: ReturnLayoutSettings
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "returnLayout"), settings);
}
