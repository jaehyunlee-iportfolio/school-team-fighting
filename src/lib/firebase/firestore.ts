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
  /** 페이지 하단 가운데 표시되는 조직명 (출장신청서와 동일 패턴) */
  footer: {
    fontSize: number;
    fontWeight: number;
    marginTop: number;
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
  footer: { fontSize: 15, fontWeight: 700, marginTop: 42 },
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

/* ===================================================================
   소프트웨어 활용 희망 요청서 (D-3) 설정
   =================================================================== */

export type SwRequestSettings = {
  titleText: string;
  defaultTarget: string;     // "교원"
  closingText: string;
  recipientText: string;     // "(주)아이포트폴리오 귀하"
};

export const DEFAULT_SW_REQUEST_SETTINGS: SwRequestSettings = {
  titleText: "소프트웨어 활용 희망 요청서",
  defaultTarget: "교원",
  closingText: "위와 같은 내용으로 소프트웨어 활용을 희망합니다.",
  recipientText: "(주)아이포트폴리오 귀하",
};

export async function getSwRequestSettings(): Promise<SwRequestSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "swRequest"));
  if (!snap.exists()) return DEFAULT_SW_REQUEST_SETTINGS;
  return deepMerge(
    DEFAULT_SW_REQUEST_SETTINGS as unknown as Record<string, unknown>,
    snap.data() as Record<string, unknown>,
  ) as unknown as SwRequestSettings;
}

export async function saveSwRequestSettings(
  settings: SwRequestSettings,
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "swRequest"), settings);
}

export type SwRequestLayoutSettings = {
  page: {
    fontFamily: string;
    baseFontSize: number;
    marginMm: number;
  };
  title: {
    fontSize: number;
    fontWeight: number;
    marginBottom: number;
    textAlign: "left" | "center" | "right";
  };
  infoTable: {
    headerBg: string;
    labelBg: string;
    borderColor: string;
    cellPaddingV: number;
    cellPaddingH: number;
    labelFontSize: number;
    valueFontSize: number;
    sectionTitleFontSize: number;
    labelWidth: number;     // pt
    rowHeight: number;
    marginBottom: number;
  };
  itemsTable: {
    headerBg: string;
    borderColor: string;
    cellPaddingV: number;
    cellPaddingH: number;
    headerFontSize: number;
    valueFontSize: number;
    rowHeight: number;
    sectionTitleFontSize: number;
    /** 4 columns: user / product / qty / period (in proportions, sum=1) */
    colRatios: [number, number, number, number];
    marginBottom: number;
  };
  closing: {
    fontSize: number;
    textAlign: "left" | "center" | "right";
    marginTop: number;
    marginBottom: number;
  };
  date: {
    fontSize: number;
    textAlign: "left" | "center" | "right";
    marginBottom: number;
  };
  recipient: {
    fontSize: number;
    fontWeight: number;
    textAlign: "left" | "center" | "right";
    marginTop: number;
  };
  placeholders: {
    emptyField: string;
    emptyFieldColor: string;
    target: string;
  };
};

export const DEFAULT_SW_REQUEST_LAYOUT: SwRequestLayoutSettings = {
  page: { fontFamily: "Pretendard", baseFontSize: 10, marginMm: 20 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 32, textAlign: "center" },
  infoTable: {
    headerBg: "#E5E7EB",
    labelBg: "#F3F4F6",
    borderColor: "#9CA3AF",
    cellPaddingV: 8,
    cellPaddingH: 10,
    labelFontSize: 10,
    valueFontSize: 10,
    sectionTitleFontSize: 11,
    labelWidth: 90,
    rowHeight: 28,
    marginBottom: 28,
  },
  itemsTable: {
    headerBg: "#E5E7EB",
    borderColor: "#9CA3AF",
    cellPaddingV: 4,
    cellPaddingH: 8,
    headerFontSize: 10,
    valueFontSize: 10,
    rowHeight: 18,
    sectionTitleFontSize: 11,
    colRatios: [0.18, 0.42, 0.14, 0.26],
    marginBottom: 24,
  },
  closing: { fontSize: 11, textAlign: "center", marginTop: 36, marginBottom: 32 },
  date: { fontSize: 11, textAlign: "right", marginBottom: 24 },
  recipient: { fontSize: 12, fontWeight: 700, textAlign: "right", marginTop: 4 },
  placeholders: {
    emptyField: "(빈칸)",
    emptyFieldColor: "#DC2626",
    target: "교원",
  },
};

