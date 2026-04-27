/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image, not next/image */
// 지출결의서 PDF 양식 (A4, 단일 페이지).
// 모든 폰트/크기/패딩/색상은 ExpenseLayoutSettings에서 주입.

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type {
  ExpenseLayoutSettings,
  ExpenseGroupSettings,
} from "@/lib/firebase/firestore";
import type { ExpenseRow } from "@/lib/expense/types";

export type ExpenseDocumentProps = {
  row: ExpenseRow;
  group: ExpenseGroupSettings;
  layout: ExpenseLayoutSettings;
};

/** 숫자 → "1,234,567" */
function formatMoney(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "-";
  return n.toLocaleString("ko-KR");
}

/** 빈 값이면 placeholder, 아니면 값 */
function valueOrEmpty(
  v: string,
  layout: ExpenseLayoutSettings,
): { text: string; color?: string } {
  if (!v.trim()) {
    return {
      text: layout.placeholders.emptyField,
      color: layout.placeholders.emptyFieldColor,
    };
  }
  return { text: v };
}

export function ExpenseDocument({ row, group, layout }: ExpenseDocumentProps) {
  const styles = makeStyles(layout);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 헤더: 로고 absolute 좌상단 + 제목/부제 가운데 정렬 */}
        <View style={styles.headerWrap}>
          {group.logoImageUrl ? (
            <View style={styles.logoAbs}>
              <Image src={group.logoImageUrl} style={styles.logoImg} />
            </View>
          ) : null}
          <Text style={styles.title}>지출결의서</Text>
          <Text style={styles.subtitle}>
            2025 찾아가는 학교 컨설팅 사업 | 건국대학교 사업단
          </Text>
        </View>

        {/* 1. 기본 정보 */}
        <Text style={styles.sectionHeading}>1. 기본 정보</Text>
        <BasicInfoRow label="일련 번호" value={row.serial} layout={layout} />
        <BasicInfoRow label="작성 일자" value={row.writerDate} layout={layout} />
        <BasicInfoRow label="작성자명" value={group.writerName} layout={layout} />
        <BasicInfoRow label="소속" value={group.companyFullName} layout={layout} />

        {/* 2. 지출 목적 */}
        <Text style={styles.sectionHeading}>2. 지출 목적</Text>
        <View style={styles.purposeBox}>
          {(() => {
            const v = valueOrEmpty(row.useDetail, layout);
            return (
              <Text style={[styles.purposeText, v.color ? { color: v.color } : {}]}>
                {v.text}
              </Text>
            );
          })()}
        </View>

        {/* 3. 지출결의 내용 */}
        <Text style={styles.sectionHeading}>3. 지출결의 내용</Text>
        <View style={styles.table}>
          {/* 헤더 행 */}
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <View style={[styles.tableCell, styles.tableHeader, { width: "16%" }]}>
              <Text style={styles.tableHeaderText}>지출 일자</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "16%" }]}>
              <Text style={styles.tableHeaderText}>세목</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "24%" }]}>
              <Text style={styles.tableHeaderText}>세세목</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "12%" }]}>
              <Text style={styles.tableHeaderText}>공급가액</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "12%" }]}>
              <Text style={styles.tableHeaderText}>세액</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "20%", borderRightWidth: 0 }]}>
              <Text style={styles.tableHeaderText}>지출금액(원)</Text>
            </View>
          </View>
          {/* 데이터 행 */}
          <View style={[styles.tableRow, styles.tableDataRow]}>
            <View style={[styles.tableCell, { width: "16%" }]}>
              <Text style={styles.tableCellText}>{row.executionDate || layout.placeholders.emptyField}</Text>
            </View>
            <View style={[styles.tableCell, { width: "16%" }]}>
              <Text style={styles.tableCellText}>{row.semok}</Text>
            </View>
            <View style={[styles.tableCell, { width: "24%" }]}>
              <Text style={styles.tableCellText}>{row.sesemok}</Text>
            </View>
            <View style={[styles.tableCell, { width: "12%", alignItems: "flex-end" }]}>
              <Text style={styles.tableCellText}>{formatMoney(row.supply)}</Text>
            </View>
            <View style={[styles.tableCell, { width: "12%", alignItems: "flex-end" }]}>
              <Text style={styles.tableCellText}>
                {row.vat === null ? "-" : formatMoney(row.vat)}
              </Text>
            </View>
            <View style={[styles.tableCell, { width: "20%", borderRightWidth: 0, alignItems: "flex-end" }]}>
              <Text style={styles.tableCellText}>{formatMoney(row.total)}</Text>
            </View>
          </View>
          {/* 비고 행 */}
          <View style={[styles.tableRow, styles.noteRow]}>
            <View style={[styles.tableCell, styles.tableHeader, { width: "16%", justifyContent: "center" }]}>
              <Text style={styles.tableHeaderText}>비고</Text>
            </View>
            <View style={[styles.tableCell, { width: "84%", borderRightWidth: 0 }]}>
              <Text style={styles.noteText}>{row.note || ""}</Text>
            </View>
          </View>
        </View>

        {/* 4. 지출 방식 */}
        <Text style={styles.sectionHeading}>4. 지출 방식</Text>
        <View style={styles.paymentBox}>
          {(() => {
            const v = valueOrEmpty(row.payment, layout);
            return (
              <Text style={[styles.paymentText, v.color ? { color: v.color } : {}]}>
                {v.text}
              </Text>
            );
          })()}
        </View>

        {/* 5. 지출 승인 */}
        <Text style={styles.sectionHeading}>5. 지출 승인</Text>
        <View style={styles.table}>
          {/* 헤더 */}
          <View style={[styles.tableRow, styles.approvalHeaderRow]}>
            <View style={[styles.tableCell, styles.tableHeader, { width: "12%" }]}>
              <Text style={styles.tableHeaderText}>승인 단계</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "14%" }]}>
              <Text style={styles.tableHeaderText}>성명</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "14%" }]}>
              <Text style={styles.tableHeaderText}>직책</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "20%" }]}>
              <Text style={styles.tableHeaderText}>서명</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "20%" }]}>
              <Text style={styles.tableHeaderText}>승인일</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { width: "20%", borderRightWidth: 0 }]}>
              <Text style={styles.tableHeaderText}>비고</Text>
            </View>
          </View>
          {/* 행 1: 지출 담당자 */}
          <View style={[styles.tableRow, styles.approvalDataRow]}>
            <View style={[styles.tableCell, styles.tableHeader, { width: "12%", justifyContent: "center" }]}>
              <Text style={styles.tableHeaderText}>지출 담당자</Text>
            </View>
            <View style={[styles.tableCell, { width: "14%", justifyContent: "center" }]}>
              <Text style={styles.tableCellText}>{group.writerName}</Text>
            </View>
            <View style={[styles.tableCell, { width: "14%", justifyContent: "center" }]}>
              <Text style={styles.tableCellText}>{group.writerTitle}</Text>
            </View>
            <View style={[styles.tableCell, { width: "20%", justifyContent: "center", alignItems: "center" }]}>
              {group.writerSigImageUrl ? (
                <Image src={group.writerSigImageUrl} style={styles.sigImg} />
              ) : null}
            </View>
            <View style={[styles.tableCell, { width: "20%", justifyContent: "center" }]}>
              <Text style={styles.tableCellText}>{row.handlerApprovalDate}</Text>
            </View>
            <View style={[styles.tableCell, { width: "20%", borderRightWidth: 0 }]}>
              <Text style={styles.tableCellText}> </Text>
            </View>
          </View>
          {/* 행 2: 결재권자 */}
          <View style={[styles.tableRow, styles.approvalDataRow]}>
            <View style={[styles.tableCell, styles.tableHeader, { width: "12%", justifyContent: "center" }]}>
              <Text style={styles.tableHeaderText}>결재권자</Text>
            </View>
            <View style={[styles.tableCell, { width: "14%", justifyContent: "center" }]}>
              <Text style={styles.tableCellText}>{group.approverName}</Text>
            </View>
            <View style={[styles.tableCell, { width: "14%", justifyContent: "center" }]}>
              <Text style={styles.tableCellText}>{group.approverTitle}</Text>
            </View>
            <View style={[styles.tableCell, { width: "20%", justifyContent: "center", alignItems: "center" }]}>
              {group.approverSigImageUrl ? (
                <Image src={group.approverSigImageUrl} style={styles.sigImg} />
              ) : null}
            </View>
            <View style={[styles.tableCell, { width: "20%", justifyContent: "center" }]}>
              <Text style={styles.tableCellText}>{row.approverApprovalDate}</Text>
            </View>
            <View style={[styles.tableCell, { width: "20%", borderRightWidth: 0, justifyContent: "center" }]}>
              <Text style={styles.tableCellText}>전결</Text>
            </View>
          </View>
          {/* 행 3: 상호 */}
          <View style={[styles.tableRow, styles.approvalDataRow, { borderBottomWidth: 0 }]}>
            <View style={[styles.tableCell, styles.tableHeader, { width: "12%", justifyContent: "center" }]}>
              <Text style={styles.tableHeaderText}>상호</Text>
            </View>
            <View style={[styles.tableCell, { width: "48%", justifyContent: "center", alignItems: "center" }]}>
              <Text style={styles.tableCellText}>{group.companyFullName}</Text>
            </View>
            <View style={[styles.tableCell, { width: "20%", justifyContent: "center" }]}>
              <Text style={styles.tableCellText}>회사 직인</Text>
            </View>
            <View style={[styles.tableCell, { width: "20%", borderRightWidth: 0, justifyContent: "center", alignItems: "center" }]}>
              {group.stampImageUrl ? (
                <Image src={group.stampImageUrl} style={styles.stampImg} />
              ) : null}
            </View>
          </View>
        </View>

        {/* 푸터 */}
        <Text style={styles.footer}>
          ※ 본 지출결의서는 정확한 사용 내역을 기재하고 증빙서류는 별도 제출해 주시기 바랍니다.
        </Text>
      </Page>
    </Document>
  );
}

