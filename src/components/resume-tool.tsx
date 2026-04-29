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
  FileSpreadsheet,
  Paperclip,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { ResumeCoordinatorDocument } from "@/components/pdf/resume-coordinator-document";
import { ResumeInstructorDocument } from "@/components/pdf/resume-instructor-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { parseResumeCsv } from "@/lib/csv/parseResume";
import {
  type ResumeRow,
  type ResumeAttachment,
  emptyAttachment,
  kindLabel,
  recomputeWarnings,
} from "@/lib/resume/types";
import { sampleCsvText } from "@/lib/resume/sample";
import {
  type ResumeCoordinatorLayoutSettings,
  type ResumeInstructorLayoutSettings,
  DEFAULT_RESUME_COORDINATOR_LAYOUT,
  DEFAULT_RESUME_INSTRUCTOR_LAYOUT,
  getResumeCoordinatorLayoutSettings,
  getResumeInstructorLayoutSettings,
} from "@/lib/firebase/firestore";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AppStep = "input" | "validate" | "result";

const STEPS: { id: AppStep; label: string }[] = [
  { id: "input", label: "자료" },
  { id: "validate", label: "검토" },
  { id: "result", label: "끝" },
];

const SUPPORTED_EXTS = [
  ".hwp",
  ".hwpx",
  ".docx",
  ".pptx",
  ".xlsx",
  ".pdf",
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

function pdfNameFor(row: ResumeRow) {
  const label = kindLabel(row.kind);
  const name = fileSafe(row.basic.name || `이력서_${row.rowIndex + 1}`);
  return `12. 이력서_${label}_${name}.pdf`;
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

function isSupportedAttachment(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTS.some((ext) => lower.endsWith(ext));
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
                !done && !active && "cursor-default text-muted-foreground/40",
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
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [genPending, setGenPending] = useState(false);
  const [genProgress, setGenProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [zipPending, setZipPending] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [resultFiles, setResultFiles] = useState<{ name: string }[]>([]);
  const [previewI, setPreviewI] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [coordLayout, setCoordLayout] =
    useState<ResumeCoordinatorLayoutSettings>(DEFAULT_RESUME_COORDINATOR_LAYOUT);
  const [instLayout, setInstLayout] =
    useState<ResumeInstructorLayoutSettings>(DEFAULT_RESUME_INSTRUCTOR_LAYOUT);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const previewStart = useRef(false);

  // Firestore에서 layout 1회 로드 (실패해도 default로 동작)
  useEffect(() => {
    void (async () => {
      try {
        const [c, i] = await Promise.all([
          getResumeCoordinatorLayoutSettings(),
          getResumeInstructorLayoutSettings(),
        ]);
        setCoordLayout(c);
        setInstLayout(i);
      } catch {
        // 무시 — default 사용
      }
    })();
  }, []);

  const okCount = useMemo(
    () => rows.filter((r) => !r.hasEmpty).length,
    [rows],
  );
  const warnCount = rows.length - okCount;
  const totalAttachments = useMemo(
    () => rows.reduce((sum, r) => sum + r.attachments.length, 0),
    [rows],
  );

  // ── CSV 업로드 ─────────────────────────────────────────────
  const handleCsvFile = useCallback(async (file: File) => {
    setParsePending(true);
    try {
      const text = await readFileText(file);
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext !== "csv") {
        toast.error("CSV 파일만 지원합니다.");
        return;
      }
      const parsed = parseResumeCsv(text);
      if (!parsed.length) {
        toast.error(
          "이력서 데이터를 찾지 못했어요. CSV 헤더가 올바른지 확인해주세요.",
        );
        return;
      }
      setRows(parsed);
      toast.success(`${parsed.length}건을 읽었어요.`);
    } catch (e) {
      toast.error("CSV를 읽는 데 실패했어요.");
      console.error(e);
    } finally {
      setParsePending(false);
    }
  }, []);

  // 파일 객체 보관 (state에 넣으면 깊은 비교 비용 / 메모리 낭비)
  const fileMapRef = useRef<Record<number, File[]>>({});

  // ── 행별 첨부 ─────────────────────────────────────────────
  const attachFiles = useCallback((rowIdx: number, files: File[]) => {
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      if (!isSupportedAttachment(f.name)) {
        rejected.push(f.name);
        continue;
      }
      accepted.push(f);
    }
    if (rejected.length) {
      toast.warning(
        `${rejected.length}개 파일은 지원하지 않는 형식이라 건너뜀: ${rejected
          .slice(0, 3)
          .join(", ")}${rejected.length > 3 ? " 외" : ""}`,
      );
    }
    if (!accepted.length) return;
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== rowIdx) return r;
        const next: ResumeAttachment[] = [
          ...r.attachments,
          ...accepted.map((f) => ({
            ...emptyAttachment(f.name, f.size),
            // file 객체 자체는 별도 ref Map에 보관 (메모리 누수 방지). 여기는 메타만.
          })),
        ];
        // 파일 객체를 접근 가능하게 attachment 옆에 임시 보관 — 단순 구현으로 첨부에 file 첨가.
        // 대신 attach 로직은 별도 Map<rowIdx, File[]> 으로.
        return { ...r, attachments: next };
      }),
    );
    // 실제 파일 참조 보관
    fileMapRef.current[rowIdx] = [
      ...(fileMapRef.current[rowIdx] ?? []),
      ...accepted,
    ];
  }, []);

  const removeAttachment = useCallback((rowIdx: number, attIdx: number) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== rowIdx) return r;
        const next = r.attachments.filter((_, j) => j !== attIdx);
        return { ...r, attachments: next };
      }),
    );
    if (fileMapRef.current[rowIdx]) {
      fileMapRef.current[rowIdx] = fileMapRef.current[rowIdx].filter(
        (_, j) => j !== attIdx,
      );
    }
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    delete fileMapRef.current[index];
    // index shift — fileMapRef 키 재정렬
    const reindexed: Record<number, File[]> = {};
    let n = 0;
    for (const k of Object.keys(fileMapRef.current).map(Number).sort((a, b) => a - b)) {
      if (k === index) continue;
      reindexed[n++] = fileMapRef.current[k];
    }
    fileMapRef.current = reindexed;
  }, []);

  // ── 검토 단계 ─────────────────────────────────────────────
  const makeBlobFor = useCallback(
    async (row: ResumeRow) => {
      registerPdfFonts();
      if (row.kind === "coordinator") {
        return pdf(
          <ResumeCoordinatorDocument row={row} layout={coordLayout} />,
        ).toBlob();
      }
      const { instructor, ...common } = instLayout;
      return pdf(
        <ResumeInstructorDocument
          row={row}
          layout={common}
          extra={instructor}
        />,
      ).toBlob();
    },
    [coordLayout, instLayout],
  );

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
    [rows, makeBlobFor],
  );

  // ── 한 행에 대해 첨부 추출 + AI 생성 ────────────────────────
  const generateOneRow = useCallback(
    async (rowIdx: number): Promise<ResumeRow> => {
      const row = rowsRef.current[rowIdx];
      if (!row) throw new Error("row missing");

      // 1) 각 첨부에 대해 텍스트 추출
      const files = fileMapRef.current[rowIdx] ?? [];
      const texts: string[] = [];
      const updatedAttachments: ResumeAttachment[] = [...row.attachments];
      for (let ai = 0; ai < updatedAttachments.length; ai++) {
        const f = files[ai];
        const meta = updatedAttachments[ai];
        if (!f) {
          updatedAttachments[ai] = {
            ...meta,
            status: "skipped",
            error: "파일 객체가 사라졌습니다 (페이지 새로고침 등)",
          };
          continue;
        }
        if (!isSupportedAttachment(f.name)) {
          updatedAttachments[ai] = {
            ...meta,
            status: "skipped",
            error: "지원하지 않는 확장자",
          };
          continue;
        }
        // 추출 시도
        updatedAttachments[ai] = { ...meta, status: "extracting" };
        // UI 즉각 반영
        setRowAtIndex(rowIdx, (r) => ({
          ...r,
          attachments: updatedAttachments,
        }));
        try {
          const fd = new FormData();
          fd.append("file", f, f.name);
          const r = await fetch("/api/resume/extract", {
            method: "POST",
            body: fd,
          });
          const data = (await r.json()) as {
            text?: string;
            error?: string;
          };
          if (!r.ok) {
            updatedAttachments[ai] = {
              ...meta,
              status: "failed",
              error: data?.error ?? `HTTP ${r.status}`,
            };
          } else {
            updatedAttachments[ai] = {
              ...meta,
              status: "ok",
              text: data.text ?? "",
            };
            if (data.text) texts.push(data.text);
          }
        } catch (e) {
          updatedAttachments[ai] = {
            ...meta,
            status: "failed",
            error: String((e as Error).message ?? e),
          };
        }
        setRowAtIndex(rowIdx, (r) => ({
          ...r,
          attachments: updatedAttachments,
        }));
      }

      // 2) Claude motivate 호출
      const attachedText = texts.join("\n\n").trim();
      setRowAtIndex(rowIdx, (r) => ({
        ...r,
        motivationStatus: "generating",
      }));
      try {
        const r = await fetch("/api/resume/motivate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: row.kind,
            basic: row.basic,
            attachedText,
          }),
        });
        const data = (await r.json()) as { output?: string; error?: string };
        if (!r.ok) {
          const err = data?.error ?? `HTTP ${r.status}`;
          setRowAtIndex(rowIdx, (rr) =>
            recomputeWarnings({
              ...rr,
              attachments: updatedAttachments,
              motivationStatus: "failed",
              motivationError: err,
            }),
          );
          throw new Error(err);
        }
        const out = (data.output ?? "").trim();
        setRowAtIndex(rowIdx, (rr) =>
          recomputeWarnings({
            ...rr,
            attachments: updatedAttachments,
            motivation: out,
            motivationStatus: out ? "ok" : "failed",
            motivationError: out ? undefined : "빈 응답",
          }),
        );
      } catch (e) {
        setRowAtIndex(rowIdx, (rr) =>
          recomputeWarnings({
            ...rr,
            attachments: updatedAttachments,
            motivationStatus: "failed",
            motivationError: String((e as Error).message ?? e),
          }),
        );
      }

      return rowsRef.current[rowIdx];
    },
    [],
  );

  const rowsRef = useRef<ResumeRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const setRowAtIndex = useCallback(
    (idx: number, fn: (r: ResumeRow) => ResumeRow) => {
      setRows((prev) =>
        prev.map((r, i) => (i === idx ? fn(r) : r)),
      );
    },
    [],
  );

  const runGeneration = useCallback(async () => {
    if (!rows.length) return;
    setGenPending(true);
    setGenProgress({ current: 0, total: rows.length });
    try {
      // 순차 실행 (병렬 호출하면 Polaris/Anthropic 레이트 리미트 위험)
      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i, total: rows.length });
        await generateOneRow(i);
      }
      setGenProgress({ current: rows.length, total: rows.length });
      setStep("validate");
      toast.success("AI 생성 완료. 검토 단계로 이동합니다.");
    } catch (e) {
      toast.error("일부 행에서 실패했지만 검토 단계로 이동합니다.");
      console.error(e);
      setStep("validate");
    } finally {
      setGenPending(false);
      setGenProgress(null);
    }
  }, [rows.length, generateOneRow]);

  const regenerateRow = useCallback(
    async (rowIdx: number) => {
      try {
        await generateOneRow(rowIdx);
        await onPreviewIndex(rowIdx);
        toast.success(`#${rowIdx + 1}번 행 재생성 완료`);
      } catch (e) {
        toast.error("재생성 실패");
        console.error(e);
      }
    },
    [generateOneRow, onPreviewIndex],
  );

  const editMotivation = useCallback(
    (rowIdx: number, text: string) => {
      setRowAtIndex(rowIdx, (r) =>
        recomputeWarnings({ ...r, motivation: text, motivationStatus: "ok" }),
      );
    },
    [setRowAtIndex],
  );

  // ── 결과: ZIP 만들고 다운로드 ──────────────────────────────
  const doExport = useCallback(async () => {
    setZipPending(true);
    setResultFiles([]);
    setZipProgress({ current: 0, total: rows.length });
    try {
      const z = new JSZip();
      const files: { name: string }[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        setZipProgress({ current: i + 1, total: rows.length });
        const blob = await makeBlobFor(rows[i]);
        let name = pdfNameFor(rows[i]);
        if (seen.has(name)) {
          const ext = name.endsWith(".pdf") ? ".pdf" : "";
          const base = ext ? name.slice(0, -ext.length) : name;
          let n = 2;
          while (seen.has(`${base}_${n}${ext}`)) n++;
          name = `${base}_${n}${ext}`;
        }
        seen.add(name);
        z.file(name, blob);
        files.push({ name });
      }
      const zipBlob = await z.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, zipName());
      setResultFiles(files);
      setStep("result");
      toast.success(`이력서 ${files.length}장이 담긴 ZIP을 다운로드했어요.`);
    } catch (e) {
      toast.error("PDF 생성에 실패했어요.");
      console.error(e);
    } finally {
      setZipPending(false);
      setZipProgress(null);
    }
  }, [rows, makeBlobFor]);

  const downloadSampleCsv = () => {
    const blob = new Blob(["﻿" + sampleCsvText()], {
      type: "text/csv;charset=utf-8",
    });
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div
      className={cn(
        "mx-auto space-y-6 p-4 transition-[max-width] md:p-8",
        step === "validate" ? "max-w-7xl" : "max-w-4xl",
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">이력서</h1>
          <p className="text-sm text-muted-foreground">
            CSV로 받은 명단의 「지원 동기 및 포부」를 Claude가 작성해 코디·강사 양식 PDF로 생성합니다.
          </p>
        </div>
        <StepIndicator current={step} onBack={(id) => setStep(id)} />
      </div>

      {/* ── STEP 1: 자료 ── */}
      {step === "input" && (
        <div className="space-y-4">
          {/* 1-1) CSV 업로드 카드 */}
          {rows.length === 0 && (
            <Card>
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-lg">1. CSV 업로드</CardTitle>
                <CardDescription className="text-xs">
                  헤더: 구분 / 성명 / 주민등록번호 / 성별 / 생년월일 / 소속 / 직위/직책 / 자료 / 연락처
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setCsvDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setCsvDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setCsvDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleCsvFile(f);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-muted/20 px-4 py-10 transition-colors hover:border-primary hover:bg-muted/40",
                    csvDragOver && "border-primary bg-muted/40",
                  )}
                >
                  {parsePending ? (
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  ) : (
                    <FileUp className="size-8 text-muted-foreground" />
                  )}
                  <p className="text-sm font-medium">
                    {parsePending ? "읽는 중..." : "CSV 파일을 클릭 또는 드래그"}
                  </p>
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleCsvFile(f);
                    e.target.value = "";
                  }}
                />
                <Separator />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    형식이 헷갈린다면 샘플을 받아 참고하세요.
                  </p>
                  <Button variant="outline" size="sm" onClick={downloadSampleCsv}>
                    <FileSpreadsheet className="size-4" /> CSV 샘플
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 1-2) 행별 첨부 카드들 */}
          {rows.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      2. 자료 첨부 ({rows.length}명, 첨부 {totalAttachments}개)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      각 행에 hwp/hwpx/pdf/docx/pptx/xlsx 파일을 드래그-드롭하세요. 첨부가 없어도 진행 가능 (일반 자기소개로 작성됨).
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setRows([]); fileMapRef.current = {}; }}>
                      처음으로
                    </Button>
                    <Button
                      size="sm"
                      onClick={runGeneration}
                      disabled={genPending}
                    >
                      {genPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          생성 중 {genProgress ? `(${genProgress.current}/${genProgress.total})` : ""}
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4" />
                          AI 생성 시작
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
                {rows.map((r, i) => (
                  <RowAttachCard
                    key={i}
                    row={r}
                    index={i}
                    onAttach={(files) => attachFiles(i, files)}
                    onRemoveAttachment={(ai) => removeAttachment(i, ai)}
                    onRemoveRow={() => removeRow(i)}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── STEP 2: 검토 ── */}
      {step === "validate" && rows.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  미리보기 ({previewI + 1} / {rows.length}) — {kindLabel(rows[previewI]?.kind ?? "instructor")}
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
                <ReviewRowCard
                  key={i}
                  row={r}
                  index={i}
                  selected={i === previewI}
                  onSelect={() => onPreviewIndex(i)}
                  onChangeMotivation={(t) => editMotivation(i, t)}
                  onRegenerate={() => regenerateRow(i)}
                />
              ))}
            </CardContent>
            <Separator />
            <div className="flex items-center justify-between gap-2 p-4">
              <Button variant="outline" size="sm" onClick={() => setStep("input")}>
                이전
              </Button>
              <Button size="sm" disabled={zipPending || rows.length === 0} onClick={doExport}>
                {zipPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    묶는 중 {zipProgress ? `(${zipProgress.current}/${zipProgress.total})` : ""}
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> ZIP 다운로드
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
              {resultFiles.slice(0, 30).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-1 rounded-full bg-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                </li>
              ))}
              {resultFiles.length > 30 && (
                <li className="text-xs text-muted-foreground">
                  ... 외 {resultFiles.length - 30}장
                </li>
              )}
            </ul>
            <Separator />
            <Button
              variant="outline"
              onClick={() => {
                setStep("input");
                setRows([]);
                setResultFiles([]);
                fileMapRef.current = {};
              }}
            >
              처음으로
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── 행별 첨부 카드 ─────────────────────────────────────────────
function RowAttachCard({
  row,
  index,
  onAttach,
  onRemoveAttachment,
  onRemoveRow,
}: {
  row: ResumeRow;
  index: number;
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (ai: number) => void;
  onRemoveRow: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">#{index + 1}</span>
        <span className="text-sm font-medium">{row.basic.name}</span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            row.kind === "coordinator"
              ? "border-blue-300 text-blue-700"
              : "border-purple-300 text-purple-700",
          )}
        >
          {kindLabel(row.kind)}
        </Badge>
        {row.gubun && row.gubun !== "코디네이터" && row.gubun !== "강사" && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {row.gubun}
          </Badge>
        )}
        <span className="truncate text-xs text-muted-foreground">
          {[row.basic.organization, row.basic.position].filter(Boolean).join(" · ")}
        </span>
        <button
          type="button"
          aria-label="행 삭제"
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemoveRow}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {row.attachmentHint && (
        <div className="mb-2 rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
          <span className="font-medium">CSV 자료 힌트:</span> {row.attachmentHint}
        </div>
      )}

      {/* 첨부 영역 */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const fs = Array.from(e.dataTransfer.files ?? []);
          if (fs.length) onAttach(fs);
        }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-muted/10 px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-muted/30",
          drag && "border-primary bg-muted/30",
        )}
      >
        <Paperclip className="size-3.5" />
        자료 파일 드래그-드롭 또는 클릭 (hwp / hwpx / pdf / docx / pptx / xlsx)
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".hwp,.hwpx,.pdf,.docx,.pptx,.xlsx"
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) onAttach(fs);
          e.target.value = "";
        }}
      />

      {row.attachments.length > 0 && (
        <ul className="mt-2 space-y-1">
          {row.attachments.map((a, ai) => (
            <li
              key={ai}
              className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1 text-[11px]"
            >
              <Paperclip className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{a.filename}</span>
              <span className="text-muted-foreground">
                ({(a.size / 1024).toFixed(0)}KB)
              </span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {a.status === "pending" && "대기"}
                {a.status === "extracting" && "추출중..."}
                {a.status === "ok" && "완료"}
                {a.status === "failed" && "실패"}
                {a.status === "skipped" && "건너뜀"}
              </Badge>
              <button
                type="button"
                aria-label="첨부 제거"
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onRemoveAttachment(ai)}
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── 검토 행 카드 ─────────────────────────────────────────────
function ReviewRowCard({
  row,
  index,
  selected,
  onSelect,
  onChangeMotivation,
  onRegenerate,
}: {
  row: ResumeRow;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChangeMotivation: (text: string) => void;
  onRegenerate: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">#{index + 1}</span>
          <span className="truncate text-sm font-medium">{row.basic.name}</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              row.kind === "coordinator"
                ? "border-blue-300 text-blue-700"
                : "border-purple-300 text-purple-700",
            )}
          >
            {kindLabel(row.kind)}
          </Badge>
          {row.hasEmpty ? (
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
          {[row.basic.organization, row.basic.position].filter(Boolean).join(" · ") || "-"}
        </div>
        {row.fieldWarnings.length > 0 && (
          <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
            <AlertTriangle className="size-3 shrink-0 mt-0.5" />
            <span>{row.fieldWarnings.join(" / ")}</span>
          </div>
        )}
      </button>
      <Textarea
        value={row.motivation}
        onChange={(e) => onChangeMotivation(e.target.value)}
        rows={5}
        placeholder={
          row.motivationStatus === "generating"
            ? "생성 중..."
            : "지원 동기 및 포부 (직접 편집 가능)"
        }
        className="mt-2 text-xs"
      />
      {row.motivationError && (
        <div className="mt-1 text-[11px] text-amber-700">
          ⚠ {row.motivationError}
        </div>
      )}
      <div className="mt-2 flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={row.motivationStatus === "generating"}
        >
          {row.motivationStatus === "generating" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          재생성
        </Button>
      </div>
    </div>
  );
}
