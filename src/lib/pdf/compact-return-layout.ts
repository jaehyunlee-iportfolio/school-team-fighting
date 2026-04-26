import type { ReturnLayoutSettings } from "@/lib/firebase/firestore";

/**
 * 출장복명서가 2페이지 이상으로 넘어갈 때 한 페이지에 맞추기 위한
 * "압축" 레이아웃. 줄 간격·항목 간격·셀 패딩·고정 최소 높이를 줄여
 * 가독성은 유지하면서 세로 공간을 최대한 확보한다.
 */
export function compactReturnLayout(
  l: ReturnLayoutSettings
): ReturnLayoutSettings {
  return {
    ...l,
    page: {
      ...l.page,
      baseLineHeight: clamp(l.page.baseLineHeight - 0.15, 1.15, l.page.baseLineHeight),
    },
    title: {
      ...l.title,
      marginBottom: Math.max(8, l.title.marginBottom - 6),
    },
    workContent: {
      ...l.workContent,
      lineHeight: clamp(l.workContent.lineHeight - 0.25, 1.2, l.workContent.lineHeight),
      itemSpacing: Math.max(0, l.workContent.itemSpacing - 1),
      paddingV: Math.max(3, l.workContent.paddingV - 3),
      minHeight: Math.max(120, l.workContent.minHeight - 80),
    },
    dataTable: {
      ...l.dataTable,
      rowMinHeight: Math.max(20, l.dataTable.rowMinHeight - 6),
      valuePaddingV: Math.max(2, l.dataTable.valuePaddingV - 2),
    },
    notes: {
      ...l.notes,
      minHeight: Math.max(20, l.notes.minHeight - 25),
      paddingV: Math.max(2, l.notes.paddingV - 2),
    },
    approval: {
      ...l.approval,
      cellMinHeight: Math.max(35, l.approval.cellMinHeight - 10),
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
