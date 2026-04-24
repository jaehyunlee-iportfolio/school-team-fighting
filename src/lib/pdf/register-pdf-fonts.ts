"use client";

import { Font } from "@react-pdf/renderer";

let did = false;

/** 브라우저에서 1회만(재등록은 예외) */
export function registerPdfFonts(): void {
  if (typeof window === "undefined" || did) return;
  did = true;
  try {
    Font.register({
      family: "Pretendard",
      src: "/fonts/Pretendard-Regular.otf",
    });
  } catch {
    // 다시 눌리면 무시
  }
  try {
    Font.register({
      family: "NanumPen",
      src: "/fonts/nanum-pen-korean.woff2",
      fontWeight: 400,
    });
  } catch {
    /* */
  }
}
