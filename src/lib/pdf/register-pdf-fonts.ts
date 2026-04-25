"use client";

import { Font } from "@react-pdf/renderer";

let did = false;

export const PDF_FONT_FAMILIES = [
  { value: "Pretendard", label: "Pretendard" },
  { value: "NotoSansKR", label: "Noto Sans KR" },
  { value: "SpoqaHanSansNeo", label: "Spoqa Han Sans Neo" },
] as const;

export type PdfFontFamily = (typeof PDF_FONT_FAMILIES)[number]["value"];

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

    Font.register({
      family: "NotoSansKR",
      fonts: [
        { src: "/fonts/NotoSansKR-Thin.otf", fontWeight: 100 },
        { src: "/fonts/NotoSansKR-Light.otf", fontWeight: 300 },
        { src: "/fonts/NotoSansKR-Regular.otf", fontWeight: 400 },
        { src: "/fonts/NotoSansKR-Medium.otf", fontWeight: 500 },
        { src: "/fonts/NotoSansKR-Bold.otf", fontWeight: 700 },
        { src: "/fonts/NotoSansKR-Black.otf", fontWeight: 900 },
      ],
    });

    Font.register({
      family: "SpoqaHanSansNeo",
      fonts: [
        { src: "/fonts/SpoqaHanSansNeo-Thin.otf", fontWeight: 100 },
        { src: "/fonts/SpoqaHanSansNeo-Light.otf", fontWeight: 300 },
        { src: "/fonts/SpoqaHanSansNeo-Regular.otf", fontWeight: 400 },
        { src: "/fonts/SpoqaHanSansNeo-Medium.otf", fontWeight: 500 },
        { src: "/fonts/SpoqaHanSansNeo-Bold.otf", fontWeight: 700 },
      ],
    });
  } catch {
    // ignore re-registration
  }
}
