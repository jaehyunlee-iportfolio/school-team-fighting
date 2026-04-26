import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type {
  ResumeRow,
  TrainingItem,
  CertificateItem,
  LectureItem,
  ProjectItem,
} from "@/lib/resume/types";

// ─── 디자인 토큰 ──────────────────────────────────────────────────────
const COLOR = {
  titleBg: "#2A4A8C",         // 진한 파랑 (제목 배경)
  titleText: "#FFFFFF",
  sectionBg: "#E6EAF5",       // 옅은 파랑 (섹션 헤더 / 라벨 배경)
  labelBg: "#E6EAF5",
  labelText: "#1F3A6E",       // 진한 파랑 글씨 (라벨)
  border: "#9AAACC",
  text: "#222222",
  muted: "#888888",
  emptyText: "#BBBBBB",
};

const BORDER_W = 0.5;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Pretendard",
    fontSize: 9,
    lineHeight: 1.3,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    color: COLOR.text,
  },
  prelude: {
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 6,
  },
  table: {
    borderTopWidth: BORDER_W,
    borderLeftWidth: BORDER_W,
    borderColor: COLOR.border,
  },
  row: {
    flexDirection: "row",
  },
  // 모든 셀은 right + bottom 테두리만 (table이 top+left 담당)
  cellBase: {
    borderRightWidth: BORDER_W,
    borderBottomWidth: BORDER_W,
    borderColor: COLOR.border,
    paddingHorizontal: 4,
    paddingVertical: 3,
    justifyContent: "center",
  },
  titleCell: {
    backgroundColor: COLOR.titleBg,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: BORDER_W,
    borderBottomWidth: BORDER_W,
    borderColor: COLOR.border,
  },
  titleText: {
    color: COLOR.titleText,
    fontSize: 13,
    fontWeight: 700,
  },
  sectionHeaderCell: {
    backgroundColor: COLOR.sectionBg,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRightWidth: BORDER_W,
    borderBottomWidth: BORDER_W,
    borderColor: COLOR.border,
    justifyContent: "center",
  },
  sectionHeaderText: {
    color: COLOR.labelText,
    fontWeight: 700,
    fontSize: 10,
  },
  labelCell: {
    backgroundColor: COLOR.labelBg,
    alignItems: "center",
    justifyContent: "center",
  },
  labelText: {
    color: COLOR.labelText,
    fontWeight: 600,
    fontSize: 9,
    textAlign: "center",
  },
  labelTextLeft: {
    color: COLOR.labelText,
    fontWeight: 600,
    fontSize: 9,
    textAlign: "left",
  },
  valueText: {
    fontSize: 9,
  },
  valueTextSm: {
    fontSize: 8.5,
  },
  empty: {
    color: COLOR.emptyText,
  },
  centerText: {
    textAlign: "center",
  },
  duty: {
    fontSize: 8.5,
    marginBottom: 1,
  },
  motivationCell: {
    minHeight: 180,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRightWidth: BORDER_W,
    borderBottomWidth: BORDER_W,
    borderColor: COLOR.border,
  },
  motivationText: {
    fontSize: 9,
    lineHeight: 1.5,
  },
});