export async function getSwRequestLayoutSettings(): Promise<SwRequestLayoutSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "swRequestLayout"));
  if (!snap.exists()) return DEFAULT_SW_REQUEST_LAYOUT;
  return deepMerge(
    DEFAULT_SW_REQUEST_LAYOUT as unknown as Record<string, unknown>,
    snap.data() as Record<string, unknown>,
  ) as unknown as SwRequestLayoutSettings;
}

export async function saveSwRequestLayoutSettings(
  settings: SwRequestLayoutSettings,
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "swRequestLayout"), settings);
}

/* ---------- 지출결의서 settings ---------- */

export type ExpenseGroupSettings = {
  // 텍스트
  writerName: string;
  writerTitle: string;
  approverName: string;
  approverTitle: string;
  /** 일련번호 prefix 알파벳 3자 (예: IPF / DMI) */
  orgCode: string;
  /** 일련번호 알파벳 1자 (예: R / M) */
  serialAlpha: string;
  /** PDF "소속·상호"에 들어갈 풀네임 */
  companyFullName: string;
  // 이미지 (data URL)
  logoImageUrl: string;
  writerSigImageUrl: string;
  approverSigImageUrl: string;
  stampImageUrl: string;
};

export type ExpenseSettings = {
  groups: {
    ipf: ExpenseGroupSettings;
    dimi: ExpenseGroupSettings;
  };
};

export const DEFAULT_EXPENSE_SETTINGS: ExpenseSettings = {
  groups: {
    ipf: {
      writerName: "채영지",
      writerTitle: "팀장",
      approverName: "장인선",
      approverTitle: "본부장",
      orgCode: "IPF",
      serialAlpha: "R",
      companyFullName: "(주)아이포트폴리오",
      logoImageUrl: "",
      writerSigImageUrl: "",
      approverSigImageUrl: "",
      stampImageUrl: "",
    },
    dimi: {
      writerName: "박소연",
      writerTitle: "사무국장",
      approverName: "박준호",
      approverTitle: "대표이사",
      orgCode: "DMI",
      serialAlpha: "M",
      companyFullName: "(사)디지털미디어교육콘텐츠 교사연구협회",
      logoImageUrl: "",
      writerSigImageUrl: "",
      approverSigImageUrl: "",
      stampImageUrl: "",
    },
  },
};

/**
 * Expense settings는 4 이미지 × 2 그룹 = 8 이미지(base64 data URL)를 담아
 * 단일 문서 1 MiB 한계를 쉽게 초과한다. 그래서 그룹별로 별도 문서로 저장:
 *   settings/expense_ipf
 *   settings/expense_dimi
 * (기존 settings/expense 단일 문서는 호환을 위해 fallback으로 읽음)
 */
async function readExpenseGroup(
  docId: string,
  fallback: ExpenseGroupSettings,
): Promise<ExpenseGroupSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", docId));
  if (!snap.exists()) return fallback;
  return deepMerge(
    fallback as unknown as Record<string, unknown>,
    snap.data() as Record<string, unknown>,
  ) as unknown as ExpenseGroupSettings;
}

