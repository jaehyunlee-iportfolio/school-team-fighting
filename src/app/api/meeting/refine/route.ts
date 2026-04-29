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

const FIELD_GUIDE: Record<string, { label: string; tone: string }> = {
  agenda: {
    label: "회의 안건 / 목적",
    tone: "간결한 항목식 또는 1~2문장. 회의의 안건과 목적을 명료히.",
  },
  content: {
    label: "회의 내용",
    tone: "5~10문장의 자연스러운 회의록 본문. 격식 있는 보고체.",
  },
  decisions: {
    label: "결정 및 협의사항",
    tone: "결정/합의 사항을 항목별로 정리. '항목명: 설명' 형식이면 좋음.",
  },
  schedule: {
    label: "향후 일정",
    tone: "2~5개의 후속 조치를 자연스럽게 이어쓰기.",
  },
};

function buildPrompt(field: string, input: string): string {
  const g = FIELD_GUIDE[field] ?? {
    label: field,
    tone: "회의록 본문 스타일로 매끄럽게.",
  };
  return [
    `당신은 한국어 회의록 작성 전문가입니다.`,
    `다음은 회의록의 "${g.label}" 칸에 들어갈 초안입니다.`,
    `초안이 키워드 나열이면 자연스러운 문장으로 풀어쓰고, 이미 문장이면 어색한 표현·중복·구어체를 다듬어 주세요.`,
    `톤: ${g.tone}`,
    `요구사항:`,
    `- 한국어 격식체 ("~합니다", "~하였습니다" 류 보고 어조)`,
    `- 마크다운 기호(*, #, - 등)를 쓰지 말 것 (회의록은 평문)`,
    `- 머리말/설명 없이 결과 본문만 출력`,
    `- 원문에 없는 사실을 임의 추가하지 말 것`,
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
