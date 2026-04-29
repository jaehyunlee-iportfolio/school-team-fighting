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
    `위 키워드를 회의록 본문 4개 칸으로 확장하라.`,
    `반드시 아래 JSON 객체만 응답하라(머리말·설명·코드펜스 금지):`,
    ``,
    `{`,
    `  "agenda": "...",`,
    `  "content": "...",`,
    `  "decisions": "...",`,
    `  "schedule": "..."`,
    `}`,
    ``,
    `[문체 규칙 — 모든 필드 공통]`,
    `- 개조식 작성. 모든 항목을 "- " 불릿 또는 "1. " 번호로 시작.`,
    `- 종결어미는 "임 / 됨 / 함 / 음" 4가지만 사용 (보고서 문체).`,
    `  예) "확인함", "검토 완료됨", "보강 필요함", "추진 중임", "공유 있음".`,
    `- "~합니다 / ~하였습니다 / ~입니다" 등 평어/높임체 금지.`,
    `- 한 항목은 한 줄로 짧고 명료하게. 긴 문장은 분리.`,
    ``,
    `[필드별 형식]`,
    `- agenda  : 회의 안건/목적. 1~5개 불릿("- "). 키워드의 주제어를 그대로 활용.`,
    `- content : 회의 내용. 3~8개 항목. "1. " 번호 또는 "- " 불릿. 항목 끝은 임/됨/함/음.`,
    `            예) "1. 플랫폼 운영 현황 및 강사풀 관리 실태 점검함"`,
    `- decisions: 결정 및 협의사항. 2~5개 불릿("- "). 항목 안에서 "항목명: 설명" 구조 권장.`,
    `            예) "- 강사풀 관리 개선: 등록 기준 및 배정 절차 표준화 추진하기로 함"`,
    `- schedule: 향후 일정. 2~5개 불릿("- "). 시작에 "[N월 N주]" 또는 "YYYY.MM.DD" 표기.`,
    `            예) "- [8월 2주] 매뉴얼 초안 작성 및 내부 공유 예정임"`,
    ``,
    `[금지 사항]`,
    `- 키워드에 명시되지 않은 사실·숫자·금액·일자 임의 생성 금지.`,
    `- 마크다운 헤딩(#)·강조(*, **)·구분선(---) 금지. 평문 + 불릿/번호만.`,
    `- 줄글 단락 금지. 모든 필드는 항목식.`,
    `- 빈 키워드면 빈 문자열 반환. 추론 금지.`,
    `- 응답은 JSON 객체 1개. 다른 텍스트 금지.`,
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "당신은 대한민국 교육 사업 회의록 작성 전문가입니다.",
  "교사연수·학교컨설팅 사업의 운영회의록을 개조식 + 보고서 문체(임/됨/함/음)로 작성합니다.",
  "모든 본문은 불릿(- ) 또는 번호(1. ) 항목식. 줄글 단락 금지.",
  "JSON 객체만 응답합니다. 머리말·설명·코드펜스 금지.",
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