export async function getExpenseSettings(): Promise<ExpenseSettings> {
  // 우선 그룹별 분리 문서 시도
  const [ipf, dimi, legacySnap] = await Promise.all([
    readExpenseGroup("expense_ipf", DEFAULT_EXPENSE_SETTINGS.groups.ipf),
    readExpenseGroup("expense_dimi", DEFAULT_EXPENSE_SETTINGS.groups.dimi),
    getDoc(doc(getFirebaseDb(), "settings", "expense")),
  ]);

  // legacy 단일 문서가 있고 그룹별 문서가 비어있으면 마이그레이션용 머지
  if (legacySnap.exists()) {
    const legacy = deepMerge(
      DEFAULT_EXPENSE_SETTINGS as unknown as Record<string, unknown>,
      legacySnap.data() as Record<string, unknown>,
    ) as unknown as ExpenseSettings;
    return {
      groups: {
        ipf: { ...legacy.groups.ipf, ...ipf },
        dimi: { ...legacy.groups.dimi, ...dimi },
      },
    };
  }
  return { groups: { ipf, dimi } };
}

export async function saveExpenseSettings(settings: ExpenseSettings): Promise<void> {
  // 그룹별로 별도 문서에 저장 — 1 MiB 한계 우회
  await Promise.all([
    setDoc(doc(getFirebaseDb(), "settings", "expense_ipf"), settings.groups.ipf),
    setDoc(doc(getFirebaseDb(), "settings", "expense_dimi"), settings.groups.dimi),
  ]);
}

/* ---------- 지출결의서 layout ---------- */

export type ExpenseLayoutSettings = {
  page: {
    fontFamily: string;
    baseFontSize: number;
    baseLineHeight: number;
    marginMm: number;
  };
  border: { width: number; color: string };
  /** 좌상단 로고 박스 */
  logo: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  };
  title: {
    fontSize: number;
    fontWeight: number;
    letterSpacing: number;
    marginBottom: number;
  };
  subtitle: {
    fontSize: number;
    color: string;
    marginBottom: number;
  };
  /** "1. 기본 정보" 같은 섹션 헤딩 */
  sectionHeading: {
    fontSize: number;
    fontWeight: number;
    marginTop: number;
    marginBottom: number;
  };
  /** 1. 기본 정보 4줄 (라벨/값) */
  basicInfo: {
    labelWidth: number;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    rowGap: number;
  };
  /** 2. 지출 목적 본문 */
  purpose: {
    fontSize: number;
    lineHeight: number;
    paddingV: number;
  };
  /** 3. 지출결의 내용 표 */
  expenseTable: {
    headerHeight: number;
    headerFontSize: number;
    headerBgColor: string;
    rowHeight: number;
    fontSize: number;
    paddingV: number;
    paddingH: number;
    /** 비고 행 높이 */
    noteRowHeight: number;
    noteFontSize: number;
    /** 컬럼 가로 비율 (% 단위, 합계 100) */
    colDateWidth: number;
    colSemokWidth: number;
    colSesemokWidth: number;
    colSupplyWidth: number;
    colVatWidth: number;
    colTotalWidth: number;
    /** 컬럼별 텍스트 정렬 */
    colDateAlign: "left" | "center" | "right";
    colSemokAlign: "left" | "center" | "right";
    colSesemokAlign: "left" | "center" | "right";
    colSupplyAlign: "left" | "center" | "right";
    colVatAlign: "left" | "center" | "right";
    colTotalAlign: "left" | "center" | "right";
    colNoteAlign: "left" | "center" | "right";
  };
  /** 4. 지출 방식 */
  paymentMethod: {
    fontSize: number;
    paddingV: number;
  };
  /** 5. 지출 승인 표 */
  approvalTable: {
    headerHeight: number;
    headerFontSize: number;
    headerBgColor: string;
    rowHeight: number;
    fontSize: number;
    paddingV: number;
    paddingH: number;
    /** 서명 이미지 max-height */
    sigImageMaxHeight: number;
    /** 직인 이미지 max-height */
    stampImageMaxHeight: number;
    /** 컬럼 가로 비율 (% 단위, 합계 100) */
    colStageWidth: number;
    colNameWidth: number;
    colTitleWidth: number;
    colSigWidth: number;
    colDateWidth: number;
    colNoteWidth: number;
    /** 상호 행의 비고 칸 안에서 "회사 직인" 텍스트와 직인 이미지가 차지하는 비율 (0~1) */
    stampLabelRatio: number;
    /** 데이터 행 컬럼별 텍스트 정렬 */
    colNameAlign: "left" | "center" | "right";
    colTitleAlign: "left" | "center" | "right";
    colDateAlign: "left" | "center" | "right";
    colNoteAlign: "left" | "center" | "right";
  };
  footer: {
    fontSize: number;
    fontWeight: number;
    color: string;
    marginTop: number;
  };
  placeholders: {
    /** 빈 필수 값 표시용 */
    emptyField: string;
    emptyFieldColor: string;
    /** 비정상 값(검증 실패) 표시용 */
    invalidValue: string;
    invalidValueColor: string;
  };
};

