// Claude API 프롬프트 빌더 — 「지원 동기 및 포부」 작성용.
//
// 설계 원칙:
//   1. 「지원 동기 및 포부」 한 칸만 작성. 표(연수·자격증·강의·사업)는 빈칸 유지.
//   2. 시점 보정 (b - 일부 완화):
//      - 첨부 자료의 분야명·도구명·일반 활동 유형은 본문에 자연스럽게 인용 가능.
//      - 단 특정 학교명·구체 일자·금액·수상 등은 인용 금지 (지원 시점 모순).
//   3. 다양성 (i+ii+iv+v 모두 적용):
//      (i) 길이 3~9문장 / 150~550자 — rowIndex 시드로 폭 활용
//      (ii) 도입부 진입점 5종 — rowIndex 시드로 회전
//      (iv) 키워드 클러스터 7종 — rowIndex 시드로 회전
//      (v) 시드 명시: "이 응시자는 N명 중 #M번. 다른 응시자와 어조·길이가 명확히 구별되도록"
//   4. 첨부 없음 (B - 일반 자격/연수 언급 OK):
//      - "에듀테크 직무연수를 꾸준히 이수하며" 류 일반 표현은 가능.
//      - 단 구체 자격증명·기관명·시수는 만들지 않음.

import type { ResumeBasic, ResumeKind } from "@/lib/resume/types";

const KIND_BLURB: Record<ResumeKind, { title: string; tone: string }> = {
  coordinator: {
    title: "코디네이터 지원서",
    tone:
      "사업 및 정책 이해와 성과관리 역량이 자연스럽게 드러나도록.",
  },
  instructor: {
    title: "강사 지원서",
    tone:
      "수업설계와 수업자료 개발 역량이 자연스럽게 드러나도록.",
  },
};

// 도입부 진입점 5종 — rowIndex 로 회전
const OPENING_PATTERNS = [
  "개인적 계기·동기에서 출발 (예: '교사로 근무하며 ~한 고민을 이어왔습니다')",
  "시대적 흐름·문제의식에서 출발 (예: '디지털 전환이 빠르게 진행되는 가운데 ~')",
  "구체 경험에서 출발 (예: '그동안 학생들과 ~한 활동을 진행하며 ~')",
  "본 사업에 대한 인식에서 출발 (예: '찾아가는 학교 컨설팅 사업이 추구하는 ~에 깊이 공감하여')",
  "학교 현장의 과제에서 출발 (예: '학교 현장에서는 여전히 ~한 과제가 남아있습니다')",
];

// 키워드 클러스터 7종 — rowIndex 로 회전 (1~2개 자연스럽게 활용)
const KEYWORD_CLUSTERS = [
  "디지털 전환 / 디지털 대전환 / 디지털 기반 교육혁신",
  "에듀테크 / AI 활용 수업 / 생성형 AI",
  "교실혁명 / 수업 혁신 / 학습자 중심 수업",
  "미래교육 / 미래 핵심역량 / 자기주도 학습",
  "정보 리터러시 / 디지털 시민성 / 책임 있는 활용",
  "맞춤형 학습 / 개별화 교육 / 학습 격차 해소",
  "협력적 수업 문화 / 동료 교원 학습공동체 / 학교 단위 변화",
];

function pickByIndex<T>(arr: T[], rowIndex: number, salt: number): T {
  // 단순 mod — 동일 응시자에 대해 같은 결과를 보장 (재생성 시 일관성).
  const i =
    Math.abs((rowIndex + 1) * (salt * 31 + 7) + salt * salt) % arr.length;
  return arr[i];
}

function lengthHintFor(rowIndex: number): {
  sentences: string;
  chars: string;
  flavor: string;
} {
  // 6단계로 회전: 짧고단호 ↔ 중간 ↔ 길고차분
  const stage = Math.abs((rowIndex + 1) * 5 + 3) % 6;
  switch (stage) {
    case 0:
      return {
        sentences: "3~4문장",
        chars: "150~250자",
        flavor: "짧고 단호한 톤",
      };
    case 1:
      return {
        sentences: "4~5문장",
        chars: "220~340자",
        flavor: "간결하고 명료한 톤",
      };
    case 2:
      return {
        sentences: "5~6문장",
        chars: "300~420자",
        flavor: "차분히 풀어쓰는 톤",
      };
    case 3:
      return {
        sentences: "6~7문장",
        chars: "350~470자",
        flavor: "균형 잡힌 보고체",
      };
    case 4:
      return {
        sentences: "7~8문장",
        chars: "420~520자",
        flavor: "풍부하고 서술적인 톤",
      };
    default:
      return {
        sentences: "8~9문장",
        chars: "470~550자",
        flavor: "차분하고 진중한 톤",
      };
  }
}

