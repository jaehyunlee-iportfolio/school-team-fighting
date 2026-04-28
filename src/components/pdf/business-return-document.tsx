/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image */
import {
  Document,
  Image,
  Page,
  Svg,
  Line,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReturnRow } from "@/lib/csv/parseReturn";
import {
  type ReturnApprovalCell,
  type ReturnLayoutSettings,
  DEFAULT_RETURN_LAYOUT,
} from "@/lib/firebase/firestore";
import { parseBullets } from "@/lib/text/bullets";

function buildStyles(cfg: ReturnLayoutSettings) {
  const MM = cfg.page.marginMm * 2.8346;
  const b = cfg.border.width;
  const BC = cfg.border.color;

  return StyleSheet.create({
    page: {
      fontFamily: cfg.page.fontFamily,
      fontSize: cfg.page.baseFontSize,
      lineHeight: cfg.page.baseLineHeight,
      paddingTop: MM,
      paddingBottom: MM,
      paddingLeft: MM,
      paddingRight: MM,
    },
    topBar: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "flex-start" as const,
      marginBottom: cfg.title.marginBottom,
    },
    title: {
      fontSize: cfg.title.fontSize,
      fontWeight: cfg.title.fontWeight as 700,
      letterSpacing: cfg.title.letterSpacing,
      paddingTop: 8,
    },
    /* ── 결재란 ── */
    apTable: {
      width: cfg.approval.tableWidth,
      borderTopWidth: b,
      borderLeftWidth: b,
      borderRightWidth: b,
      borderColor: BC,
    },
    apHeaderRow: {
      flexDirection: "row" as const,
    },
    apHeaderCell: {
      flex: 1,
      minHeight: cfg.approval.headerMinHeight,
      backgroundColor: cfg.approval.headerBgColor,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingVertical: 2,
    },
    apHeaderCellLast: { borderRightWidth: 0 },
    apHeaderText: {
      fontSize: cfg.approval.headerFontSize,
      textAlign: "center" as const,
    },
    apContentRow: {
      flexDirection: "row" as const,
    },
    apContentCell: {
      flex: 1,
      minHeight: cfg.approval.cellMinHeight,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      padding: cfg.approval.cellPadding,
      position: "relative" as const,
    },
    apContentCellLast: { borderRightWidth: 0 },
    apText: {
      fontSize: cfg.approval.textFontSize,
      textAlign: "center" as const,
    },
    apImg: {
      maxHeight: cfg.approval.imageMaxHeight,
      maxWidth: "100%",
      objectFit: "contain" as const,
    },
    apAnnotation: {
      fontSize: cfg.approval.annotationFontSize,
      color: cfg.approval.annotationColor,
      textAlign: "center" as const,
      marginTop: 1,
    },
    costAnnotation: {
      fontSize: cfg.approval.annotationFontSize,
      color: cfg.approval.annotationColor,
      marginTop: 2,
    },
    /* ── 2페이지: 첨부 사진 ── */
    photoTitleWrap: {
      marginBottom: 10,
    },
    photoPageTitle: {
      fontSize: cfg.title.fontSize * 0.5,
      fontWeight: cfg.title.fontWeight as 700,
      letterSpacing: cfg.title.letterSpacing * 0.5,
      lineHeight: 1.2,
    },
    photoGrid: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 8,
    },
    photoCell: {
      borderWidth: b,
      borderColor: BC,
      backgroundColor: "#ffffff",
      alignItems: "center" as const,
      justifyContent: "center" as const,
      overflow: "hidden" as const,
    },
    photoImg: {
      width: "100%",
      height: "100%",
      objectFit: "contain" as const,
    },
    /* ── 데이터 테이블 ── */
    table: {
      borderTopWidth: b,
      borderLeftWidth: b,
      borderRightWidth: b,
      borderBottomWidth: 0,
      borderColor: BC,
    },
    row: {
      flexDirection: "row" as const,
    },
    labelCell: {
      width: cfg.dataTable.labelWidth,
      backgroundColor: cfg.dataTable.labelBgColor,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: 4,
    },
    labelText: {
      fontSize: cfg.dataTable.labelFontSize,
      fontWeight: cfg.dataTable.labelFontWeight as 600,
      textAlign: "center" as const,
      letterSpacing: 2,
    },
    valueCell: {
      flex: 1,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      paddingVertical: cfg.dataTable.valuePaddingV,
      paddingHorizontal: cfg.dataTable.valuePaddingH,
    },
    valueCellMid: {
      flex: 1,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      paddingVertical: cfg.dataTable.valuePaddingV,
      paddingHorizontal: cfg.dataTable.valuePaddingH,
    },
    valueText: {
      fontSize: cfg.dataTable.valueFontSize,
    },
    /* 출장자 행: 소속·성명 라벨+값 4칸 */
    travelerLabel: {
      width: cfg.dataTable.labelWidth,
      backgroundColor: cfg.dataTable.labelBgColor,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: 4,
      letterSpacing: 1,
    },
    travelerSubLabel: {
      width: 50,
      backgroundColor: cfg.dataTable.labelBgColor,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: 2,
    },
    /* 페이지 하단 푸터 (조직명) */
    footer: {
      marginTop: cfg.footer.marginTop,
      textAlign: "center" as const,
      fontSize: cfg.footer.fontSize,
      fontWeight: cfg.footer.fontWeight as 700,
    },
    /* 업무내용 / 특이사항 */
    workContentCell: {
      flex: 1,
      minHeight: cfg.workContent.minHeight,
      borderBottomWidth: b,
      borderColor: BC,
      paddingVertical: cfg.workContent.paddingV,
      paddingHorizontal: cfg.workContent.paddingH,
    },
    notesCell: {
      flex: 1,
      minHeight: cfg.notes.minHeight,
      borderBottomWidth: b,
      borderColor: BC,
      paddingVertical: cfg.notes.paddingV,
      paddingHorizontal: cfg.notes.paddingH,
    },
    bulletRow: {
      flexDirection: "row" as const,
      marginBottom: cfg.workContent.itemSpacing,
    },
    bulletMarker: {
      width: 16,
      fontSize: cfg.workContent.fontSize,
      lineHeight: cfg.workContent.lineHeight,
    },
    bulletText: {
      flex: 1,
      fontSize: cfg.workContent.fontSize,
      lineHeight: cfg.workContent.lineHeight,
    },
  });
}

