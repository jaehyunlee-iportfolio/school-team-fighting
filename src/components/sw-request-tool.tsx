"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { SwRequestDocument } from "@/components/pdf/sw-request-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { parseSwRequestCsv } from "@/lib/csv/parseSwRequest";
import { parseSchoolApplicantsCsv } from "@/lib/csv/parseSchoolApplicants";
import { parseSwConfirmedCsv } from "@/lib/csv/parseSwConfirmed";
import {
  parseQuoteWorkbookFile,
  parseQuoteDate,
} from "@/lib/xlsx/parseQuoteWorkbook";
import {
  enrichSwRequestRows,
  makeSwRequestFilename,
} from "@/lib/sw/merge";
import type {
  SwLineItem,
  SwRequestRow,
} from "@/lib/sw/types";
import {
  getSwRequestSettings,
  getSwRequestLayoutSettings,
  DEFAULT_SW_REQUEST_SETTINGS,
  DEFAULT_SW_REQUEST_LAYOUT,
  type SwRequestSettings,
  type SwRequestLayoutSettings,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type AppStep = "input" | "validate" | "result";
type InputMode = "triple" | "confirmed";

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

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function zipName() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `소프트웨어_요청서_모음_${date}_${hh}시${mm}분.zip`;
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
                done &&
                  "cursor-pointer text-muted-foreground hover:text-foreground",
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

/* ============================================================
   행 편집 다이얼로그
   ============================================================ */

function SwRequestRowEditDialog({
  row,
  index,
  open,
  onOpenChange,
  onSave,
}: {
  row: SwRequestRow;
  index: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated: SwRequestRow) => void;
}) {
  const [draft, setDraft] = useState<SwRequestRow>(row);

  useEffect(() => {
    if (open) setDraft(row);
  }, [open, row]);

  const setField = <K extends keyof SwRequestRow>(k: K, v: SwRequestRow[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setItem = (i: number, patch: Partial<SwLineItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)),
    }));

  const addItem = () =>
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        { user: "", product: "", quantity: "", period: "", warnings: [] },
      ],
    }));

  const removeItem = (i: number) =>
    setDraft((d) => ({
      ...d,
      items: d.items.filter((_, j) => j !== i),
    }));

  const handleSave = () => {
    // 날짜 재계산
    const dateRaw =
      draft.quoteY && draft.quoteM && draft.quoteD
        ? `${draft.quoteY} 년 ${draft.quoteM.padStart(2, "0")} 월 ${draft.quoteD.padStart(2, "0")} 일`
        : draft.quoteDateRaw;
    const ymd = parseQuoteDate(dateRaw);

    const updated: SwRequestRow = {
      ...draft,
      quoteDateRaw: dateRaw,
      quoteY: ymd.y || draft.quoteY,
      quoteM: ymd.m || draft.quoteM,
      quoteD: ymd.d || draft.quoteD,
      quoteYymmdd: ymd.yymmdd,
    };
    // hasEmpty 재계산 (간단)
    updated.hasEmpty =
      !updated.schoolName ||
      !updated.applicantName ||
      updated.items.length === 0 ||
      updated.items.some((x) => !x.product || !x.quantity);
    // 사용자가 학교명을 직접 채웠으면 fieldWarnings 중 매칭 실패 경고는 제거
    if (updated.schoolName) {
      updated.fieldWarnings = updated.fieldWarnings.filter(
        (w) => !w.startsWith("학교명 매칭 실패") && !w.startsWith("학교명 누락"),
      );
    }
    onSave(updated);
    onOpenChange(false);
    toast.success(`#${index + 1}번 행을 수정했어요`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>#{index + 1}번 행 수정 — {draft.schoolName || "(학교 미정)"}</DialogTitle>
          <DialogDescription>
            신청자 정보와 요청 사항을 직접 편집할 수 있어요. 저장하면 미리보기에 즉시 반영돼요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 신청자 정보 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">신청자 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">신청자</Label>
                <Input
                  value={draft.applicantName}
                  onChange={(e) => setField("applicantName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">신청 학교</Label>
                <Input
                  value={draft.schoolName}
                  onChange={(e) => setField("schoolName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">연락처(휴대폰)</Label>
                <Input
                  value={draft.applicantPhone}
                  onChange={(e) => setField("applicantPhone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">신청 대상</Label>
                <Input
                  value={draft.applicantTarget}
                  onChange={(e) => setField("applicantTarget", e.target.value)}
                  placeholder="교원"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">증빙번호</Label>
                <Input
                  value={draft.evidenceNo}
                  onChange={(e) => setField("evidenceNo", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="space-y-1.5">
                  <Label className="text-xs">연도</Label>
                  <Input
                    value={draft.quoteY}
                    onChange={(e) => setField("quoteY", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">월</Label>
                  <Input
                    value={draft.quoteM}
                    onChange={(e) => setField("quoteM", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">일</Label>
                  <Input
                    value={draft.quoteD}
                    onChange={(e) => setField("quoteD", e.target.value)}
                  />
                </div>
              </div>
            </div>
            {draft.quoteDateOptions && draft.quoteDateOptions.length > 1 && (
              <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/50 p-2.5">
                <Label className="text-[11px] text-amber-800">
                  같은 그룹에서 신청일자가 {draft.quoteDateOptions.length}개 발견됐어요. 하나를 고르면 위 날짜 칸이 자동 채워져요.
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {draft.quoteDateOptions.map((opt) => {
                    const ymd = parseQuoteDate(opt);
                    const selected =
                      ymd.y === draft.quoteY && ymd.m === draft.quoteM && ymd.d === draft.quoteD;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          const v = parseQuoteDate(opt);
                          setDraft((d) => ({
                            ...d,
                            quoteDateRaw: opt,
                            quoteY: v.y || d.quoteY,
                            quoteM: v.m || d.quoteM,
                            quoteD: v.d || d.quoteD,
                            quoteYymmdd: v.yymmdd,
                          }));
                        }}
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary hover:bg-muted/40",
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* 요청 사항 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">요청 사항 ({draft.items.length})</h3>
              <Button size="sm" variant="outline" onClick={addItem} className="gap-1">
                <Plus className="size-3.5" /> 행 추가
              </Button>
            </div>
            <div className="space-y-2">
              {draft.items.map((it, i) => (
                <div key={i} className="rounded-lg border bg-muted/20 p-3">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">사용자</Label>
                      <Input
                        value={it.user}
                        onChange={(e) => setItem(i, { user: e.target.value })}
                        className="h-8"
                      />
                    </div>
                    <div className="col-span-5 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">품목명 및 규격</Label>
                      <Input
                        value={it.product}
                        onChange={(e) => setItem(i, { product: e.target.value })}
                        className="h-8"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">수량</Label>
                      <Input
                        value={it.quantity}
                        onChange={(e) => setItem(i, { quantity: e.target.value })}
                        className="h-8"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">사용기간</Label>
                      <Input
                        value={it.period}
                        onChange={(e) => setItem(i, { period: e.target.value })}
                        className="h-8"
                      />
                    </div>
                  </div>
                  {it.warnings.length > 0 && (
                    <div className="mt-2 flex items-start gap-1 text-[11px] text-amber-700">
                      <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                      <span>{it.warnings.join(" / ")}</span>
                    </div>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-destructive"
                      onClick={() => removeItem(i)}
                    >
                      <Trash2 className="size-3" /> 삭제
                    </Button>
                  </div>
                </div>
              ))}
              {draft.items.length === 0 && (
                <p className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                  요청 항목이 없어요. "행 추가"로 만들어 주세요.
                </p>
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   파일 업로드 카드 (작은 dropzone)
   ============================================================ */

function UploadSlot({
  label,
  description,
  accept,
  filename,
  onPick,
  busy,
  icon,
}: {
  label: string;
  description: string;
  accept: string;
  filename: string | null;
  onPick: (f: File) => void;
  busy: boolean;
  icon: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onPick(f);
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg border-2 border-dashed p-4 transition-colors",
          drag ? "border-primary bg-muted/40" : "border-border bg-muted/10 hover:border-primary hover:bg-muted/30",
          filename && "border-emerald-300 bg-emerald-50/40",
        )}
      >
        <div className="flex w-full items-center gap-2">
          {busy ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : filename ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : (
            icon
          )}
          <span className="truncate text-sm font-medium">
            {filename ?? description}
          </span>
        </div>
        {filename && (
          <span className="text-[11px] text-muted-foreground">클릭하면 다른 파일로 교체</span>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ============================================================
   메인
   ============================================================ */

export function SwRequestTool() {
  const [step, setStep] = useState<AppStep>("input");
  const [inputMode, setInputMode] = useState<InputMode>("triple");
  const [d3File, setD3File] = useState<File | null>(null);
  const [applicantsFile, setApplicantsFile] = useState<File | null>(null);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [confirmedFile, setConfirmedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);

  const [rows, setRows] = useState<SwRequestRow[]>([]);
  const [settings, setSettings] = useState<SwRequestSettings>(DEFAULT_SW_REQUEST_SETTINGS);
  const [layout, setLayout] = useState<SwRequestLayoutSettings>(DEFAULT_SW_REQUEST_LAYOUT);

  const [previewI, setPreviewI] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);

  const [genPending, setGenPending] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultFiles, setResultFiles] = useState<{ name: string }[]>([]);

  const [editIndex, setEditIndex] = useState<number | null>(null);

  // 어드민 설정 로드
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, l] = await Promise.all([
          getSwRequestSettings(),
          getSwRequestLayoutSettings(),
        ]);
        if (!active) return;
        setSettings(s);
        setLayout(l);
      } catch (e) {
        console.warn("settings load failed", e);
      }
    })();
    return () => { active = false; };
  }, []);

  const okCount = useMemo(
    () => rows.filter((r) => !r.hasEmpty && r.fieldWarnings.length === 0).length,
    [rows],
  );
  const warnCount = rows.length - okCount;

  const tripleReady = !!(d3File && applicantsFile && xlsxFile);
  const confirmedReady = !!confirmedFile;

  const doParse = useCallback(async () => {
    if (!d3File || !applicantsFile || !xlsxFile) return;
    setParsing(true);
    try {
      const [d3Text, applText] = await Promise.all([
        readFileText(d3File),
        readFileText(applicantsFile),
      ]);
      const d3 = parseSwRequestCsv(d3Text);
      if (d3.rows.length === 0) {
        toast.error("D-3 CSV 에서 행을 찾지 못했어요.");
        return;
      }
      const appl = parseSchoolApplicantsCsv(applText);
      const quotes = await parseQuoteWorkbookFile(xlsxFile);

      const enriched = enrichSwRequestRows(d3.rows, appl, quotes, settings);
      setRows(enriched);
      setStep("validate");
      toast.success(
        `${enriched.length}건을 읽었어요 (D-3 ${d3.totalSourceRows}행 → 학교 ${enriched.length}건).`,
      );
    } catch (e) {
      console.error(e);
      toast.error("파일 파싱에 실패했어요.");
    } finally {
      setParsing(false);
    }
  }, [d3File, applicantsFile, xlsxFile, settings]);

  const doParseConfirmed = useCallback(async () => {
    if (!confirmedFile) return;
    setParsing(true);
    try {
      const text = await readFileText(confirmedFile);
      const result = parseSwConfirmedCsv(text);
      if (result.rows.length === 0) {
        toast.error("CSV 에서 행을 찾지 못했어요. 헤더(학교/증빙번호)를 확인해 주세요.");
        return;
      }
      // applicantTarget 기본값 적용 (어드민 설정의 defaultTarget)
      const withTarget = result.rows.map((r) => ({
        ...r,
        applicantTarget: r.applicantTarget || settings.defaultTarget,
      }));
      setRows(withTarget);
      setStep("validate");
      toast.success(
        `${withTarget.length}건을 읽었어요 (${result.totalSourceRows}행 → ${withTarget.length}그룹).`,
      );
    } catch (e) {
      console.error(e);
      toast.error("CSV 파싱에 실패했어요.");
    } finally {
      setParsing(false);
    }
  }, [confirmedFile, settings]);

  // 모든 입력 채워지면 자동 파싱
  useEffect(() => {
    if (step !== "input") return;
    if (inputMode === "triple" && tripleReady) {
      void doParse();
    } else if (inputMode === "confirmed" && confirmedReady) {
      void doParseConfirmed();
    }
  }, [inputMode, tripleReady, confirmedReady, step, doParse, doParseConfirmed]);

  const makeBlobFor = useCallback(
    async (row: SwRequestRow) => {
      registerPdfFonts();
      return pdf(
        <SwRequestDocument row={row} settings={settings} layout={layout} />,
      ).toBlob();
    },
    [settings, layout],
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
        toast.error("미리보기 생성 실패");
      } finally {
        setPreviewPending(false);
      }
    },
    [rows, makeBlobFor],
  );

  const removeRow = (index: number) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setPreviewI((p) => Math.min(p, Math.max(0, next.length - 1)));
      return next;
    });
    toast.success(`#${index + 1}번 행을 삭제했어요`);
  };

  const onSaveEdit = (updated: SwRequestRow) => {
    if (editIndex === null) return;
    setRows((prev) => prev.map((r, i) => (i === editIndex ? updated : r)));
    if (editIndex === previewI) {
      void onPreviewIndex(editIndex);
    }
  };

  const doGenerate = useCallback(async () => {
    setGenPending(true);
    setResultFiles([]);
    setGenProgress({ current: 0, total: rows.length });
    try {
      const z = new JSZip();
      const seen = new Set<string>();
      const files: { name: string }[] = [];
      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i + 1, total: rows.length });
        const blob = await makeBlobFor(rows[i]);
        let name = makeSwRequestFilename(rows[i]);
        if (seen.has(name)) {
          const base = name.replace(/\.pdf$/, "");
          let n = 2;
          while (seen.has(`${base}_${n}.pdf`)) n++;
          name = `${base}_${n}.pdf`;
        }
        seen.add(name);
        z.file(name, blob);
        files.push({ name });
      }
      const zipBlob = await z.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, zipName());
      setResultFiles(files);
      setStep("result");
      toast.success(`${files.length}장 PDF가 담긴 ZIP을 받았어요.`);
    } catch (e) {
      console.error(e);
      toast.error("ZIP 생성 실패");
    } finally {
      setGenPending(false);
      setGenProgress(null);
    }
  }, [rows, makeBlobFor]);

  // validate 진입 시 첫 행 미리보기
  const previewStarted = useRef(false);
  useEffect(() => {
    if (step !== "validate" || !rows.length || previewStarted.current) return;
    previewStarted.current = true;
    void onPreviewIndex(0);
  }, [step, rows.length, onPreviewIndex]);

  useEffect(() => {
    if (step === "input") {
      previewStarted.current = false;
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
        step === "validate" ? "max-w-7xl" : "max-w-3xl",
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">소프트웨어 활용 희망 요청서</h1>
          <p className="text-sm text-muted-foreground">
            D-3 비고 + 학교 신청자 관리 + 견적서 xlsx → 학교별 PDF 일괄 생성
          </p>
        </div>
        <StepIndicator current={step} onBack={(id) => setStep(id)} />
      </div>

      {/* ── STEP 1: 자료 ── */}
      {step === "input" && (
        <Card className="mx-auto max-w-3xl">
          <CardHeader className="space-y-3 pb-4">
            <CardTitle className="text-lg">1. 자료</CardTitle>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setInputMode("triple")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  inputMode === "triple"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                3개 파일 (D-3 + 학교 + 견적서)
              </button>
              <button
                type="button"
                onClick={() => setInputMode("confirmed")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  inputMode === "confirmed"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                통합 CSV 1개
              </button>
            </div>
            <CardDescription className="text-xs">
              {inputMode === "triple"
                ? "세 파일을 모두 올리면 자동으로 다음 단계로 넘어가요."
                : "통합 CSV 파일 1개를 올리면 자동으로 다음 단계로 넘어가요."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {inputMode === "triple" ? (
              <>
                <UploadSlot
                  label="① D-3 소프트웨어활용비 CSV"
                  description="아★…D-3.소프트웨어활용비.csv 파일을 올려주세요"
                  accept=".csv"
                  filename={d3File?.name ?? null}
                  onPick={(f) => setD3File(f)}
                  busy={parsing}
                  icon={<FileUp className="size-5 text-muted-foreground" />}
                />
                <UploadSlot
                  label="② 학교 신청자 관리 CSV"
                  description="학교별 담당자/연락처 매핑 CSV"
                  accept=".csv"
                  filename={applicantsFile?.name ?? null}
                  onPick={(f) => setApplicantsFile(f)}
                  busy={parsing}
                  icon={<FileUp className="size-5 text-muted-foreground" />}
                />
                <UploadSlot
                  label="③ 학교별 에듀테크 견적서 xlsx"
                  description="시트별로 학교 견적이 들어있는 xlsx"
                  accept=".xlsx"
                  filename={xlsxFile?.name ?? null}
                  onPick={(f) => setXlsxFile(f)}
                  busy={parsing}
                  icon={<FileSpreadsheet className="size-5 text-muted-foreground" />}
                />
              </>
            ) : (
              <>
                <UploadSlot
                  label="통합 CSV (1개 파일)"
                  description="신청일자 / 학교 / 신청자 / 신청자 연락처 / 이름 / 신청 품목 / 사용기간 / 수량 / 증빙번호 / 지급방법"
                  accept=".csv"
                  filename={confirmedFile?.name ?? null}
                  onPick={(f) => setConfirmedFile(f)}
                  busy={parsing}
                  icon={<FileUp className="size-5 text-muted-foreground" />}
                />
                <p className="text-[11px] text-muted-foreground">
                  같은 (증빙번호 + 학교) 행이 한 PDF로 묶여요. 같은 그룹에서 신청자/연락처/신청일자가
                  여러 값이면 검토 단계에서 경고 + 편집으로 보정할 수 있어요.
                </p>
              </>
            )}
            {parsing && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 파일을 분석하는 중...
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: 검토 ── */}
      {step === "validate" && rows.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditIndex(previewI)}
                    className="gap-1"
                  >
                    <Pencil className="size-3.5" /> 편집
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
                  <iframe src={previewUrl} className="size-full" title="요청서 미리보기" />
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
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                    양호 {okCount}
                  </Badge>
                  {warnCount > 0 && (
                    <Badge variant="outline" className="border-amber-300 text-amber-700">
                      검토 {warnCount}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="max-h-[60vh] space-y-2 overflow-y-auto">
              {rows.map((r, i) => {
                const hasWarn = r.hasEmpty || r.fieldWarnings.length > 0;
                return (
                  <button
                    key={i}
                    onClick={() => onPreviewIndex(i)}
                    className={cn(
                      "flex w-full items-start justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40",
                      i === previewI && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          #{i + 1}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {r.evidenceNo || "—"}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {r.schoolName || r.schoolRaw || "(학교 미정)"}
                        </span>
                        {hasWarn ? (
                          <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
                            검토
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700">
                            양호
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[r.applicantName, r.applicantPhone, `${r.items.length}건`]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {r.fieldWarnings.length > 0 && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                          <span>{r.fieldWarnings.join(" / ")}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        aria-label="편집"
                        onClick={(e) => { e.stopPropagation(); setEditIndex(i); }}
                        className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="삭제"
                        onClick={(e) => { e.stopPropagation(); removeRow(i); }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </button>
                );
              })}
            </CardContent>
            <Separator />
            <div className="flex items-center justify-between gap-2 p-4">
              <Button variant="outline" size="sm" onClick={() => setStep("input")}>
                이전
              </Button>
              <Button
                size="sm"
                disabled={genPending || rows.length === 0}
                onClick={doGenerate}
              >
                {genPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> 생성 중{" "}
                    {genProgress ? `(${genProgress.current}/${genProgress.total})` : ""}
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> ZIP으로 받기
                  </>
                )}
              </Button>
            </div>
          </Card>

          {editIndex !== null && rows[editIndex] && (
            <SwRequestRowEditDialog
              row={rows[editIndex]}
              index={editIndex}
              open={editIndex !== null}
              onOpenChange={(v) => { if (!v) setEditIndex(null); }}
              onSave={onSaveEdit}
            />
          )}
        </div>
      )}

      {/* ── STEP 3: 끝 ── */}
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
            <ul className="space-y-1 text-xs">
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
                setD3File(null);
                setApplicantsFile(null);
                setXlsxFile(null);
                setConfirmedFile(null);
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
