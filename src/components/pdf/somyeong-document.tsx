/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image */
import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { SomyeongRow } from "@/lib/csv/parseSomyeong";
import type { SomyeongSettings, SomyeongLayoutSettings } from "@/lib/firebase/firestore";
import { DEFAULT_SOMYEONG_LAYOUT } from "@/lib/firebase/firestore";

function buildStyles(cfg: SomyeongLayoutSettings) {
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
    title: {
      fontSize: cfg.title.fontSize,
      fontWeight: cfg.title.fontWeight as 700,
      textAlign: cfg.title.textAlign,
      marginBottom: cfg.title.marginBottom,
    },
    // ── 테이블 외곽: top+left+right만, bottom 없음 (출장신청서 동일 패턴)
    table: {
      borderTopWidth: b,
      borderLeftWidth: b,
      borderRightWidth: b,
      borderBottomWidth: 0,
      borderColor: BC,
    },
    // ── 섹션 헤더 (테이블 내부 첫 행)
    sectionHeader: {
      backgroundColor: cfg.sectionHeader.bgColor,
      minHeight: cfg.sectionHeader.minHeight,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      borderBottomWidth: b,
      borderColor: BC,
    },
    sectionHeaderText: {
      fontSize: cfg.sectionHeader.fontSize,
      fontWeight: cfg.sectionHeader.fontWeight as 600,
      textAlign: "center" as const,
    },
    // ── 데이터 행: 방향만, 테두리 없음 (각 셀이 담당)
    row: {
      flexDirection: "row" as const,
    },
    // ── 라벨 셀: right+bottom
    labelCell: {
      width: cfg.infoTable.labelWidth,
      minHeight: cfg.infoTable.rowMinHeight,
      backgroundColor: cfg.infoTable.labelBgColor,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingVertical: cfg.infoTable.labelPaddingV,
      paddingHorizontal: cfg.infoTable.labelPaddingH,
    },
    labelText: {
      fontSize: cfg.infoTable.labelFontSize,
      fontWeight: cfg.infoTable.labelFontWeight as 500,
      textAlign: "center" as const,
    },
    // ── 값 셀 (중간): right+bottom
    valueCellMid: {
      flex: 1,
      minHeight: cfg.infoTable.rowMinHeight,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      paddingVertical: cfg.infoTable.valuePaddingV,
      paddingHorizontal: cfg.infoTable.valuePaddingH,
    },
    // ── 값 셀 (마지막): bottom만
    valueCellEnd: {
      flex: 1,
      minHeight: cfg.infoTable.rowMinHeight,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      paddingVertical: cfg.infoTable.valuePaddingV,
      paddingHorizontal: cfg.infoTable.valuePaddingH,
    },
    valueText: {
      fontSize: cfg.infoTable.valueFontSize,
    },
    infoTableMargin: {
      marginBottom: cfg.infoTable.marginBottom,
    },
    // ── 상세 내용: section header(bottom) + body(bottom) = 외곽 table(top+left+right) 닫힘
    detailBody: {
      borderBottomWidth: b,
      borderColor: BC,
      paddingVertical: cfg.detailSection.paddingV,
      paddingHorizontal: cfg.detailSection.paddingH,
    },
    detailText: {
      fontSize: cfg.detailSection.fontSize,
      lineHeight: cfg.detailSection.lineHeight,
      whiteSpace: "pre-wrap" as const,
    },
    detailTableMargin: {
      marginBottom: cfg.detailSection.marginBottom,
    },
    // ── 구분선
    divider: {
      borderBottomWidth: b,
      borderColor: BC,
      marginTop: cfg.divider.marginTop,
      marginBottom: cfg.divider.marginBottom,
    },
    // ── 첨부서류
    attachTitle: {
      fontSize: cfg.attachSection.titleFontSize,
      fontWeight: cfg.attachSection.titleFontWeight as 700,
      marginBottom: cfg.attachSection.titleMarginBottom,
    },
    attachText: {
      fontSize: cfg.attachSection.fontSize,
      lineHeight: cfg.attachSection.lineHeight,
      whiteSpace: "pre-wrap" as const,
      marginBottom: cfg.attachSection.marginBottom,
    },
    // ── 서명 영역
    closingText: {
      fontSize: cfg.closingText.fontSize,
      textAlign: cfg.closingText.textAlign,
      marginTop: cfg.closingText.marginTop,
      marginBottom: cfg.closingText.marginBottom,
    },
    dateText: {
      fontSize: cfg.dateText.fontSize,
      textAlign: cfg.dateText.textAlign,
      marginBottom: cfg.dateText.marginBottom,
    },
    signatureRow: {
      flexDirection: "row" as const,
      justifyContent: "flex-end" as const,
      alignItems: "center" as const,
      marginBottom: cfg.signature.marginBottom,
      gap: 8,
    },
    signatureText: {
      fontSize: cfg.signature.fontSize,
    },
    signImg: {
      maxHeight: cfg.signature.signImageMaxHeight,
      maxWidth: 80,
      objectFit: "contain" as const,
    },
    recipientText: {
      fontSize: cfg.recipient.fontSize,
      fontWeight: cfg.recipient.fontWeight as 600,
      textAlign: cfg.recipient.textAlign,
    },
  });
}