function fb(value: string, ph: ReturnLayoutSettings["placeholders"]) {
  if (value && value.trim()) return { text: value, color: undefined as string | undefined };
  return { text: ph.emptyField, color: ph.emptyFieldColor };
}

function ApprovalCellView({
  cell,
  isLast,
  cfg,
  styles,
}: {
  cell: ReturnApprovalCell;
  isLast: boolean;
  cfg: ReturnLayoutSettings;
  styles: ReturnType<typeof buildStyles>;
}) {
  const cellStyle = isLast
    ? [styles.apContentCell, styles.apContentCellLast]
    : styles.apContentCell;

  return (
    <View style={cellStyle}>
      {cell.type === "diagonal" ? (
        <Svg
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <Line x1="0" y1="100" x2="100" y2="0" stroke={cfg.border.color} strokeWidth={1} />
        </Svg>
      ) : cell.type === "image" ? (
        cell.imageUrl ? (
          <Image src={cell.imageUrl} style={styles.apImg} />
        ) : (
          <Text style={[styles.apText, { color: cfg.placeholders.emptyFieldColor }]}>
            (서명 없음)
          </Text>
        )
      ) : (
        <Text style={styles.apText}>{cell.text || ""}</Text>
      )}
      {cell.annotation && cell.annotation.trim() ? (
        <Text style={styles.apAnnotation}>{cell.annotation}</Text>
      ) : null}
    </View>
  );
}

