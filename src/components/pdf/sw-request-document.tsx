/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type {
  SwRequestSettings,
  SwRequestLayoutSettings,
} from "@/lib/firebase/firestore";
import { DEFAULT_SW_REQUEST_LAYOUT } from "@/lib/firebase/firestore";
import type { SwRequestRow } from "@/lib/sw/types";

const BORDER_W = 0.7;

function buildStyles(cfg: SwRequestLayoutSettings) {
  const MM = cfg.page.marginMm * 2.8346;
  const BC = cfg.infoTable.borderColor;
  return StyleSheet.create({
    page: {
      fontFamily: cfg.page.fontFamily,
      fontSize: cfg.page.baseFontSize,
      paddingTop: MM,
      paddingBottom: MM,
      paddingLeft: MM,
      paddingRight: MM,
    },
    title: {
      fontSize: cfg.title.fontSize,
      fontWeight: cfg.title.fontWeight as 700,
      textAlign: cfg.title.textAlign,
      marginBottom: cfg.title.marginBottom,
    },
    // ── 신청자 정보 표
    infoTable: {
      borderTopWidth: BORDER_W,
      borderLeftWidth: BORDER_W,
      borderRightWidth: BORDER_W,
      borderColor: BC,
      marginBottom: cfg.infoTable.marginBottom,
    },
    infoSectionHeader: {
      backgroundColor: cfg.infoTable.headerBg,
      paddingVertical: cfg.infoTable.cellPaddingV,
      borderBottomWidth: BORDER_W,
      borderColor: BC,
      alignItems: "center" as const,
    },
    infoSectionHeaderText: {
      fontSize: cfg.infoTable.sectionTitleFontSize,
      fontWeight: 700 as 700,
    },
    infoRow: {
      flexDirection: "row" as const,
    },
    infoLabel: {
      width: cfg.infoTable.labelWidth,
      backgroundColor: cfg.infoTable.labelBg,
      borderRightWidth: BORDER_W,
      borderBottomWidth: BORDER_W,
      borderColor: BC,
      paddingVertical: cfg.infoTable.cellPaddingV,
      paddingHorizontal: cfg.infoTable.cellPaddingH,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      minHeight: cfg.infoTable.rowHeight,
    },
    infoLabelText: {
      fontSize: cfg.infoTable.labelFontSize,
      fontWeight: 600 as 600,
    },
    infoValue: {
      flex: 1,
      borderRightWidth: BORDER_W,
      borderBottomWidth: BORDER_W,
      borderColor: BC,
      paddingVertical: cfg.infoTable.cellPaddingV,
      paddingHorizontal: cfg.infoTable.cellPaddingH,
      justifyContent: "center" as const,
      minHeight: cfg.infoTable.rowHeight,
    },
    infoValueLast: {
      flex: 1,
      borderBottomWidth: BORDER_W,
      borderColor: BC,
      paddingVertical: cfg.infoTable.cellPaddingV,
      paddingHorizontal: cfg.infoTable.cellPaddingH,
      justifyContent: "center" as const,
      minHeight: cfg.infoTable.rowHeight,
    },
    infoValueText: {
      fontSize: cfg.infoTable.valueFontSize,
    },
    // ── 요청 사항 표
    itemsTable: {
      borderTopWidth: BORDER_W,
      borderLeftWidth: BORDER_W,
      borderRightWidth: BORDER_W,
      borderColor: cfg.itemsTable.borderColor,
      marginBottom: cfg.itemsTable.marginBottom,
    },
    itemsSectionHeader: {
      backgroundColor: cfg.itemsTable.headerBg,
      paddingVertical: cfg.itemsTable.cellPaddingV,
      borderBottomWidth: BORDER_W,
      borderColor: cfg.itemsTable.borderColor,
      alignItems: "center" as const,
    },
    itemsSectionHeaderText: {
      fontSize: cfg.itemsTable.sectionTitleFontSize,
      fontWeight: 700 as 700,
    },
    itemsHeaderRow: {
      flexDirection: "row" as const,
      backgroundColor: cfg.itemsTable.headerBg,
    },
    itemsRow: {
      flexDirection: "row" as const,
    },
    itemsCell: {
      borderRightWidth: BORDER_W,
      borderBottomWidth: BORDER_W,
      borderColor: cfg.itemsTable.borderColor,
      paddingVertical: cfg.itemsTable.cellPaddingV,
      paddingHorizontal: cfg.itemsTable.cellPaddingH,
      justifyContent: "center" as const,
      minHeight: cfg.itemsTable.rowHeight,
    },
    itemsCellLast: {
      borderBottomWidth: BORDER_W,
      borderColor: cfg.itemsTable.borderColor,
      paddingVertical: cfg.itemsTable.cellPaddingV,
      paddingHorizontal: cfg.itemsTable.cellPaddingH,
      justifyContent: "center" as const,
      minHeight: cfg.itemsTable.rowHeight,
    },
    itemsHeaderText: {
      fontSize: cfg.itemsTable.headerFontSize,
      fontWeight: 700 as 700,
      textAlign: "center" as const,
    },
    itemsValueText: {
      fontSize: cfg.itemsTable.valueFontSize,
      textAlign: "center" as const,
    },
    closing: {
      fontSize: cfg.closing.fontSize,
      textAlign: cfg.closing.textAlign,
      marginTop: cfg.closing.marginTop,
      marginBottom: cfg.closing.marginBottom,
    },
    date: {
      fontSize: cfg.date.fontSize,
      textAlign: cfg.date.textAlign,
      marginBottom: cfg.date.marginBottom,
    },
    recipient: {
      fontSize: cfg.recipient.fontSize,
      fontWeight: cfg.recipient.fontWeight as 700,
      textAlign: cfg.recipient.textAlign,
      marginTop: cfg.recipient.marginTop,
    },
  });
}