export type SomyeongDocumentProps = {
  row: SomyeongRow;
  settings: SomyeongSettings;
  layout?: SomyeongLayoutSettings;
};

export function SomyeongDocument({ row, settings, layout }: SomyeongDocumentProps) {
  const cfg = layout ?? DEFAULT_SOMYEONG_LAYOUT;
  const styles = buildStyles(cfg);
  const ph = cfg.placeholders;

  const fb = (value: string | undefined | null) =>
    value && value.trim()
      ? { text: value, color: undefined as string | undefined }
      : { text: ph.emptyField, color: ph.emptyFieldColor };

  const nameFb = fb(settings.name);
  const orgPosFb = fb(settings.orgPosition);
  const phoneFb = fb(settings.phone);
  const birthFb = fb(settings.birthdate);
  const addressFb = fb(settings.address);
  const dateFb = fb(settings.date);
  const writerFb = fb(settings.writerName);
  const recipientFb = fb(settings.recipient);
  const titleFb = fb(row.title);
  const detailFb = fb(row.detail);
  const attachFb = fb(row.attachments);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 제목 */}
        <Text style={styles.title}>소명서</Text>

        {/* 소명자 정보 테이블 */}
        <View style={[styles.table, styles.infoTableMargin]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>소명자 정보</Text>
          </View>
          {/* 성명 / 소속·직위 */}
          <View style={styles.row}>
            <View style={styles.labelCell}><Text style={styles.labelText}>성명</Text></View>
            <View style={styles.valueCellMid}>
              <Text style={[styles.valueText, nameFb.color ? { color: nameFb.color } : {}]}>{nameFb.text}</Text>
            </View>
            <View style={styles.labelCell}><Text style={styles.labelText}>소속/직위</Text></View>
            <View style={styles.valueCellEnd}>
              <Text style={[styles.valueText, orgPosFb.color ? { color: orgPosFb.color } : {}]}>{orgPosFb.text}</Text>
            </View>
          </View>
          {/* 연락처 / 생년월일 */}
          <View style={styles.row}>
            <View style={styles.labelCell}><Text style={styles.labelText}>연락처</Text></View>
            <View style={styles.valueCellMid}>
              <Text style={[styles.valueText, phoneFb.color ? { color: phoneFb.color } : {}]}>{phoneFb.text}</Text>
            </View>
            <View style={styles.labelCell}><Text style={styles.labelText}>생년월일</Text></View>
            <View style={styles.valueCellEnd}>
              <Text style={[styles.valueText, birthFb.color ? { color: birthFb.color } : {}]}>{birthFb.text}</Text>
            </View>
          </View>
          {/* 사업장 주소 */}
          <View style={styles.row}>
            <View style={styles.labelCell}><Text style={styles.labelText}>사업장 주소</Text></View>
            <View style={styles.valueCellEnd}>
              <Text style={[styles.valueText, addressFb.color ? { color: addressFb.color } : {}]}>{addressFb.text}</Text>
            </View>
          </View>
          {/* 건명 */}
          <View style={styles.row}>
            <View style={styles.labelCell}><Text style={styles.labelText}>건 명</Text></View>
            <View style={styles.valueCellEnd}>
              <Text style={[styles.valueText, titleFb.color ? { color: titleFb.color } : {}]}>{titleFb.text}</Text>
            </View>
          </View>
        </View>

        {/* 소명서 상세 내용 */}
        <View style={[styles.table, styles.detailTableMargin]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>소명서 상세 내용</Text>
          </View>
          <View style={styles.detailBody}>
            <Text style={[styles.detailText, detailFb.color ? { color: detailFb.color } : {}]}>{detailFb.text}</Text>
          </View>
        </View>

        {/* 구분선 */}
        <View style={styles.divider} />

        {/* 첨부서류 */}
        <Text style={styles.attachTitle}>첨부서류</Text>
        <Text style={[styles.attachText, attachFb.color ? { color: attachFb.color } : {}]}>{attachFb.text}</Text>

        {/* 서명 앞 문구 */}
        <Text style={styles.closingText}>
          위 기재 사항은 사실과 다름이 없으며, 관련 증빙 자료를 첨부하여 소명합니다.
        </Text>

        {/* 날짜 */}
        <Text style={[styles.dateText, dateFb.color ? { color: dateFb.color } : {}]}>{dateFb.text}</Text>

        {/* 작성자 + 서명 */}
        <View style={styles.signatureRow}>
          <Text style={styles.signatureText}>작성자:</Text>
          <Text style={[styles.signatureText, writerFb.color ? { color: writerFb.color } : {}]}>{writerFb.text}</Text>
          {settings.signatureImageUrl ? (
            <Image src={settings.signatureImageUrl} style={styles.signImg} />
          ) : (
            <Text style={[styles.signatureText, { color: ph.signEmptyColor }]}>{ph.signEmpty}</Text>
          )}
        </View>

        {/* 수신처 */}
        <Text style={[styles.recipientText, recipientFb.color ? { color: recipientFb.color } : {}]}>{recipientFb.text}</Text>
      </Page>
    </Document>
  );
}