function BasicInfoRow({
  label,
  value,
  layout,
}: {
  label: string;
  value: string;
  layout: ExpenseLayoutSettings;
}) {
  const v = valueOrEmpty(value, layout);
  const styles = makeStyles(layout);
  return (
    <View style={styles.basicRow}>
      <Text style={styles.basicLabel}>{label}</Text>
      <Text style={[styles.basicValue, v.color ? { color: v.color } : {}]}>
        {v.text}
      </Text>
    </View>
  );
}

function makeStyles(layout: ExpenseLayoutSettings) {
  return StyleSheet.create({
    page: {
      fontFamily: layout.page.fontFamily,
      fontSize: layout.page.baseFontSize,
      lineHeight: layout.page.baseLineHeight,
      padding: layout.page.marginMm * 2.83465, // mm → pt
      color: "#222222",
    },
    headerWrap: {
      position: "relative",
      alignItems: "center",
      marginBottom: layout.subtitle.marginBottom,
      // 로고가 절대 위치이므로 제목 영역에 최소 높이 보장 (로고 잘림 방지)
      minHeight: layout.logo.height,
      justifyContent: "center",
    },
    logoAbs: {
      position: "absolute",
      left: layout.logo.offsetX,
      top: layout.logo.offsetY,
      width: layout.logo.width,
      height: layout.logo.height,
    },
    logoImg: {
      width: "100%",
      height: "100%",
      objectFit: "contain",
    },
    title: {
      fontSize: layout.title.fontSize,
      fontWeight: layout.title.fontWeight,
      letterSpacing: layout.title.letterSpacing,
      lineHeight: 1.2,
      textAlign: "center",
      marginBottom: layout.title.marginBottom,
    },
    subtitle: {
      fontSize: layout.subtitle.fontSize,
      color: layout.subtitle.color,
      lineHeight: 1.4,
      textAlign: "center",
    },
    sectionHeading: {
      fontSize: layout.sectionHeading.fontSize,
      fontWeight: layout.sectionHeading.fontWeight,
      marginTop: layout.sectionHeading.marginTop,
      marginBottom: layout.sectionHeading.marginBottom,
    },
    basicRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: layout.basicInfo.rowGap,
    },
    basicLabel: {
      width: layout.basicInfo.labelWidth,
      fontSize: layout.basicInfo.fontSize,
      fontWeight: layout.basicInfo.fontWeight,
      lineHeight: layout.basicInfo.lineHeight,
    },
    basicValue: {
      flex: 1,
      fontSize: layout.basicInfo.fontSize,
      lineHeight: layout.basicInfo.lineHeight,
    },
    purposeBox: {
      paddingVertical: layout.purpose.paddingV,
    },
    purposeText: {
      fontSize: layout.purpose.fontSize,
      lineHeight: layout.purpose.lineHeight,
    },
    table: {
      borderTopWidth: layout.border.width,
      borderLeftWidth: layout.border.width,
      borderColor: layout.border.color,
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: layout.border.width,
      borderColor: layout.border.color,
    },
    tableHeaderRow: {
      minHeight: layout.expenseTable.headerHeight,
      backgroundColor: layout.expenseTable.headerBgColor,
    },
    tableDataRow: {
      minHeight: layout.expenseTable.rowHeight,
    },
    noteRow: {
      minHeight: layout.expenseTable.noteRowHeight,
    },
    tableCell: {
      paddingVertical: layout.expenseTable.paddingV,
      paddingHorizontal: layout.expenseTable.paddingH,
      borderRightWidth: layout.border.width,
      borderColor: layout.border.color,
      justifyContent: "center",
    },
    tableHeader: {
      backgroundColor: layout.expenseTable.headerBgColor,
    },
    tableHeaderText: {
      fontSize: layout.expenseTable.headerFontSize,
      fontWeight: 700,
      textAlign: "center",
    },
    tableCellText: {
      fontSize: layout.expenseTable.fontSize,
    },
    noteText: {
      fontSize: layout.expenseTable.noteFontSize,
    },
    paymentBox: {
      paddingVertical: layout.paymentMethod.paddingV,
    },
    paymentText: {
      fontSize: layout.paymentMethod.fontSize,
    },
    approvalHeaderRow: {
      minHeight: layout.approvalTable.headerHeight,
      backgroundColor: layout.approvalTable.headerBgColor,
    },
    approvalDataRow: {
      minHeight: layout.approvalTable.rowHeight,
    },
    sigImg: {
      maxHeight: layout.approvalTable.sigImageMaxHeight,
      maxWidth: "90%",
      objectFit: "contain",
    },
    stampImg: {
      maxHeight: layout.approvalTable.stampImageMaxHeight,
      maxWidth: "70%",
      objectFit: "contain",
    },
    footer: {
      fontSize: layout.footer.fontSize,
      fontWeight: layout.footer.fontWeight,
      color: layout.footer.color,
      marginTop: layout.footer.marginTop,
    },
  });
}
