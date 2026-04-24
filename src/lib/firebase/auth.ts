import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "./config";

const ALLOWED_DOMAIN = "iportfolio.co.kr";
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: ALLOWED_DOMAIN });

export function isAllowedDomain(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith(`@${ALLOWED_DOMAIN}`);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(getFirebaseAuth(), provider);
  const user = result.user;

  if (!isAllowedDomain(user.email)) {
    await fbSignOut(getFirebaseAuth());
    throw new Error(`@${ALLOWED_DOMAIN} 이메일만 사용할 수 있어요.`);
  }

  return user;
}

export async function signOut(): Promise<void> {
  await fbSignOut(getFirebaseAuth());
}
