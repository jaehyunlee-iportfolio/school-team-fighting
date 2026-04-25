"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  FileUp,
  ImageIcon,
  Loader2,
  MapPin,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";
import { BusinessTripDocument } from "@/components/pdf/business-trip-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import {
  type TripRow,
  type DatePlaceholders,
  parseD4Csv,
  recomputeRowWithOverride,
} from "@/lib/csv/parseD4";
import { drafterSignatureGraphemes } from "@/lib/names/parseName";
import { type ApprovalGroup, getApprovalHeaderLabels, detectGroupFromFilename, resolveGroup } from "@/lib/approval/labels";
import { resolveHardcodedPdfLogoSrc } from "@/lib/pdf/group-logos";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getApprovalSettings,
  getPdfLayoutSettings,
  type ApprovalSettings,
  type PdfLayoutSettings,
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

function pdfName(r: TripRow) {
  const digits = r.usageDate.replace(/\D/g, "");
  // YYMMDD 6자리: YYYYMMDD면 앞 2자리(세기) 떼고, 6자리면 그대로, 그 외엔 UNKNOWN
  const date =
    digits.length >= 8 ? digits.slice(2, 8) : digits.length === 6 ? digits : "UNKNOWN";
  const name = r.writerName?.trim() ? fileSafe(r.writerName) : "UNKNOWN";
  const place = r.outPlace?.trim() ? fileSafe(r.outPlace).slice(0, 20) : "UNKNOWN";
  const ev = r.evidenceNo?.trim() ? fileSafe(r.evidenceNo) : "UNKNOWN";
  return `${ev}_1. 내부결재문서_출장신청서_${name}_${place}_${date}.pdf`;
}

function zipName() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `출장신청서_모음_${date}_${hh}시${mm}분.zip`;
}

