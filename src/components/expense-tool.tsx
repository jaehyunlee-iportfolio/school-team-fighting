"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { ExpenseDocument } from "@/components/pdf/expense-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { getPdfPageCount } from "@/lib/pdf/page-count";
import {
  listExpenseTabs,
  parseExpenseXlsx,
  readFileBuffer,
  recomputeRowAutoFields,
  type XlsxTabInfo,
} from "@/lib/xlsx/parseExpense";
import { detectExpenseGroupFromFilename } from "@/lib/expense/group";
import {
  type ExpenseRow,
  type ExpenseGroupCode,
  recomputeWarnings,
} from "@/lib/expense/types";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getExpenseSettings,
  getExpenseLayoutSettings,
  type ExpenseSettings,
  type ExpenseLayoutSettings,
} from "@/lib/firebase/firestore";

type AppStep = "input" | "validate" | "result";

const STEPS: { id: AppStep; label: string }[] = [
  { id: "input", label: "자료" },
  { id: "validate", label: "검토" },
  { id: "result", label: "끝" },
];

function fileSafe(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
}

function pdfNameFor(row: ExpenseRow): string {
  const ev = fileSafe(row.evidenceNo || "UNKNOWN");
  const serial = fileSafe(row.serial || "NO-SERIAL");
  return `${ev}_1. 내부결의문서_지출결의서_${serial}.pdf`;
}

function zipName() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `지출결의서_모음_${date}_${hh}시${mm}분.zip`;
}

