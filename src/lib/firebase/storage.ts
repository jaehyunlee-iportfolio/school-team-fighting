import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { getFirebaseStorage } from "./config";

/**
 * Upload a signature image and return its public download URL.
 * Path: `/signatures/{groupId}/{role}.png`
 */
export async function uploadSignatureImage(
  groupId: string,
  role: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `signatures/${groupId}/${role}.${ext}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, {
    contentType: file.type,
  });
  return getDownloadURL(storageRef);
}

export async function getSignatureImageUrl(
  groupId: string,
  role: string,
  ext = "png"
): Promise<string | null> {
  try {
    const path = `signatures/${groupId}/${role}.${ext}`;
    return await getDownloadURL(ref(getFirebaseStorage(), path));
  } catch {
    return null;
  }
}

export async function deleteSignatureImage(
  groupId: string,
  role: string,
  ext = "png"
): Promise<void> {
  try {
    const path = `signatures/${groupId}/${role}.${ext}`;
    await deleteObject(ref(getFirebaseStorage(), path));
  } catch {
    /* ignore not-found */
  }
}