const ALL_APPROVAL: { id: ApprovalGroup | "auto"; label: string }[] = [
  { id: "auto", label: "자동(집행기관명)" },
  { id: "ipf", label: "iPF / (주)아이포트폴리오" },
  { id: "dimi", label: "디미교연 / (사)디지털미디어교육콘텐츠 교사연구협회" },
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
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-input bg-card px-4 text-sm outline-none transition hover:bg-muted/50 focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10"
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
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/10"
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

const GROUP_DISPLAY: Record<string, string> = {
  ipf: "iPF ((주)아이포트폴리오)",
  dimi: "디미교연 ((사)디지털미디어교육콘텐츠 교사연구협회)",
};

function AdminSignaturePreview({ settings }: { settings: ApprovalSettings }) {
  const groups = Object.entries(settings.groups).filter(
    ([, g]) => g.approver1ImageUrl || g.approver2ImageUrl
  );
  if (!groups.length) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">결재 서명 이미지</p>
        <p className="text-xs text-muted-foreground">
          어드민이 설정한 서명이에요. 그룹에 맞게 자동 적용돼요.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {groups.map(([gid, g]) => (
          <div
            key={gid}
            className="rounded-xl border bg-card p-3 space-y-2.5"
          >
            <p className="text-xs font-semibold text-muted-foreground">
              {GROUP_DISPLAY[gid] ?? gid}
            </p>
            <div className="flex gap-3">
              <SigThumb
                src={g.approver1ImageUrl}
                label={`결재자 1 (${g.approver1Label})`}
              />
              <SigThumb
                src={g.approver2ImageUrl}
                label={`결재자 2 (${g.approver2Label})`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SigThumb({ src, label }: { src: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="flex size-14 items-center justify-center rounded-lg border bg-muted overflow-hidden">
        {src ? (
          <img src={src} alt={label} className="size-full object-contain" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground/40" />
        )}
      </div>
      <span className="text-[11px] leading-tight text-muted-foreground text-center">
        {label}
      </span>
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
                className="w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
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

type EditableFields = Pick<
  TripRow,
  "writerName" | "orgName" | "memberText" | "periodText" | "outPlace" | "purposeText"
>;

const EDITABLE_FIELD_META: { key: keyof EditableFields; label: string; multiline?: boolean }[] = [
  { key: "writerName", label: "작성자 성명" },
  { key: "orgName", label: "작성자 소속 (집행기관)" },
  { key: "memberText", label: "출장 인원" },
  { key: "outPlace", label: "출장지" },
  { key: "purposeText", label: "출장 목적", multiline: true },
];

function formatDateKr(d: Date): string {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function parseDateKr(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function parsePeriodDates(period: string): { start: Date | null; end: Date | null } {
  if (!period || !period.includes("~")) return { start: null, end: null };
  const [left, right] = period.split("~").map((s) => s.trim());
  return {
    start: parseDateKr(left),
    end: right?.includes("YYYY") ? null : parseDateKr(right),
  };
}

const dayPickerClassNames = {
  root: "text-sm",
  months: "flex flex-col",
  month_caption: "flex justify-center items-center h-8 font-medium text-foreground",
  nav: "flex items-center gap-1",
  button_previous: "absolute left-1 top-1 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted",
  button_next: "absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted",
  weekdays: "flex",
  weekday: "w-8 text-center text-xs font-medium text-muted-foreground",
  week: "flex",
  day: "size-8 text-center text-sm p-0",
  day_button: "inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted",
  selected: "!bg-foreground !text-background rounded-lg",
  today: "font-bold",
  outside: "text-muted-foreground/40",
  disabled: "text-muted-foreground/30",
};

function DateRangeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = parsePeriodDates(value);
  const [startDate, setStartDate] = useState<Date | undefined>(parsed.start ?? undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(parsed.end ?? undefined);
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = parsePeriodDates(value);
    setStartDate(p.start ?? undefined);
    setEndDate(p.end ?? undefined);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (startRef.current && !startRef.current.contains(e.target as Node)) setShowStart(false);
      if (endRef.current && !endRef.current.contains(e.target as Node)) setShowEnd(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updatePeriod = (s: Date | undefined, e: Date | undefined) => {
    if (s && e) onChange(`${formatDateKr(s)} ~ ${formatDateKr(e)}`);
    else if (s) onChange(`${formatDateKr(s)} ~ YYYY. MM. DD`);
    else onChange("");
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">출장 기간</Label>
      <div className="grid grid-cols-2 gap-2">
        <div ref={startRef} className="relative">
          <button
            type="button"
            onClick={() => { setShowStart(!showStart); setShowEnd(false); }}
            className="flex h-10 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10"
          >
            <Calendar className="size-4 shrink-0 text-muted-foreground" />
            <span className={startDate ? "text-foreground" : "text-muted-foreground"}>
              {startDate ? formatDateKr(startDate) : "시작일"}
            </span>
          </button>
          {showStart && (
            <div className="absolute left-0 top-12 z-50 rounded-xl border border-border bg-card p-2 shadow-lg">
              <DayPicker
                mode="single"
                locale={ko}
                selected={startDate}
                defaultMonth={startDate}
                onSelect={(d) => {
                  setStartDate(d ?? undefined);
                  updatePeriod(d ?? undefined, endDate);
                  setShowStart(false);
                }}
                classNames={dayPickerClassNames}
              />
            </div>
          )}
        </div>
        <div ref={endRef} className="relative">
          <button
            type="button"
            onClick={() => { setShowEnd(!showEnd); setShowStart(false); }}
            className="flex h-10 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10"
          >
            <Calendar className="size-4 shrink-0 text-muted-foreground" />
            <span className={endDate ? "text-foreground" : "text-muted-foreground"}>
              {endDate ? formatDateKr(endDate) : "종료일"}
            </span>
          </button>
          {showEnd && (
            <div className="absolute right-0 top-12 z-50 rounded-xl border border-border bg-card p-2 shadow-lg">
              <DayPicker
                mode="single"
                locale={ko}
                selected={endDate}
                defaultMonth={endDate ?? startDate}
                onSelect={(d) => {
                  setEndDate(d ?? undefined);
                  updatePeriod(startDate, d ?? undefined);
                  setShowEnd(false);
                }}
                classNames={dayPickerClassNames}
              />
            </div>
          )}
        </div>
      </div>
      {value && (
        <p className="text-xs text-muted-foreground">{value}</p>
      )}
    </div>
  );
}

function recomputeWarnings(r: TripRow): TripRow {
  const wlist: string[] = [];
  if (!r.writerName) wlist.push("이름: 거래처 또는 사용내역(출장자명)을 찾지 못함");
  if (!r.purposeText) wlist.push("「사용내역(수령인)」이 비어 있어요");
  if (!r.outPlace) wlist.push("「출장지」가 비어 있어요");
  if (!r.orgName) wlist.push("「집행기관(명)」이 비어 있어요");
  if (!r.periodText) wlist.push("「사용일자」가 비어 있어요");
  else if (r.periodText === "날짜 확인 불가")
    wlist.push("「사용일자」가 날짜 형식이 아니에요 — 직접 확인해 주세요");
  else if (r.periodText.includes("YYYY"))
    wlist.push("「사용일자」에 날짜가 하나뿐이에요 — 종료일을 직접 입력해 주세요");
  return { ...r, hasEmpty: wlist.length > 0, fieldWarnings: wlist };
}

function RowEditDialog({
  row,
  index,
  open,
  onOpenChange,
  onSave,
}: {
  row: TripRow;
  index: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated: TripRow) => void;
}) {
  const [draft, setDraft] = useState<EditableFields>({
    writerName: row.writerName,
    orgName: row.orgName,
    memberText: row.memberText,
    periodText: row.periodText,
    outPlace: row.outPlace,
    purposeText: row.purposeText,
  });

  useEffect(() => {
    if (open) {
      setDraft({
        writerName: row.writerName,
        orgName: row.orgName,
        memberText: row.memberText,
        periodText: row.periodText,
        outPlace: row.outPlace,
        purposeText: row.purposeText,
      });
    }
  }, [open, row]);

  const handleSave = () => {
    const updated: TripRow = {
      ...row,
      ...draft,
      drafter3: drafterSignatureGraphemes(draft.writerName, 3),
      detail: draft.purposeText,
    };
    onSave(recomputeWarnings(updated));
    onOpenChange(false);
    toast.success(`#${index + 1}번 행을 수정했어요`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>#{index + 1}번 행 수정</DialogTitle>
          <DialogDescription>
            내용을 직접 수정할 수 있어요. 수정하면 PDF에 바로 반영돼요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {EDITABLE_FIELD_META.map(({ key, label, multiline }) => (
            <Fragment key={key}>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium" htmlFor={`edit-${key}`}>
                  {label}
                </Label>
                {multiline ? (
                  <textarea
                    id={`edit-${key}`}
                    className="flex min-h-20 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10"
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={`edit-${key}`}
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                )}
              </div>
              {key === "memberText" && (
                <DateRangeField
                  value={draft.periodText}
                  onChange={(v) => setDraft((d) => ({ ...d, periodText: v }))}
                />
              )}
            </Fragment>
          ))}
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

function MobileRowCard({
  r,
  index,
  approvalMode,
  selected,
  onSelect,
  onEdit,
  onRemove,
}: {
  r: TripRow;
  index: number;
  approvalMode: ApprovalGroup | "auto";
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const lab = getApprovalHeaderLabels(r.orgName, approvalMode);
  return (
    <div
      className={cn(
        "relative w-full max-w-full rounded-lg border p-3 text-left transition",
        "min-h-14",
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
        <div className="relative z-10 flex items-center gap-1.5 shrink-0">
          {r.evidenceNo ? (
            <Badge variant="secondary" className="font-mono text-[10px] sm:text-xs">
              {r.evidenceNo}
            </Badge>
          ) : (
            <Badge variant="destructive" className="font-mono text-[10px] sm:text-xs">
              증빙번호 없음
            </Badge>
          )}
          {r.hasEmpty ? (
            <Badge variant="destructive" className="text-[10px] sm:text-xs">
              누락
            </Badge>
          ) : (
            <Badge className="border-0 bg-success-tint text-success-tint-foreground text-[10px] sm:text-xs">
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
        <ul className="relative z-10 mt-2 list-inside list-disc text-[10px] text-warning-tint-foreground sm:text-xs">
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
  const [pdfLayout, setPdfLayout] = useState<PdfLayoutSettings | null>(null);
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getApprovalSettings(), getPdfLayoutSettings()])
      .then(([s, l]) => {
        setAdminSettings(s);
        setPdfLayout(l);
        setAdminSigLoaded(true);
      })
      .catch(() => setAdminSigLoaded(true));
  }, []);

  const hasAdminSig = (key: "approver1ImageUrl" | "approver2ImageUrl") =>
    adminSettings
      ? Object.values(adminSettings.groups).some((g) => !!g[key])
      : false;

  const removeRow = (index: number) => {
    setRows((cur) => {
      const next = cur.filter((_, i) => i !== index);
      if (previewI >= next.length && next.length > 0) setPreviewI(next.length - 1);
      if (next.length === 0) setPreviewI(0);
      return next;
    });
    toast("행을 삭제했어요", { description: `#${index + 1}번 행이 제거되었어요.` });
  };

  const updateRow = (index: number, updated: TripRow) => {
    setRows((cur) => cur.map((r, i) => (i === index ? recomputeRowWithOverride(updated, approvalMode) : r)));
  };

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
      const datePh: DatePlaceholders | undefined = pdfLayout
        ? { dateFallback: pdfLayout.placeholders.dateFallback, dateInvalid: pdfLayout.placeholders.dateInvalid }
        : undefined;
      const p = parseD4Csv(t, datePh);
      setHeaderIdx(p.headerLineIndex);
      setParseKeys(p.keys);

      const fileGroup = detectGroupFromFilename(csv.name);
      const effectiveMode = fileGroup ?? approvalMode;
      if (fileGroup && approvalMode === "auto") {
        setApprovalMode(fileGroup);
        toast.success(
          `파일명에서 "${fileGroup === "ipf" ? "(주)아이포트폴리오" : "(사)디지털미디어교육콘텐츠 교사연구협회"}" 그룹을 감지했어요`
        );
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

  const resolveSignatures = useCallback(
    (r: TripRow) => {
      const resolvedGroup = resolveGroup(r.orgName, approvalMode);
      const groupSigs = adminSettings?.groups[resolvedGroup];
      const src1 = a1Data || groupSigs?.approver1ImageUrl || undefined;
      const src2 = a2Data || groupSigs?.approver2ImageUrl || undefined;
      const logo = resolveHardcodedPdfLogoSrc(resolvedGroup);
      return { src1, src2, logo };
    },
    [a1Data, a2Data, approvalMode, adminSettings]
  );

  const makeBlobFor = useCallback(
    async (r: TripRow) => {
      registerPdfFonts();
      const d = recomputeRowWithOverride(r, approvalMode);
      const { src1, src2, logo } = resolveSignatures(r);
      return pdf(
        <BusinessTripDocument
          row={d}
          approver1Src={src1}
          approver2Src={src2}
          logoSrc={logo}
          layout={pdfLayout ?? undefined}
        />
      ).toBlob();
    },
    [approvalMode, resolveSignatures, pdfLayout]
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
          const n = pdfName(r);
          z.file(n, b);
        }
        const zipB = await z.generateAsync({ type: "blob" });
        const href = URL.createObjectURL(zipB);
        const a = document.createElement("a");
        a.href = href;
        a.download = zipName();
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
      // preview 모드도 ZIP으로 다운로드
      const z2 = new JSZip();
      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i + 1, total: rows.length });
        const b = await makeBlobFor(rows[i]);
        const n = pdfName(rows[i]);
        z2.file(n, b);
        setListDone((d) => [...d, { n, i: i + 1 }]);
      }
      const zipB2 = await z2.generateAsync({ type: "blob" });
      const href2 = URL.createObjectURL(zipB2);
      const a2Elem = document.createElement("a");
      a2Elem.href = href2;
      a2Elem.download = zipName();
      a2Elem.click();
      URL.revokeObjectURL(href2);
      toast.success(
        `PDF ${rows.length}장이 담긴 ZIP 파일을 다운로드합니다.`
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
      className="mx-auto min-h-0 w-full min-w-0 overflow-x-hidden px-3 py-6 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-5 sm:py-8 lg:px-8 xl:px-10"
      data-step={step}
    >
      <div className="mx-auto w-full min-w-0 space-y-4 sm:space-y-6">
        <header className="mx-auto mb-0 w-full max-w-4xl border-b border-border pb-5 sm:pb-6">
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            출장신청서
          </h1>
          <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
            CSV는 필수, 결재 서명 이미지 2장은 선택이에요.
          </p>
        </header>

        <div className="mx-auto w-full max-w-4xl">
          <StepIndicator current={step} onGoTo={goToStep} />
        </div>

      {step === "input" && (
        <Card className="mx-auto max-w-4xl">
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
              {adminSigLoaded && adminSettings && (hasAdminSig("approver1ImageUrl") || hasAdminSig("approver2ImageUrl")) ? (
                <AdminSignaturePreview settings={adminSettings} />
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4 sm:gap-y-6">
                  <FileField
                    id="f-a1"
                    label="결재 1·서명(이미지)"
                    hint="팀장(또는 사무국장) / PNG·JPG"
                    file={a1}
                    accept="image/*"
                    onFile={async (f) => {
                      setA1(f);
                      if (f) setA1Data(await readDataUrl(f));
                      else setA1Data("");
                    }}
                  />
                  <FileField
                    id="f-a2"
                    label="결재 2·서명(이미지)"
                    hint="본부장(또는 대표) / PNG·JPG"
                    file={a2}
                    accept="image/*"
                    onFile={async (f) => {
                      setA2(f);
                      if (f) setA2Data(await readDataUrl(f));
                      else setA2Data("");
                    }}
                  />
                </div>
              )}
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
              <div className="grid grid-cols-3 gap-2">
                {ALL_APPROVAL.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => reapplyApproval(a.id as ApprovalGroup | "auto")}
                    className={cn(
                      "rounded-xl border-2 px-3 py-2.5 text-sm font-medium outline-none transition-all touch-manipulation focus-visible:ring-2 focus-visible:ring-foreground/10",
                      approvalMode === a.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:bg-muted/40"
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
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
          {/* Header */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold sm:text-xl">
              {rows.length > 0 ? `${rows.length}건 읽었어요` : "2. 검토"}
            </h2>
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
            <p className="text-sm text-muted-foreground">
              읽힌 게 없어요. CSV가 D-4 형식인지 확인해 주세요.
            </p>
          )}

          {/* Desktop: side-by-side / Mobile: stacked */}
          {rows.length > 0 && (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
              {/* Left: PDF Preview */}
              {mode === "preview" && (
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
                          <Loader2 className="size-6 animate-spin" aria-hidden />
                          <span>PDF 만드는 중</span>
                        </div>
                      </div>
                    )}
                    {previewUrl ? (
                      <iframe
                        className="aspect-[1/1.414] w-full rounded-xl border border-border/80"
                        title={`행 ${previewI + 1} PDF 미리보기`}
                        src={previewUrl}
                      />
                    ) : (
                      <div className="flex aspect-[1/1.414] w-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                        미리보기를 불러옵니다…
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Right: Row list */}
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-sm font-medium text-foreground">
                  행 목록
                </p>
                <div className="max-h-[min(80vh,56rem)] overflow-y-auto rounded-xl border border-border/80 p-2 lg:max-h-[calc(100vh-14rem)]">
                  <div className="grid gap-2" role="list" aria-label="행 목록">
                    {rows.map((r, i) => (
                      <div key={i} role="listitem">
                        <MobileRowCard
                          r={r}
                          index={i}
                          approvalMode={approvalMode}
                          selected={mode === "preview" && previewI === i}
                          onSelect={() => mode === "preview" ? void onPreviewIndex(i) : undefined}
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

          {/* CSV columns debug */}
          <details className="group rounded-xl border border-dashed border-border/80 bg-muted/15 px-3 py-2.5 text-sm sm:px-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-muted-foreground [&::-webkit-details-marker]:hidden">
              <span>CSV 컬럼 이름 확인</span>
              <span className="text-xs">펼치기</span>
            </summary>
            <p className="mt-2 break-all text-xs text-muted-foreground sm:text-sm">
              {parseKeys.length ? parseKeys.join(" | ") : "—"}
            </p>
          </details>

          {/* Bottom actions */}
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
                    "ZIP으로 받기"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === "result" && (
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 py-8 text-center">
          <CheckCircle2 className="size-12 text-green-500" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{listDone.length}건 생성 완료</h2>
            <p className="text-sm text-muted-foreground">
              ZIP 파일 1개로 다운로드했어요.
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

      {editingRowIdx !== null && rows[editingRowIdx] && (
        <RowEditDialog
          row={rows[editingRowIdx]}
          index={editingRowIdx}
          open
          onOpenChange={(v) => { if (!v) setEditingRowIdx(null); }}
          onSave={(updated) => {
            updateRow(editingRowIdx, updated);
            if (mode === "preview") void onPreviewIndex(editingRowIdx);
          }}
        />
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
