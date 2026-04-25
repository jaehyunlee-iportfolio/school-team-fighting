/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image, not next/image */
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
import type { ReactNode } from "react";
import type { TripRow } from "@/lib/csv/parseD4";
import {
  type PdfLayoutSettings,
  DEFAULT_PDF_LAYOUT,
} from "@/lib/firebase/firestore";

function buildStyles(cfg: PdfLayoutSettings) {
  const MM = cfg.page.marginMm * 2.8346;
  const b = cfg.border.width;
  const BORDER = cfg.border.color;

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
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: cfg.title.marginBottom,
    },
    logoTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
    },
    logo: {
      width: cfg.logo.width,
      height: cfg.logo.height,
      marginRight: cfg.logo.marginRight,
      marginLeft: cfg.logo.offsetX,
      marginTop: cfg.logo.offsetY,
      objectFit: "contain" as const,
    },
    pageTitle: {
      fontSize: cfg.title.fontSize,
      fontWeight: cfg.title.fontWeight as 700,
      lineHeight: cfg.title.lineHeight,
    },
    apTable: { width: cfg.approval.tableWidth, borderWidth: b, borderColor: BORDER },
    apRow: { flexDirection: "row" },
    gyeoljaeCol: {
      width: cfg.approval.labelColWidth,
      borderRightWidth: b,
      borderColor: BORDER,
      minHeight: cfg.approval.labelColMinHeight,
      justifyContent: "center",
      alignItems: "center",
    },
    gchar: { fontSize: cfg.approval.labelFontSize, lineHeight: 1.15 },
    apRest: { flex: 1, flexDirection: "column" },
    apHead: {
      flexDirection: "row",
      borderColor: BORDER,
      borderBottomWidth: b,
      minHeight: cfg.approval.headerMinHeight,
    },
    apHeadC: {
      flex: 1,
      borderColor: BORDER,
      borderRightWidth: b,
      paddingVertical: cfg.approval.headerPaddingV,
      paddingHorizontal: cfg.approval.headerPaddingH,
      justifyContent: "center",
      alignItems: "center",
    },
    apHeadCLast: { borderRightWidth: 0 },
    apHeadT: { fontSize: cfg.approval.headerFontSize, textAlign: "center" },
    apSign: { flexDirection: "row", minHeight: cfg.approval.signMinHeight },
    apSignC: {
      flex: 1,
      borderColor: BORDER,
      borderRightWidth: b,
      padding: cfg.approval.signPadding,
      justifyContent: "center",
      alignItems: "center",
    },
    apSignCLast: { borderRightWidth: 0 },
    drafter: { fontSize: cfg.approval.drafterFontSize, textAlign: "center" },
    small: { fontSize: cfg.approval.placeholderFontSize, color: cfg.approval.placeholderColor },
    apImg: {
      maxHeight: cfg.approval.signImageMaxHeight,
      maxWidth: "100%",
      objectFit: "contain" as const,
    },
    dataTable: {
      width: "100%" as const,
      borderColor: BORDER,
      borderTopWidth: b,
      borderLeftWidth: b,
      borderRightWidth: b,
      borderBottomWidth: 0,
    },
    dRow: { flexDirection: "row", width: "100%" as const, borderColor: BORDER },
    dLabel: {
      width: cfg.dataTable.labelWidth,
      minHeight: cfg.dataTable.rowMinHeight,
      borderColor: BORDER,
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderRightWidth: b,
      borderBottomWidth: b,
      backgroundColor: cfg.dataTable.labelBgColor,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: cfg.dataTable.labelPaddingV,
      paddingHorizontal: cfg.dataTable.labelPaddingH,
    },
    dLabelT: {
      fontSize: cfg.dataTable.labelFontSize,
      textAlign: "center",
      fontWeight: cfg.dataTable.labelFontWeight as 500,
    },
    dValue: {
      flex: 1,
      minHeight: cfg.dataTable.rowMinHeight,
      borderColor: BORDER,
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: b,
      paddingVertical: cfg.dataTable.valuePaddingV,
      paddingHorizontal: cfg.dataTable.valuePaddingH,
      justifyContent: "center",
    },
    dValS: { fontSize: cfg.dataTable.valueFontSize, textAlign: "left" },
    intro: {
      fontSize: cfg.intro.fontSize,
      textAlign: "left",
      marginTop: cfg.intro.marginTop,
      marginBottom: cfg.intro.marginBottom,
    },
    pRow: { flexDirection: "row", width: "100%" as const },
    pLabel: {
      width: cfg.dataTable.labelWidth,
      minHeight: cfg.purpose.minHeight,
      borderColor: BORDER,
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderRightWidth: b,
      borderBottomWidth: b,
      backgroundColor: cfg.dataTable.labelBgColor,
      justifyContent: "center",
      alignItems: "center",
    },
    pValue: {
      flex: 1,
      minHeight: cfg.purpose.minHeight,
      borderColor: BORDER,
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: b,
      padding: cfg.purpose.padding,
    },
    purpose: {
      fontSize: cfg.purpose.fontSize,
      lineHeight: cfg.purpose.lineHeight,
      textAlign: "left",
      whiteSpace: "pre-wrap" as const,
    },
    footer: {
      marginTop: cfg.footer.marginTop,
      textAlign: "center",
      fontSize: cfg.footer.fontSize,
      fontWeight: cfg.footer.fontWeight as 700,
    },
    content: { width: "100%" as const },
  });
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n) + "…");

