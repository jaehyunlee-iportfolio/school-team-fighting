/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image */
import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  type MeetingOperationsLayoutSettings,
  type MeetingOperationsSettings,
  DEFAULT_MEETING_OP_LAYOUT,
  DEFAULT_MEETING_OP_SETTINGS,
} from "@/lib/firebase/firestore";
import {
  effectiveValue,
  parseAttendees,
  type MeetingOperationsRow,
} from "@/lib/meeting/types";

function buildStyles(cfg: MeetingOperationsLayoutSettings) {
  const MM = (n: number) => n * 2.8346;
  const b = cfg.border.width;
  const BC = cfg.border.color;

  return StyleSheet.create({
    page: {
      fontFamily: cfg.page.fontFamily,
      fontSize: cfg.page.baseFontSize,
      lineHeight: cfg.page.baseLineHeight,
      paddingTop: MM(cfg.page.paddingTopMm),
      paddingBottom: MM(cfg.page.paddingBottomMm),
      paddingLeft: MM(cfg.page.paddingLeftMm),
      paddingRight: MM(cfg.page.paddingRightMm),
      flexDirection: "column" as const,
    },
    /* 헤더 (모든 페이지 우측 상단 로고) */
    header: {
      flexDirection: "row" as const,
      justifyContent: "flex-end" as const,
      alignItems: "flex-start" as const,
      marginBottom: cfg.title.marginTop,
    },
    headerLogoImg: {
      width: cfg.headerLogo.width,
      height: cfg.headerLogo.height,
      objectFit: "contain" as const,
    },
    /* 제목 */
    titleWrap: {
      alignItems: "center" as const,
      marginTop: cfg.title.marginTop,
      marginBottom: cfg.title.marginBottom,
    },
    title: {
      fontSize: cfg.title.fontSize,
      fontWeight: cfg.title.fontWeight as 700,
    },
    /* 페이지1: 상단 정보표 (2x2) */
    topTable: {
      flexDirection: "column" as const,
      borderTopWidth: b,
      borderLeftWidth: b,
      borderColor: BC,
      marginBottom: 12,
    },
    topRow: { flexDirection: "row" as const },
    topLabelCell: {
      width: cfg.topInfoTable.labelWidth,
      minHeight: cfg.topInfoTable.rowHeight,
      backgroundColor: cfg.topInfoTable.labelBgColor,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: cfg.topInfoTable.cellPadding,
    },
    topValueCell: {
      flex: 1,
      minHeight: cfg.topInfoTable.rowHeight,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: cfg.topInfoTable.cellPadding,
    },
    topLabelText: {
      fontSize: cfg.topInfoTable.labelFontSize,
      fontWeight: 700 as const,
      letterSpacing: 4,
    },
    topValueText: {
      fontSize: cfg.topInfoTable.valueFontSize,
    },
    /* 페이지1: 본문 표 */
    bodyTable: {
      borderTopWidth: b,
      borderLeftWidth: b,
      borderColor: BC,
      flexGrow: 1,
    },
    bodyRow: {
      flexDirection: "row" as const,
    },
    bodyLabelCell: {
      width: cfg.bodyTable.labelWidth,
      backgroundColor: cfg.bodyTable.labelBgColor,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    bodyLabelText: {
      fontSize: cfg.bodyTable.labelFontSize,
      fontWeight: 700 as const,
      letterSpacing: 1,
      textAlign: "center" as const,
    },
    bodyContentCell: {
      flex: 1,
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      padding: cfg.bodyTable.contentPadding,
    },
    bodyContentText: {
      fontSize: cfg.bodyTable.contentFontSize,
      lineHeight: cfg.bodyTable.contentLineHeight,
    },
    /* 페이지2: 서명부 */
    sigTitle: {
      fontSize: cfg.signature.titleFontSize,
      fontWeight: 700 as const,
      textAlign: "center" as const,
      marginTop: 4,
      marginBottom: 12,
    },
    sigNotice: {
      fontSize: cfg.signature.noticeFontSize,
      color: cfg.signature.noticeColor,
      textAlign: "center" as const,
      marginBottom: 12,
    },
    sigTable: {
      borderTopWidth: b,
      borderLeftWidth: b,
      borderColor: BC,
    },
    sigHeaderRow: {
      flexDirection: "row" as const,
      backgroundColor: cfg.signature.headerBgColor,
    },
    sigHeaderCell: {
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      minHeight: cfg.signature.headerHeight,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    sigHeaderText: {
      fontSize: cfg.signature.headerFontSize,
      fontWeight: 700 as const,
    },
    sigRow: {
      flexDirection: "row" as const,
    },
    sigCell: {
      borderRightWidth: b,
      borderBottomWidth: b,
      borderColor: BC,
      minHeight: cfg.signature.rowHeight,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: 4,
    },
    sigCellText: {
      fontSize: cfg.signature.nameFontSize,
    },
    /* 페이지3: 사진/영수증 */
    photoTitle: {
      fontSize: cfg.photoPage.titleFontSize,
      fontWeight: 400 as const,
      marginBottom: 8,
    },
    photoGrid: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: cfg.photoPage.cellGap,
    },
    photoCell: {
      borderWidth: cfg.photoPage.cellBorderWidth,
      borderColor: cfg.photoPage.cellBorderColor,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      overflow: "hidden" as const,
    },
    photoImg: {
      width: "100%",
      height: "100%",
      objectFit: "contain" as const,
    },
    /* 푸터 */
    footer: {
      marginTop: cfg.footer.marginTop,
      flexDirection: "row" as const,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      gap: cfg.footer.gap,
      paddingTop: 6,
    },
    footerItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    footerLogoImg: {
      height: cfg.footer.logoHeight,
      maxWidth: cfg.footer.logoMaxWidth,
      objectFit: "contain" as const,
    },
    footerLabel: {
      fontSize: cfg.footer.labelFontSize,
      color: cfg.footer.labelColor,
      fontWeight: 700 as const,
    },
    /* 빈 셀 표시 */
    emptyAuthor: {
      color: cfg.placeholders.emptyAuthorColor,
      fontStyle: "italic" as const,
    },
    emptyField: {
      color: cfg.placeholders.emptyFieldColor,
    },
  });
}

type StylesT = ReturnType<typeof buildStyles>;

function HeaderLogo({
  settings,
  styles,
}: {
  settings: MeetingOperationsSettings;
  styles: StylesT;
}) {
  return (
    <View style={styles.header} fixed>
      {settings.headerLogoUrl ? (
        <Image src={settings.headerLogoUrl} style={styles.headerLogoImg} />
      ) : (
        <View style={{ width: 1, height: 1 }} />
      )}
    </View>
  );
}

function Footer({
  settings,
  styles,
}: {
  settings: MeetingOperationsSettings;
  styles: StylesT;
}) {
  const items = settings.footerLogos.filter((l) => l.enabled);
  if (items.length === 0) return null;
  return (
    <View style={styles.footer} fixed>
      {items.map((logo, i) => (
        <View key={i} style={styles.footerItem}>
          {logo.imageUrl ? (
            <Image src={logo.imageUrl} style={styles.footerLogoImg} />
          ) : null}
          {logo.label ? (
            <Text style={styles.footerLabel}>{logo.label}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Page1({
  row,
  settings,
  styles,
  cfg,
}: {
  row: MeetingOperationsRow;
  settings: MeetingOperationsSettings;
  styles: StylesT;
  cfg: MeetingOperationsLayoutSettings;
}) {
  const date = effectiveValue(row.date) || settings.emptyPlaceholder;
  const time = effectiveValue(row.time) || settings.emptyPlaceholder;
  const location = effectiveValue(row.location) || settings.emptyPlaceholder;
  const author = effectiveValue(row.author);
  const agenda = effectiveValue(row.agenda);
  const content = effectiveValue(row.content);
  const decisions = effectiveValue(row.decisions);
  const schedule = effectiveValue(row.schedule);
  const attendees = effectiveValue(row.attendees);

  return (
    <Page size="A4" style={styles.page}>
      <HeaderLogo settings={settings} styles={styles} />

      <View style={styles.titleWrap}>
        <Text style={styles.title}>회의록</Text>
      </View>

      {/* 상단 4셀 정보 표 */}
      <View style={styles.topTable}>
        <View style={styles.topRow}>
          <View style={styles.topLabelCell}>
            <Text style={styles.topLabelText}>일 시</Text>
          </View>
          <View style={styles.topValueCell}>
            <Text style={styles.topValueText}>{date || ""}</Text>
          </View>
          <View style={styles.topLabelCell}>
            <Text style={styles.topLabelText}>장 소</Text>
          </View>
          <View style={styles.topValueCell}>
            <Text style={styles.topValueText}>{location || ""}</Text>
          </View>
        </View>
        <View style={styles.topRow}>
          <View style={styles.topLabelCell}>
            <Text style={styles.topLabelText}>시 간</Text>
          </View>
          <View style={styles.topValueCell}>
            <Text style={styles.topValueText}>{time || ""}</Text>
          </View>
          <View style={styles.topLabelCell}>
            <Text style={styles.topLabelText}>작성자</Text>
          </View>
          <View style={styles.topValueCell}>
            {author ? (
              <Text style={styles.topValueText}>{author}</Text>
            ) : (
              <Text style={[styles.topValueText, styles.emptyAuthor]}>
                {settings.authorPlaceholder}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* 본문 표 */}
      <View style={styles.bodyTable}>
        <BodyRow
          label="회의 안건 / 목적"
          value={agenda}
          minHeight={cfg.bodyTable.agendaMinHeight}
          styles={styles}
        />
        <BodyRow
          label="회의 내용"
          value={content}
          minHeight={cfg.bodyTable.contentMinHeight}
          styles={styles}
        />
        <BodyRow
          label="결정 및 협의사항"
          value={decisions}
          minHeight={cfg.bodyTable.decisionsMinHeight}
          styles={styles}
        />
        <BodyRow
          label="향후 일정"
          value={schedule}
          minHeight={cfg.bodyTable.scheduleMinHeight}
          styles={styles}
        />
        <BodyRow
          label="참석자"
          value={attendees ? "서명부 후면 첨부" : "서명부 후면 첨부"}
          minHeight={cfg.bodyTable.attendeesMinHeight}
          styles={styles}
        />
      </View>

      <Footer settings={settings} styles={styles} />
    </Page>
  );
}

function BodyRow({
  label,
  value,
  minHeight,
  styles,
}: {
  label: string;
  value: string;
  minHeight: number;
  styles: StylesT;
}) {
  return (
    <View style={[styles.bodyRow, { minHeight }]}>
      <View style={[styles.bodyLabelCell, { minHeight }]}>
        <Text style={styles.bodyLabelText}>{label}</Text>
      </View>
      <View style={[styles.bodyContentCell, { minHeight }]}>
        <Text style={styles.bodyContentText}>{value || " "}</Text>
      </View>
    </View>
  );
}

function SignaturePages({
  attendees,
  settings,
  styles,
  cfg,
}: {
  attendees: string[];
  settings: MeetingOperationsSettings;
  styles: StylesT;
  cfg: MeetingOperationsLayoutSettings;
}) {
  const perPage = Math.max(1, settings.signatureRowsPerPage || 20);
  // 참석자 수 ≤ perPage 면 perPage 만큼 빈 행 패딩, 초과면 다음 페이지
  const totalRows = Math.max(perPage, attendees.length);
  const pageCount = Math.ceil(totalRows / perPage);

  const pages: Array<Array<{ no: number; name: string }>> = [];
  for (let p = 0; p < pageCount; p++) {
    const start = p * perPage;
    const slice: Array<{ no: number; name: string }> = [];
    for (let i = 0; i < perPage; i++) {
      const idx = start + i;
      slice.push({ no: idx + 1, name: attendees[idx] ?? "" });
    }
    pages.push(slice);
  }

  return (
    <>
      {pages.map((rows, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
          <HeaderLogo settings={settings} styles={styles} />
          <Text style={styles.sigTitle}>서명부</Text>
          {settings.signaturePrivacyNotice.enabled && pi === 0 ? (
            <Text style={styles.sigNotice}>
              {settings.signaturePrivacyNotice.text}
            </Text>
          ) : null}

          <View style={styles.sigTable}>
            <View style={styles.sigHeaderRow}>
              <View style={[styles.sigHeaderCell, { width: cfg.signature.colNoWidth }]}>
                <Text style={styles.sigHeaderText}>NO</Text>
              </View>
              <View style={[styles.sigHeaderCell, { width: cfg.signature.colNameWidth }]}>
                <Text style={styles.sigHeaderText}>이 름</Text>
              </View>
              <View style={[styles.sigHeaderCell, { width: cfg.signature.colSignWidth }]}>
                <Text style={styles.sigHeaderText}>서 명</Text>
              </View>
            </View>
            {rows.map((r) => (
              <View key={r.no} style={styles.sigRow}>
                <View style={[styles.sigCell, { width: cfg.signature.colNoWidth }]}>
                  <Text style={styles.sigCellText}>{r.no}</Text>
                </View>
                <View style={[styles.sigCell, { width: cfg.signature.colNameWidth }]}>
                  <Text style={styles.sigCellText}>{r.name}</Text>
                </View>
                <View style={[styles.sigCell, { width: cfg.signature.colSignWidth }]}>
                  <Text style={styles.sigCellText}> </Text>
                </View>
              </View>
            ))}
          </View>

          <Footer settings={settings} styles={styles} />
        </Page>
      ))}
    </>
  );
}

function PhotoPage({
  photos,
  settings,
  styles,
  cfg,
}: {
  photos: string[];
  settings: MeetingOperationsSettings;
  styles: StylesT;
  cfg: MeetingOperationsLayoutSettings;
}) {
  const cols = cfg.photoPage.cols;
  const rows = cfg.photoPage.rows;
  const max = cols * rows;
  const cells = photos.slice(0, max);
  // 셀 크기는 페이지 가로 / cols 비율로 자동 계산 (간단히 % 사용)
  const cellWidthPct = `${100 / cols - 2}%` as `${number}%`;
  const cellAspect = 1.2; // 세로 비율
  return (
    <Page size="A4" style={styles.page}>
      <HeaderLogo settings={settings} styles={styles} />
      <Text style={styles.photoTitle}>사진 / 영수증</Text>
      <View style={styles.photoGrid}>
        {cells.map((src, i) => (
          <View
            key={i}
            style={[
              styles.photoCell,
              { width: cellWidthPct, aspectRatio: cellAspect },
            ]}
          >
            <Image src={src} style={styles.photoImg} />
          </View>
        ))}
        {/* 빈 셀로 그리드 채워두기 (테두리 보이기) */}
        {Array.from({ length: Math.max(0, max - cells.length) }).map((_, i) => (
          <View
            key={`empty-${i}`}
            style={[
              styles.photoCell,
              { width: cellWidthPct, aspectRatio: cellAspect },
            ]}
          />
        ))}
      </View>
      <Footer settings={settings} styles={styles} />
    </Page>
  );
}

export function MeetingOperationsDocument({
  row,
  settings = DEFAULT_MEETING_OP_SETTINGS,
  layout = DEFAULT_MEETING_OP_LAYOUT,
}: {
  row: MeetingOperationsRow;
  settings?: MeetingOperationsSettings;
  layout?: MeetingOperationsLayoutSettings;
}) {
  const styles = buildStyles(layout);
  const attendees = parseAttendees(effectiveValue(row.attendees));

  return (
    <Document>
      <Page1 row={row} settings={settings} styles={styles} cfg={layout} />
      <SignaturePages
        attendees={attendees}
        settings={settings}
        styles={styles}
        cfg={layout}
      />
      <PhotoPage
        photos={row.photos}
        settings={settings}
        styles={styles}
        cfg={layout}
      />
    </Document>
  );
}

/**
 * 파일명 생성: {증빙번호}_{filenamePrefix}_{meetingType}_{YYMMDD}.pdf
 *   ex) D-2-1_7. 회의록_운영회의_250728.pdf
 */
export function makeMeetingOperationsFilename(
  row: MeetingOperationsRow,
  evidenceNo: string,
  settings: MeetingOperationsSettings,
): string {
  const safe = (s: string) => s.replace(/\//g, "／");
  const ev = evidenceNo || "미증빙";
  const date = row.dateYymmdd || "날짜미상";
  const prefix = settings.filenamePrefix || "7. 회의록";
  const type = settings.meetingType || "운영회의";
  return `${ev}_${safe(prefix)}_${safe(type)}_${date}.pdf`;
}
