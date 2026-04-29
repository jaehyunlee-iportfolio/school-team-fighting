/**
 * 회의록 텍스트 다듬기 API.
 *
 * POST /api/meeting/refine
 *   body: { field: "agenda"|"content"|"decisions"|"schedule", input: string, context?: object }
 *   200 : { output: string }
 *   400 : { error: string }
 *   500 : { error: string }
 *
 * 환경변수: ANTHROPIC_API_KEY
 * 모델: 기본 claude-sonnet-4-5 (env CLAUDE_MEETING_MODEL 로 오버라이드 가능)
 *
 * 키워드/문장 어느 쪽이든 받아 매끄러운 한국어 회의록 본문으로 정리한다.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FIELD_GUIDE: Record<string, { label: string; format: string }> = {
  agenda: {
    label: "회의 안건 / 목적",
    format: "1~5개 불릿(\"- \")으로 작성. 키워드의 주제어를 그대로 살림.",
  },
  content: {
    label: "회의 내용",
    format:
      "3~8개 항목. \"1. \" 번호 또는 \"- \" 불릿으로 시작. 각 항목 한 줄.",
  },
  decisions: {
    label: "결정 및 협의사항",
    format:
      "2~5개 불릿(\"- \"). 항목 안에서 \"항목명: 설명\" 구조 권장.",
  },
  schedule: {
    label: "향후 일정",
    format:
      "2~5개 불릿(\"- \"). 시작에 \"[N월 N주]\" 또는 \"YYYY.MM.DD\" 표기.",
  },
};

function buildPrompt(field: string, input: string): string {
  const g = FIELD_GUIDE[field] ?? {
    label: field,
    format: "개조식 항목 나열.",
  };
  return [
    `당신은 한국어 회의록 작성 전문가입니다.`,
    `다음은 회의록의 "${g.label}" 칸에 들어갈 초안입니다.`,
    `초안이 키워드 나열이면 항목식으로 풀어쓰고, 이미 항목식이면 표현·중복·구어체를 다듬어 주세요.`,
    ``,
    `[형식]`,
    `- ${g.format}`,
    ``,
    `[문체 규칙]`,
    `- 개조식. 모든 항목을 "- " 불릿 또는 "1. " 번호로 시작.`,
    `- 종결어미는 "임 / 됨 / 함 / 음" 4가지만 사용 (보고서 문체).`,
    `  예) "확인함", "검토 완료됨", "보강 필요함", "추진 중임", "공유 있음".`,
    `- "~합니다 / ~하였습니다 / ~입니다" 등 평어/높임체 금지.`,
    `- 한 항목은 한 줄로 짧고 명료하게. 긴 문장은 분리.`,
    ``,
    `[금지 사항]`,
    `- 마크다운 헤딩(#)·강조(*, **)·구분선(---) 금지. 평문 + 불릿/번호만.`,
    `- 줄글 단락 금지.`,
    `- 머리말/설명 없이 결과 본문만 출력.`,
    `- 원문에 없는 사실·숫자·일자 임의 추가 금지.`,
    ``,
    `[초안]`,
    input,
  ].join("\n");
}

export async function POST(req: Request) {
  let body: { field?: string; input?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const field = String(body.field ?? "");
  const input = String(body.input ?? "").trim();
  if (!input) {
    return NextResponse.json({ error: "input 비어있음" }, { status: 400 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 미설정" },
      { status: 500 },
    );
  }
  const model =
    process.env.CLAUDE_MEETING_MODEL || "claude-sonnet-4-5-20250929";

  const prompt = buildPrompt(field, input);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: `Claude API ${r.status}: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }
    const data = (await r.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const out =
      (data.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")
        .trim() || "";
    return NextResponse.json({ output: out });
  } catch (e) {
    return NextResponse.json(
      { error: String((e as Error).message ?? e) },
      { status: 500 },
    );
  }
}
