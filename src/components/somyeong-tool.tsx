"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Download,
  Pencil,
  Trash2,
} from "lucide-react";
import { SomyeongDocument } from "@/components/pdf/somyeong-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { getPdfPageCount } from "@/lib/pdf/page-count";
import {
  type SomyeongRow,
  parseSomyeongCsv,
  expandFolders,
  recomputeSomyeongWarnings,
} from "@/lib/csv/parseSomyeong";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  getSomyeongSettings,
  getSomyeongLayoutSettings,
  SEOMOK_LIST,
  SUB_SEOMOK_LIST,
  type SomyeongSettings,
  type SomyeongLayoutSettings,
} from "@/lib/firebase/firestore";

type AppStep = "input" | "validate" | "result";

const STEPS: { id: AppStep; label: string; desc: string }[] = [
  { id: "input", label: "자료", desc: "파일" },
  { id: "validate", label: "검토", desc: "내용" },
  { id: "result", label: "끝", desc: "저장" },
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

function somyeongPdfName(folder: string, n: number, subSeomok: string, title: string) {
  const safeFolder = fileSafe(folder || "UNKNOWN");
  // 세세목의 "/"는 파일시스템·ZIP 경로 구분자라 그대로 못 씀 → 시각적으로 동일한 전각 슬래시로 치환
  const safeSub = fileSafe((subSeomok || "UNKNOWN").replace(/\//g, "／"));
  const safeTitle = fileSafe((title || "소명서").replace(/\//g, "／"));
  return `${safeFolder}_${n}. 기타_소명서_${safeSub}_${safeTitle}.pdf`;
}

function zipName() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `소명서_모음_${date}_${hh}시${mm}분.zip`;
}

function SomyeongRowEditDialog({
  row,
  index,
  open,
  onOpenChange,
  onSave,
}: {
  row: SomyeongRow;
  index: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated: SomyeongRow) => void;
}) {
  const [draft, setDraft] = useState({
    folderRaw: row.folderRaw,
    title: row.title,
    detail: row.detail,
    attachments: row.attachments,
    seomok: row.seomok,
    subSeomok: row.subSeomok,
  });

  useEffect(() => {
    if (open) {
      setDraft({
        folderRaw: row.folderRaw,
        title: row.title,
        detail: row.detail,
        attachments: row.attachments,
        seomok: row.seomok,
        subSeomok: row.subSeomok,
      });
    }
  }, [open, row]);

  const folders = expandFolders(draft.folderRaw);

  const handleSave = () => {
    const updated = recomputeSomyeongWarnings({
      ...row,
      folderRaw: draft.folderRaw,
      folders,
      title: draft.title,
      detail: draft.detail,
      attachments: draft.attachments,
      seomok: draft.seomok,
      subSeomok: draft.subSeomok,
    });
    onSave(updated);
    onOpenChange(false);
    toast.success(`#${index + 1}번 행을 수정했어요`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>#{index + 1}번 행 수정</DialogTitle>
          <DialogDescription>
            내용을 직접 수정할 수 있어요. 저장하면 PDF에 바로 반영돼요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium" htmlFor="edit-folderRaw">
              증빙폴더번호
            </Label>
            <Input
              id="edit-folderRaw"
              value={draft.folderRaw}
              placeholder="예: A-1-21 ~ A-1-55 또는 C-9, A-1-1"
              onChange={(e) => setDraft((d) => ({ ...d, folderRaw: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              현재 PDF {folders.length}개 생성: {folders.length === 0 ? "없음" : folders.length > 6 ? `${folders.slice(0, 3).join(", ")} ... ${folders[folders.length - 1]}` : folders.join(", ")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium" htmlFor="edit-title">건명</Label>
            <Input
              id="edit-title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium" htmlFor="edit-seomok">세목</Label>
              <Select
                value={draft.seomok || undefined}
                onValueChange={(v) => { if (v) setDraft((d) => ({ ...d, seomok: v })); }}
              >
                <SelectTrigger id="edit-seomok">
                  <SelectValue placeholder="세목 선택" />
                </SelectTrigger>
                <SelectContent>
                  {SEOMOK_LIST.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium" htmlFor="edit-subSeomok">세세목</Label>
              <Select
                value={draft.subSeomok || undefined}
                onValueChange={(v) => { if (v) setDraft((d) => ({ ...d, subSeomok: v })); }}
              >
                <SelectTrigger id="edit-subSeomok">
                  <SelectValue placeholder="세세목 선택" />
                </SelectTrigger>
                <SelectContent>
                  {SUB_SEOMOK_LIST.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            파일명: <span className="font-mono">{`{폴더}_0. 기타_소명서_${draft.subSeomok || "?"}_${draft.title || "?"}.pdf`}</span>
          </p>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium" htmlFor="edit-detail">상세내용</Label>
            <textarea
              id="edit-detail"
              className="flex min-h-32 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10"
              value={draft.detail}
              onChange={(e) => setDraft((d) => ({ ...d, detail: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium" htmlFor="edit-attachments">첨부서류</Label>
            <textarea
              id="edit-attachments"
              className="flex min-h-20 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10"
              value={draft.attachments}
              placeholder="1. 영수증 1부&#10;2. 거래명세서 1부"
              onChange={(e) => setDraft((d) => ({ ...d, attachments: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SomyeongRowCard({
  r,
  index,
  selected,
  onSelect,
  onEdit,
  onRemove,
}: {
  r: SomyeongRow;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "relative w-full max-w-full rounded-lg border p-3 text-left transition",
        selected
          ? "border-foreground/20 bg-muted shadow-sm"
          : "border-border bg-card hover:bg-muted/50"
      )}
    >
      <button
        type="button"
        className="absolute inset-0 touch-manipulation outline-none"
        onClick={onSelect}
        aria-label={`${index + 1}번 행 선택`}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            <span className="text-muted-foreground">#{index + 1}</span>{" "}
            {r.title || <span className="text-muted-foreground">(건명 없음)</span>}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {r.seomok && (
              <Badge variant="outline" className="text-xs">
                {r.seomok}
              </Badge>
            )}
            {r.subSeomok && (
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                {r.subSeomok}
              </Badge>
            )}
            {r.folderRaw && (
              <Badge variant="secondary" className="font-mono text-xs">
                {r.folderRaw}
              </Badge>
            )}
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-1.5 shrink-0">
          {r.folders.length > 1 && (
            <Badge variant="secondary" className="text-[10px] sm:text-xs">
              ×{r.folders.length}
            </Badge>
          )}
          {r.hasEmpty ? (
            <Badge variant="destructive" className="text-[10px] sm:text-xs">
              누락
            </Badge>
          ) : (
            <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] sm:text-xs">
              양호
            </Badge>
          )}
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/10"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label={`${index + 1}번 행 수정`}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-destructive focus-visible:ring-2 focus-visible:ring-foreground/10"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={`${index + 1}번 행 삭제`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {r.hasEmpty && r.fieldWarnings.length > 0 && (
        <ul className="relative z-10 mt-2 list-inside list-disc text-[10px] text-amber-700 dark:text-amber-400 sm:text-xs">
          {r.fieldWarnings.map((w) => (
            <li key={w} className="line-clamp-2">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepIndicator({
  steps,
  current,
  onBack,
}: {
  steps: typeof STEPS;
  current: AppStep;
  onBack: (id: AppStep) => void;
}) {
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-1">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
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

export function SomyeongTool() {
  const [step, setStep] = useState<AppStep>("input");
  const [rows, setRows] = useState<SomyeongRow[]>([]);
  const [settings, setSettings] = useState<SomyeongSettings | null>(null);
  const [layout, setLayout] = useState<SomyeongLayoutSettings | null>(null);
  const [parsePending, setParsePending] = useState(false);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [genPending, setGenPending] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultFiles, setResultFiles] = useState<{ name: string; pageCount: number }[]>([]);
  const [previewI, setPreviewI] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const previewStart = useRef(false);

  const okCount = useMemo(() => rows.filter((r) => !r.hasEmpty).length, [rows]);
  const warnCount = useMemo(() => rows.filter((r) => r.hasEmpty).length, [rows]);

  const updateRow = useCallback((index: number, updated: SomyeongRow) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // 미리보기 인덱스 보정
      setPreviewI((p) => {
        if (next.length === 0) return 0;
        if (p >= next.length) return next.length - 1;
        return p;
      });
      return next;
    });
    toast.success(`#${index + 1}번 행을 삭제했어요`);
  }, []);

  useEffect(() => {
    getSomyeongSettings().then(setSettings).catch(console.error);
    getSomyeongLayoutSettings().then(setLayout).catch(console.error);
  }, []);

  const handleCsvFile = useCallback(async (file: File) => {
    setParsePending(true);
    try {
      const text = await readFileText(file);
      const parsed = parseSomyeongCsv(text);
      if (!parsed.length) {
        toast.error("소명서 데이터를 찾지 못했어요. 컬럼명을 확인해주세요.");
        return;
      }
      setRows(parsed);
      setStep("validate");
      toast.success(`${parsed.length}행을 읽었어요.`);
    } catch (e) {
      toast.error("파일을 읽는 데 실패했어요.");
      console.error(e);
    } finally {
      setParsePending(false);
    }
  }, []);

  const makeBlobFor = useCallback(
    async (row: SomyeongRow) => {
      registerPdfFonts();
      return pdf(
        <SomyeongDocument row={row} settings={settings!} layout={layout ?? undefined} />
      ).toBlob();
    },
    [settings]
  );

  const doGenerate = useCallback(async () => {
    if (!settings) return;
    setGenPending(true);
    setResultFiles([]);
    setGenProgress({ current: 0, total: rows.length });

    try {
      const z = new JSZip();
      const files: { name: string; pageCount: number }[] = [];

      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i + 1, total: rows.length });
        const row = rows[i];
        const n = settings.seomokN[row.seomok] ?? 0;
        const blob = await makeBlobFor(row);
        const pageCount = await getPdfPageCount(blob);

        for (const folder of row.folders) {
          const name = somyeongPdfName(folder, n, row.subSeomok, row.title);
          z.file(name, blob);
          files.push({ name, pageCount });
        }
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
      toast.success(`PDF ${files.length}개가 담긴 ZIP을 다운로드합니다.`);
    } catch (e) {
      toast.error("PDF 생성에 실패했어요.");
      console.error(e);
    } finally {
      setGenPending(false);
      setGenProgress(null);
    }
  }, [rows, settings, makeBlobFor]);

  const totalPdfCount = rows.reduce((acc, r) => acc + r.folders.length, 0);

  const onPreviewIndex = useCallback(
    async (i: number) => {
      if (i < 0 || i >= rows.length || !settings) return;
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
        toast.error("이 행의 PDF 미리보기를 만들지 못했어요.");
      } finally {
        setPreviewPending(false);
      }
    },
    [rows, settings, makeBlobFor]
  );

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
    if (step !== "validate" || !rows.length || !settings || previewStart.current) return;
    previewStart.current = true;
    void onPreviewIndex(0);
  }, [step, rows.length, settings, onPreviewIndex]);

  // 컴포넌트 unmount 시 미리보기 URL 정리
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className={cn(
      "mx-auto space-y-6 p-4 transition-[max-width] md:p-8",
      step === "validate" ? "max-w-7xl" : "max-w-3xl"
    )}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">소명서</h1>
          <p className="text-sm text-muted-foreground">
            CSV에서 소명서 PDF를 자동 생성합니다.
          </p>
        </div>
        <StepIndicator
          steps={STEPS}
          current={step}
          onBack={(id) => setStep(id)}
        />
      </div>

      {/* ── STEP 1: 파일 업로드 ── */}
      {step === "input" && (
        <Card className="mx-auto max-w-4xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg sm:text-xl">1. 자료</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              CSV 파일을 올리고 어드민 설정을 확인하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!settings && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
                어드민에서 소명서 설정(소명자 정보, 서명 등)을 먼저 저장해주세요.
              </div>
            )}

            {/* CSV 업로드 */}
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">CSV 파일</h2>
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setCsvDragOver(true); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setCsvDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setCsvDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCsvDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && f.name.toLowerCase().endsWith(".csv")) handleCsvFile(f);
                }}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-10 transition-colors hover:border-primary hover:bg-muted/40",
                  csvDragOver && "border-primary bg-muted/40"
                )}
              >
                {parsePending ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  <FileUp className="size-8 text-muted-foreground" />
                )}
                <p className="text-sm font-medium">
                  {parsePending ? "파일 읽는 중..." : "CSV 파일을 클릭 또는 드래그하여 업로드"}
                </p>
                <p className="text-xs text-muted-foreground">
                  증빙폴더번호, 건명, 상세내용, 첨부서류, 세목 컬럼이 필요해요.
                </p>
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvFile(f);
                  e.target.value = "";
                }}
              />
            </section>

            {/* 어드민 설정 미리보기 */}
            {settings && (
              <>
                <Separator />
                <section className="space-y-4">
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-medium text-foreground">어드민 설정 미리보기</h2>
                    <p className="text-xs text-muted-foreground">
                      PDF에 들어갈 소명자 정보와 서명이에요. 변경은 어드민 &gt; 소명서 설정에서 가능해요.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
                    {/* 서명 이미지 */}
                    <div className="rounded-xl border bg-card p-4">
                      <p className="mb-3 text-xs font-semibold text-muted-foreground">
                        작성자 서명
                      </p>
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="flex size-32 items-center justify-center overflow-hidden rounded-lg border"
                          style={{
                            backgroundImage: settings.signatureImageUrl
                              ? "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)"
                              : undefined,
                            backgroundSize: "12px 12px",
                            backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
                            backgroundColor: settings.signatureImageUrl ? undefined : "hsl(var(--muted))",
                          }}
                        >
                          {settings.signatureImageUrl ? (
                            <img
                              src={settings.signatureImageUrl}
                              alt="서명"
                              className="size-full object-contain"
                            />
                          ) : (
                            <ImageIcon className="size-6 text-muted-foreground/40" />
                          )}
                        </div>
                        <span className="text-[11px] leading-tight text-muted-foreground">
                          {settings.writerName || "작성자 미지정"}
                        </span>
                      </div>
                    </div>

                    {/* 소명자 정보 */}
                    <div className="rounded-xl border bg-card p-4">
                      <p className="mb-3 text-xs font-semibold text-muted-foreground">
                        소명자 정보
                      </p>
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                        {[
                          ["성명", settings.name],
                          ["소속/직위", settings.orgPosition],
                          ["연락처", settings.phone],
                          ["생년월일", settings.birthdate],
                          ["사업장 주소", settings.address],
                          ["날짜", settings.date],
                          ["작성자", settings.writerName],
                          ["수신처", settings.recipient],
                        ].map(([label, value]) => (
                          <div key={label} className="flex gap-2 leading-relaxed">
                            <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                            <dd className={cn("min-w-0 flex-1 break-words", !value && "text-muted-foreground/60")}>
                              {value || "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>

                  {/* 세목별 N값 */}
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-3 text-xs font-semibold text-muted-foreground">
                      세목별 번호 (파일명: 폴더명_<span className="font-mono font-semibold">번호</span>.소명서_건명.pdf)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SEOMOK_LIST.map((s) => (
                        <div
                          key={s}
                          className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs"
                        >
                          <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary font-mono text-[10px] font-bold text-primary-foreground tabular-nums">
                            {settings.seomokN[s] ?? 0}
                          </span>
                          <span className="font-medium">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: 검토 ── */}
      {step === "validate" && (
        <div className="space-y-3 sm:space-y-4">
          {/* 헤더 */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold sm:text-xl">
              {rows.length > 0 ? `${rows.length}건 읽었어요` : "2. 검토"}
            </h2>
            {rows.length > 0 && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Check className="size-3" />
                  양호 {okCount}
                </span>
                {warnCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="size-3" />
                    누락 {warnCount}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  PDF {totalPdfCount}개 생성 예정
                </span>
              </>
            )}
          </div>

          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              읽힌 게 없어요. CSV 컬럼명을 확인해 주세요.
            </p>
          )}

          {rows.length > 0 && (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
              {/* 좌측: PDF 미리보기 */}
              <div className="w-full shrink-0 space-y-3 lg:w-[480px] xl:w-[560px] 2xl:w-[640px]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    PDF 미리보기
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      행 {previewI + 1} / {rows.length}
                      {previewPending ? " · 만드는 중" : ""}
                    </span>
                  </p>
                  <div className="flex items-center gap-1" role="group" aria-label="페이지네이터">
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className="h-7 px-2"
                      disabled={previewI <= 0}
                      onClick={() => void onPreviewIndex(previewI - 1)}
                      aria-label="이전 행"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="min-w-12 text-center text-xs font-medium tabular-nums">
                      {previewI + 1} / {rows.length}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className="h-7 px-2"
                      disabled={previewI >= rows.length - 1}
                      onClick={() => void onPreviewIndex(previewI + 1)}
                      aria-label="다음 행"
                    >
                      <ChevronLeft className="size-4 rotate-180" />
                    </Button>
                  </div>
                </div>
                <div className="relative w-full">
                  {previewPending && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-dashed bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-6 animate-spin" />
                        <span>PDF 만드는 중</span>
                      </div>
                    </div>
                  )}
                  {previewUrl ? (
                    <iframe
                      className="aspect-[1/1.414] w-full rounded-xl border border-border/80"
                      title={`행 ${previewI + 1} 소명서 미리보기`}
                      src={previewUrl}
                    />
                  ) : (
                    <div className="flex aspect-[1/1.414] w-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                      미리보기를 불러옵니다…
                    </div>
                  )}
                </div>
              </div>

              {/* 우측: 행 리스트 */}
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-sm font-medium text-foreground">행 목록</p>
                <div className="max-h-[min(80vh,56rem)] overflow-y-auto rounded-xl border border-border/80 p-2 lg:max-h-[calc(100vh-14rem)]">
                  <div className="grid gap-2" role="list" aria-label="행 목록">
                    {rows.map((row, i) => (
                      <div key={i} role="listitem">
                        <SomyeongRowCard
                          r={row}
                          index={i}
                          selected={previewI === i}
                          onSelect={() => void onPreviewIndex(i)}
                          onEdit={() => setEditingRowIdx(i)}
                          onRemove={() => removeRow(i)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 하단 액션 */}
          <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep("input")}
              type="button"
            >
              <ChevronLeft className="size-4" />
              이전
            </Button>
            <Button
              size="lg"
              className="w-full gap-2 sm:w-auto sm:min-w-48"
              type="button"
              disabled={genPending || !rows.length || !settings}
              onClick={doGenerate}
            >
              {genPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {genProgress
                    ? `${genProgress.current}/${genProgress.total}`
                    : "준비 중…"}
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  PDF {totalPdfCount}개 ZIP으로 받기
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 행 편집 다이얼로그 */}
      {editingRowIdx !== null && rows[editingRowIdx] && (
        <SomyeongRowEditDialog
          row={rows[editingRowIdx]}
          index={editingRowIdx}
          open={editingRowIdx !== null}
          onOpenChange={(v) => { if (!v) setEditingRowIdx(null); }}
          onSave={(updated) => {
            updateRow(editingRowIdx, updated);
            // 편집된 행이 현재 미리보기 행이면 즉시 갱신
            if (previewI === editingRowIdx) {
              void onPreviewIndex(editingRowIdx);
            }
          }}
        />
      )}

      {/* ── STEP 3: 결과 ── */}
      {step === "result" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green-500" />
                <CardTitle className="text-base">ZIP 다운로드 완료</CardTitle>
              </div>
              <CardDescription>
                총 {resultFiles.length}개의 PDF가 ZIP으로 저장되었어요.
                {(() => {
                  const over = resultFiles.filter((f) => f.pageCount >= 2).length;
                  return over > 0 ? ` · 2장 이상 ${over}건` : "";
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="max-h-96 space-y-1 overflow-y-auto">
                {resultFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50">
                    <CheckCircle2 className="size-3 shrink-0 text-green-500" />
                    <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
                    {f.pageCount >= 2 && (
                      <Badge variant="destructive" className="shrink-0 text-[10px]">
                        {f.pageCount}장
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setStep("input");
                setRows([]);
                setResultFiles([]);
              }}
            >
              처음으로
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
