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
  logo: {
    enabled: boolean;
    width: number;
    height: number;
    marginRight: number;
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
  logo: { enabled: true, width: 60, height: 60, marginRight: 8 },
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
