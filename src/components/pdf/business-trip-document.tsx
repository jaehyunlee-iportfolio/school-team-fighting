/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image, not next/image */
import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { TripRow } from "@/lib/csv/parseD4";

/** 20mm 여백 (1mm ≈ 2.83pt) */
const MM_20 = 20 * 2.8346;

const BORDER = "#000000";
const b = 0.75;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Pretendard",
    fontSize: 9.5,
    lineHeight: 1.4,
    paddingTop: MM_20,
    paddingBottom: MM_20,
    paddingLeft: MM_20,
    paddingRight: MM_20,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 42,
  },
  pageTitle: { fontSize: 25, fontWeight: 700, lineHeight: 1.15 },
  /** 전체: 테두리 한 겹 */
  apTable: { width: 256, borderWidth: b, borderColor: BORDER },
  apRow: { flexDirection: "row" },
  gyeoljaeCol: {
    width: 32,
    borderRightWidth: b,
    borderColor: BORDER,
    minHeight: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  gchar: { fontSize: 10, lineHeight: 1.15 },
  apRest: { flex: 1, flexDirection: "column" },
  apHead: {
    flexDirection: "row",
    borderColor: BORDER,
    borderBottomWidth: b,
    minHeight: 30,
  },
  apHeadC: {
    flex: 1,
    borderColor: BORDER,
    borderRightWidth: b,
    paddingVertical: 3,
    paddingHorizontal: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  apHeadCLast: { borderRightWidth: 0 },
  apHeadT: { fontSize: 9, textAlign: "center" },
  apSign: { flexDirection: "row", minHeight: 33 },
  apSignC: {
    flex: 1,
    borderColor: BORDER,
    borderRightWidth: b,
    padding: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  apSignCLast: { borderRightWidth: 0 },
  drafter: { fontSize: 12, textAlign: "center" },
  small: { fontSize: 7.5, color: "#333" },
  apImg: { maxHeight: 23, maxWidth: "100%", objectFit: "contain" as const },
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
    width: 100,
    minHeight: 32,
    borderColor: BORDER,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: b,
    borderBottomWidth: b,
    backgroundColor: "#E6E6E6",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  dLabelT: { fontSize: 11, textAlign: "center", fontWeight: 500 },
  dValue: {
    flex: 1,
    minHeight: 32,
    borderColor: BORDER,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: b,
    paddingVertical: 5,
    paddingHorizontal: 7,
    justifyContent: "center",
  },
  dValS: { fontSize: 11, textAlign: "left" },
  intro: {
    fontSize: 11,
    textAlign: "left",
    marginTop: 42,
    marginBottom: 42,
  },
  pRow: { flexDirection: "row", width: "100%" as const },
  pLabel: {
    width: 100,
    minHeight: 112,
    borderColor: BORDER,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: b,
    borderBottomWidth: b,
    backgroundColor: "#E6E6E6",
    justifyContent: "center",
    alignItems: "center",
  },
  pValue: {
    flex: 1,
    minHeight: 112,
    borderColor: BORDER,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: b,
    padding: 6,
  },
  purpose: { fontSize: 11, lineHeight: 1.4, textAlign: "left", whiteSpace: "pre-wrap" as const },
  /** 한 페이지 끝에 띄울 때(높이 흡수는 아래 콘텐츠 View → spacer → 본문 푸터) */
  footer: {
    marginTop: 42,
    textAlign: "center",
    fontSize: 15,
    fontWeight: 700,
  },
  content: { width: "100%" as const },
});

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n) + "…");

export type BusinessTripDocumentProps = {
  row: TripRow;
  approver1Src?: string;
  approver2Src?: string;
};

const DataTableRow = ({ children }: { children: ReactNode }) => (
  <View style={styles.dRow}>{children}</View>
);

const LabelCell = ({ children }: { children: ReactNode }) => (
  <View style={styles.dLabel}>{children}</View>
);

const ValCell = ({ children }: { children: ReactNode }) => (
  <View style={styles.dValue}>{children}</View>
);

/**
 * A4 출장신청서(제공한 양식): 좌상단 제목 + 우상단 결재(세로 '결재' + 기안자/결재/결재),
 * 작성자 2행, 연결 문장, 상세 4행(맨 아래 '출장 목적'은 높게), 하단 가운데 조직명.
 */
export function BusinessTripDocument({ row, approver1Src, approver2Src }: BusinessTripDocumentProps) {
  return (
    <Document>
        <Page size="A4" style={styles.page}>
        <View style={styles.content}>
        <View style={styles.topBar}>
          <Text style={styles.pageTitle}>출장신청서</Text>
          <View style={styles.apTable}>
            <View style={styles.apRow}>
              <View style={styles.gyeoljaeCol}>
                <View>
                  <Text style={styles.gchar}>결</Text>
                  <Text style={[styles.gchar, { marginTop: 2 }]}>재</Text>
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
                      <Text style={styles.small}>(—)</Text>
                    )}
                  </View>
                  <View style={styles.apSignC}>
                    {approver1Src ? (
                      <Image src={approver1Src} style={styles.apImg} />
                    ) : (
                      <Text style={styles.small}>(서명)</Text>
                    )}
                  </View>
                  <View style={[styles.apSignC, styles.apSignCLast]}>
                    {approver2Src ? (
                      <Image src={approver2Src} style={styles.apImg} />
                    ) : (
                      <Text style={styles.small}>(서명)</Text>
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
              <Text style={styles.dValS}>{row.orgName || "—"}</Text>
            </ValCell>
          </DataTableRow>
          <DataTableRow>
            <LabelCell>
              <Text style={styles.dLabelT}>작성자 성명</Text>
            </LabelCell>
            <ValCell>
              <Text style={styles.dValS}>{row.writerName || "—"}</Text>
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
              <Text style={styles.dValS}>{row.memberText || "—"}</Text>
            </ValCell>
          </DataTableRow>
          <DataTableRow>
            <LabelCell>
              <Text style={styles.dLabelT}>출장 기간</Text>
            </LabelCell>
            <ValCell>
              <Text style={styles.dValS}>{row.periodText || "—"}</Text>
            </ValCell>
          </DataTableRow>
          <DataTableRow>
            <LabelCell>
              <Text style={styles.dLabelT}>출 장 지</Text>
            </LabelCell>
            <ValCell>
              <Text style={styles.dValS}>{row.outPlace || "—"}</Text>
            </ValCell>
          </DataTableRow>
          <View style={styles.pRow}>
            <View style={styles.pLabel}>
              <Text style={styles.dLabelT}>출장 목적</Text>
            </View>
            <View style={styles.pValue}>
              <Text style={styles.purpose}>{clip(row.purposeText || "—", 4000)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          {row.orgName || "—"}
        </Text>
        </View>
      </Page>
    </Document>
  );
}