export function buildMotivationPrompt(input: {
  kind: ResumeKind;
  basic: ResumeBasic;
  attachedText: string;
  rowIndex: number;
  totalRows: number;
}): string {
  const { kind, basic, attachedText, rowIndex, totalRows } = input;
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
  const hasRef = ref.length > 0;

  // 다양화 시드 — 응시자별로 다른 톤·도입·키워드를 자연스럽게 회전
  const lenHint = lengthHintFor(rowIndex);
  const opening = pickByIndex(OPENING_PATTERNS, rowIndex, 1);
  const keywords = pickByIndex(KEYWORD_CLUSTERS, rowIndex, 2);

  const lines: string[] = [
    `당신은 한국의 디지털 교육 사업(찾아가는 학교 컨설팅, 디지털 교실혁명 등) 지원서를 대신 작성하는 한국어 작문 전문가입니다.`,
    ``,
    `[양식] ${blurb.title}`,
    `[톤 가이드] ${blurb.tone}`,
    ``,
    `[지원자 프로필]`,
    profile || "(프로필 정보 없음)",
    ``,
    `[다양화 컨텍스트]`,
    `이 응시자는 같은 사업에 동시 지원한 ${totalRows}명 중 #${rowIndex + 1}번째입니다.`,
    `검토자가 모든 지원서를 연달아 읽기 때문에, 응시자별로 어조·도입부·문장 구조·길이가 명확히 구별되어야 자연스럽습니다.`,
    `40명이 비슷한 어휘·구조로 작성되면 인공지능 작성으로 곧장 식별되니 절대 피하세요.`,
    ``,
    `[이 응시자에게 권장하는 다양화 축]`,
    `· 길이: ${lenHint.sentences} / ${lenHint.chars} (${lenHint.flavor}) — 이 범위 안에서 자연스럽게.`,
    `· 도입부 진입점: ${opening}`,
    `· 키워드 클러스터: 「${keywords}」 군에서 1~2개를 자연스럽게 활용. 다른 클러스터 어휘는 가급적 자제.`,
    `· 위 권장은 단서일 뿐, 응시자 프로필과 부합하도록 자연스럽게 조정 가능.`,
    ``,
  ];

  if (hasRef) {
    lines.push(
      `[참고 자료 — 첨부 추출 텍스트]`,
      ref,
      ``,
      `※ 시점 안내 (중요):`,
      `- 위 자료는 지원자가 본 사업에 합격한 이후 실제로 수행한 활동(자문서·활용내역서·결과보고 등) 기록입니다.`,
      `- 작성하려는 「지원 동기 및 포부」 본문은 합격 이전(지원서 제출 시점) 기준이라야 합니다.`,
      `※ 활용 정책:`,
      `- 자료의 「분야명·도구명·일반 활동 유형」은 본문에 자연스럽게 인용 가능 (예: 패들렛·바이브코딩·AI 활용 수업·교사 연수 운영·서면 자문 경험 등).`,
      `- 자료의 「특정 학교명·구체 일자·정확한 금액·수상 이력·구체 차시 수」는 본문에 인용 금지. 시점 모순이 생깁니다.`,
      `- 자료에서 알 수 있는 「지원자의 전문 분야·관심 영역·기존부터 보유한 역량」 단서를 적극 활용해 본문을 구체화하세요. 추상적 일반론으로만 흐르지 마세요.`,
      `- "그동안 ~ 분야에서 역량을 쌓아왔으며" + "앞으로 본 사업에서 ~ 기여하고자 합니다" 미래형 포부 톤 유지.`,
    );
  } else {
    lines.push(
      `[참고 자료]`,
      `(첨부 없음 — 지원자 프로필만 사용)`,
      ``,
      `※ 첨부가 없을 때 정책:`,
      `- 프로필(소속·직위)에 어울리는 일반적 디지털 교육 관심·역량을 자연스럽게 서술하세요.`,
      `- 일반적 직무연수 이수, 자격 보유, 동료 교원 협력 등의 서술은 가능 (예: "에듀테크 관련 직무연수를 꾸준히 이수하며", "동료 교원과 학습공동체 활동을 통해").`,
      `- 단 「구체 자격증명·기관명·시수·연도·수상」 같은 검증 가능한 사실은 만들어내지 마세요. 발각 시 거짓이 됩니다.`,
      `- 다른 39명과 어휘·도입·구조가 겹치지 않도록 위 다양화 축을 충실히 따르세요.`,
    );
  }

  lines.push(
    ``,
    `[작성 요구사항]`,
    `- 위 [다양화 컨텍스트] 의 길이/도입/키워드 권장을 따르되, 응시자에 맞춰 자연스럽게.`,
    `- 한국어 격식체 ("~합니다", "~하였습니다" 류 보고 어조).`,
    `- 마크다운 기호(*, #, - 등) 또는 머리말("아래는…", "다음과 같이…")을 쓰지 말 것. 본문만 출력.`,
    `- 본문 외에 어떤 설명·주석·따옴표도 출력하지 말 것.`,
    `- 마지막 문장은 향후 본 사업에서의 활동·기여에 대한 미래형 포부로 마무리.`,
  );

  return lines.join("\n");
}
