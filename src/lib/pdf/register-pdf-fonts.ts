"use client";

import { Font } from "@react-pdf/renderer";

let did = false;

export function registerPdfFonts(): void {
  if (typeof window === "undefined" || did) return;
  did = true;
  try {
    Font.register({
      family: "Pretendard",
      fonts: [
        { src: "/fonts/Pretendard-Regular.otf", fontWeight: 400 },
        { src: "/fonts/Pretendard-Medium.otf", fontWeight: 500 },
        { src: "/fonts/Pretendard-SemiBold.otf", fontWeight: 600 },
        { src: "/fonts/Pretendard-Bold.otf", fontWeight: 700 },
        { src: "/fonts/Pretendard-ExtraBold.otf", fontWeight: 800 },
        { src: "/fonts/Pretendard-Black.otf", fontWeight: 900 },
      ],
    });
  } catch {
    // ignore re-registration
  }
}
