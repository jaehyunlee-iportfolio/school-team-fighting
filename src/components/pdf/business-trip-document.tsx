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
import type { ExpenseTable } from "@/lib/trip/expense";
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
    /* ── 소요경비 표 (dataTable 내부 통합 — 외곽 보더 없음) ── */
    eTable: {
      width: "100%" as const,
      flexDirection: "row" as const,
    },
    /** "소요경비" 좌측 병합 셀 — 다른 라벨 셀(dLabel)과 같은 폭으로 맞춰
     *  모든 행의 좌/우 컬럼 경계가 일직선이 되도록 함 */
    eTitleCell: {
      width: cfg.dataTable.labelWidth,
      backgroundColor: cfg.expense.labelBgColor,
      borderColor: BORDER,
      borderRightWidth: b,
      borderBottomWidth: b,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    eTitleText: {
      fontSize: cfg.expense.titleFontSize,
      letterSpacing: cfg.expense.titleLetterSpacing,
      lineHeight: cfg.expense.titleLineHeight,
      textAlign: "center" as const,
    },
    eRows: { flex: 1, flexDirection: "column" as const },
    eRow: { flexDirection: "row" as const },
    eHeaderCell: {
      backgroundColor: cfg.expense.labelBgColor,
      borderColor: BORDER,
      borderRightWidth: b,
      borderBottomWidth: b,
      height: cfg.expense.headerRowHeight,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    eHeaderCellLast: { borderRightWidth: 0 },
    eHeaderText: { fontSize: cfg.expense.headerFontSize, textAlign: "center" as const },
    eCategoryCell: {
      width: cfg.expense.categoryColWidth,
      backgroundColor: cfg.expense.labelBgColor,
      borderColor: BORDER,
      borderRightWidth: b,
      borderBottomWidth: b,
      height: cfg.expense.rowHeight,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    eContentCell: {
      flex: 1,
      borderColor: BORDER,
      borderRightWidth: b,
      borderBottomWidth: b,
      height: cfg.expense.rowHeight,
      paddingVertical: cfg.expense.cellPaddingV,
      paddingHorizontal: cfg.expense.cellPaddingH,
      justifyContent: "center" as const,
    },
    eTotalCell: {
      width: cfg.expense.totalColWidth,
      borderColor: BORDER,
      borderBottomWidth: b,
      height: cfg.expense.rowHeight,
      paddingVertical: cfg.expense.cellPaddingV,
      paddingHorizontal: cfg.expense.cellPaddingH,
      justifyContent: "center" as const,
      alignItems: "flex-end" as const,
    },
    eCellText: { fontSize: cfg.expense.cellFontSize, textAlign: "left" as const },
    eCellTextRight: { fontSize: cfg.expense.cellFontSize, textAlign: "right" as const },
    eReviewText: { color: cfg.expense.reviewColor },
    content: { width: "100%" as const },
  });
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n) + "…");

/** PDF 렌더링에 필요한 row/group의 공통 필드 */
export type TripPdfData = Pick<
  TripRow,
  "periodText" | "orgName" | "writerName" | "drafter3" | "memberText" | "outPlace" | "purposeText" | "approver1" | "approver2"
>;

export type BusinessTripDocumentProps = {
  row: TripPdfData;
  /** 소요경비 표 (그룹 단위로 빌드된 결과). 없으면 표 미렌더 */
  expenseTable?: ExpenseTable;
  approver1Src?: string;
  approver2Src?: string;
  logoSrc?: string;
  layout?: PdfLayoutSettings;
};

export function BusinessTripDocument({
  row,
  expenseTable,
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
                    <View style={[styles.apSignC, { position: "relative" }]}>
                      {skipApprover1 ? (
                        // 셀 전체를 덮는 absolute SVG로 정확히 모서리(꼭짓점) → 모서리 대각선 그리기
                        <Svg
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                          }}
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                        >
                          <Line
                            x1="0"
                            y1="100"
                            x2="100"
                            y2="0"
                            stroke={cfg.border.color}
                            strokeWidth={1}
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
            {expenseTable ? <ExpenseSection table={expenseTable} styles={styles} cfg={cfg} /> : null}
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

function ExpenseSection({
  table,
  styles,
  cfg,
}: {
  table: ExpenseTable;
  styles: ReturnType<typeof buildStyles>;
  cfg: PdfLayoutSettings;
}) {
  const fmt = (n: number) => (n > 0 ? `${n.toLocaleString("ko-KR")}원` : "");
  const all: { label: string; content: string; total: number; needsReview: boolean }[] = [
    { label: "교통비", content: table.교통비.contentText, total: table.교통비.total, needsReview: table.교통비.needsReview },
    { label: "일비", content: table.일비.contentText, total: table.일비.total, needsReview: table.일비.needsReview },
    { label: "식비", content: table.식비.contentText, total: table.식비.total, needsReview: table.식비.needsReview },
    { label: "숙박비", content: table.숙박비.contentText, total: table.숙박비.total, needsReview: table.숙박비.needsReview },
    { label: "기타", content: table.기타.contentText, total: table.기타.total, needsReview: table.기타.needsReview },
  ];
  // 빈 행(내용 없고 합계 0)은 제거
  const rows = all.filter((r) => r.content.trim() || r.total > 0);
  // 합계 행은 항상 표시
  rows.push({ label: "합계", content: "", total: table.합계, needsReview: false });
  return (
    <View style={styles.eTable}>
      <View style={styles.eTitleCell}>
        <Text style={styles.eTitleText}>{"소\n요\n경\n비"}</Text>
      </View>
      <View style={styles.eRows}>
        {/* 헤더 행 */}
        <View style={styles.eRow}>
          <View style={[styles.eHeaderCell, { width: cfg.expense.categoryColWidth }]}>
            <Text style={styles.eHeaderText}>구분</Text>
          </View>
          <View style={[styles.eHeaderCell, { flex: 1 }]}>
            <Text style={styles.eHeaderText}>내용</Text>
          </View>
          <View style={[styles.eHeaderCell, styles.eHeaderCellLast, { width: cfg.expense.totalColWidth }]}>
            <Text style={styles.eHeaderText}>합계</Text>
          </View>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.eRow}>
            <View style={styles.eCategoryCell}>
              <Text style={styles.eHeaderText}>{r.label}</Text>
            </View>
            <View style={styles.eContentCell}>
              {r.content ? (
                <Text style={[styles.eCellText, r.needsReview ? styles.eReviewText : {}]}>{r.content}</Text>
              ) : null}
            </View>
            <View style={styles.eTotalCell}>
              {r.total > 0 ? (
                <Text style={styles.eCellTextRight}>{fmt(r.total)}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
