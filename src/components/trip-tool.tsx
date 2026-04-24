"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  FileUp,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { BusinessTripDocument } from "@/components/pdf/business-trip-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import {
  type TripRow,
  parseD4Csv,
  recomputeRowWithOverride,
} from "@/lib/csv/parseD4";
import { type ApprovalGroup, getApprovalHeaderLabels, detectGroupFromFilename } from "@/lib/approval/labels";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getApprovalSettings,
  type ApprovalSettings,
} from "@/lib/firebase/firestore";

type Mode = "preview" | "direct";
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

function readDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

function fileSafe(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
}

const ALL_APPROVAL: { id: ApprovalGroup | "auto"; label: string }[] = [
  { id: "auto", label: "자동(집행기관명)" },
  { id: "ipf", label: "iPF / 아이포트폴리오" },
  { id: "dimi", label: "디미" },
];

function mapAllRows(list: TripRow[], m: ApprovalGroup | "auto"): TripRow[] {
  return list.map((r) => recomputeRowWithOverride(r, m));
}

type FileFieldProps = {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  accept: string;
  onFile: (f: File | null) => void | Promise<void>;
};

function FileField({ id, label, hint, file, accept, onFile }: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clear = () => {
    void onFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <Label className="text-sm font-medium text-foreground" htmlFor={id}>
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-input bg-card px-4 text-sm transition hover:bg-muted/50"
      >
        <FileUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {file ? (
          <span className="min-w-0 flex-1 truncate text-left font-medium">{file.name}</span>
        ) : (
          <span className="flex-1 text-left text-muted-foreground">파일을 선택하세요</span>
        )}
        {file && (
          <span
            role="button"
            tabIndex={0}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="파일 제거"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clear(); } }}
          >
            <X className="size-3.5" />
          </span>
        )}
      </button>
    </div>
  );
}

