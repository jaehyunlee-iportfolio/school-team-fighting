/**
 * 이력서 「지원 동기 및 포부」 생성 API.
 *
 * POST /api/resume/motivate
 *   body: { kind: "coordinator" | "instructor", basic: ResumeBasic, attachedText: string }
 *   200 : { output: string }
 *   400 : { error: string }
 *   500 : { error: string }
 *
 * 환경변수: ANTHROPIC_API_KEY (필수), CLAUDE_RESUME_MODEL (선택, 기본 claude-sonnet-4-6)
 */

import { NextResponse } from "next/server";
import { buildMotivationPrompt } from "@/lib/resume/prompt";
import type { ResumeBasic, ResumeKind } from "@/lib/resume/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  kind?: ResumeKind;
  basic?: ResumeBasic;
  attachedText?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind: ResumeKind =
    body.kind === "coordinator" ? "coordinator" : "instructor";
  const basic = body.basic ?? {
    name: "",
    rrn: "",
    gender: "",
    birth: "",
    organization: "",
    position: "",
    subject: "",
  };
  const attachedText = (body.attachedText ?? "").trim();

  if (!basic.name?.trim()) {
    return NextResponse.json(
      { error: "성명이 비어있습니다" },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 미설정" },
      { status: 500 },
    );
  }
  const model = process.env.CLAUDE_RESUME_MODEL || "claude-sonnet-4-6";

  const prompt = buildMotivationPrompt({ kind, basic, attachedText });

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
