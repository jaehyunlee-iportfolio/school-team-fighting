"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  MeetingOperationsDocument,
  makeMeetingOperationsFilename,
} from "@/components/pdf/meeting-operations-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { parseMeetingOperationsCsv, reparseDateYMD } from "@/lib/csv/parseMeetingOperations";
import {
  effectiveValue,
  hasConflict,
  parseAttendees,
  allBodyEmpty,
  partialBodyEmpty,
  hasAiGeneratedBody,
  BODY_FIELD_KEYS,
  type BodyFieldKey,
  type MeetingFieldChoice,
  type MeetingOperationsRow,
} from "@/lib/meeting/types";
import {
  getMeetingOperationsSettings,
  getMeetingOperationsLayoutSettings,
  DEFAULT_MEETING_OP_SETTINGS,
  DEFAULT_MEETING_OP_LAYOUT,
  type MeetingOperationsSettings,
  type MeetingOperationsLayoutSettings,
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
import { Textarea } from "@/components/ui/textarea";
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

const STEPS: { id: AppStep; label: string }[] = [
  { id: "input", label: "자료" },
  { id: "validate", label: "검토" },
  { id: "result", label: "끝" },
];

const MAX_PHOTOS = 6;

function readFileText(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(f, "UTF-8");
  });
}

function readFileDataURL(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
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
  return `회의록_모음_${date}_${hh}시${mm}분.zip`;
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

/* ============================================================
   필드 편집 (충돌 후보 칩 + 직접입력 + AI 다듬기)
   ============================================================ */

function FieldEditor({
  label,
  field,
  fieldKey,
  onChange,
  textarea,
  refinable,
}: {
  label: string;
  field: MeetingFieldChoice;
  fieldKey: string;
  onChange: (next: MeetingFieldChoice) => void;
  textarea?: boolean;
  refinable?: boolean;
}) {
  const conflict = hasConflict(field);
  const current = effectiveValue(field);
  const [refining, setRefining] = useState(false);

  const setOverride = (v: string) => {
    onChange({
      ...field,
      selectedIndex: -1,
      override: v,
      aiGenerated: false,
    });
  };

  const pickCandidate = (i: number) => {
    onChange({ ...field, selectedIndex: i, override: "", aiGenerated: false });
  };

  const refine = async () => {
    if (!refinable) return;
    if (!current.trim()) {
      toast.error("내용이 비어있어요");
      return;
    }
    setRefining(true);
    try {
      const r = await fetch("/api/meeting/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field: fieldKey, input: current }),
      });
      const data = (await r.json()) as { output?: string; error?: string };
      if (!r.ok) {
        toast.error(data.error || "다듬기 실패");
        return;
      }
      if (data.output) {
        setOverride(data.output);
        toast.success("AI 다듬기 적용됨");
      }
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setRefining(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">
          {label}
          {conflict && (
            <Badge
              variant="outline"
              className="ml-1.5 border-amber-300 text-[10px] text-amber-700"
            >
              충돌
            </Badge>
          )}
        </Label>
        {refinable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={refining}
            onClick={refine}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            {refining ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
            AI 다듬기
          </Button>
        )}
      </div>

      {field.candidates.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {field.candidates.map((c, i) => {
            const selected = field.selectedIndex === i && !field.override;
            const preview = c.value
              ? c.value.length > 30
                ? c.value.slice(0, 28) + "…"
                : c.value
              : "(빈 값)";
            return (
              <button
                key={`${c.evidenceNo}-${i}`}
                type="button"
                onClick={() => pickCandidate(i)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted/40",
                )}
                title={c.value}
              >
                <span className="font-mono text-[10px] opacity-75">{c.evidenceNo}</span>
                <span className="ml-1.5">{preview}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChange({ ...field, selectedIndex: -1, override: current })}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px]",
              field.selectedIndex === -1 && field.override
                ? "border-primary bg-primary text-primary-foreground"
                : "border-dashed border-border bg-background hover:bg-muted/40",
            )}
          >
            직접 입력
          </button>
        </div>
      )}

      {textarea ? (
        <Textarea
          value={current}
          onChange={(e) => setOverride(e.target.value)}
          rows={4}
          className="min-h-[88px] resize-y"
        />
      ) : (
        <Input value={current} onChange={(e) => setOverride(e.target.value)} />
      )}
    </div>
  );
}