function StepIndicator({
  current,
  onGoTo,
}: {
  current: AppStep;
  onGoTo?: (step: AppStep) => void;
}) {
  const i = STEPS.findIndex((s) => s.id === current);
  return (
    <div
      className="mb-4 grid w-full min-w-0 max-w-4xl grid-cols-3 gap-0 rounded-lg bg-muted p-1 sm:mb-6"
      role="status"
      aria-label="진행 단계"
    >
      {STEPS.map((s, n) => {
        const done = n < i;
        const active = n === i;
        const goBack = onGoTo && n < i;
        const segment = (
          <div
            className={cn(
              "flex min-h-11 w-full touch-manipulation flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-2 text-center sm:min-h-9 sm:gap-0 sm:px-2.5",
              active && "bg-card text-foreground shadow-sm",
              !active && done && "text-muted-foreground",
              !active && !done && "text-muted-foreground/70"
            )}
            aria-current={active ? "step" : undefined}
          >
            <span className="inline-flex items-center justify-center gap-1 text-xs font-medium sm:text-sm">
              {done && !active ? <Check className="size-3.5 sm:size-4" aria-hidden /> : null}
              {s.label}
            </span>
            <span className="text-[9px] leading-tight text-muted-foreground sm:text-[10px]">
              {s.desc}
            </span>
          </div>
        );
        return (
          <div key={s.id} className="min-w-0">
            {goBack ? (
              <button
                type="button"
                className="w-full"
                onClick={() => onGoTo(s.id)}
                aria-label={`${s.label} 단계로 돌아가기`}
              >
                {segment}
              </button>
            ) : (
              <div className="w-full">{segment}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MobileRowCard({
  r,
  index,
  approvalMode,
  selected,
  onSelect,
}: {
  r: TripRow;
  index: number;
  approvalMode: ApprovalGroup | "auto";
  selected: boolean;
  onSelect: () => void;
}) {
  const lab = getApprovalHeaderLabels(r.orgName, approvalMode);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full max-w-full rounded-lg border p-3 text-left transition",
        "min-h-14 touch-manipulation",
        selected
          ? "border-foreground/20 bg-muted shadow-sm"
          : "border-border bg-card hover:bg-muted/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <span className="text-muted-foreground">#{index + 1}</span>{" "}
            {r.writerName || "—"}{" "}
            {r.drafter3 && (
              <span className="text-muted-foreground">({r.drafter3})</span>
            )}
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {r.orgName || "집행기관 없음"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {lab.approver1} · {lab.approver2}
          </p>
        </div>
        <div className="shrink-0">
          {r.hasEmpty ? (
            <Badge variant="destructive" className="text-[10px] sm:text-xs">
              누락
            </Badge>
          ) : (
            <Badge
              className="border-0 bg-success-tint text-success-tint-foreground text-[10px] sm:text-xs"
            >
              양호
            </Badge>
          )}
        </div>
      </div>
      {r.hasEmpty && r.fieldWarnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-[10px] text-warning-tint-foreground sm:text-xs">
          {r.fieldWarnings.slice(0, 2).map((w) => (
            <li key={w} className="line-clamp-1">
              {w}
            </li>
          ))}
          {r.fieldWarnings.length > 2 && <li>…</li>}
        </ul>
      )}
    </button>
  );
}

export function TripTool() {
  const [step, setStep] = useState<AppStep>("input");
  const [mode, setMode] = useState<Mode>("preview");
  const [csv, setCsv] = useState<File | null>(null);
  const [a1, setA1] = useState<File | null>(null);
  const [a2, setA2] = useState<File | null>(null);
  const [a1Data, setA1Data] = useState<string>("");
  const [a2Data, setA2Data] = useState<string>("");
  const [rows, setRows] = useState<TripRow[]>([]);
  const [approvalMode, setApprovalMode] =
    useState<ApprovalGroup | "auto">("auto");
  const [headerIdx, setHeaderIdx] = useState(-1);
  const [showEmptyWarn, setShowEmptyWarn] = useState(false);
  const [parseKeys, setParseKeys] = useState<string[]>([]);
  const [previewI, setPreviewI] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [genPending, setGenPending] = useState(false);
  const [parsePending, setParsePending] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [listDone, setListDone] = useState<{ n: string; i: number }[]>([]);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [adminSettings, setAdminSettings] = useState<ApprovalSettings | null>(null);
  const [adminSigLoaded, setAdminSigLoaded] = useState(false);

  useEffect(() => {
    getApprovalSettings()
      .then((s) => {
        setAdminSettings(s);
        if (s.approver1.imageUrl && !a1Data) setA1Data(s.approver1.imageUrl);
        if (s.approver2.imageUrl && !a2Data) setA2Data(s.approver2.imageUrl);
        setAdminSigLoaded(true);
      })
      .catch(() => setAdminSigLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reapplyApproval = (m: ApprovalGroup | "auto") => {
    setApprovalMode(m);
    setRows((cur) => (cur.length ? mapAllRows(cur, m) : cur));
  };

  const onParse = async () => {
    if (!csv) {
      toast.error("CSV를 선택하세요");
      return;
    }
    setParsePending(true);
    try {
      const t = await readFileText(csv);
      const p = parseD4Csv(t);
      setHeaderIdx(p.headerLineIndex);
      setParseKeys(p.keys);

      const fileGroup = detectGroupFromFilename(csv.name);
      const effectiveMode = fileGroup ?? approvalMode;
      if (fileGroup && approvalMode === "auto") {
        setApprovalMode(fileGroup);
        toast.success(`파일명에서 "${fileGroup === "ipf" ? "아이포트폴리오" : "디미"}" 그룹을 감지했어요`);
      }
      const m = mapAllRows(p.rows, effectiveMode);
      setRows(m);
      if (a1) {
        const d = await readDataUrl(a1);
        setA1Data(d);
      } else {
        setA1Data("");
      }
      if (a2) {
        const d = await readDataUrl(a2);
        setA2Data(d);
      } else {
        setA2Data("");
      }
      setStep("validate");
      if (!p.rows.length)
        toast.error("읽힌 데이터가 없어요. D-4 출장비 시트가 맞는지, CSV로 올바르게 저장했는지 확인해 주세요.");
    } catch (e) {
      console.error(e);
      toast.error("CSV 파일을 읽지 못했어요. 파일이 UTF-8로 저장되었는지 확인해 주세요.");
    } finally {
      setParsePending(false);
    }
  };

  const hasAnyEmpty = useMemo(() => rows.some((r) => r.hasEmpty), [rows]);
  const okCount = useMemo(() => rows.filter((r) => !r.hasEmpty).length, [rows]);
  const warnCount = useMemo(() => rows.filter((r) => r.hasEmpty).length, [rows]);
  const askStartGenerate = () => {
    if (hasAnyEmpty) {
      setShowEmptyWarn(true);
    } else {
      void doGenerate();
    }
  };

  const makeBlobFor = useCallback(
    async (r: TripRow) => {
      registerPdfFonts();
      const d = recomputeRowWithOverride(r, approvalMode);
      return pdf(
        <BusinessTripDocument
          row={d}
          approver1Src={a1Data || undefined}
          approver2Src={a2Data || undefined}
        />
      ).toBlob();
    },
    [a1Data, a2Data, approvalMode]
  );

  const doGenerate = async () => {
    setShowEmptyWarn(false);
    if (!rows.length) {
      toast.error("데이터가 없어요.");
      return;
    }
    setGenPending(true);
    setListDone([]);
    setGenProgress({ current: 0, total: rows.length });
    try {
      if (mode === "direct") {
        const z = new JSZip();
        for (let i = 0; i < rows.length; i++) {
          setGenProgress({ current: i + 1, total: rows.length });
          const r = rows[i];
          const b = await makeBlobFor(r);
          const n = `출장신청서_r${i + 1}_${fileSafe(r.writerName || "이름")}.pdf`;
          z.file(n, b);
        }
        const zipB = await z.generateAsync({ type: "blob" });
        const href = URL.createObjectURL(zipB);
        const a = document.createElement("a");
        a.href = href;
        a.download = `출장신청서_${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(href);
        toast.success(
          `PDF ${rows.length}장이 담긴 ZIP 파일을 다운로드합니다.`
        );
        setListDone(
          rows.map((r, i) => ({ n: r.writerName, i: i + 1 }))
        );
        setStep("result");
        return;
      }
      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i + 1, total: rows.length });
        const b = await makeBlobFor(rows[i]);
        if (i === 0) {
          setPreviewI(0);
        }
        const n = `출장신청서_r${i + 1}_${fileSafe(rows[i].writerName || "x")}.pdf`;
        if (i === 0) {
          setPreviewUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(b);
          });
        }
        const href = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = href;
        a.download = n;
        a.click();
        URL.revokeObjectURL(href);
        setListDone((d) => [...d, { n, i: i + 1 }]);
      }
      toast.success(
        `PDF ${rows.length}장을 각각 다운로드했어요.`
      );
      setStep("result");
    } catch (e) {
      console.error(e);
      toast.error("PDF 생성에 실패했어요.");
    } finally {
      setGenPending(false);
      setGenProgress(null);
    }
  };

  const previewStart = useRef(false);

  const onPreviewIndex = useCallback(
    async (i: number) => {
      if (i < 0 || i >= rows.length) return;
      setPreviewI(i);
      setPreviewPending(true);
      try {
        registerPdfFonts();
        const b = await makeBlobFor(rows[i]);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
      } catch (e) {
        console.error(e);
        toast.error("이 행의 PDF를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요");
      } finally {
        setPreviewPending(false);
      }
    },
    [rows, makeBlobFor]
  );

  useEffect(() => {
    if (step === "input") {
      previewStart.current = false;
    }
  }, [step]);

  useEffect(() => {
    if (
      mode !== "preview" ||
      step !== "validate" ||
      !rows.length ||
      previewStart.current
    ) {
      return;
    }
    previewStart.current = true;
    void onPreviewIndex(0);
  }, [mode, step, rows, onPreviewIndex, rows.length]);

  const goToStep = useCallback(
    (target: AppStep) => {
      const cur = STEPS.findIndex((x) => x.id === step);
      const idx = STEPS.findIndex((x) => x.id === target);
      if (idx === -1 || cur === -1 || idx >= cur) return;
      setStep(target);
      if (target === "input") {
        setPreviewUrl(null);
      }
    },
    [step]
  );

  return (
    <div
      className="mx-auto min-h-0 w-full min-w-0 max-w-[min(100%,1920px)] overflow-x-hidden px-3 py-6 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-5 sm:py-8 lg:px-8 xl:px-10"
      data-step={step}
    >
      <div className="mx-auto w-full min-w-0 max-w-4xl space-y-4 sm:space-y-6">
        <header className="mb-0 border-b border-border pb-5 sm:pb-6">
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            출장신청서
          </h1>
          <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
            CSV는 필수, 결재 서명 이미지 2장은 선택이에요.
          </p>
        </header>

        <StepIndicator current={step} onGoTo={goToStep} />

      {step === "input" && (
        <Card>
          <CardHeader className="space-y-1 pb-4 sm:pb-4">
            <CardTitle className="text-lg sm:text-xl">1. 자료</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              파일을 올리고 생성 모드를 선택하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 sm:space-y-7">
            <section className="space-y-3" aria-labelledby="mode-heading">
              <h2 id="mode-heading" className="text-sm font-medium text-foreground">
                생성 모드
              </h2>
              <RadioGroup
                className="grid w-full grid-cols-1 items-stretch gap-3 sm:grid-cols-2"
                value={mode}
                onValueChange={(v) => setMode(v as Mode)}
              >
                {(
                  [
                    {
                      v: "preview" as const,
                      id: "p",
                      title: "미리보기(추천)",
                      sub: "2단계에서 PDF로 확인 후 다운로드",
                    },
                    {
                      v: "direct" as const,
                      id: "d",
                      title: "바로 생성",
                      sub: "확인 후 ZIP 한 개로 전부 받기",
                    },
                  ] as const
                ).map(({ v, id, title, sub }) => (
                  <label
                    key={v}
                    htmlFor={id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-all",
                      mode === v
                        ? "border-foreground bg-muted/60"
                        : "border-transparent bg-card hover:bg-muted/30"
                    )}
                  >
                    <div className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
                      <RadioGroupItem value={v} id={id} />
                    </div>
                    {mode === v
                      ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-foreground" />
                      : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/40" />
                    }
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold">{title}</span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sub}
                      </p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </section>
            <Separator className="my-1" />
            <div className="space-y-6">
              <h2 className="text-sm font-medium text-foreground">파일</h2>
              <FileField
                id="f-csv"
                label="D-4 출장비 · CSV(필수)"
                hint="엑셀/시트에서 .csv로 저장(UTF-8 권장)"
                file={csv}
                accept=".csv,text/csv"
                onFile={setCsv}
              />
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4 sm:gap-y-6">
                <div className="space-y-1">
                  <FileField
                    id="f-a1"
                    label="결재 1·서명(이미지)"
                    hint="팀장(또는 사무국장) / PNG·JPG"
                    file={a1}
                    accept="image/*"
                    onFile={async (f) => {
                      setA1(f);
                      if (f) setA1Data(await readDataUrl(f));
                      else setA1Data(adminSettings?.approver1.imageUrl ?? "");
                    }}
                  />
                  {!a1 && adminSigLoaded && adminSettings?.approver1.imageUrl && (
                    <p className="text-xs text-primary">어드민에서 설정된 서명 사용 중</p>
                  )}
                </div>
                <div className="space-y-1">
                  <FileField
                    id="f-a2"
                    label="결재 2·서명(이미지)"
                    hint="본부장(또는 대표) / PNG·JPG"
                    file={a2}
                    accept="image/*"
                    onFile={async (f) => {
                      setA2(f);
                      if (f) setA2Data(await readDataUrl(f));
                      else setA2Data(adminSettings?.approver2.imageUrl ?? "");
                    }}
                  />
                  {!a2 && adminSigLoaded && adminSettings?.approver2.imageUrl && (
                    <p className="text-xs text-primary">어드민에서 설정된 서명 사용 중</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2 sm:max-w-2xl">
              <div className="space-y-1">
                <Label
                  className="text-sm font-medium text-foreground"
                  htmlFor="approval-override"
                >
                  결재자 직위 설정
                </Label>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  CSV의 집행기관명을 보고 자동으로 맞춰요. 안 맞으면 직접 고르세요.
                </p>
              </div>
              <Select
                value={approvalMode}
                onValueChange={(v) =>
                  reapplyApproval(v as ApprovalGroup | "auto")
                }
              >
                <SelectTrigger
                  id="approval-override"
                  className="h-11 w-full touch-manipulation text-base sm:h-10 sm:text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[min(100vw-2rem,20rem)]">
                  {ALL_APPROVAL.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="min-h-11 sm:min-h-0">
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto sm:min-w-48"
                onClick={async () => {
                  if (!csv) {
                    toast.error("CSV를 선택하세요");
                    return;
                  }
                  await onParse();
                }}
                disabled={parsePending}
              >
                {parsePending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    읽는 중…
                  </>
                ) : (
                  "2단계로(내용 확인) →"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "validate" && (
        <div className="space-y-3 sm:space-y-4">
          <Card>
            <CardHeader className="pb-3 sm:pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg sm:text-xl">
                  {rows.length > 0 ? `${rows.length}건 읽었어요` : "2. 검토"}
                </CardTitle>
                {rows.length > 0 && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                      <Check className="size-3" aria-hidden />
                      {okCount}
                    </span>
                    {warnCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <AlertTriangle className="size-3" aria-hidden />
                        {warnCount}
                      </span>
                    )}
                  </>
                )}
              </div>
              {rows.length === 0 && (
                <CardDescription className="text-xs sm:text-sm">
                  읽힌 게 없어요. CSV가 D-4 형식인지 확인해 주세요.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-5">
              {rows.length > 0 && (
                <section
                  className="space-y-2"
                  aria-labelledby="rows-heading"
                >
                  <h2
                    id="rows-heading"
                    className="text-sm font-medium text-foreground"
                  >
                    행 요약
                  </h2>
                  <div
                    className="max-h-[min(50vh,28rem)] overflow-hidden rounded-lg border border-border/80"
                    data-rows={rows.length}
                  >
                  <div className="md:hidden max-h-[min(45vh,22rem)] overflow-y-auto p-2">
                    <div
                      className="grid gap-2"
                      role="list"
                      aria-label="행 요약(모바일)"
                    >
                      {rows.map((r, i) => (
                        <div key={i} role="listitem">
                          {mode === "preview" && (
                            <MobileRowCard
                              r={r}
                              index={i}
                              approvalMode={approvalMode}
                              selected={previewI === i}
                              onSelect={() => void onPreviewIndex(i)}
                            />
                          )}
                          {mode === "direct" && (
                            <div className="rounded-lg border bg-card/50 p-3 text-left">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">
                                    <span className="text-muted-foreground">
                                      #{i + 1}
                                    </span>{" "}
                                    {r.writerName || "—"}{" "}
                                    {r.drafter3 && (
                                      <span className="text-muted-foreground">({r.drafter3})</span>
                                    )}
                                  </p>
                                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                    {r.orgName || "집행기관 없음"}
                                  </p>
                                  {r.outPlace && (
                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                      <MapPin className="size-3 shrink-0" aria-hidden />
                                      <span className="line-clamp-1">{r.outPlace}</span>
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0">
                                  {r.hasEmpty ? (
                                    <Badge variant="destructive" className="text-[10px] sm:text-xs">
                                      누락
                                    </Badge>
                                  ) : (
                                    <Badge className="border-0 bg-success-tint text-success-tint-foreground text-[10px] sm:text-xs">
                                      양호
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {r.hasEmpty && r.fieldWarnings.length > 0 && (
                                <ul className="mt-2 list-inside list-disc text-[10px] text-warning-tint-foreground sm:text-xs">
                                  {r.fieldWarnings.slice(0, 2).map((w) => (
                                    <li key={w} className="line-clamp-1">{w}</li>
                                  ))}
                                  {r.fieldWarnings.length > 2 && <li>외 {r.fieldWarnings.length - 2}건…</li>}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="hidden h-[min(50vh,20rem)] md:block">
                    <ScrollArea className="h-full w-full pr-1">
                      <div className="overflow-x-auto pb-1">
                        <Table>
                          <TableHeader>
                            <TableRow className="whitespace-nowrap">
                              <TableHead className="w-8" title="행 번호">
                                #
                              </TableHead>
                              <TableHead title="이름(거래처/내역)">이름</TableHead>
                              <TableHead title="기안 란에 쓰일 글(최대3자)">
                                기안(3자)
                              </TableHead>
                              <TableHead>출장지</TableHead>
                              <TableHead>출장기간</TableHead>
                              <TableHead>집행기관</TableHead>
                              <TableHead title="결재 머리(팀장 등)">결재 제목</TableHead>
                              <TableHead>상태</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((r, i) => {
                              const lab = getApprovalHeaderLabels(
                                r.orgName,
                                approvalMode
                              );
                              return (
                                <TableRow
                                  key={i}
                                  className={cn(
                                    "align-top",
                                    mode === "preview" && "cursor-pointer hover:bg-muted/40",
                                    mode === "preview" && previewI === i && "bg-muted/70"
                                  )}
                                  onClick={() =>
                                    mode === "preview"
                                      ? void onPreviewIndex(i)
                                      : undefined
                                  }
                                >
                                  <TableCell>{i + 1}</TableCell>
                                  <TableCell className="min-w-24">
                                    {r.writerName}
                                    {r.nameSource === "georae" && (
                                      <span
                                        className="ml-0.5 text-xs text-muted-foreground"
                                        title="거래처 셀에서"
                                      >
                                        (거)
                                      </span>
                                    )}
                                    {r.nameSource === "detail" && (
                                      <span
                                        className="ml-0.5 text-xs text-muted-foreground"
                                        title="사용내역에서"
                                      >
                                        (내)
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="min-w-12 font-mono text-xs">
                                    {r.drafter3}
                                  </TableCell>
                                  <TableCell className="min-w-20 max-w-36 text-xs">
                                    <span className="line-clamp-1">{r.outPlace || "—"}</span>
                                  </TableCell>
                                  <TableCell className="min-w-28 max-w-44 text-xs">
                                    <span className="line-clamp-1">{r.periodText || "—"}</span>
                                  </TableCell>
                                  <TableCell className="min-w-32 max-w-48 text-xs">
                                    <span className="line-clamp-1">{r.orgName}</span>
                                  </TableCell>
                                  <TableCell className="min-w-28 whitespace-nowrap text-xs">
                                    {lab.approver1} / {lab.approver2}
                                  </TableCell>
                                  <TableCell>
                                    {r.hasEmpty && (
                                      <Badge variant="destructive">누락</Badge>
                                    )}
                                    {!r.hasEmpty && (
                                      <Badge className="border-0 bg-success-tint text-success-tint-foreground">
                                        양호
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                    </div>
                  </div>
                </section>
              )}

              {mode === "preview" && rows[0] && (
                <section
                  className="space-y-4 border-t border-border/60 pt-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0 lg:pt-5"
                  aria-labelledby="preview-h"
                >
                  <div className="min-w-0 space-y-3">
                    <div>
                      <h2
                        id="preview-h"
                        className="text-sm font-medium text-foreground sm:text-base"
                      >
                        PDF 미리보기
                      </h2>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        행 {previewI + 1} / {rows.length}
                        {previewPending ? " · 만드는 중" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2" role="group" aria-label="미리보기 페이지네이터">
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        disabled={previewI <= 0}
                        onClick={() => void onPreviewIndex(previewI - 1)}
                        aria-label="이전 행"
                      >
                        <ChevronLeft className="size-4" />
                        이전
                      </Button>
                      <span className="min-w-16 text-center text-sm font-medium tabular-nums">
                        {previewI + 1} / {rows.length}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        disabled={previewI >= rows.length - 1}
                        onClick={() => void onPreviewIndex(previewI + 1)}
                        aria-label="다음 행"
                      >
                        다음
                        <ChevronLeft className="size-4 rotate-180" />
                      </Button>
                    </div>
                    <div className="relative w-full min-h-48 sm:min-h-0">
                      {previewPending && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-dashed bg-background/80 backdrop-blur-sm">
                          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                            <Loader2
                              className="size-6 animate-spin"
                              aria-hidden
                            />
                            <span>PDF 만드는 중</span>
                          </div>
                        </div>
                      )}
                      {previewUrl ? (
                        <iframe
                          className="h-[min(52vh,480px)] w-full rounded-lg border border-border/80 sm:h-96"
                          title={`행 ${previewI + 1} PDF 미리보기`}
                          src={previewUrl}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">미리보기를 불러옵니다…</p>
                      )}
                    </div>
                  </div>
                </section>
              )}

              <details className="group rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-2.5 text-sm sm:px-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <span>CSV 컬럼 이름 확인</span>
                  <span className="text-xs">펼치기</span>
                </summary>
                <p className="mt-2 break-all text-xs text-muted-foreground sm:text-sm">
                  {parseKeys.length ? parseKeys.join(" | ") : "—"}
                </p>
              </details>

            </CardContent>
          </Card>
          <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setStep("input");
                setPreviewUrl(null);
              }}
              type="button"
            >
              <ChevronLeft className="size-4" aria-hidden />
              이전
            </Button>
            <div className="flex justify-end gap-2">
              {mode === "direct" && (
                <Button
                  size="lg"
                  className="w-full sm:w-auto sm:min-w-40"
                  type="button"
                  disabled={genPending || !rows.length}
                  onClick={() => askStartGenerate()}
                >
                  {genPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {genProgress
                        ? `${genProgress.current}/${genProgress.total}`
                        : "준비 중…"}
                    </>
                  ) : (
                    "ZIP으로 받기"
                  )}
                </Button>
              )}
              {mode === "preview" && (
                <Button
                  size="lg"
                  className="w-full sm:w-auto sm:min-w-48"
                  type="button"
                  disabled={genPending || !rows.length}
                  onClick={async () => {
                    if (!rows.length) return;
                    if (!previewUrl) await onPreviewIndex(0);
                    await doGenerate();
                  }}
                >
                  {genPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {genProgress
                        ? `${genProgress.current}/${genProgress.total}`
                        : "준비 중…"}
                    </>
                  ) : (
                    "전부 PDF로 (행마다)"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === "result" && (
        <div className="flex flex-col items-center gap-6 py-8 text-center">
          <CheckCircle2 className="size-12 text-green-500" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{listDone.length}건 생성 완료</h2>
            <p className="text-sm text-muted-foreground">
              {mode === "direct" ? "ZIP 파일 1개로 " : `PDF ${listDone.length}개를 `}
              다운로드했어요.
              {warnCount > 0 && ` (경고 ${warnCount}건 포함)`}
            </p>
          </div>
          <div className="flex justify-end w-full border-t border-border/60 pt-4">
            <Button
              onClick={() => {
                setStep("input");
                setRows([]);
                setListDone([]);
                setPreviewUrl(null);
                setCsv(null);
                setA1(null);
                setA2(null);
                setA1Data("");
                setA2Data("");
                previewStart.current = false;
              }}
              variant="outline"
              size="lg"
              className="w-full sm:w-auto sm:min-w-40"
            >
              처음으로
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={showEmptyWarn}
        onOpenChange={setShowEmptyWarn}
      >
        <AlertDialogContent className="w-[min(100vw-2rem,32rem)] gap-2">
          <AlertDialogHeader>
            <AlertDialogTitle>빈 항목이 있어요</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              그대로 만들면 누락 항목은 <strong>빈 칸/대시(—)</strong> 쪽으로
              갈 수 있어요. 계속할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="m-0 w-full min-h-11 sm:w-auto">취소</AlertDialogCancel>
            <AlertDialogAction
              className="w-full min-h-11 sm:w-auto"
              onClick={() => void doGenerate()}
            >
              그래도 PDF 만들기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
