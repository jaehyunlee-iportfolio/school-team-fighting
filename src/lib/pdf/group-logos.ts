import type { ApprovalGroup } from "@/lib/approval/labels";

/** `public/logos`에 두 파일이 있어야 합니다 (assets/logo에서 복사). */
const LOGO_PATH: Partial<Record<ApprovalGroup, string>> = {
  ipf: "/logos/ipf.jpg",
  dimi: "/logos/dimi.png",
};

/**
 * PDF용 로고 URL. 브라우저에서는 절대 URL로 고정해 @react-pdf Image 로딩을 안정화합니다.
 */
export function resolveHardcodedPdfLogoSrc(group: ApprovalGroup): string | undefined {
  const path = LOGO_PATH[group];
  if (!path) return undefined;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).href;
  }
  return path;
}
