/**
 * 회의록 키워드 → 4개 본문 필드 자동 생성.
 *
 * POST /api/meeting/expand
 *   body: {
 *     keywords: string,
 *     date?: string, time?: string, location?: string, author?: string,
 *     attendees?: string, meetingType?: string,
 *   }
 *   200 : { agenda, content, decisions, schedule }
 *   400 : { error }
 *   500 : { error }
 *
 * 환경변수: ANTHROPIC_API_KEY, CLAUDE_MEETING_MODEL (옵션)
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ExpandRequest = {
  keywords?: string;
  date?: string;
  time?: string;
  location?: string;
  author?: string;
  attendees?: string;
  meetingType?: string;
};

type ExpandResponse = {
  agenda: string;
  content: string;
  decisions: string;
  schedule: string;
};

function previewAttendees(s: string | undefined): string {
  if (!s) return "(미기재)";
  const list = s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  if (list.length <= 6) return list.join(", ");
  return `${list.slice(0, 5).join(", ")} 외 ${list.length - 5}명`;
}

function buildPrompt(req: ExpandRequest): string {
  const meta = [
    `- 회의 유형: ${req.meetingType?.trim() || "운영회의"}`,
    `- 일시: ${req.date?.trim() || "(미기재)"} ${req.time?.trim() || ""}`,
    `- 장소: ${req.location?.trim() || "(미기재)"}`,
    `- 작성자: ${req.author?.trim() || "(미기재)"}`,
    `- 참석자: ${previewAttendees(req.attendees)}`,
  ].join("\n");

  return [
    `[메타]`,
    meta,
    ``,
    `[키워드(원본)]`,
    req.keywords?.trim() || "(없음)",
    ``,
    `[요청]`,
    `위 키워드를 회의록 본문 4개 칸으로 확장해 주세요.`,
    `반드시 아래 JSON 객체만 응답하세요(머리말·설명·코드펜스 금지):`,
    ``,
    `{`,
    `  "agenda": "...",`,
    `  "content": "...",`,
    `  "decisions": "...",`,
    `  "schedule": "..."`,
    `}`,
    ``,
    `[필드별 가이드]`,
    `- agenda  : 회의 안건/목적. 1~5개 항목식, 각 줄 시작에 "· ". 키워드의 주제어를 짧고 명료하게.`,
    `- content : 회의 내용. 5~10문장 격식 보고체. "본 회의는 …을 위해 개최되었다." 식 도입 → 주요 논의 사항을 "1. … 2. … 3. …" 정리.`,
    `- decisions: 결정 및 협의사항. 2~5개. "항목명: 구체 설명" 형식, 줄바꿈으로 구분.`,
    `- schedule: 향후 일정. 2~5개. "[N월 N주]" 또는 "YYYY.MM.DD" 시작 후 한 줄 후속 조치.`,
    ``,
    `[규칙]`,
    `- 키워드에 명시되지 않은 사실·숫자·금액·일자를 만들지 마세요.`,
    `- 마크다운(#, *, **, --) 금지. 회의록은 평문.`,
    `- "~합니다/~하였습니다" 보고 어조.`,
    `- 키워드가 너무 짧거나 모호해도 가용 정보 안에서만 작성. 부족하면 빈 문자열 반환.`,
    `- 응답은 반드시 JSON 객체 1개. 다른 텍스트 금지.`,
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "당신은 대한민국 교육 사업 회의록 작성 전문가입니다.",
  "교사연수·학교컨설팅 사업의 운영회의록을 격식체로 작성합니다.",
  "JSON 객체만 응답하세요. 머리말·설명·코드펜스 금지.",
].join("\n");

/** 응답에서 JSON 객체를 추출 (코드펜스/머리말이 섞여도 첫 { ... } 블록을 잡음) */
function extractJsonObject(s: string): string | null {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return null;
}

function safeParse(s: string): Partial<ExpandResponse> | null {
  const j = extractJsonObject(s);
  if (!j) return null;
  try {
    const obj = JSON.parse(j);
    if (typeof obj !== "object" || obj === null) return null;
    return obj as Partial<ExpandResponse>;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: ExpandRequest;
  try {
    body = (await req.json()) as ExpandRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const keywords = String(body.keywords ?? "").trim();
  if (!keywords) {
    return NextResponse.json({ error: "keywords 비어있음" }, { status: 400 });
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

  const userPrompt = buildPrompt(body);

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
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
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
        .trim();

    const parsed = safeParse(out);
    if (!parsed) {
      return NextResponse.json(
        { error: "응답 JSON 파싱 실패", raw: out.slice(0, 500) },
        { status: 502 },
      );
    }
    const result: ExpandResponse = {
      agenda: String(parsed.agenda ?? "").trim(),
      content: String(parsed.content ?? "").trim(),
      decisions: String(parsed.decisions ?? "").trim(),
      schedule: String(parsed.schedule ?? "").trim(),
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: String((e as Error).message ?? e) },
      { status: 500 },
    );
  }
}