function StepIndicator({ current, onBack }: { current: AppStep; onBack: (s: AppStep) => void }) {
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

const GROUP_OPTIONS: { id: ExpenseGroupCode | "auto"; label: string }[] = [
  { id: "auto", label: "자동 (파일명에서 인식)" },
  { id: "ipf", label: "iPF / (주)아이포트폴리오" },
  { id: "dimi", label: "디미교연 / (사)디지털미디어교육콘텐츠 교사연구협회" },
];

export function ExpenseTool() {
  const [step, setStep] = useState<AppStep>("input");
  const [groupChoice, setGroupChoice] = useState<ExpenseGroupCode | "auto">("auto");
  const [resolvedGroup, setResolvedGroup] = useState<ExpenseGroupCode | null>(null);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [parsePending, setParsePending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // xlsx 업로드 후 탭 목록 (사용자 선택 단계)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingBuffer, setPendingBuffer] = useState<ArrayBuffer | null>(null);
  const [pendingGroup, setPendingGroup] = useState<ExpenseGroupCode | null>(null);
  const [availableTabs, setAvailableTabs] = useState<XlsxTabInfo[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());
  const [previewI, setPreviewI] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [genPending, setGenPending] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultFiles, setResultFiles] = useState<{ name: string; pageCount: number }[]>([]);
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [pageInfo, setPageInfo] = useState<Record<number, { pageCount: number }>>({});
  const [pageInfoProgress, setPageInfoProgress] = useState<{ done: number; total: number } | null>(null);
  const [skippedTabs, setSkippedTabs] = useState<{ name: string; reason: string }[]>([]);
  const [settings, setSettings] = useState<ExpenseSettings | null>(null);
  const [layout, setLayout] = useState<ExpenseLayoutSettings | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewStart = useRef(false);
  const measureToken = useRef(0);

  useEffect(() => {
    getExpenseSettings().then(setSettings).catch(console.error);
    getExpenseLayoutSettings().then(setLayout).catch(console.error);
  }, []);

  const okCount = useMemo(() => rows.filter((r) => !r.hasEmpty).length, [rows]);
  const warnCount = rows.length - okCount;

  const groupSettings = useMemo(() => {
    if (!settings || !resolvedGroup) return null;
    return settings.groups[resolvedGroup];
  }, [settings, resolvedGroup]);

  /** 1단계: 파일 업로드 시 탭 목록만 추출. 사용자가 탭을 선택한 뒤 proceedWithSelectedTabs 호출. */
  const handleFile = useCallback(
    async (file: File) => {
      if (!settings) {
        toast.error("어드민 설정을 불러오는 중이에요. 잠시 뒤 다시 시도해 주세요.");
        return;
      }
      setParsePending(true);
      try {
        // 그룹 결정
        let group: ExpenseGroupCode | null = null;
        if (groupChoice === "auto") {
          group = detectExpenseGroupFromFilename(file.name);
          if (!group) {
            toast.error("파일명에서 조직을 인식하지 못했어요. 수동으로 선택해 주세요.");
            return;
          }
        } else {
          group = groupChoice;
        }

        const buf = await readFileBuffer(file);
        const tabs = await listExpenseTabs(buf);
        const processable = tabs.filter((t) => t.processable);

        if (processable.length === 0) {
          toast.error("처리 가능한 탭이 없어요. xlsx 시트 이름이 'C/D-1/D-2/D-3/D-4/E-1/E-3/E-4/E-5/F-1' 형식인지 확인해 주세요.");
          setAvailableTabs(tabs);
          setSelectedTabs(new Set());
          setPendingFile(file);
          setPendingBuffer(buf);
          setPendingGroup(group);
          return;
        }

        // 기본: 처리 가능한 탭 모두 선택
        setAvailableTabs(tabs);
        setSelectedTabs(new Set(processable.map((t) => t.name)));
        setPendingFile(file);
        setPendingBuffer(buf);
        setPendingGroup(group);
        toast.success(`${processable.length}개 탭 인식 — 선택 후 진행해 주세요.`);
      } catch (e) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "xlsx 파일 읽기 실패");
      } finally {
        setParsePending(false);
      }
    },
    [groupChoice, settings]
  );

  /** 2단계: 사용자 선택 탭으로 실제 파싱 → 검토 단계 진입 */
  const proceedWithSelectedTabs = useCallback(async () => {
    if (!settings || !pendingBuffer || !pendingGroup) return;
    if (selectedTabs.size === 0) {
      toast.error("처리할 탭을 1개 이상 선택해 주세요.");
      return;
    }
    setParsePending(true);
    try {
      const gs = settings.groups[pendingGroup];
      const result = await parseExpenseXlsx(pendingBuffer, gs.orgCode, gs.serialAlpha, selectedTabs);
      if (!result.rows.length) {
        toast.error("선택한 탭에서 유효한 지출 행을 찾지 못했어요.");
        setSkippedTabs(result.skippedTabs);
        return;
      }
      setRows(result.rows);
      setResolvedGroup(pendingGroup);
      setSkippedTabs(result.skippedTabs);
      setStep("validate");
      toast.success(`${result.rows.length}건을 읽었어요.`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "xlsx 파싱 실패");
    } finally {
      setParsePending(false);
    }
  }, [settings, pendingBuffer, pendingGroup, selectedTabs]);

  const resetUpload = useCallback(() => {
    setPendingFile(null);
    setPendingBuffer(null);
    setPendingGroup(null);
    setAvailableTabs([]);
    setSelectedTabs(new Set());
  }, []);

  const makeBlobFor = useCallback(
    async (row: ExpenseRow) => {
      if (!groupSettings || !layout) throw new Error("설정 미로드");
      registerPdfFonts();
      return pdf(
        <ExpenseDocument row={row} group={groupSettings} layout={layout} />
      ).toBlob();
    },
    [groupSettings, layout]
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
    [rows, makeBlobFor]
  );

  const updateRow = useCallback((index: number, updated: ExpenseRow) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

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

  const doGenerate = useCallback(async () => {
    if (!groupSettings || !layout) {
      toast.error("어드민 설정을 먼저 저장해 주세요.");
      return;
    }
    setGenPending(true);
    setResultFiles([]);
    setGenProgress({ current: 0, total: rows.length });
    try {
      const z = new JSZip();
      const files: { name: string; pageCount: number }[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i + 1, total: rows.length });
        const blob = await makeBlobFor(rows[i]);
        let name = pdfNameFor(rows[i]);
        if (seen.has(name)) {
          const ext = ".pdf";
          const base = name.slice(0, -ext.length);
          let n = 2;
          while (seen.has(`${base}_${n}${ext}`)) n++;
          name = `${base}_${n}${ext}`;
        }
        seen.add(name);
        z.file(name, blob);
        const pageCount = await getPdfPageCount(blob);
        files.push({ name, pageCount });
      }
      const zipBlob = await z.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = href;
      a.download = zipName();
      a.click();
      URL.revokeObjectURL(href);
      setResultFiles(files);
      setStep("result");
      toast.success(`PDF ${files.length}개가 담긴 ZIP 다운로드 시작`);
    } catch (e) {
      console.error(e);
      toast.error("PDF 생성 실패");
    } finally {
      setGenPending(false);
      setGenProgress(null);
    }
  }, [rows, groupSettings, layout, makeBlobFor]);

  // 검토 진입 시 첫 행 미리보기
  useEffect(() => {
    if (step !== "validate" || !rows.length || !groupSettings || !layout || previewStart.current) return;
    previewStart.current = true;
    void onPreviewIndex(0);
  }, [step, rows.length, groupSettings, layout, onPreviewIndex]);

  // 검토 진입 시 페이지 수 측정 (배경)
  useEffect(() => {
    if (step !== "validate" || !rows.length || !groupSettings || !layout) return;
    const token = ++measureToken.current;
    setPageInfo({});
    setPageInfoProgress({ done: 0, total: rows.length });
    let cancelled = false;
    (async () => {
      for (let i = 0; i < rows.length; i++) {
        if (cancelled || measureToken.current !== token) return;
        try {
          const blob = await makeBlobFor(rows[i]);
          const pageCount = await getPdfPageCount(blob);
          if (cancelled || measureToken.current !== token) return;
          setPageInfo((prev) => ({ ...prev, [i]: { pageCount } }));
          setPageInfoProgress({ done: i + 1, total: rows.length });
        } catch (e) {
          console.error("page count measure failed", i, e);
        }
      }
      if (!cancelled && measureToken.current === token) {
        setPageInfoProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, rows, groupSettings, layout, makeBlobFor]);

  // input 진입 시 정리
  useEffect(() => {
    if (step === "input") {
      previewStart.current = false;
      measureToken.current++;
      setPageInfo({});
      setPageInfoProgress(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
  }, [step, previewUrl]);

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
          <h1 className="text-xl font-bold tracking-tight">지출결의서</h1>
          <p className="text-sm text-muted-foreground">
            세부비목별집행내역서(xlsx)에서 지출결의서 PDF를 자동 생성합니다.
          </p>
        </div>
        <StepIndicator current={step} onBack={(id) => setStep(id)} />
      </div>

      {/* STEP 1: 자료 */}
      {step === "input" && (
        <Card className="mx-auto max-w-4xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg sm:text-xl">1. 자료</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              xlsx 파일을 올리고 조직을 선택하세요. 어드민에서 그룹별 작성자/결재자/이미지를 미리 등록해야 해요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!settings && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
                어드민 설정을 불러오는 중…
              </div>
            )}

            {/* 조직 선택 */}
            <section className="space-y-2">
              <Label className="text-sm font-medium">조직</Label>
              <RadioGroup
                value={groupChoice}
                onValueChange={(v) => setGroupChoice(v as ExpenseGroupCode | "auto")}
                className="grid gap-2 sm:grid-cols-3"
              >
                {GROUP_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-xs",
                      groupChoice === opt.id ? "border-foreground/40 bg-muted/40" : "border-border hover:bg-muted/30"
                    )}
                  >
                    <RadioGroupItem value={opt.id} />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </section>

            {/* 파일 업로드 */}
            <section className="space-y-3">
              <h2 className="text-sm font-medium">xlsx 파일</h2>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && f.name.toLowerCase().endsWith(".xlsx")) handleFile(f);
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
                  {parsePending ? "파일 읽는 중..." : "xlsx 파일을 클릭 또는 드래그하여 업로드"}
                </p>
                <p className="text-xs text-muted-foreground">
                  세부비목별집행내역서 — C/D-1/D-2/D-3/D-4/E-1/E-3/E-4/E-5/F-1 탭 자동 인식
                </p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </section>

            {/* 탭 선택 (xlsx 업로드 후) */}
            {pendingFile && availableTabs.length > 0 && (
              <section className="space-y-3">
                <Separator />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-medium">처리할 탭 선택</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {pendingFile.name} · 조직 = {pendingGroup === "ipf" ? "iPF" : "디미교연"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedTabs(new Set(availableTabs.filter((t) => t.processable).map((t) => t.name)))}
                    >
                      전체 선택
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedTabs(new Set())}
                    >
                      전체 해제
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={resetUpload}
                    >
                      취소
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1.5 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                  {availableTabs.map((tab) => {
                    const checked = selectedTabs.has(tab.name);
                    return (
                      <label
                        key={tab.name}
                        className={cn(
                          "flex items-start gap-2 rounded-md p-2 text-xs transition-colors",
                          tab.processable ? "cursor-pointer hover:bg-muted/40" : "cursor-not-allowed opacity-50",
                          checked && "bg-muted/50"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          disabled={!tab.processable}
                          checked={checked}
                          onChange={(e) => {
                            setSelectedTabs((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(tab.name);
                              else next.delete(tab.name);
                              return next;
                            });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{tab.name}</p>
                          {tab.processable ? (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {tab.semok} · {tab.sesemok} · 약 {tab.estimatedRows}행
                            </p>
                          ) : (
                            <p className="truncate text-[10px] text-amber-700 dark:text-amber-400">
                              {tab.reason}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    선택: {selectedTabs.size} / 처리 가능: {availableTabs.filter((t) => t.processable).length}
                  </p>
                  <Button
                    onClick={proceedWithSelectedTabs}
                    disabled={parsePending || selectedTabs.size === 0}
                    size="sm"
                  >
                    {parsePending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        처리 중…
                      </>
                    ) : (
                      <>선택한 탭으로 진행</>
                    )}
                  </Button>
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 2: 검토 */}
      {step === "validate" && rows.length > 0 && groupSettings && layout && (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* 좌: 미리보기 */}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium">PDF 미리보기</h2>
              <span className="text-xs text-muted-foreground">행 {previewI + 1} / {rows.length}</span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="outline" disabled={previewI === 0 || previewPending}
                  onClick={() => onPreviewIndex(previewI - 1)}>이전</Button>
                <Button size="sm" variant="outline" disabled={previewI === rows.length - 1 || previewPending}
                  onClick={() => onPreviewIndex(previewI + 1)}>다음</Button>
              </div>
            </div>
            <div className="relative">
              {previewPending && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-dashed bg-background/80 backdrop-blur-sm">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {previewUrl ? (
                <iframe className="aspect-[1/1.414] w-full rounded-xl border" title="미리보기" src={previewUrl} />
              ) : (
                <div className="flex aspect-[1/1.414] w-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  불러오는 중…
                </div>
              )}
            </div>
          </div>

          {/* 우: 행 목록 */}
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">행 목록 ({rows.length})</h2>
                <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700 dark:text-emerald-400">
                  <Check className="mr-0.5 size-3" /> 양호 {okCount}
                </Badge>
                {warnCount > 0 && (
                  <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mr-0.5 size-3" /> 누락 {warnCount}
                  </Badge>
                )}
              </div>
              {pageInfoProgress && (
                <p className="text-[11px] text-muted-foreground">
                  페이지 검사 {pageInfoProgress.done}/{pageInfoProgress.total}
                </p>
              )}
            </div>
            <div className="max-h-[min(80vh,56rem)] overflow-y-auto rounded-xl border p-2 lg:max-h-[calc(100vh-14rem)]">
              <div className="grid gap-2">
                {rows.map((row, i) => (
                  <ExpenseRowCard
                    key={i}
                    row={row}
                    index={i}
                    selected={previewI === i}
                    pageInfo={pageInfo[i]}
                    onSelect={() => void onPreviewIndex(i)}
                    onEdit={() => setEditingRowIdx(i)}
                    onRemove={() => removeRow(i)}
                  />
                ))}
              </div>
            </div>

            {/* 액션 */}
            <div className="mt-4 flex items-center justify-between gap-2">
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

            {skippedTabs.length > 0 && (
              <details className="mt-3 text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">스킵된 탭 {skippedTabs.length}개 보기</summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {skippedTabs.map((s, i) => (
                    <li key={i}>· {s.name} — {s.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: 결과 */}
      {step === "result" && (
        <Card className="mx-auto max-w-3xl">
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-500" />
              <h2 className="text-base font-semibold">ZIP 다운로드 완료</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              총 {resultFiles.length}개의 PDF가 ZIP으로 저장됐어요.
              {(() => {
                const over = resultFiles.filter((f) => f.pageCount >= 2).length;
                return over > 0 ? ` · 2장 이상 ${over}건` : "";
              })()}
            </p>
            <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto">
              {resultFiles.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50">
                  <CheckCircle2 className="size-3 shrink-0 text-green-500" />
                  <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
                  {f.pageCount >= 2 && (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">{f.pageCount}장</Badge>
                  )}
                </li>
              ))}
            </ul>
            <Separator className="my-4" />
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => {
                setStep("input");
                setRows([]);
                setResultFiles([]);
                setResolvedGroup(null);
                resetUpload();
              }}>
                처음으로
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 편집 다이얼로그 */}
      {editingRowIdx !== null && rows[editingRowIdx] && groupSettings && (
        <ExpenseRowEditDialog
          row={rows[editingRowIdx]}
          index={editingRowIdx}
          orgCode={groupSettings.orgCode}
          serialAlpha={groupSettings.serialAlpha}
          open
          onOpenChange={(v) => { if (!v) setEditingRowIdx(null); }}
          onSave={(updated) => {
            updateRow(editingRowIdx, updated);
            // 미리보기 재로드
            if (previewI === editingRowIdx) void onPreviewIndex(editingRowIdx);
            // 페이지 수 다시 측정 (해당 행만)
            measureToken.current++;
          }}
        />
      )}
    </div>
  );
}

function ExpenseRowCard({
  row,
  index,
  selected,
  pageInfo,
  onSelect,
  onEdit,
  onRemove,
}: {
  row: ExpenseRow;
  index: number;
  selected: boolean;
  pageInfo?: { pageCount: number };
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "relative w-full rounded-lg border p-3 text-left transition",
        selected ? "border-foreground/20 bg-muted shadow-sm" : "border-border bg-card hover:bg-muted/50"
      )}
    >
      <button type="button" className="absolute inset-0 outline-none" onClick={onSelect} aria-label={`${index + 1}번 행 선택`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            <span className="text-muted-foreground">#{index + 1}</span>{" "}
            <span className="font-mono text-xs text-muted-foreground">{row.evidenceNo || "(증빙번호 없음)"}</span>{" "}
            · {row.vendor || "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.sourceTab} · {row.executionDate || "(집행일자 없음)"} · {row.total.toLocaleString("ko-KR")}원
          </p>
          {row.fieldWarnings.length > 0 && (
            <ul className="relative z-10 mt-2 list-inside list-disc text-[10px] text-amber-700 dark:text-amber-400">
              {row.fieldWarnings.slice(0, 3).map((w, i) => (
                <li key={i} className="line-clamp-1">{w}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="relative z-10 flex items-center gap-1.5 shrink-0">
          {pageInfo && pageInfo.pageCount >= 2 && (
            <Badge variant="destructive" className="text-[10px]">{pageInfo.pageCount}장</Badge>
          )}
          {row.hasEmpty ? (
            <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">누락</Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700">양호</Badge>
          )}
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label={`${index + 1}번 행 수정`}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={`${index + 1}번 행 삭제`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpenseRowEditDialog({
  row,
  index,
  orgCode,
  serialAlpha,
  open,
  onOpenChange,
  onSave,
}: {
  row: ExpenseRow;
  index: number;
  orgCode: string;
  serialAlpha: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated: ExpenseRow) => void;
}) {
  const [draft, setDraft] = useState<ExpenseRow>(row);

  useEffect(() => {
    if (open) setDraft(row);
  }, [open, row]);

  const handleSave = () => {
    // 집행일자가 변경됐으면 자동 필드 재계산 (일련번호는 유지)
    const recomputed = recomputeRowAutoFields(draft, orgCode, serialAlpha, true);
    onSave(recomputed);
    onOpenChange(false);
    toast.success(`#${index + 1}번 행을 수정했어요`);
  };

  const set = <K extends keyof ExpenseRow>(k: K, v: ExpenseRow[K]) => {
    setDraft((d) => recomputeWarnings({ ...d, [k]: v }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>#{index + 1}번 행 수정</DialogTitle>
          <DialogDescription>
            {draft.sourceTab} · 일련번호 {draft.serial}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="증빙번호 (PK)">
              <Input value={draft.evidenceNo} onChange={(e) => set("evidenceNo", e.target.value)} />
            </Field>
            <Field label="거래처">
              <Input value={draft.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </Field>
            <Field label="사용일자">
              <Input value={draft.useDate} onChange={(e) => set("useDate", e.target.value)} />
            </Field>
            <Field label="집행일자">
              <Input value={draft.executionDate} onChange={(e) => set("executionDate", e.target.value)} />
            </Field>
            <Field label="공급가액">
              <Input
                type="number"
                value={draft.supply}
                onChange={(e) => set("supply", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="세액 (빈칸이면 - 표시)">
              <Input
                type="number"
                value={draft.vat ?? ""}
                onChange={(e) => set("vat", e.target.value === "" ? null : Number(e.target.value) || 0)}
                placeholder="-"
              />
            </Field>
            <Field label="합계금액 (지출금액)">
              <Input
                type="number"
                value={draft.total}
                onChange={(e) => set("total", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="지급방법">
              <Input value={draft.payment} onChange={(e) => set("payment", e.target.value)} />
            </Field>
          </div>
          <Field label="지출목적 (PDF &quot;2. 지출 목적&quot;에 들어감)">
            <textarea
              value={draft.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <div className="space-y-1.5">
            <Label className="text-xs">사용내역(수령인)</Label>
            <textarea
              value={draft.useDetail}
              onChange={(e) => set("useDetail", e.target.value)}
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.includeUseDetail}
                  onChange={(e) => set("includeUseDetail", e.target.checked)}
                />
                <span>PDF 지출 목적에 함께 표시</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.includeUseDetailInNote}
                  onChange={(e) => set("includeUseDetailInNote", e.target.checked)}
                />
                <span>비고에 함께 표시</span>
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground">
              두 옵션 모두 체크 해제 시 PDF에 표시 안 됨. 둘 다 체크하면 양쪽에 출력.
            </p>
          </div>
          <Field label="비고 (PDF 지출결의 내용 표 비고 행에 들어감)">
            <textarea
              value={draft.note}
              onChange={(e) => set("note", e.target.value)}
              className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>

          {draft.fieldWarnings.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30">
              <p className="mb-1 font-medium">검증 경고:</p>
              <ul className="list-inside list-disc space-y-0.5">
                {draft.fieldWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
