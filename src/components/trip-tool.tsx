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
  Info,
  Loader2,
  MapPin,
  Minimize2,
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
import { Input } from "@/components/ui/input";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <Label className="text-sm font-medium text-foreground" htmlFor={id}>
          {label}
        </Label>
        <p className="text-xs text-muted-foreground sm:max-w-[55%] sm:text-right sm:text-sm">
          {hint}
        </p>
      </div>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          className="h-12 pr-10 text-base file:min-h-10 file:cursor-pointer file:rounded-md file:bg-transparent file:px-0 file:text-muted-foreground sm:min-h-0 sm:h-11 sm:file:h-7"
          type="file"
          accept={accept}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        <FileUp
          className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
      {file ? (
        <div className="flex items-center gap-2">
          <Check className="size-3.5 shrink-0 text-green-600" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={file.name}>
            {file.name}
          </p>
          <button
            type="button"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="파일 제거"
            onClick={() => {
              void onFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">파일을 골랐다면 아래에 이름이 보여요</p>
      )}
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
  const [mode, setMode] = useState<Mode>("direct");
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
        toast.error("데이터 행이 0개예요. CSV에 표가 맞는지, D-4(출장비) 머리·저장 방식이 맞는지 확인하세요");
    } catch (e) {
      console.error(e);
      toast.error("CSV 읽기에 실패했어요. UTF-8인지, 파일이 꽉 찬 건지 확인하세요");
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
      toast.error("데이터가 없습니다");
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
          `ZIP(안에 PDF ${rows.length}장)로 저장이 시작돼요. 막힌 경우 브라우저/팝업 설정을 봐 주세요`
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
        "미리보기: 행마다 PDF를 내려냈어요(여러 개는 폴더/브라우저에 따라 잇달아 저장돼요)"
      );
      setStep("result");
    } catch (e) {
      console.error(e);
      toast.error("PDF 생성에 실패했습니다");
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
      className="mx-auto min-h-0 w-full min-w-0 max-w-[min(100%,1920px)] overflow-x-hidden px-3 py-6 pb-28 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-5 sm:py-8 sm:pb-10 lg:px-8 xl:px-10"
      data-step={step}
    >
      <div className="mx-auto w-full min-w-0 max-w-4xl space-y-4 sm:space-y-6">
        <header className="mb-0 flex min-w-0 flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:pb-6">
          <h1 className="min-w-0 text-balance text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            출장신청서
          </h1>
          <Alert className="max-w-none border border-border/80 bg-muted/40 sm:max-w-md sm:shrink-0 sm:self-center">
            <Info
              className="size-4 text-muted-foreground"
              strokeWidth={2}
              aria-hidden
            />
            <AlertDescription className="text-xs sm:text-sm [&_strong]:font-medium">
              <strong>CSV</strong>는 꼭 필요해요. 결재란엔{" "}
              <strong>서명 이미지 2장</strong>이 들어갑니다. 기안란(맨 앞)에는{" "}
              <strong>거래처</strong>에 적힌 이름 중 <strong>맨 앞 사람</strong>의
              이름(최대 3자)이 손글씨처럼 표시돼요.
            </AlertDescription>
          </Alert>
        </header>

        <StepIndicator current={step} onGoTo={goToStep} />

      {step === "input" && (
        <Card>
          <CardHeader className="space-y-1 pb-4 sm:pb-4">
            <CardTitle className="text-lg sm:text-xl">1. 자료</CardTitle>
            <CardDescription>
              D-4 «출장비» 시트를 <strong>CSV(UTF-8 권장)</strong>로 저장·내보내
              주세요. 결재 서명은 <strong>PNG·JPG</strong> — 배경이 투명하면(누끼) 문서에 더
              잘 맞아요. 기안 서명란은 이미지로 넣지 않아도 됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 sm:space-y-7">
            <section className="space-y-3" aria-labelledby="mode-heading">
              <h2 id="mode-heading" className="text-sm font-medium text-foreground">
                생성 모드
              </h2>
              <p className="text-xs text-muted-foreground sm:text-sm">
                좌·우에서 하나만 고르면 돼요. (모바일은 화면이 좁을 때만 위·아래로 쌓입니다)
              </p>
              <RadioGroup
                className="grid w-full grid-cols-1 items-stretch gap-3 sm:grid-cols-2"
                value={mode}
                onValueChange={(v) => setMode(v as Mode)}
              >
                {(
                  [
                    {
                      v: "direct" as const,
                      id: "d",
                      title: "바로 생성(추천)",
                      sub: "2단계에서 확인 후 ZIP 한 개로 전부 받기",
                    },
                    {
                      v: "preview" as const,
                      id: "p",
                      title: "미리보기",
                      sub: "2단계에서 PDF로 확인 후, 행마다 나눠 받기",
                    },
                  ] as const
                ).map(({ v, id, title, sub }) => (
                  <div
                    key={v}
                    className={cn(
                      "flex h-full min-h-[7.5rem] items-start gap-2.5 rounded-lg border p-3 transition-colors sm:gap-3 sm:p-4",
                      "active:scale-[0.99]",
                      mode === v
                        ? "border-foreground/20 bg-muted"
                        : "border-border bg-card hover:border-foreground/15 hover:bg-muted/50"
                    )}
                  >
                    <RadioGroupItem value={v} id={id} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <Label
                        className="cursor-pointer text-sm font-medium leading-snug"
                        htmlFor={id}
                      >
                        {title}
                      </Label>
                      <p className="mt-1.5 text-pretty text-xs leading-relaxed text-muted-foreground sm:text-sm">
                        {sub}
                      </p>
                    </div>
                  </div>
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
                  결재란 머리(팀장, 본부장 등) 맞추기
                </Label>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  집행기관(명)에 맞게 자동으로 씁니다. iPF/디미에 안 맞으면 여기서 고르면
                  돼요.
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
            <div className="border-t border-border/60 pt-2">
              <Button
                type="button"
                size="lg"
                className="min-h-12 w-full sm:max-w-sm"
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
                  "2단계로(내용 확인)"
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 space-y-2">
                  <CardTitle className="text-lg sm:text-xl">2. 검토</CardTitle>
                  <CardDescription className="text-pretty text-xs sm:text-sm">
                    {rows.length > 0 ? (
                      <>
                        <strong className="text-foreground">{rows.length}건</strong>을 읽었어요.{" "}
                        {headerIdx >= 0 ? (
                          <span>
                            {`(사용일자, 거래처… 같은) 표 머리는 `}
                            <strong>엑셀에서 맨 윗줄로부터 {headerIdx + 1}번째 줄</strong>
                            {`을 머리로 잡았어요.`}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "읽힌 게 없어요. 머리(사용일자·거래처…)가 있는 D-4인지, CSV 저장이 괜한지 봐 주세요"
                    )}
                  </CardDescription>
                  {rows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                        <Check className="size-3" aria-hidden />
                        양호 {okCount}건
                      </span>
                      {warnCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <AlertTriangle className="size-3" aria-hidden />
                          경고 {warnCount}건
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {rows.length > 0 && hasAnyEmpty && (
                  <Alert
                    className="w-full max-w-md shrink-0 border border-border/80 bg-warning-tint/80 text-warning-tint-foreground"
                    role="status"
                  >
                    <AlertTriangle className="h-4 w-4 opacity-80" aria-hidden />
                    <AlertDescription>
                      <p className="text-xs font-medium sm:text-sm">빈 칸·누락 의심 {warnCount}건</p>
                      <p className="mt-1 text-[11px] leading-relaxed sm:text-sm">
                        일부 행에 데이터가 비었을 수 있어요. PDF는 그대로 나갈 수 있어요.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-5">
              <details className="group rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-2.5 text-sm sm:px-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <span>열명이 이상하다면 (디버그)</span>
                  <span className="text-xs">펼치기</span>
                </summary>
                <p className="mt-2 break-all text-xs text-muted-foreground sm:text-sm">
                  {parseKeys.length ? parseKeys.join(" | ") : "—"}
                </p>
              </details>

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
                                      <Badge variant="destructive">빈칸</Badge>
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
                        {previewPending ? " · 만드는 중" : " · 표·위 번호·목록에서 행을 바꿀 수 있어요"}
                      </p>
                    </div>
                    <div
                      className="-mx-0.5 flex max-w-full flex-nowrap gap-1.5 overflow-x-auto py-0.5 pb-1 [scrollbar-width:thin]"
                      role="group"
                      aria-label="행 번호(미리보기)"
                    >
                      {rows.map((_, i) => (
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          className="min-h-9 min-w-9 shrink-0 touch-manipulation sm:min-h-9"
                          key={i}
                          aria-pressed={previewI === i}
                          aria-label={`${i + 1}행 미리보기`}
                          onClick={async () => onPreviewIndex(i)}
                        >
                          {i + 1}
                        </Button>
                      ))}
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
                    <p className="text-xs text-muted-foreground">
                      표나 카드의 행을 누르는 것과 번호는 같은 동작이에요.
                    </p>
                  </div>
                  <aside
                    className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 sm:p-4"
                    role="complementary"
                  >
                    <p className="flex items-start gap-2 text-sm text-muted-foreground sm:text-pretty">
                      <Minimize2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        <strong className="text-foreground">전부 PDF로</strong>는 행마다
                        파일이 내려갑니다. 막힌다면(팝업·권한) 1단계의{" "}
                        <strong>바로 생성</strong>으로 ZIP 받는 편이 나을 수도 있어요.
                      </span>
                    </p>
                  </aside>
                </section>
              )}

            </CardContent>
          </Card>
            <div
            className={cn(
              "fixed bottom-0 left-0 right-0 z-20 border-t border-border/80 bg-background/95 px-3 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.05)] backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-auto sm:mb-0 sm:max-w-4xl sm:rounded-xl sm:border sm:shadow"
            )}
          >
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-0">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("input");
                  setPreviewUrl(null);
                }}
                type="button"
                className="min-h-11 w-full sm:w-auto"
              >
                <ChevronLeft className="size-4" aria-hidden />
                이전(자료)
              </Button>
              <div className="grid flex-1 gap-2 sm:flex sm:justify-end">
                {mode === "direct" && (
                  <Button
                    className="min-h-12 w-full sm:min-w-40 sm:max-w-xs"
                    type="button"
                    disabled={genPending || !rows.length}
                    onClick={() => askStartGenerate()}
                  >
                    {genPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {genProgress
                          ? `생성 중 ${genProgress.current}/${genProgress.total}`
                          : "준비 중…"}
                      </>
                    ) : (
                      "ZIP으로 받기"
                    )}
                  </Button>
                )}
                {mode === "preview" && (
                  <Button
                    className="min-h-12 w-full sm:min-w-48"
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
                          ? `생성 중 ${genProgress.current}/${genProgress.total}`
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
        </div>
      )}

      {step === "result" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">3. 끝</CardTitle>
            <CardDescription>
              다운로드는 브라우저 설정에 맞는 폴더로 떨어집니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/50">
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  출장신청서 {listDone.length}건 생성 완료
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  {mode === "direct" ? "ZIP 파일 1개로 " : `PDF ${listDone.length}개를 `}
                  다운로드했어요
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
                전체 {listDone.length}건
              </span>
              {warnCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  <AlertTriangle className="size-3" aria-hidden />
                  경고 {warnCount}건 포함
                </span>
              )}
              {okCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                  <Check className="size-3" aria-hidden />
                  양호 {okCount}건
                </span>
              )}
            </div>

            <ul className="ml-1 list-outside list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>다운이 안 보이면 팝업·다운로드 권한을 확인해 주세요</li>
              <li>ZIP이면 압축만 풀면 돼요. 여러 개면 횟수만큼 떨어질 수 있어요</li>
              {warnCount > 0 && (
                <li className="text-amber-700 dark:text-amber-300">
                  경고 {warnCount}건은 빈 칸이 있을 수 있어요 — PDF 출력 후 확인을 권장합니다
                </li>
              )}
            </ul>

            <div className="border-t border-border/60 pt-4">
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
                variant="default"
                className="h-12 w-full min-[420px]:max-w-xs"
              >
                처음으로
              </Button>
            </div>
          </CardContent>
        </Card>
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