/* ============================================================
   행 편집 다이얼로그
   ============================================================ */

function MeetingRowEditDialog({
  row,
  index,
  open,
  onOpenChange,
  onSave,
}: {
  row: MeetingOperationsRow;
  index: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated: MeetingOperationsRow) => void;
}) {
  const [draft, setDraft] = useState<MeetingOperationsRow>(row);
  const [expanding, setExpanding] = useState(false);
  useEffect(() => {
    if (open) setDraft(row);
  }, [open, row]);

  const setField = <K extends keyof MeetingOperationsRow>(
    k: K,
    v: MeetingOperationsRow[K],
  ) => setDraft((d) => ({ ...d, [k]: v }));

  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remain = MAX_PHOTOS - draft.photos.length;
    const take = Array.from(files).slice(0, remain);
    if (take.length === 0) {
      toast.error(`사진은 최대 ${MAX_PHOTOS}장`);
      return;
    }
    try {
      const urls = await Promise.all(take.map(readFileDataURL));
      setDraft((d) => ({ ...d, photos: [...d.photos, ...urls].slice(0, MAX_PHOTOS) }));
      toast.success(`${urls.length}장 추가`);
    } catch {
      toast.error("이미지 처리 실패");
    }
  };

  const removePhoto = (i: number) => {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, j) => j !== i) }));
  };

  const handleSave = () => {
    // 일시 재파싱 → YYMMDD 갱신
    const dateStr = effectiveValue(draft.date);
    const ymd = reparseDateYMD(dateStr);
    const updated: MeetingOperationsRow = {
      ...draft,
      dateY: ymd.y || draft.dateY,
      dateM: ymd.m || draft.dateM,
      dateD: ymd.d || draft.dateD,
      dateYymmdd: ymd.yymmdd || draft.dateYymmdd,
    };
    // 빈값 재계산
    updated.hasEmpty =
      !effectiveValue(updated.location) ||
      !effectiveValue(updated.author) ||
      !updated.dateYymmdd;
    onSave(updated);
    onOpenChange(false);
    toast.success(`#${index + 1}번 회의록 수정`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            #{index + 1}번 회의록 — {effectiveValue(draft.location) || "(장소 미정)"}
          </DialogTitle>
          <DialogDescription>
            증빙번호: {draft.evidenceNos.join(", ")} ·{" "}
            {draft.evidenceNos.length > 1 ? "결제 다중 — 동일 PDF 사본 N개로 출력" : "단일"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 헤더 정보 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">기본 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldEditor
                label="일시"
                field={draft.date}
                fieldKey="date"
                onChange={(v) => setField("date", v)}
              />
              <FieldEditor
                label="시간"
                field={draft.time}
                fieldKey="time"
                onChange={(v) => setField("time", v)}
              />
              <FieldEditor
                label="장소"
                field={draft.location}
                fieldKey="location"
                onChange={(v) => setField("location", v)}
              />
              <FieldEditor
                label="작성자"
                field={draft.author}
                fieldKey="author"
                onChange={(v) => setField("author", v)}
              />
            </div>
          </section>

          <Separator />

          {/* 키워드 (PDF 미포함, AI 생성 입력) */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                키워드{" "}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  PDF 에는 포함되지 않음 · AI 자동 생성 입력값
                </span>
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={expanding || !effectiveValue(draft.keywords).trim()}
                onClick={async () => {
                  setExpanding(true);
                  try {
                    const r = await fetch("/api/meeting/expand", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        keywords: effectiveValue(draft.keywords),
                        date: effectiveValue(draft.date),
                        time: effectiveValue(draft.time),
                        location: effectiveValue(draft.location),
                        author: effectiveValue(draft.author),
                        attendees: effectiveValue(draft.attendees),
                      }),
                    });
                    const data = (await r.json()) as {
                      agenda?: string;
                      content?: string;
                      decisions?: string;
                      schedule?: string;
                      error?: string;
                    };
                    if (!r.ok) {
                      toast.error(data.error || "AI 생성 실패");
                      return;
                    }
                    setDraft((d) => ({
                      ...d,
                      agenda: { ...d.agenda, selectedIndex: -1, override: data.agenda ?? "", aiGenerated: true },
                      content: { ...d.content, selectedIndex: -1, override: data.content ?? "", aiGenerated: true },
                      decisions: { ...d.decisions, selectedIndex: -1, override: data.decisions ?? "", aiGenerated: true },
                      schedule: { ...d.schedule, selectedIndex: -1, override: data.schedule ?? "", aiGenerated: true },
                    }));
                    toast.success("AI 본문 4개 칸 생성 완료");
                  } catch (e) {
                    toast.error(String((e as Error).message ?? e));
                  } finally {
                    setExpanding(false);
                  }
                }}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                {expanding ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                키워드로 4필드 재생성
              </Button>
            </div>
            <FieldEditor
              label="키워드 (원본)"
              field={draft.keywords}
              fieldKey="keywords"
              onChange={(v) => setField("keywords", v)}
              textarea
            />
          </section>

          <Separator />

          {/* 본문 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">본문</h3>
            <FieldEditor
              label="회의 안건 / 목적"
              field={draft.agenda}
              fieldKey="agenda"
              onChange={(v) => setField("agenda", v)}
              textarea
              refinable
            />
            <FieldEditor
              label="회의 내용"
              field={draft.content}
              fieldKey="content"
              onChange={(v) => setField("content", v)}
              textarea
              refinable
            />
            <FieldEditor
              label="결정 및 협의사항"
              field={draft.decisions}
              fieldKey="decisions"
              onChange={(v) => setField("decisions", v)}
              textarea
              refinable
            />
            <FieldEditor
              label="향후 일정"
              field={draft.schedule}
              fieldKey="schedule"
              onChange={(v) => setField("schedule", v)}
              textarea
              refinable
            />
          </section>

          <Separator />

          {/* 참석자 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              참석자{" "}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (콤마로 구분 — {parseAttendees(effectiveValue(draft.attendees)).length}명)
              </span>
            </h3>
            <FieldEditor
              label="참석자 명단"
              field={draft.attendees}
              fieldKey="attendees"
              onChange={(v) => setField("attendees", v)}
              textarea
            />
          </section>

          <Separator />

          {/* 사진 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                사진 / 영수증{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({draft.photos.length}/{MAX_PHOTOS})
                </span>
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={draft.photos.length >= MAX_PHOTOS}
                onClick={() => photoInputRef.current?.click()}
                className="gap-1"
              >
                <ImageIcon className="size-3.5" /> 사진 추가
              </Button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleAddPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {draft.photos.length === 0 ? (
              <p className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                사진/영수증을 첨부하면 PDF 마지막 페이지가 채워져요. 최대 {MAX_PHOTOS}장 (2x3).
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {draft.photos.map((src, i) => (
                  <div
                    key={i}
                    className="relative aspect-[1.2/1] overflow-hidden rounded-md border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`사진 ${i + 1}`} className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute right-1 top-1 rounded bg-background/80 p-1 hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
   메인
   ============================================================ */

export function MeetingOperationsTool() {
  const [step, setStep] = useState<AppStep>("input");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [csvDragging, setCsvDragging] = useState(false);

  const [rows, setRows] = useState<MeetingOperationsRow[]>([]);
  const [settings, setSettings] = useState<MeetingOperationsSettings>(
    DEFAULT_MEETING_OP_SETTINGS,
  );
  const [layout, setLayout] = useState<MeetingOperationsLayoutSettings>(
    DEFAULT_MEETING_OP_LAYOUT,
  );

  const [previewI, setPreviewI] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);

  const [genPending, setGenPending] = useState(false);
  const [genProgress, setGenProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [resultFiles, setResultFiles] = useState<{ name: string }[]>([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  // 어드민 설정 로드
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, l] = await Promise.all([
          getMeetingOperationsSettings(),
          getMeetingOperationsLayoutSettings(),
        ]);
        if (!active) return;
        setSettings(s);
        setLayout(l);
      } catch (e) {
        console.warn("settings load failed", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const okCount = useMemo(
    () => rows.filter((r) => !r.hasEmpty && r.fieldWarnings.length === 0).length,
    [rows],
  );
  const warnCount = rows.length - okCount;

  const totalEvidence = useMemo(
    () => rows.reduce((acc, r) => acc + r.evidenceNos.length, 0),
    [rows],
  );

  const doParse = useCallback(async () => {
    if (!csvFile) return;
    setParsing(true);
    try {
      const text = await readFileText(csvFile);
      const result = parseMeetingOperationsCsv(text);
      if (result.rows.length === 0) {
        toast.error("CSV 에서 회의록 행을 찾지 못했어요. 헤더(증빙번호/일시/장소)를 확인해 주세요.");
        return;
      }
      setRows(result.rows);
      setStep("validate");
      toast.success(
        `${result.totalSourceRows}행 → ${result.rows.length}회의로 묶음`,
      );
    } catch (e) {
      console.error(e);
      toast.error("파싱 실패");
    } finally {
      setParsing(false);
    }
  }, [csvFile]);

  useEffect(() => {
    if (step === "input" && csvFile) {
      void doParse();
    }
  }, [csvFile, step, doParse]);

  const makeBlobFor = useCallback(
    async (row: MeetingOperationsRow) => {
      registerPdfFonts();
      return pdf(
        <MeetingOperationsDocument row={row} settings={settings} layout={layout} />,
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
    toast.success(`#${index + 1}번 행 삭제`);
  };

  const onSaveEdit = (updated: MeetingOperationsRow) => {
    if (editIndex === null) return;
    setRows((prev) => prev.map((r, i) => (i === editIndex ? updated : r)));
    if (editIndex === previewI) {
      void onPreviewIndex(editIndex);
    }
  };

  const doGenerate = useCallback(async () => {
    setGenPending(true);
    setResultFiles([]);
    // 총 출력 파일 수: 각 행의 증빙번호 수 합
    const total = rows.reduce((acc, r) => acc + r.evidenceNos.length, 0);
    setGenProgress({ current: 0, total });
    try {
      const z = new JSZip();
      const seen = new Set<string>();
      const files: { name: string }[] = [];
      let cur = 0;
      for (const r of rows) {
        // 한 번만 PDF 생성 → 파일명만 다르게 N개
        const blob = await makeBlobFor(r);
        const arrayBuf = await blob.arrayBuffer();
        for (const ev of r.evidenceNos) {
          cur++;
          setGenProgress({ current: cur, total });
          let name = makeMeetingOperationsFilename(r, ev, settings);
          if (seen.has(name)) {
            const base = name.replace(/\.pdf$/, "");
            let n = 2;
            while (seen.has(`${base}_${n}.pdf`)) n++;
            name = `${base}_${n}.pdf`;
          }
          seen.add(name);
          z.file(name, arrayBuf);
          files.push({ name });
        }
      }
      const zipBlob = await z.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, zipName());
      setResultFiles(files);
      setStep("result");
      toast.success(`${files.length}장 PDF ZIP 다운로드 완료`);
    } catch (e) {
      console.error(e);
      toast.error("ZIP 생성 실패");
    } finally {
      setGenPending(false);
      setGenProgress(null);
    }
  }, [rows, makeBlobFor, settings]);

  const previewStarted = useRef(false);
  const autoExpandStarted = useRef(false);
  useEffect(() => {
    if (step !== "validate" || !rows.length || previewStarted.current) return;
    previewStarted.current = true;
    void onPreviewIndex(0);
  }, [step, rows.length, onPreviewIndex]);

  // 검토 진입 시 자동으로 키워드 → 4필드 AI 생성 (한 번만)
  useEffect(() => {
    if (step !== "validate" || !rows.length || autoExpandStarted.current) return;
    const targetIndices = rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) => allBodyEmpty(r) && effectiveValue(r.keywords).trim() !== "",
      )
      .map(({ i }) => i);
    if (targetIndices.length === 0) return;
    autoExpandStarted.current = true;

    (async () => {
      toast(`${targetIndices.length}건 AI 본문 자동 생성 중...`);
      const results = await Promise.all(
        targetIndices.map(async (idx) => {
          const r = rows[idx];
          try {
            const resp = await fetch("/api/meeting/expand", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                keywords: effectiveValue(r.keywords),
                date: effectiveValue(r.date),
                time: effectiveValue(r.time),
                location: effectiveValue(r.location),
                author: effectiveValue(r.author),
                attendees: effectiveValue(r.attendees),
              }),
            });
            const data = (await resp.json()) as {
              agenda?: string;
              content?: string;
              decisions?: string;
              schedule?: string;
              error?: string;
            };
            if (!resp.ok) {
              return { idx, ok: false as const, error: data.error || "fail" };
            }
            return { idx, ok: true as const, data };
          } catch (e) {
            return { idx, ok: false as const, error: String((e as Error).message ?? e) };
          }
        }),
      );

      setRows((prev) => {
        const next = [...prev];
        for (const res of results) {
          const r = next[res.idx];
          if (!r) continue;
          if (res.ok) {
            const d = res.data;
            const keysMap: Record<BodyFieldKey, string | undefined> = {
              agenda: d.agenda,
              content: d.content,
              decisions: d.decisions,
              schedule: d.schedule,
            };
            const updated = { ...r };
            for (const k of BODY_FIELD_KEYS) {
              const v = (keysMap[k] ?? "").trim();
              if (!v) continue;
              updated[k] = {
                ...r[k],
                selectedIndex: -1,
                override: v,
                aiGenerated: true,
              };
            }
            next[res.idx] = updated;
          } else {
            next[res.idx] = {
              ...r,
              fieldWarnings: [...r.fieldWarnings, `AI 자동 생성 실패: ${res.error}`],
            };
          }
        }
        return next;
      });

      const okCount = results.filter((x) => x.ok).length;
      const failCount = results.length - okCount;
      if (failCount === 0) {
        toast.success(`AI 본문 ${okCount}건 생성 완료`);
      } else if (okCount === 0) {
        toast.error(`AI 본문 생성 모두 실패 (${failCount}건)`);
      } else {
        toast.warning(`AI 본문 ${okCount}건 성공 / ${failCount}건 실패`);
      }
      // 현재 미리보기 행이 갱신됐다면 다시 렌더
      void onPreviewIndex(previewI);
    })();
  }, [step, rows, onPreviewIndex, previewI]);

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
          <h1 className="text-xl font-bold tracking-tight">운영회의록</h1>
          <p className="text-sm text-muted-foreground">
            CSV → 회의 단위 묶음 → 회의록·서명부·사진 PDF 일괄 생성
          </p>
        </div>
        <StepIndicator current={step} onBack={(id) => setStep(id)} />
      </div>

      {step === "input" && (
        <Card className="mx-auto max-w-3xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg">1. 자료</CardTitle>
            <CardDescription className="text-xs">
              운영회의록 데이터 CSV 1개를 올리면 자동으로 다음 단계로 넘어가요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">D-2 운영회의록 CSV</Label>
              <button
                type="button"
                onClick={() => document.getElementById("meeting-csv-input")?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setCsvDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setCsvDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setCsvDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (!f) return;
                  if (!/\.csv$/i.test(f.name)) {
                    toast.error("CSV 파일만 올려주세요");
                    return;
                  }
                  setCsvFile(f);
                }}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg border-2 border-dashed p-4 transition-colors",
                  csvDragging
                    ? "border-primary bg-muted/40"
                    : csvFile
                      ? "border-emerald-300 bg-emerald-50/40"
                      : "border-border bg-muted/10 hover:border-primary hover:bg-muted/30",
                )}
              >
                <div className="flex w-full items-center gap-2">
                  {parsing ? (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  ) : csvFile ? (
                    <CheckCircle2 className="size-5 text-emerald-600" />
                  ) : (
                    <FileUp className="size-5 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-medium">
                    {csvFile?.name ?? "회의비 - 운영회의록 데이터.csv"}
                  </span>
                </div>
                {csvFile ? (
                  <span className="text-[11px] text-muted-foreground">
                    클릭 또는 드래그하면 다른 파일로 교체
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    클릭하거나 파일을 끌어다 놓으세요
                  </span>
                )}
              </button>
              <input
                id="meeting-csv-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setCsvFile(f);
                  e.target.value = "";
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                헤더: 증빙번호 / 일시 / 시간 / 장소 / 작성자 / 회의 안건·목적 / 회의 내용 / 결정 및 협의사항 / 향후 일정 / 참석자
              </p>
            </div>
            {parsing && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 파싱 중...
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
                  <iframe src={previewUrl} className="size-full" title="회의록 미리보기" />
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
                <CardTitle className="text-base">
                  회의 목록 ({rows.length}) · 출력 PDF {totalEvidence}장
                </CardTitle>
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
                const conflicts: string[] = [];
                if (hasConflict(r.agenda)) conflicts.push("안건");
                if (hasConflict(r.content)) conflicts.push("내용");
                if (hasConflict(r.decisions)) conflicts.push("결정");
                if (hasConflict(r.schedule)) conflicts.push("일정");
                if (hasConflict(r.author)) conflicts.push("작성자");
                if (hasConflict(r.attendees)) conflicts.push("참석자");
                const noAuthor = !effectiveValue(r.author);
                const aiBody = hasAiGeneratedBody(r);
                const partialEmpty = partialBodyEmpty(r);
                const hasWarn = r.hasEmpty || r.fieldWarnings.length > 0 || conflicts.length > 0 || partialEmpty;

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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">#{i + 1}</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {r.evidenceNos.join(", ")}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {effectiveValue(r.location) || "(장소 미정)"}
                        </span>
                        {r.evidenceNos.length > 1 && (
                          <Badge
                            variant="outline"
                            className="border-blue-300 text-[10px] text-blue-700"
                          >
                            묶음 {r.evidenceNos.length}건
                          </Badge>
                        )}
                        {noAuthor && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-[10px] text-amber-700"
                          >
                            작성자 누락
                          </Badge>
                        )}
                        {conflicts.length > 0 && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-[10px] text-amber-700"
                          >
                            충돌: {conflicts.join("·")}
                          </Badge>
                        )}
                        {aiBody && (
                          <Badge
                            variant="outline"
                            className="border-violet-300 text-[10px] text-violet-700"
                          >
                            ✨ AI 생성됨
                          </Badge>
                        )}
                        {partialEmpty && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-[10px] text-amber-700"
                          >
                            내용 생성 필요
                          </Badge>
                        )}
                        {!hasWarn && (
                          <Badge
                            variant="outline"
                            className="border-emerald-300 text-[10px] text-emerald-700"
                          >
                            양호
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                          effectiveValue(r.date),
                          effectiveValue(r.time),
                          `참석 ${parseAttendees(effectiveValue(r.attendees)).length}명`,
                          `사진 ${r.photos.length}/${MAX_PHOTOS}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {r.fieldWarnings.length > 0 && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                          <span>{r.fieldWarnings.join(" / ")}</span>
                        </div>
                      )}
                      {partialEmpty && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                          <span>
                            본문 일부가 비어있어요. 편집 ✏️ → "키워드로 4필드 재생성" 또는 직접 입력으로 채워주세요.
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        aria-label="편집"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditIndex(i);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRow(i);
                        }}
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
                    <Download className="size-4" /> ZIP으로 받기 ({totalEvidence}장)
                  </>
                )}
              </Button>
            </div>
          </Card>

          {editIndex !== null && rows[editIndex] && (
            <MeetingRowEditDialog
              row={rows[editIndex]}
              index={editIndex}
              open={editIndex !== null}
              onOpenChange={(v) => {
                if (!v) setEditIndex(null);
              }}
              onSave={onSaveEdit}
            />
          )}
        </div>
      )}

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
                setCsvFile(null);
              }}
            >
              <Wand2 className="size-4" /> 처음으로
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
