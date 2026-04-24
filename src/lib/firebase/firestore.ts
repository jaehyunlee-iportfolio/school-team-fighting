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

export type GroupLabels = {
  approver1Label: string;
  approver2Label: string;
};

export type ApprovalSettings = {
  drafter: DrafterSettings;
  approver1: ApproverSettings;
  approver2: ApproverSettings;
  groups: Record<string, GroupLabels>;
};

const DEFAULT_SETTINGS: ApprovalSettings = {
  drafter: { mode: "text", fontFamily: "NanumPen", maxChars: 3 },
  approver1: { mode: "image", imageUrl: "", label: "팀장" },
  approver2: { mode: "image", imageUrl: "", label: "본부장" },
  groups: {
    ipf: { approver1Label: "팀장", approver2Label: "본부장" },
    dimi: { approver1Label: "사무국장", approver2Label: "대표이사" },
  },
};

export async function getApprovalSettings(): Promise<ApprovalSettings> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "approval"));
  if (!snap.exists()) return DEFAULT_SETTINGS;
  const data = snap.data() as DocumentData;
  return {
    drafter: { ...DEFAULT_SETTINGS.drafter, ...(data.drafter ?? {}) },
    approver1: { ...DEFAULT_SETTINGS.approver1, ...(data.approver1 ?? {}) },
    approver2: { ...DEFAULT_SETTINGS.approver2, ...(data.approver2 ?? {}) },
    groups: { ...DEFAULT_SETTINGS.groups, ...(data.groups ?? {}) },
  };
}

export async function saveApprovalSettings(
  settings: ApprovalSettings
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), "settings", "approval"), settings, {
    merge: true,
  });
}