// ─── 유틸 컴포넌트 ────────────────────────────────────────────────────
function Cell({
  width,
  variant = "value",
  align,
  children,
  minHeight,
}: {
  width: string | number;
  variant?: "value" | "label";
  align?: "left" | "center" | "right";
  children?: React.ReactNode;
  minHeight?: number;
}) {
  const isLabel = variant === "label";
  return (
    <View
      style={[
        styles.cellBase,
        isLabel ? styles.labelCell : {},
        { width: width as string | number, minHeight: minHeight ?? 18 },
        align === "left" ? { alignItems: "flex-start" } : {},
        align === "right" ? { alignItems: "flex-end" } : {},
      ]}
    >
      {typeof children === "string" ? (
        <Text style={isLabel ? styles.labelText : styles.valueText}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

function ValueText({ value }: { value: string }) {
  if (!value || !value.trim()) {
    return <Text style={[styles.valueText, styles.empty]}>-</Text>;
  }
  return <Text style={styles.valueText}>{value}</Text>;
}

// ─── 섹션별 렌더러 ────────────────────────────────────────────────────

function TitleRow() {
  return (
    <View style={styles.row}>
      <View style={[styles.titleCell, { width: "100%" }]}>
        <Text style={styles.titleText}>코디네이터 지원서</Text>
      </View>
    </View>
  );
}

function SectionHeader({ text }: { text: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.sectionHeaderCell, { width: "100%" }]}>
        <Text style={styles.sectionHeaderText}>{text}</Text>
      </View>
    </View>
  );
}

function BasicInfoRows({ row }: { row: ResumeRow }) {
  const b = row.basic;
  // 14열을 6개 셀로: 라벨 12% / 값 22% / 라벨 8% / 값 22% / 라벨 15% / 값 21%
  return (
    <>
      <View style={styles.row}>
        <Cell width="12%" variant="label">성명</Cell>
        <Cell width="22%"><ValueText value={b.name} /></Cell>
        <Cell width="8%" variant="label">성별</Cell>
        <Cell width="22%"><ValueText value={b.gender} /></Cell>
        <Cell width="15%" variant="label">생년월일</Cell>
        <Cell width="21%"><ValueText value={b.birth} /></Cell>
      </View>
      <View style={styles.row}>
        <Cell width="12%" variant="label">소속</Cell>
        <Cell width="22%"><ValueText value={b.organization} /></Cell>
        <Cell width="8%" variant="label">직위/직책</Cell>
        <Cell width="22%"><ValueText value={b.position} /></Cell>
        <Cell width="15%" variant="label">
          <View>
            <Text style={styles.labelText}>담당교과</Text>
            <Text style={[styles.labelText, { fontSize: 7.5, color: COLOR.muted, fontWeight: 400 }]}>
              (중등 교원일 경우)
            </Text>
          </View>
        </Cell>
        <Cell width="21%"><ValueText value={b.subject} /></Cell>
      </View>
    </>
  );
}

function CareerSection({ row }: { row: ResumeRow }) {
  const c = row.career;
  // 헤더: 교사 경력(36%) | 근속연수(29%) | 담당업무 및 주요역할(35%)
  return (
    <>
      {/* 헤더 행 */}
      <View style={styles.row}>
        <Cell width="36%" variant="label">교사 경력</Cell>
        <Cell width="29%" variant="label">근속연수</Cell>
        <Cell width="35%" variant="label">
          <View>
            <Text style={styles.labelText}>담당업무 및 주요역할</Text>
            <Text style={[styles.labelText, { fontSize: 7.5, color: COLOR.muted, fontWeight: 400 }]}>
              (최근 3년이내, 최대 5개)
            </Text>
          </View>
        </Cell>
      </View>
      {/* 교사경력 데이터 */}
      <View style={styles.row}>
        <View style={[styles.cellBase, styles.labelCell, { width: "10%" }]}>
          <Text style={styles.labelText}>교사경력</Text>
        </View>
        <View style={[styles.cellBase, { width: "26%" }]}>
          <Text style={[styles.valueTextSm, { color: COLOR.text }]}>교원 근속 경력 및 주요 업무</Text>
          <Text style={[styles.valueTextSm, { color: COLOR.labelText }]}>(연계역량: 학교조직이해)</Text>
        </View>
        <View style={[styles.cellBase, { width: "29%", alignItems: "center" }]}>
          <ValueText value={c.teacherYears} />
        </View>
        <View style={[styles.cellBase, { width: "35%" }]}>
          {c.teacherDuties.length === 0 ? (
            <Text style={[styles.valueText, styles.empty]}>-</Text>
          ) : (
            c.teacherDuties.map((d, i) => (
              <Text key={i} style={styles.duty}>{d}</Text>
            ))
          )}
        </View>
      </View>
      {/* 수석교사 데이터 */}
      <View style={styles.row}>
        <View style={[styles.cellBase, styles.labelCell, { width: "10%" }]}>
          <Text style={styles.labelText}>수석교사 경력</Text>
        </View>
        <View style={[styles.cellBase, { width: "26%" }]}>
          <Text style={[styles.valueTextSm, { color: COLOR.text }]}>수석교사 경력</Text>
          <Text style={[styles.valueTextSm, { color: COLOR.labelText }]}>(연계역량: 학교조직이해)</Text>
        </View>
        <View style={[styles.cellBase, { width: "29%", alignItems: "center" }]}>
          <ValueText value={c.seniorYears} />
        </View>
        <View style={[styles.cellBase, { width: "35%" }]}>
          {c.seniorDuties.length === 0 ? (
            <Text style={[styles.valueText, styles.empty]}>-</Text>
          ) : (
            c.seniorDuties.map((d, i) => (
              <Text key={i} style={styles.duty}>{d}</Text>
            ))
          )}
        </View>
      </View>
    </>
  );
}

function TrainingSection({ row }: { row: ResumeRow }) {
  const slots = 3;
  const buildSlots = (items: TrainingItem[]) => {
    const out: (TrainingItem | null)[] = [];
    for (let i = 0; i < slots; i++) out.push(items[i] ?? null);
    return out;
  };
  const renderRows = (
    title: string,
    description: string,
    sub: string,
    items: TrainingItem[]
  ) => {
    const padded = buildSlots(items);
    return padded.map((it, i) => (
      <View key={i} style={styles.row}>
        {i === 0 && (
          <View
            style={[
              styles.cellBase,
              styles.labelCell,
              { width: "16%" },
            ]}
          >
            <Text style={styles.labelText}>{title}</Text>
          </View>
        )}
        {i === 0 && (
          <View style={[styles.cellBase, { width: "26%" }]}>
            <Text style={[styles.valueTextSm, { color: COLOR.text }]}>{description}</Text>
            <Text style={[styles.valueTextSm, { color: COLOR.labelText }]}>{sub}</Text>
          </View>
        )}
        {i !== 0 && <View style={{ width: "42%" }} />}
        <View style={[styles.cellBase, { width: "29%" }]}>
          {it?.name ? <Text style={styles.valueTextSm}>{it.name}</Text> : <Text style={[styles.valueTextSm, styles.empty]}> </Text>}
        </View>
        <View style={[styles.cellBase, { width: "14%", alignItems: "center" }]}>
          {it?.period ? <Text style={styles.valueTextSm}>{it.period}</Text> : <Text style={[styles.valueTextSm, styles.empty]}> </Text>}
        </View>
        <View style={[styles.cellBase, { width: "15%" }]}>
          {it?.organizer ? <Text style={styles.valueTextSm}>{it.organizer}</Text> : <Text style={[styles.valueTextSm, styles.empty]}> </Text>}
        </View>
      </View>
    ));
  };

  return (
    <>
      {/* 헤더 행 */}
      <View style={styles.row}>
        <Cell width="42%" variant="label">교육경험</Cell>
        <Cell width="29%" variant="label">연수명</Cell>
        <Cell width="14%" variant="label">연수기간 (차시)</Cell>
        <Cell width="15%" variant="label">연수운영기관</Cell>
      </View>
      {renderRows(
        "연수 이수 현황",
        "디지털 관련 연수 이수",
        "(연계역량: 수업설계/주제전문성)",
        row.trainings.digital
      )}
      {renderRows(
        "기타 연수 이수",
        "기타 연수 이수",
        "(연계역량: 수업설계/주제전문성)",
        row.trainings.others
      )}
    </>
  );
}

function CertificateSection({ row }: { row: ResumeRow }) {
  const slots = 3;
  const padded: (CertificateItem | null)[] = [];
  for (let i = 0; i < slots; i++) padded.push(row.certificates[i] ?? null);

  return (
    <>
      <View style={styles.row}>
        <View style={[styles.cellBase, styles.labelCell, { width: "42%" }]}>
          <View>
            <Text style={[styles.labelText, { textAlign: "left" }]}>디지털/IT 관련 자격증</Text>
            <Text style={[styles.labelText, { textAlign: "left", fontSize: 7.5, color: COLOR.muted, fontWeight: 400 }]}>
              (연계역량: 디지털 리터러시)
            </Text>
          </View>
        </View>
        <Cell width="29%" variant="label">자격증명</Cell>
        <Cell width="14%" variant="label">취득일자</Cell>
        <Cell width="15%" variant="label">발행기관</Cell>
      </View>
      {padded.map((c, i) => (
        <View key={i} style={styles.row}>
          <View style={{ width: "42%" }} />
          <View style={[styles.cellBase, { width: "29%" }]}>
            <Text style={c?.name ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{c?.name || " "}</Text>
          </View>
          <View style={[styles.cellBase, { width: "14%", alignItems: "center" }]}>
            <Text style={c?.date ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{c?.date || " "}</Text>
          </View>
          <View style={[styles.cellBase, { width: "15%" }]}>
            <Text style={c?.issuer ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{c?.issuer || " "}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

function LectureSection({ row }: { row: ResumeRow }) {
  const slots = 5;
  const padded: (LectureItem | null)[] = [];
  for (let i = 0; i < slots; i++) padded.push(row.lectures[i] ?? null);

  return (
    <>
      <View style={styles.row}>
        <View style={[styles.cellBase, styles.labelCell, { width: "30%" }]}>
          <View>
            <Text style={[styles.labelText, { textAlign: "left" }]}>교원대상 강의 경험</Text>
            <Text style={[styles.labelText, { textAlign: "left", fontSize: 7.5, color: COLOR.muted, fontWeight: 400 }]}>
              (연계역량: 코디네이터 전문역량)
            </Text>
            <Text style={[styles.labelText, { textAlign: "left", fontSize: 7.5, color: COLOR.muted, fontWeight: 400, marginTop: 2 }]}>
              ※ 최근 3년 이내에 이수한 연수 기재 (최대 5개)
            </Text>
          </View>
        </View>
        <Cell width="28%" variant="label">연수명</Cell>
        <Cell width="14%" variant="label">연수기간(차시)</Cell>
        <Cell width="10%" variant="label">역할</Cell>
        <Cell width="18%" variant="label">연수 운영기관</Cell>
      </View>
      {padded.map((l, i) => (
        <View key={i} style={styles.row}>
          <View style={{ width: "30%" }} />
          <View style={[styles.cellBase, { width: "28%" }]}>
            <Text style={l?.name ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{l?.name || " "}</Text>
          </View>
          <View style={[styles.cellBase, { width: "14%", alignItems: "center" }]}>
            <Text style={l?.period ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{l?.period || " "}</Text>
          </View>
          <View style={[styles.cellBase, { width: "10%", alignItems: "center" }]}>
            <Text style={l?.role ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{l?.role || " "}</Text>
          </View>
          <View style={[styles.cellBase, { width: "18%" }]}>
            <Text style={l?.organizer ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{l?.organizer || " "}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

function ProjectSection({ row }: { row: ResumeRow }) {
  const slots = 5;
  const padded: (ProjectItem | null)[] = [];
  for (let i = 0; i < slots; i++) padded.push(row.projects[i] ?? null);

  return (
    <>
      <View style={styles.row}>
        <View style={[styles.cellBase, styles.labelCell, { width: "30%" }]}>
          <View>
            <Text style={[styles.labelText, { textAlign: "left" }]}>정부사업 수행 경험</Text>
            <Text style={[styles.labelText, { textAlign: "left", fontSize: 7.5, color: COLOR.muted, fontWeight: 400 }]}>
              (연계역량: 디지털 전환 교육 정책 이해 등)
            </Text>
            <Text style={[styles.labelText, { textAlign: "left", fontSize: 7.5, color: COLOR.muted, fontWeight: 400, marginTop: 2 }]}>
              ※ 최근 3년 이내에 공동연구진 또는 자문진 등으로 참여한 정부사업 정책 기재 (최대 5개)
            </Text>
          </View>
        </View>
        <Cell width="28%" variant="label">사업명</Cell>
        <Cell width="14%" variant="label">사업기간</Cell>
        <Cell width="18%" variant="label">역할</Cell>
        <Cell width="10%" variant="label">기관</Cell>
      </View>
      {padded.map((p, i) => (
        <View key={i} style={styles.row}>
          <View style={{ width: "30%" }} />
          <View style={[styles.cellBase, { width: "28%" }]}>
            <Text style={p?.name ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{p?.name || " "}</Text>
          </View>
          <View style={[styles.cellBase, { width: "14%", alignItems: "center" }]}>
            <Text style={p?.period ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{p?.period || " "}</Text>
          </View>
          <View style={[styles.cellBase, { width: "18%" }]}>
            <Text style={p?.role ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{p?.role || " "}</Text>
          </View>
          <View style={[styles.cellBase, { width: "10%", alignItems: "center" }]}>
            <Text style={p?.organization ? styles.valueTextSm : [styles.valueTextSm, styles.empty]}>{p?.organization || " "}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

function MotivationSection({ row }: { row: ResumeRow }) {
  return (
    <View style={styles.row}>
      <View style={[styles.motivationCell, { width: "100%" }]}>
        {row.motivation.trim() ? (
          row.motivation.split(/\n/).map((line, i) => (
            <Text key={i} style={styles.motivationText}>{line || " "}</Text>
          ))
        ) : (
          <Text style={[styles.motivationText, styles.empty]}>-</Text>
        )}
      </View>
    </View>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────
export type ResumeDocumentProps = {
  row: ResumeRow;
};

export function ResumeDocument({ row }: ResumeDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.prelude}>○ (서류평가) 코디네이터 지원서 양식</Text>
        <View style={styles.table}>
          <TitleRow />
          <SectionHeader text="■ 기본정보" />
          <BasicInfoRows row={row} />
          <SectionHeader text="■ 경력사항(지원자가 해당하는 항목만 기재)" />
          <CareerSection row={row} />
          <TrainingSection row={row} />
          <CertificateSection row={row} />
          <LectureSection row={row} />
          <ProjectSection row={row} />
          <SectionHeader text="■ 지원 동기 및 포부 (역량: 사업 및 정책 이해, 성과관리)" />
          <MotivationSection row={row} />
        </View>
      </Page>
    </Document>
  );
}
