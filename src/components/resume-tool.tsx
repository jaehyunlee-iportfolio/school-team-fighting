"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Trash2,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { ResumeDocument } from "@/components/pdf/resume-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { parseResumeJson } from "@/lib/json/parseResume";
import { parseResumeCsv } from "@/lib/csv/parseResume";
import type { ResumeRow } from "@/lib/resume/types";
import { SAMPLE_JSON, sampleCsvText } from "@/lib/resume/sample";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AppStep = "input" | "validate" | "result";

const STEPS: { id: AppStep; label: string }[] = [
  { id: "input", label: "자료" },
  { id: "validate", label: "검토" },
  { id: "result", label: "끝" },
];

function readFileText(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(f, "UTF-8");
  });
}

function fileSafe(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
}

function pdfNameFor(row: ResumeRow, i: number) {
  const name = fileSafe(row.basic.name || `이력서_${i + 1}`);
  const org = fileSafe(row.basic.organization || "");
  return org ? `이력서_${name}_${org}.pdf` : `이력서_${name}.pdf`;
}

function zipName() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `이력서_모음_${date}_${hh}시${mm}분.zip`;
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function StepIndicator({
  current,
  onBack,
}: {
  current: AppStep;
  onBack: (s: AppStep) => void;
}) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <li key={s.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground">›</span>}
            <button
              onClick={() => done && onBack(s.id)}
              disabled={!done}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                active && "bg-primary text-primary-foreground",
                done && "cursor-pointer text-muted-foreground hover:text-foreground",
                !done && !active && "cursor-default text-muted-foreground/40"
              )}
            >
              {s.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function ResumeTool() {
  const [step, setStep] = useState<AppStep>("input");
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [parsePending, setParsePending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [genPending, setGenPending] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultFiles, setResultFiles] = useState<{ name: string }[]>([]);
  const [previewI, setPreviewI] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewStart = useRef(false);

  const okCount = useMemo(() => rows.filter((r) => !r.hasEmpty).length, [rows]);
  const warnCount = rows.length - okCount;

  const removeRow = useCallback((index: number) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setPreviewI((p) => {
        if (next.length === 0) return 0;
        if (p >= next.length) return next.length - 1;
        return p;
      });
      return next;
    });
    toast.success(`#${index + 1}번 행을 삭제했어요`);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setParsePending(true);
    try {
      const text = await readFileText(file);
      const ext = file.name.toLowerCase().split(".").pop();
      let parsed: ResumeRow[] = [];
      if (ext === "json") {
        parsed = parseResumeJson(text);
      } else if (ext === "csv") {
        parsed = parseResumeCsv(text);
      } else {
        toast.error("JSON 또는 CSV 파일만 지원해요.");
        return;
      }
      if (!parsed.length) {
        toast.error("이력서 데이터를 찾지 못했어요. 형식을 확인해주세요.");
        return;
      }
      setRows(parsed);
      setStep("validate");
      toast.success(`${parsed.length}건을 읽었어요.`);
    } catch (e) {
      toast.error("파일을 읽는 데 실패했어요.");
      console.error(e);
    } finally {
      setParsePending(false);
    }
  }, []);

  const makeBlobFor = useCallback(async (row: ResumeRow) => {
    registerPdfFonts();
    return pdf(<ResumeDocument row={row} />).toBlob();
  }, []);

  const onPreviewIndex = useCallback(
    async (i: number) => {
      if (i < 0 || i >= rows.length) return;
      setPreviewI(i);
      setPreviewPending(true);
      try {
        const blob = await makeBlobFor(rows[i]);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch (e) {
        console.error(e);
        toast.error("미리보기를 만들지 못했어요.");
      } finally {
        setPreviewPending(false);
      }
    },
    [rows, makeBlobFor]
  );

  const doGenerate = useCallback(async () => {
    setGenPending(true);
    setResultFiles([]);
    setGenProgress({ current: 0, total: rows.length });
    try {
      const z = new JSZip();
      const files: { name: string }[] = [];
      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i + 1, total: rows.length });
        const blob = await makeBlobFor(rows[i]);
        const name = pdfNameFor(rows[i], i);
        z.file(name, blob);
        files.push({ name });
      }
      const zipBlob = await z.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, zipName());
      setResultFiles(files);
      setStep("result");
      toast.success(`이력서 ${files.length}장이 담긴 ZIP을 다운로드합니다.`);
    } catch (e) {
      toast.error("PDF 생성에 실패했어요.");
      console.error(e);
    } finally {
      setGenPending(false);
      setGenProgress(null);
    }
  }, [rows, makeBlobFor]);

  // 파일 다운로드 — 샘플
  const downloadSampleJson = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_JSON, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    downloadBlob(blob, "이력서_샘플.json");
  };
  const downloadSampleCsv = () => {
    const blob = new Blob(["﻿" + sampleCsvText()], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "이력서_샘플.csv");
  };

  // input 단계로 돌아가면 미리보기 초기화
  useEffect(() => {
    if (step === "input") {
      previewStart.current = false;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
  }, [step, previewUrl]);

  // validate 진입 시 첫 행 자동 미리보기
  useEffect(() => {
    if (step !== "validate" || !rows.length || previewStart.current) return;
    previewStart.current = true;
    void onPreviewIndex(0);
  }, [step, rows.length, onPreviewIndex]);

  // unmount 시 URL 정리
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div
      className={cn(
        "mx-auto space-y-6 p-4 transition-[max-width] md:p-8",
        step === "validate" ? "max-w-7xl" : "max-w-3xl"
      )}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">이력서</h1>
          <p className="text-sm text-muted-foreground">
            JSON/CSV에서 코디네이터 지원서 PDF를 자동 생성합니다.
          </p>
        </div>
        <StepIndicator current={step} onBack={(id) => setStep(id)} />
      </div>

      {/* ── STEP 1: 입력 ── */}
      {step === "input" && (
        <Card className="mx-auto max-w-4xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg sm:text-xl">1. 자료</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              JSON 또는 CSV(wide) 파일을 올리세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 파일 업로드 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-10 transition-colors hover:border-primary hover:bg-muted/40",
                dragOver && "border-primary bg-muted/40"
              )}
            >
              {parsePending ? (
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              ) : (
                <FileUp className="size-8 text-muted-foreground" />
              )}
              <p className="text-sm font-medium">
                {parsePending ? "파일 읽는 중..." : "JSON/CSV 파일을 클릭 또는 드래그하여 업로드"}
              </p>
              <p className="text-xs text-muted-foreground">
                JSON: 한국어 키 (기본정보·경력·연수이수 등) · CSV: wide format (성명, 디지털연수_1_연수명 …)
              </p>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />

            <Separator />

            <section className="space-y-3">
              <h2 className="text-sm font-medium">샘플 다운로드</h2>
              <p className="text-xs text-muted-foreground">
                처음이라면 샘플을 받아 형식을 참고하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={downloadSampleJson}>
                  <FileJson className="size-4" /> JSON 샘플
                </Button>
                <Button variant="outline" size="sm" onClick={downloadSampleCsv}>
                  <FileSpreadsheet className="size-4" /> CSV 샘플
                </Button>
              </div>
            </section>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: 검토 ── */}
      {step === "validate" && rows.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* 좌: PDF 미리보기 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  미리보기 ({previewI + 1} / {rows.length})
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previewI === 0 || previewPending}
                    onClick={() => onPreviewIndex(previewI - 1)}
                  >
                    이전
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previewI === rows.length - 1 || previewPending}
                    onClick={() => onPreviewIndex(previewI + 1)}
                  >
                    다음
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="aspect-[1/1.4] w-full overflow-hidden rounded-md border bg-muted/30">
                {previewPending && !previewUrl ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="size-6 animate-spin" />
                  </div>
                ) : previewUrl ? (
                  <iframe src={previewUrl} className="size-full" title="이력서 미리보기" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    미리보기 준비 중
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 우: 행 목록 + 액션 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">행 목록 ({rows.length})</CardTitle>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-400">
                    양호 {okCount}
                  </Badge>
                  {warnCount > 0 && (
                    <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
                      누락 {warnCount}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
              {rows.map((r, i) => (
                <button
                  key={i}
                  onClick={() => onPreviewIndex(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40",
                    i === previewI && "border-primary bg-primary/5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{i + 1}</span>
                      <span className="truncate text-sm font-medium">
                        {r.basic.name || "(이름 없음)"}
                      </span>
                      {r.hasEmpty ? (
                        <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
                          누락
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700">
                          양호
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[r.basic.organization, r.basic.position].filter(Boolean).join(" · ") || "-"}
                    </div>
                    {r.fieldWarnings.length > 0 && (
                      <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                        <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                        <span>{r.fieldWarnings.join(" / ")}</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="삭제"
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRow(i);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </button>
              ))}
            </CardContent>
            <Separator />
            <div className="flex items-center justify-between gap-2 p-4">
              <Button variant="outline" size="sm" onClick={() => setStep("input")}>
                이전
              </Button>
              <Button size="sm" disabled={genPending || rows.length === 0} onClick={doGenerate}>
                {genPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    생성 중 {genProgress ? `(${genProgress.current}/${genProgress.total})` : ""}
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> ZIP으로 받기
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── STEP 3: 결과 ── */}
      {step === "result" && (
        <Card className="mx-auto max-w-3xl">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <CardTitle className="text-lg">완료!</CardTitle>
            </div>
            <CardDescription>
              총 {resultFiles.length}장의 PDF가 ZIP으로 다운로드됐어요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm">
              {resultFiles.slice(0, 20).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-1 rounded-full bg-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                </li>
              ))}
              {resultFiles.length > 20 && (
                <li className="text-xs text-muted-foreground">
                  ... 외 {resultFiles.length - 20}장
                </li>
              )}
            </ul>
            <Separator />
            <Button variant="outline" onClick={() => { setStep("input"); setRows([]); setResultFiles([]); }}>
              처음으로
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
