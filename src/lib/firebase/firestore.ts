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

export type SignatureMode = "text" | "image";

export type DrafterSettings = {
  mode: SignatureMode;
  fontFamily: string;
  maxChars: number;
};

export type ApproverSettings = {
  mode: SignatureMode;
  imageUrl: string;
  label: string;
};

export type GroupSettings = {
  approver1Label: string;
  approver2Label: string;
  approver1ImageUrl: string;
  approver2ImageUrl: string;
};

export type ApprovalSettings = {
  drafter: DrafterSettings;
  /** @deprecated 하위 호환용. 새 구조는 groups[gid].approver{1,2}ImageUrl */
  approver1?: ApproverSettings;
  /** @deprecated */
  approver2?: ApproverSettings;
  groups: Record<string, GroupSettings>;
};

const DEFAULT_SETTINGS: ApprovalSettings = {
  drafter: { mode: "text", fontFamily: "NanumPen", maxChars: 3 },
  groups: {
    ipf: { approver1Label: "팀장", approver2Label: "본부장", approver1ImageUrl: "", approver2ImageUrl: "" },
    dimi: { approver1Label: "사무국장", approver2Label: "대표이사", approver1ImageUrl: "", approver2ImageUrl: "" },
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

  return {
    drafter: { ...DEFAULT_SETTINGS.drafter, ...(data.drafter ?? {}) },
    groups: mergedGroups,
  };
}

export async function saveApprovalSettings(
  settings: ApprovalSettings
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "approval"), settings, {
    merge: true,
  });
}
