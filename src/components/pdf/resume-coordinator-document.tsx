// 코디네이터 지원서 PDF — narrow CSV 모드.
// CSV에 없는 필드(경력/연수/자격증/강의/사업)는 모두 빈칸으로 그리되,
// 빈 row 갯수는 layout 설정으로 1~5 사이에서 조절 가능.

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResumeRow } from "@/lib/resume/types";
import {
  type ResumeLayoutCommon,
  DEFAULT_RESUME_COMMON,
  buildResumeStyles,
} from "@/components/pdf/resume-shared-styles";

export type ResumeCoordinatorDocumentProps = {
  row: ResumeRow;
  layout?: ResumeLayoutCommon;
};

export function ResumeCoordinatorDocument({
  row,
  layout,
}: ResumeCoordinatorDocumentProps) {
  const cfg = layout ?? DEFAULT_RESUME_COMMON;
  const styles = buildResumeStyles(StyleSheet, cfg);
  const b = cfg.border.width;
  const BC = cfg.border.color;

  const ValueText = ({ value }: { value: string }) =>
    value && value.trim() ? (
      <Text style={styles.valueText}>{value}</Text>
    ) : (
      <Text style={[styles.valueText, styles.empty]}>-</Text>
    );

  const SmText = ({ value }: { value: string }) =>
    value && value.trim() ? (
      <Text style={styles.valueTextSm}>{value}</Text>
    ) : (
      <Text style={[styles.valueTextSm, styles.empty]}>-</Text>
    );

  const SectionHeader = ({ text }: { text: string }) => (
    <View style={styles.row}>
      <View style={[styles.sectionHeaderCell, { width: "100%" }]}>
        <Text style={styles.sectionHeaderText}>{text}</Text>
      </View>
    </View>
  );

  const TitleRow = () => (
    <View style={styles.row}>
      <View style={[styles.titleCell, { width: "100%" }]}>
        <Text style={styles.titleText}>코디네이터 지원서</Text>
      </View>
    </View>
  );

  const BasicInfoRows = () => {
    const bi = row.basic;
    return (
      <>
        <View style={styles.row}>
          <View style={[styles.cellBase, styles.labelCell, { width: "12%" }]}>
            <Text style={styles.labelText}>성명</Text>
          </View>
          <View style={[styles.cellBase, { width: "22%" }]}>
            <ValueText value={bi.name} />
          </View>
          <View style={[styles.cellBase, styles.labelCell, { width: "8%" }]}>
            <Text style={styles.labelText}>성별</Text>
          </View>
          <View style={[styles.cellBase, { width: "22%" }]}>
            <ValueText value={bi.gender} />
          </View>
          <View style={[styles.cellBase, styles.labelCell, { width: "15%" }]}>
            <Text style={styles.labelText}>생년월일</Text>
          </View>
          <View style={[styles.cellBase, { width: "21%" }]}>
            <ValueText value={bi.birth} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={[styles.cellBase, styles.labelCell, { width: "12%" }]}>
            <Text style={styles.labelText}>소속</Text>
          </View>
          <View style={[styles.cellBase, { width: "22%" }]}>
            <ValueText value={bi.organization} />
          </View>
          <View style={[styles.cellBase, styles.labelCell, { width: "8%" }]}>
            <Text style={styles.labelText}>직위/직책</Text>
          </View>
          <View style={[styles.cellBase, { width: "22%" }]}>
            <ValueText value={bi.position} />
          </View>
          <View style={[styles.cellBase, styles.labelCell, { width: "15%" }]}>
            <View>
              <Text style={styles.labelText}>담당교과</Text>
              <Text
                style={[
                  styles.labelText,
                  styles.sublabelMuted,
                  { color: cfg.colors.muted },
                ]}
              >
                (중등 교원일 경우)
              </Text>
            </View>
          </View>
          <View style={[styles.cellBase, { width: "21%" }]}>
            <ValueText value={bi.subject} />
          </View>
        </View>
      </>
    );
  };

  const CareerSection = () => (
    <>
      <View style={styles.row}>
        <View style={[styles.cellBase, styles.labelCell, { width: "10%" }]}>
          <Text style={styles.labelText}>구분</Text>
        </View>
        <View style={[styles.cellBase, styles.labelCell, { width: "26%" }]}>
          <Text style={styles.labelText}>경력 구분</Text>
        </View>
        <View style={[styles.cellBase, styles.labelCell, { width: "29%" }]}>
          <Text style={styles.labelText}>근속연수</Text>
        </View>
        <View style={[styles.cellBase, styles.labelCell, { width: "35%" }]}>
          <View>
            <Text style={styles.labelText}>담당업무 및 주요역할</Text>
            <Text
              style={[
                styles.labelText,
                styles.sublabelMuted,
                { color: cfg.colors.muted },
              ]}
            >
              (최근 3년이내, 최대 5개)
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.row}>
        <View style={[styles.cellBase, styles.labelCell, { width: "10%" }]}>
          <Text style={styles.labelText}>교사 경력</Text>
        </View>
        <View style={[styles.cellBase, { width: "26%" }]}>
          <Text style={[styles.valueTextSm, { color: cfg.colors.text }]}>
            교원 근속 경력 및 주요 업무
          </Text>
          <Text style={[styles.valueTextSm, { color: cfg.colors.labelText }]}>
            (연계역량: 학교조직이해)
          </Text>
        </View>
        <View
          style={[styles.cellBase, { width: "29%", alignItems: "center" }]}
        >
          <SmText value="" />
        </View>
        <View style={[styles.cellBase, { width: "35%" }]}>
          <SmText value="" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={[styles.cellBase, styles.labelCell, { width: "10%" }]}>
          <Text style={styles.labelText}>수석교사 경력</Text>
        </View>
        <View style={[styles.cellBase, { width: "26%" }]}>
          <Text style={[styles.valueTextSm, { color: cfg.colors.text }]}>
            수석교사 경력
          </Text>
          <Text style={[styles.valueTextSm, { color: cfg.colors.labelText }]}>
            (연계역량: 학교조직이해)
          </Text>
        </View>
        <View
          style={[styles.cellBase, { width: "29%", alignItems: "center" }]}
        >
          <SmText value="" />
        </View>
        <View style={[styles.cellBase, { width: "35%" }]}>
          <SmText value="" />
        </View>
      </View>
    </>
  );

  // 「연수 이수 현황」: 디지털 / 기타 두 그룹. 각 그룹은 emptyRows.training 만큼의 빈 row.
  const TrainingSection = () => {
    const slots = Math.max(1, cfg.emptyRows.training);
    const renderGroup = (title: string, description: string, sub: string) => {
      return Array.from({ length: slots }, (_, i) => {
        const isFirst = i === 0;
        const isLast = i === slots - 1;
        const mergeDown = !isLast;
        return (
          <View key={`${title}-${i}`} style={styles.row}>
            {isFirst ? (
              <>
                <View
                  style={[
                    styles.cellBase,
                    styles.labelCell,
                    {
                      width: "16%",
                      ...(mergeDown ? { borderBottomWidth: 0 } : null),
                    },
                  ]}
                >
                  <Text style={styles.labelText}>{title}</Text>
                </View>
                <View
                  style={[
                    styles.cellBase,
                    {
                      width: "26%",
                      ...(mergeDown ? { borderBottomWidth: 0 } : null),
                    },
                  ]}
                >
                  <Text
                    style={[styles.valueTextSm, { color: cfg.colors.text }]}
                  >
                    {description}
                  </Text>
                  <Text
                    style={[
                      styles.valueTextSm,
                      { color: cfg.colors.labelText },
                    ]}
                  >
                    {sub}
                  </Text>
                </View>
              </>
            ) : (
              <View
                style={{
                  width: "42%",
                  borderRightWidth: b,
                  borderColor: BC,
                  ...(isLast ? { borderBottomWidth: b } : null),
                }}
              />
            )}
            <View style={[styles.cellBase, { width: "29%" }]}>
              <SmText value="" />
            </View>
            <View
              style={[styles.cellBase, { width: "14%", alignItems: "center" }]}
            >
              <SmText value="" />
            </View>
            <View style={[styles.cellBase, { width: "15%" }]}>
              <SmText value="" />
            </View>
          </View>
        );
      });
    };
    return (
      <>
        <View style={styles.row}>
          <View style={[styles.cellBase, styles.labelCell, { width: "42%" }]}>
            <Text style={styles.labelText}>교육경험</Text>
          </View>
          <View style={[styles.cellBase, styles.labelCell, { width: "29%" }]}>
            <Text style={styles.labelText}>연수명</Text>
          </View>
          <View style={[styles.cellBase, styles.labelCell, { width: "14%" }]}>
            <Text style={styles.labelText}>연수기간 (차시)</Text>
          </View>
          <View style={[styles.cellBase, styles.labelCell, { width: "15%" }]}>
            <Text style={styles.labelText}>연수운영기관</Text>
          </View>
        </View>
        {renderGroup(
          "연수 이수 현황",
          "디지털 관련 연수 이수",
          "(연계역량: 수업설계/주제전문성)",
        )}
        {renderGroup(
          "기타 연수 이수",
          "기타 연수 이수",
          "(연계역량: 수업설계/주제전문성)",
        )}
      </>
    );
  };

  // 라벨 병합 그룹(자격증/강의/사업): 헤더 행에 좌측 라벨 + 우측 4컬럼.
  // 빈 row 갯수만큼 우측 4컬럼은 빈칸으로, 좌측 라벨 영역은 placeholder View.
  const MergedLabelTable = (props: {
    labelTitle: string;
    labelSubs: string[];
    labelWidth: string;
    headers: { width: string; label: string }[];
    slotCount: number;
    centerCols?: number[]; // 중앙 정렬할 데이터 셀 컬럼 인덱스
  }) => {
    const {
      labelTitle,
      labelSubs,
      labelWidth,
      headers,
      slotCount,
      centerCols = [],
    } = props;
    const slots = Math.max(1, slotCount);
    const placeholderWidth = (() => {
      // 라벨 width + 헤더 첫 컬럼 width 의 합산 (% 기반)
      const labelN = parseFloat(labelWidth);
      return `${labelN}%`;
    })();
    return (
      <>
        <View style={styles.row}>
          <View
            style={[
              styles.cellBase,
              styles.labelCell,
              { width: labelWidth, borderBottomWidth: 0 },
            ]}
          >
            <View>
              <Text style={[styles.labelText, { textAlign: "left" }]}>
                {labelTitle}
              </Text>
              {labelSubs.map((s, i) => (
                <Text
                  key={i}
                  style={[
                    styles.labelText,
                    styles.sublabelMuted,
                    { textAlign: "left", color: cfg.colors.muted, marginTop: i === 0 ? 0 : 2 },
                  ]}
                >
                  {s}
                </Text>
              ))}
            </View>
          </View>
          {headers.map((h, i) => (
            <View
              key={i}
              style={[styles.cellBase, styles.labelCell, { width: h.width }]}
            >
              <Text style={styles.labelText}>{h.label}</Text>
            </View>
          ))}
        </View>
        {Array.from({ length: slots }, (_, i) => {
          const isLast = i === slots - 1;
          return (
            <View key={i} style={styles.row}>
              <View
                style={{
                  width: placeholderWidth,
                  borderRightWidth: b,
                  borderColor: BC,
                  ...(isLast ? { borderBottomWidth: b } : null),
                }}
              />
              {headers.map((h, j) => (
                <View
                  key={j}
                  style={[
                    styles.cellBase,
                    {
                      width: h.width,
                      ...(centerCols.includes(j)
                        ? { alignItems: "center" }
                        : null),
                    },
                  ]}
                >
                  <SmText value="" />
                </View>
              ))}
            </View>
          );
        })}
      </>
    );
  };

  const MotivationSection = () => (
    <View style={styles.row}>
      <View style={[styles.motivationCell, { width: "100%" }]}>
        {row.motivation.trim() ? (
          row.motivation.split(/\n/).map((line, i) => (
            <Text key={i} style={styles.motivationText}>
              {line || " "}
            </Text>
          ))
        ) : (
          <Text style={[styles.motivationText, styles.empty]}>-</Text>
        )}
      </View>
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.prelude}>○ (서류평가) 코디네이터 지원서 양식</Text>
        <View style={styles.table}>
          <TitleRow />
          <SectionHeader text="■ 기본정보" />
          <BasicInfoRows />
          <SectionHeader text="■ 경력사항(지원자가 해당하는 항목만 기재)" />
          <CareerSection />
          <TrainingSection />
          <MergedLabelTable
            labelTitle="디지털/IT 관련 자격증"
            labelSubs={["(연계역량: 디지털 리터러시)"]}
            labelWidth="42%"
            headers={[
              { width: "29%", label: "자격증명" },
              { width: "14%", label: "취득일자" },
              { width: "15%", label: "발행기관" },
            ]}
            slotCount={cfg.emptyRows.certificate}
            centerCols={[1]}
          />
          <MergedLabelTable
            labelTitle="교원대상 강의 경험"
            labelSubs={[
              "(연계역량: 코디네이터 전문역량)",
              "※ 최근 3년 이내에 이수한 연수 기재 (최대 5개)",
            ]}
            labelWidth="30%"
            headers={[
              { width: "28%", label: "연수명" },
              { width: "14%", label: "연수기간(차시)" },
              { width: "10%", label: "역할" },
              { width: "18%", label: "연수 운영기관" },
            ]}
            slotCount={cfg.emptyRows.lecture}
            centerCols={[1, 2]}
          />
          <MergedLabelTable
            labelTitle="정부사업 수행 경험"
            labelSubs={[
              "(연계역량: 디지털 전환 교육 정책 이해 등)",
              "※ 최근 3년 이내에 공동연구진 또는 자문진 등으로 참여한 정부사업 정책 기재 (최대 5개)",
            ]}
            labelWidth="30%"
            headers={[
              { width: "28%", label: "사업명" },
              { width: "14%", label: "사업기간" },
              { width: "18%", label: "역할" },
              { width: "10%", label: "기관" },
            ]}
            slotCount={cfg.emptyRows.project}
            centerCols={[1, 3]}
          />
          <SectionHeader text="■ 지원 동기 및 포부 (역량: 사업 및 정책 이해, 성과관리)" />
          <MotivationSection />
        </View>
      </Page>
    </Document>
  );
}