export type SwRequestDocumentProps = {
  row: SwRequestRow;
  settings: SwRequestSettings;
  layout?: SwRequestLayoutSettings;
};

function spaceDateUnits(s: string): string {
  return s.replace(/(\d)\s*(년|월|일)/g, "$1 $2");
}

export function SwRequestDocument({
  row,
  settings,
  layout,
}: SwRequestDocumentProps) {
  const cfg = layout ?? DEFAULT_SW_REQUEST_LAYOUT;
  const styles = buildStyles(cfg);
  const ph = cfg.placeholders;

  const fb = (s: string | undefined | null) =>
    s && s.trim()
      ? { text: s, color: undefined as string | undefined }
      : { text: ph.emptyField, color: ph.emptyFieldColor };

  const target = (row.applicantTarget || settings.defaultTarget || ph.target).trim();
  const schoolFb = fb(row.schoolName);
  const nameFb = fb(row.applicantName);
  const phoneFb = fb(row.applicantPhone);
  const targetFb = fb(target);

  const totalRatio = cfg.itemsTable.colRatios.reduce((a, b) => a + b, 0) || 1;
  const colFlex = cfg.itemsTable.colRatios.map((r) => r / totalRatio);

  // 날짜
  const dateText =
    row.quoteY && row.quoteM && row.quoteD
      ? spaceDateUnits(`${row.quoteY} 년 ${row.quoteM} 월 ${row.quoteD} 일`)
      : ph.emptyField;
  const dateColor =
    row.quoteY && row.quoteM && row.quoteD ? undefined : ph.emptyFieldColor;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {settings.titleText || "소프트웨어 활용 희망 요청서"}
        </Text>

        {/* ── 신청자 정보 ── */}
        <View style={styles.infoTable}>
          <View style={styles.infoSectionHeader}>
            <Text style={styles.infoSectionHeaderText}>신청자 정보</Text>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoLabel}>
              <Text style={styles.infoLabelText}>신청자</Text>
            </View>
            <View style={styles.infoValue}>
              <Text style={[styles.infoValueText, nameFb.color ? { color: nameFb.color } : {}]}>
                {nameFb.text}
              </Text>
            </View>
            <View style={styles.infoLabel}>
              <Text style={styles.infoLabelText}>신청 학교</Text>
            </View>
            <View style={styles.infoValueLast}>
              <Text style={[styles.infoValueText, schoolFb.color ? { color: schoolFb.color } : {}]}>
                {schoolFb.text}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoLabel}>
              <Text style={styles.infoLabelText}>연락처</Text>
            </View>
            <View style={styles.infoValue}>
              <Text style={[styles.infoValueText, phoneFb.color ? { color: phoneFb.color } : {}]}>
                {phoneFb.text}
              </Text>
            </View>
            <View style={styles.infoLabel}>
              <Text style={styles.infoLabelText}>신청 대상</Text>
            </View>
            <View style={styles.infoValueLast}>
              <Text style={[styles.infoValueText, targetFb.color ? { color: targetFb.color } : {}]}>
                {targetFb.text}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 요청 사항 ── */}
        <View style={styles.itemsTable}>
          <View style={styles.itemsSectionHeader}>
            <Text style={styles.itemsSectionHeaderText}>요청 사항</Text>
          </View>
          <View style={styles.itemsHeaderRow}>
            <ItemsCell flex={colFlex[0]} style={styles.itemsCell}>
              <Text style={styles.itemsHeaderText}>사용자</Text>
            </ItemsCell>
            <ItemsCell flex={colFlex[1]} style={styles.itemsCell}>
              <Text style={styles.itemsHeaderText}>품목명 및 규격</Text>
            </ItemsCell>
            <ItemsCell flex={colFlex[2]} style={styles.itemsCell}>
              <Text style={styles.itemsHeaderText}>수량</Text>
            </ItemsCell>
            <ItemsCell flex={colFlex[3]} style={styles.itemsCellLast}>
              <Text style={styles.itemsHeaderText}>사용기간</Text>
            </ItemsCell>
          </View>
          {row.items.length === 0 ? (
            <View style={styles.itemsRow}>
              <ItemsCell flex={1} style={styles.itemsCellLast}>
                <Text
                  style={[styles.itemsValueText, { color: ph.emptyFieldColor }]}
                >
                  {ph.emptyField}
                </Text>
              </ItemsCell>
            </View>
          ) : (
            row.items.map((it, i) => {
              const userFb = fb(it.user);
              const productFb = fb(it.product);
              const qtyFb = fb(it.quantity);
              const periodFb = fb(it.period);
              return (
                <View key={i} style={styles.itemsRow}>
                  <ItemsCell flex={colFlex[0]} style={styles.itemsCell}>
                    <Text style={[styles.itemsValueText, userFb.color ? { color: userFb.color } : {}]}>
                      {userFb.text}
                    </Text>
                  </ItemsCell>
                  <ItemsCell flex={colFlex[1]} style={styles.itemsCell}>
                    <Text style={[styles.itemsValueText, productFb.color ? { color: productFb.color } : {}]}>
                      {productFb.text}
                    </Text>
                  </ItemsCell>
                  <ItemsCell flex={colFlex[2]} style={styles.itemsCell}>
                    <Text style={[styles.itemsValueText, qtyFb.color ? { color: qtyFb.color } : {}]}>
                      {qtyFb.text}
                    </Text>
                  </ItemsCell>
                  <ItemsCell flex={colFlex[3]} style={styles.itemsCellLast}>
                    <Text style={[styles.itemsValueText, periodFb.color ? { color: periodFb.color } : {}]}>
                      {periodFb.text}
                    </Text>
                  </ItemsCell>
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.closing}>
          {settings.closingText ||
            "위와 같은 내용으로 소프트웨어 활용을 희망합니다."}
        </Text>
        <Text style={[styles.date, dateColor ? { color: dateColor } : {}]}>
          {dateText}
        </Text>
        <Text style={styles.recipient}>
          {settings.recipientText || "(주)아이포트폴리오 귀하"}
        </Text>
      </Page>
    </Document>
  );
}

// 임의의 styleSheet 결과 타입 (react-pdf 가 외부로 Style 타입을 export 하지 않으므로 추론에 의존)
type Styles = ReturnType<typeof buildStyles>;
type CellStyle = Styles[keyof Styles];

function ItemsCell({
  flex,
  style,
  children,
}: {
  flex: number;
  style: CellStyle;
  children: React.ReactNode;
}) {
  return <View style={[style, { flex }]}>{children}</View>;
}
