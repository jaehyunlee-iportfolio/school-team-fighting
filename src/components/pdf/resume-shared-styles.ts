// 코디/강사 이력서 PDF 공통 디자인 토큰·헬퍼.
//
// 테이블 border 중복 방지 규칙 (기존 resume-document.tsx와 동일):
//   table = top + left (right + bottom 은 0 — 셀이 그림)
//   cell  = right + bottom (모든 셀)
//   섹션 라벨이 N개 row를 시각적으로 병합할 때는 첫 행 라벨만 borderBottom 0,
//     나머지 행은 placeholder View로 그 영역의 right border만 유지.

import type { StyleSheet as RPDF_StyleSheet } from "@react-pdf/renderer";

export type ResumeLayoutCommon = {
  page: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    paddingTop: number;
    paddingBottom: number;
    paddingHorizontal: number;
  };
  border: {
    width: number;
    color: string;
  };
  colors: {
    titleBg: string;
    titleText: string;
    sectionBg: string;
    labelBg: string;
    labelText: string;
    text: string;
    muted: string;
    empty: string;
  };
  prelude: { fontSize: number; fontWeight: 400 | 500 | 600 | 700; marginBottom: number };
  title: { fontSize: number; fontWeight: 400 | 500 | 600 | 700; paddingV: number };
  sectionHeader: {
    fontSize: number;
    fontWeight: 400 | 500 | 600 | 700;
    paddingV: number;
    paddingH: number;
  };
  cell: {
    paddingV: number;
    paddingH: number;
    minHeight: number;
  };
  text: {
    fontSize: number;
    fontSizeSm: number;
  };
  emptyRows: {
    training: number;
    certificate: number;
    lecture: number;
    project: number;
  };
  motivation: {
    minHeight: number;
    paddingV: number;
    paddingH: number;
    fontSize: number;
    lineHeight: number;
  };
};

export type ResumeInstructorExtra = {
  practiceBox: {
    minHeight: number;
    paddingV: number;
    paddingH: number;
    fontSize: number;
    lineHeight: number;
  };
};

export const DEFAULT_RESUME_COMMON: ResumeLayoutCommon = {
  page: {
    fontFamily: "Pretendard",
    fontSize: 9,
    lineHeight: 1.3,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
  },
  border: { width: 0.5, color: "#9AAACC" },
  colors: {
    titleBg: "#2A4A8C",
    titleText: "#FFFFFF",
    sectionBg: "#E6EAF5",
    labelBg: "#E6EAF5",
    labelText: "#1F3A6E",
    text: "#222222",
    muted: "#888888",
    empty: "#BBBBBB",
  },
  prelude: { fontSize: 11, fontWeight: 600, marginBottom: 6 },
  title: { fontSize: 13, fontWeight: 700, paddingV: 6 },
  sectionHeader: { fontSize: 10, fontWeight: 700, paddingV: 4, paddingH: 6 },
  cell: { paddingV: 3, paddingH: 4, minHeight: 18 },
  text: { fontSize: 9, fontSizeSm: 8.5 },
  emptyRows: { training: 1, certificate: 1, lecture: 1, project: 1 },
  motivation: {
    minHeight: 180,
    paddingV: 8,
    paddingH: 8,
    fontSize: 9,
    lineHeight: 1.5,
  },
};

export const DEFAULT_INSTRUCTOR_EXTRA: ResumeInstructorExtra = {
  practiceBox: {
    minHeight: 90,
    paddingV: 8,
    paddingH: 8,
    fontSize: 9,
    lineHeight: 1.5,
  },
};

export function buildResumeStyles(
  StyleSheet: typeof RPDF_StyleSheet,
  cfg: ResumeLayoutCommon,
) {
  const b = cfg.border.width;
  const BC = cfg.border.color;
  return StyleSheet.create({
    page: {
      fontFamily: cfg.page.fontFamily,
      fontSize: cfg.page.fontSize,
      lineHeight: cfg.page.lineHeight,
      paddingTop: cfg.page.paddingTop,
      paddingBottom: cfg.page.paddingBottom,
      paddingHorizontal: cfg.page.paddingHorizontal,
      color: cfg.colors.text,
    },
    prelude: {
      fontSize: cfg.prelude.fontSize,
      fontWeight: cfg.prelude.fontWeight,
      marginBottom: cfg.prelude.marginBottom,
    },
    table: {
      borderTopWidth: b,
      borderLeftWidth: b,
      borderColor: BC,
    },
    row: { flexDirection: "row" },
    cellBase: {
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      paddingHorizontal: cfg.cell.paddingH,
      paddingVertical: cfg.cell.paddingV,
      justifyContent: "center",
    },
    titleCell: {
      backgroundColor: cfg.colors.titleBg,
      paddingVertical: cfg.title.paddingV,
      alignItems: "center",
      justifyContent: "center",
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
    },
    titleText: {
      color: cfg.colors.titleText,
      fontSize: cfg.title.fontSize,
      fontWeight: cfg.title.fontWeight,
    },
    sectionHeaderCell: {
      backgroundColor: cfg.colors.sectionBg,
      paddingVertical: cfg.sectionHeader.paddingV,
      paddingHorizontal: cfg.sectionHeader.paddingH,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center",
    },
    sectionHeaderText: {
      color: cfg.colors.labelText,
      fontWeight: cfg.sectionHeader.fontWeight,
      fontSize: cfg.sectionHeader.fontSize,
    },
    labelCell: {
      backgroundColor: cfg.colors.labelBg,
      alignItems: "center",
      justifyContent: "center",
    },
    labelText: {
      color: cfg.colors.labelText,
      fontWeight: 600,
      fontSize: cfg.text.fontSize,
      textAlign: "center",
    },
    labelTextLeft: {
      color: cfg.colors.labelText,
      fontWeight: 600,
      fontSize: cfg.text.fontSize,
      textAlign: "left",
    },
    valueText: { fontSize: cfg.text.fontSize },
    valueTextSm: { fontSize: cfg.text.fontSizeSm },
    empty: { color: cfg.colors.empty },
    duty: { fontSize: cfg.text.fontSizeSm, marginBottom: 1 },
    motivationCell: {
      minHeight: cfg.motivation.minHeight,
      paddingHorizontal: cfg.motivation.paddingH,
      paddingVertical: cfg.motivation.paddingV,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
    },
    motivationText: {
      fontSize: cfg.motivation.fontSize,
      lineHeight: cfg.motivation.lineHeight,
    },
    sublabelMuted: {
      fontSize: 7.5,
      fontWeight: 400 as const,
    },
  });
}

export function buildPracticeBoxStyle(
  StyleSheet: typeof RPDF_StyleSheet,
  cfg: ResumeLayoutCommon,
  extra: ResumeInstructorExtra,
) {
  const b = cfg.border.width;
  return StyleSheet.create({
    practiceCell: {
      minHeight: extra.practiceBox.minHeight,
      paddingHorizontal: extra.practiceBox.paddingH,
      paddingVertical: extra.practiceBox.paddingV,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: cfg.border.color,
    },
    practiceText: {
      fontSize: extra.practiceBox.fontSize,
      lineHeight: extra.practiceBox.lineHeight,
    },
  });
}