export const DEFAULT_EXPENSE_LAYOUT: ExpenseLayoutSettings = {
  page: { fontFamily: "Pretendard", baseFontSize: 10, baseLineHeight: 1.4, marginMm: 18 },
  border: { width: 0.5, color: "#000000" },
  logo: { width: 60, height: 30, offsetX: 0, offsetY: 0 },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: 0, marginBottom: 8 },
  subtitle: { fontSize: 11, color: "#444444", marginBottom: 14 },
  sectionHeading: { fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 6 },
  basicInfo: {
    labelWidth: 70,
    fontSize: 10.5,
    fontWeight: 600,
    lineHeight: 1.5,
    rowGap: 2,
  },
  purpose: { fontSize: 10.5, lineHeight: 1.4, paddingV: 4 },
  expenseTable: {
    headerHeight: 26,
    headerFontSize: 10,
    headerBgColor: "#F5F5F5",
    rowHeight: 38,
    fontSize: 10,
    paddingV: 5,
    paddingH: 6,
    noteRowHeight: 50,
    noteFontSize: 10,
    colDateWidth: 16,
    colSemokWidth: 16,
    colSesemokWidth: 24,
    colSupplyWidth: 12,
    colVatWidth: 12,
    colTotalWidth: 20,
    colDateAlign: "center",
    colSemokAlign: "center",
    colSesemokAlign: "center",
    colSupplyAlign: "right",
    colVatAlign: "right",
    colTotalAlign: "right",
    colNoteAlign: "left",
  },
  paymentMethod: { fontSize: 10.5, paddingV: 4 },
  approvalTable: {
    headerHeight: 24,
    headerFontSize: 10,
    headerBgColor: "#F5F5F5",
    rowHeight: 50,
    fontSize: 10,
    paddingV: 4,
    paddingH: 6,
    sigImageMaxHeight: 30,
    colStageWidth: 12,
    colNameWidth: 14,
    colTitleWidth: 14,
    colSigWidth: 20,
    colDateWidth: 20,
    colNoteWidth: 20,
    stampLabelRatio: 0.5,
    stampImageMaxHeight: 38,
    colNameAlign: "center",
    colTitleAlign: "center",
    colDateAlign: "center",
    colNoteAlign: "center",
  },
  footer: { fontSize: 9, fontWeight: 400, color: "#666666", marginTop: 14 },
  placeholders: {
    emptyField: "—",
    emptyFieldColor: "#DC2626",
    invalidValue: "확인 필요",
    invalidValueColor: "#B45309",
  },
};

export async function getExpenseLayoutSettings(): Promise<ExpenseLayoutSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "expenseLayout"));
  if (!snap.exists()) return DEFAULT_EXPENSE_LAYOUT;
  return deepMerge(
    DEFAULT_EXPENSE_LAYOUT as unknown as Record<string, unknown>,
    snap.data() as Record<string, unknown>,
  ) as unknown as ExpenseLayoutSettings;
}

export async function saveExpenseLayoutSettings(
  settings: ExpenseLayoutSettings,
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "expenseLayout"), settings);
}