function BulletList({
  raw,
  cfg,
  styles,
}: {
  raw: string;
  cfg: ReturnLayoutSettings;
  styles: ReturnType<typeof buildStyles>;
}) {
  const items = parseBullets(raw);
  if (items.length === 0) {
    return (
      <Text
        style={[
          styles.bulletText,
          { color: cfg.placeholders.emptyFieldColor },
        ]}
      >
        {cfg.placeholders.emptyField}
      </Text>
    );
  }

  // depth 1 = 번호 매기기 (1./2./3.) — 어드민 마커 무시하고 자동 카운트
  let depth1Count = 0;
  return (
    <View>
      {items.map((item, i) => {
        const indent = (item.depth - 1) * cfg.workContent.indentPerDepth;
        let marker = cfg.workContent.depthMarkers[Math.min(item.depth - 1, 2)] ?? "-";
        if (item.depth === 1) {
          depth1Count += 1;
          // 마커가 "1." 형태이면 자동 카운트로 교체
          if (/^\d+\./.test(marker)) marker = `${depth1Count}.`;
        }
        return (
          <View key={i} style={[styles.bulletRow, { paddingLeft: indent }]}>
            <Text style={styles.bulletMarker}>{marker}</Text>
            <Text style={styles.bulletText}>{item.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

export type BusinessReturnDocumentProps = {
  row: ReturnRow;
  layout?: ReturnLayoutSettings;
};

export function BusinessReturnDocument({ row, layout }: BusinessReturnDocumentProps) {
  const cfg = layout ?? DEFAULT_RETURN_LAYOUT;
  const styles = buildStyles(cfg);
  const ph = cfg.placeholders;

  const orgFb = fb(row.org, ph);
  const nameFb = fb(row.name, ph);
  const periodFb = row.invalidPeriod
    ? { text: ph.dateInvalid, color: ph.dateInvalidColor }
    : row.periodText
      ? { text: row.periodText, color: undefined as string | undefined }
      : { text: ph.emptyField, color: ph.emptyFieldColor };
  const destFb = fb(row.destination, ph);
  const purposeFb = fb(row.purpose, ph);
  const costFb = fb(row.cost, ph);
  const paymentFb = fb(row.payment, ph);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 상단: 제목 + 결재란 */}
        <View style={styles.topBar}>
          <Text style={styles.title}>출장복명서</Text>
          <View style={styles.apTable}>
            {/* 헤더 행 (라벨) */}
            <View style={styles.apHeaderRow}>
              {row.approval.map((cell, i) => (
                <View
                  key={i}
                  style={
                    i === row.approval.length - 1
                      ? [styles.apHeaderCell, styles.apHeaderCellLast]
                      : styles.apHeaderCell
                  }
                >
                  <Text style={styles.apHeaderText}>{cell.label}</Text>
                </View>
              ))}
            </View>
            {/* 내용 행 (text/image/diagonal) */}
            <View style={styles.apContentRow}>
              {row.approval.map((cell, i) => (
                <ApprovalCellView
                  key={i}
                  cell={cell}
                  isLast={i === row.approval.length - 1}
                  cfg={cfg}
                  styles={styles}
                />
              ))}
            </View>
          </View>
        </View>

        {/* 데이터 테이블 */}
        <View style={styles.table}>
          {/* 출장자 (소속 + 성명) */}
          <View style={styles.row}>
            <View style={styles.travelerLabel}>
              <Text style={styles.labelText}>출장자</Text>
            </View>
            <View style={styles.travelerSubLabel}>
              <Text style={[styles.labelText, { fontSize: 9.5, letterSpacing: 1 }]}>소 속</Text>
            </View>
            <View style={styles.valueCellMid}>
              <Text style={[styles.valueText, orgFb.color ? { color: orgFb.color } : {}]}>{orgFb.text}</Text>
            </View>
            <View style={styles.travelerSubLabel}>
              <Text style={[styles.labelText, { fontSize: 9.5, letterSpacing: 1 }]}>성 명</Text>
            </View>
            <View style={styles.valueCell}>
              <Text style={[styles.valueText, nameFb.color ? { color: nameFb.color } : {}]}>{nameFb.text}</Text>
            </View>
          </View>

          {/* 출장기간 */}
          <View style={styles.row}>
            <View style={styles.labelCell}>
              <Text style={styles.labelText}>출장기간</Text>
            </View>
            <View style={styles.valueCell}>
              <Text style={[styles.valueText, periodFb.color ? { color: periodFb.color } : {}]}>{periodFb.text}</Text>
            </View>
          </View>

          {/* 출장지 */}
          <View style={styles.row}>
            <View style={styles.labelCell}>
              <Text style={styles.labelText}>출장지</Text>
            </View>
            <View style={styles.valueCell}>
              <Text style={[styles.valueText, destFb.color ? { color: destFb.color } : {}]}>{destFb.text}</Text>
            </View>
          </View>

          {/* 출장목적 */}
          <View style={styles.row}>
            <View style={styles.labelCell}>
              <Text style={styles.labelText}>출장목적</Text>
            </View>
            <View style={styles.valueCell}>
              <Text style={[styles.valueText, purposeFb.color ? { color: purposeFb.color } : {}]}>{purposeFb.text}</Text>
            </View>
          </View>

          {/* 업무내용 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { minHeight: cfg.workContent.minHeight }]}>
              <Text style={styles.labelText}>업무내용</Text>
            </View>
            <View style={styles.workContentCell}>
              <BulletList raw={row.workContent} cfg={cfg} styles={styles} />
            </View>
          </View>

          {/* 특이사항 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { minHeight: cfg.notes.minHeight }]}>
              <Text style={styles.labelText}>특이사항</Text>
            </View>
            <View style={styles.notesCell}>
              {row.notes && row.notes.trim() && row.notes.trim() !== "없음" ? (
                <BulletList raw={row.notes} cfg={cfg} styles={styles} />
              ) : (
                <Text style={styles.bulletText}>{row.notes?.trim() || "없음"}</Text>
              )}
            </View>
          </View>

          {/* 출장경비 + 정산방법 */}
          <View style={styles.row}>
            <View style={styles.labelCell}>
              <Text style={styles.labelText}>출장경비</Text>
            </View>
            <View style={styles.valueCellMid}>
              <Text style={[styles.valueText, costFb.color ? { color: costFb.color } : {}]}>{costFb.text}</Text>
              {row.costAnnotation && row.costAnnotation.trim() ? (
                <Text style={styles.costAnnotation}>{row.costAnnotation}</Text>
              ) : null}
            </View>
            <View style={[styles.labelCell, { width: cfg.dataTable.labelWidth }]}>
              <Text style={styles.labelText}>정산방법</Text>
            </View>
            <View style={styles.valueCell}>
              <Text style={[styles.valueText, paymentFb.color ? { color: paymentFb.color } : {}]}>{paymentFb.text}</Text>
            </View>
          </View>
          <Text style={[styles.footer, orgFb.color ? { color: orgFb.color } : {}]}>
            {orgFb.text}
          </Text>
        </View>
      </Page>
      {row.photos && row.photos.length > 0 ? (
        <PhotoPage photos={row.photos} cfg={cfg} styles={styles} />
      ) : null}
    </Document>
  );
}

function PhotoPage({
  photos,
  cfg,
  styles,
}: {
  photos: string[];
  cfg: ReturnLayoutSettings;
  styles: ReturnType<typeof buildStyles>;
}) {
  // A4 595 x 842pt. 페이지 패딩과 제목 영역을 cfg 기반으로 정확히 계산.
  const PAGE_W = 595;
  const PAGE_H = 842;
  const padPt = cfg.page.marginMm * 2.8346;
  // 제목: 50% 축소 폰트 × lineHeight 1.2 + marginBottom 10pt
  const titleAreaPt = cfg.title.fontSize * 0.5 * 1.2 + 10;
  // 오버플로우 방지용 안전 여유 (셀 테두리 누적 + flex wrap 라운딩 보정)
  const SAFETY_PT = 12;
  // 사진 수와 무관하게 2열 × 3행 고정. 빈 셀은 미렌더.
  const COLS = 2;
  const ROWS = 3;
  const gap = 8;
  const gridWidth = PAGE_W - padPt * 2;
  const gridHeight = PAGE_H - padPt * 2 - titleAreaPt - SAFETY_PT;
  const cellW = (gridWidth - gap * (COLS - 1)) / COLS;
  const cellH = (gridHeight - gap * (ROWS - 1)) / ROWS;
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.photoTitleWrap}>
        <Text style={styles.photoPageTitle}>첨부 사진</Text>
      </View>
      <View style={styles.photoGrid}>
        {photos.slice(0, COLS * ROWS).map((src, i) => (
          <View key={i} style={[styles.photoCell, { width: cellW, height: cellH }]}>
            <Image src={src} style={styles.photoImg} />
          </View>
        ))}
      </View>
    </Page>
  );
}
