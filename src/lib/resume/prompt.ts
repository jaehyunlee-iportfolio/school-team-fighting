// Claude API 프롬프트 빌더 — 「지원 동기 및 포부」 작성용.

import type { ResumeBasic, ResumeKind } from "@/lib/resume/types";

const KIND_BLURB: Record<ResumeKind, { title: string; tone: string }> = {
  coordinator: {
    title: "코디네이터 지원서",
    tone:
      "사업 및 정책 이해와 성과관리 역량이 드러나도록. 학교 디지털 전환·찾아가는 컨설팅 등 정부사업 맥락을 자연스럽게 녹여내기.",
  },
  instructor: {
    title: "강사 지원서",
    tone:
      "수업설계와 수업자료 개발 역량이 드러나도록. 학생·교원 대상 디지털 교육 경험과 그로 인한 성과를 평이하게 서술.",
  },
};

export function buildMotivationPrompt(input: {
  kind: ResumeKind;
  basic: ResumeBasic;
  attachedText: string;
}): string {
  const { kind, basic, attachedText } = input;
  const blurb = KIND_BLURB[kind];
  const profile = [
    basic.name && `성명: ${basic.name}`,
    basic.organization && `소속: ${basic.organization}`,
    basic.position && `직위/직책: ${basic.position}`,
    basic.gender && `성별: ${basic.gender}`,
    basic.birth && `생년월일: ${basic.birth}`,
  ]
    .filter(Boolean)
    .join(" / ");

  const ref = (attachedText || "").trim().slice(0, 12000);

  return [
    `당신은 한국의 디지털 교육 사업(찾아가는 학교 컨설팅, 디지털 교실혁명 등)에서 활동하는 교사·코디네이터·자문위원의 지원서를 대신 작성해 주는 한국어 작문 전문가입니다.`,
    ``,
    `이 지원서의 양식: ${blurb.title}`,
    `이 칸의 톤: ${blurb.tone}`,
    ``,
    `[지원자 프로필]`,
    profile || "(프로필 정보가 비어있음)",
    ``,
    `[참고 자료에서 추출한 텍스트]`,
    ref || "(참고 자료가 없습니다 — 지원자 프로필만 보고 일반적인 자기소개를 작성하세요.)",
    ``,
    `위 정보를 바탕으로 「지원 동기 및 포부」 본문을 한국어로 작성해 주세요.`,
    ``,
    `요구사항:`,
    `- 4~7문장, 200~400자 분량.`,
    `- 한국어 격식체 ("~합니다", "~하였습니다" 류 보고체).`,
    `- 마크다운 기호(*, #, - 등) 또는 머리말("아래는…", "다음과 같이…")을 쓰지 말 것. 본문만 출력.`,
    `- 참고 자료에 명시되지 않은 사실(수상 경력·구체 학교명 등)을 임의로 만들지 말 것.`,
    `- 참고 자료가 비어있거나 일반적인 양식 문서뿐이라면, 지원자 프로필(소속·직위)만 활용하여 디지털 교육에 기여하고자 하는 일반적인 포부를 자연스럽게 서술.`,
    `- 첫 문장은 "디지털"·"교육"·"학교"·"수업" 등으로 시작해 자연스럽게 도입.`,
    `- 마지막 문장은 향후 활동에 대한 포부로 마무리.`,
  ].join("\n");
}