export type BusinessTripDocumentProps = {
  row: TripRow;
  approver1Src?: string;
  approver2Src?: string;
  logoSrc?: string;
  layout?: PdfLayoutSettings;
};

export function BusinessTripDocument({
  row,
  approver1Src,
  approver2Src,
  logoSrc,
  layout,
}: BusinessTripDocumentProps) {
  const cfg = layout ?? DEFAULT_PDF_LAYOUT;
  const styles = buildStyles(cfg);
  const ph = cfg.placeholders;

  const fb = (value: string | undefined | null) =>
    value ? { text: value, color: undefined } : { text: ph.emptyField, color: ph.emptyFieldColor };

  const periodColor = (() => {
    if (!row.periodText) return ph.emptyFieldColor;
    if (row.periodText === ph.dateInvalid) return ph.dateInvalidColor;
    if (row.periodText.includes(ph.dateFallback)) return ph.dateFallbackColor;
    return undefined;
  })();

  const DataTableRow = ({ children }: { children: ReactNode }) => (
    <View style={styles.dRow}>{children}</View>
  );
  const LabelCell = ({ children }: { children: ReactNode }) => (
    <View style={styles.dLabel}>{children}</View>
  );
  const ValCell = ({ children }: { children: ReactNode }) => (
    <View style={styles.dValue}>{children}</View>
  );

  const orgFb = fb(row.orgName);
  const writerFb = fb(row.writerName);

  // 기안자가 결재자1(팀장/사무국장)을 겸하면 그 칸은 건너뛰고 대각선(/)으로 표시
  const SKIP_APPROVER1_NAMES = new Set(["장인선", "박준호"]);
  const skipApprover1 = SKIP_APPROVER1_NAMES.has(row.writerName?.trim() ?? "");
  const memberFb = fb(row.memberText);
  const periodFb = row.periodText
    ? { text: row.periodText, color: periodColor }
    : { text: ph.emptyField, color: ph.emptyFieldColor };
  const placeFb = fb(row.outPlace);
  const purposeFb = fb(row.purposeText);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <View style={styles.logoTitleWrap}>
              {cfg.logo.enabled && logoSrc && (
                <Image src={logoSrc} style={styles.logo} />
              )}
              <Text style={styles.pageTitle}>출장신청서</Text>
            </View>
            <View style={styles.apTable}>
              <View style={styles.apRow}>
                <View style={styles.gyeoljaeCol}>
                  <View>
                    <Text style={styles.gchar}>결</Text>
                    <Text style={[styles.gchar, { marginTop: cfg.approval.labelCharGap }]}>재</Text>
                  </View>
                </View>
                <View style={styles.apRest}>
                  <View style={styles.apHead}>
                    {[
                      { k: 0, t: "기안자", last: false },
                      { k: 1, t: row.approver1, last: false },
                      { k: 2, t: row.approver2, last: true },
                    ].map((c) => (
                      <View
                        key={c.k}
                        style={c.last ? [styles.apHeadC, styles.apHeadCLast] : styles.apHeadC}
                      >
                        <Text style={styles.apHeadT}>{c.t || " "}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.apSign}>
                    <View style={styles.apSignC}>
                      {row.drafter3 ? (
                        <Text style={styles.drafter}>{row.drafter3}</Text>
                      ) : (
                        <Text style={[styles.small, { color: ph.drafterEmptyColor }]}>{ph.drafterEmpty}</Text>
                      )}
                    </View>
                    <View style={styles.apSignC}>
                      {skipApprover1 ? (
                        <Svg
                          style={{ width: "100%", height: cfg.approval.signImageMaxHeight }}
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                        >
                          {/* 좌하단(0,100) → 우상단(100,0) 대각선 — 셀 모서리에 정확히 닿도록 */}
                          <Line
                            x1="0"
                            y1="100"
                            x2="100"
                            y2="0"
                            stroke={cfg.border.color}
                            strokeWidth={cfg.border.width}
                          />
                        </Svg>
                      ) : approver1Src ? (
                        <Image src={approver1Src} style={styles.apImg} />
                      ) : (
                        <Text style={[styles.small, { color: ph.signEmptyColor }]}>{ph.signEmpty}</Text>
                      )}
                    </View>
                    <View style={[styles.apSignC, styles.apSignCLast]}>
                      {approver2Src ? (
                        <Image src={approver2Src} style={styles.apImg} />
                      ) : (
                        <Text style={[styles.small, { color: ph.signEmptyColor }]}>{ph.signEmpty}</Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.dataTable}>
            <DataTableRow>
              <LabelCell>
                <Text style={styles.dLabelT}>작성자 소속</Text>
              </LabelCell>
              <ValCell>
                <Text style={[styles.dValS, orgFb.color ? { color: orgFb.color } : {}]}>{orgFb.text}</Text>
              </ValCell>
            </DataTableRow>
            <DataTableRow>
              <LabelCell>
                <Text style={styles.dLabelT}>작성자 성명</Text>
              </LabelCell>
              <ValCell>
                <Text style={[styles.dValS, writerFb.color ? { color: writerFb.color } : {}]}>{writerFb.text}</Text>
              </ValCell>
            </DataTableRow>
          </View>

          <Text style={styles.intro}>아래와 같이 출장을 신청합니다.</Text>

          <View style={styles.dataTable}>
            <DataTableRow>
              <LabelCell>
                <Text style={styles.dLabelT}>출장 인원</Text>
              </LabelCell>
              <ValCell>
                <Text style={[styles.dValS, memberFb.color ? { color: memberFb.color } : {}]}>{memberFb.text}</Text>
              </ValCell>
            </DataTableRow>
            <DataTableRow>
              <LabelCell>
                <Text style={styles.dLabelT}>출장 기간</Text>
              </LabelCell>
              <ValCell>
                <Text style={[styles.dValS, periodFb.color ? { color: periodFb.color } : {}]}>{periodFb.text}</Text>
              </ValCell>
            </DataTableRow>
            <DataTableRow>
              <LabelCell>
                <Text style={styles.dLabelT}>출 장 지</Text>
              </LabelCell>
              <ValCell>
                <Text style={[styles.dValS, placeFb.color ? { color: placeFb.color } : {}]}>{placeFb.text}</Text>
              </ValCell>
            </DataTableRow>
            <View style={styles.pRow}>
              <View style={styles.pLabel}>
                <Text style={styles.dLabelT}>출장 목적</Text>
              </View>
              <View style={styles.pValue}>
                <Text style={[styles.purpose, purposeFb.color ? { color: purposeFb.color } : {}]}>
                  {clip(purposeFb.text, 4000)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.footer, orgFb.color ? { color: orgFb.color } : {}]}>
            {orgFb.text}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
