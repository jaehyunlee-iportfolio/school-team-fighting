"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { BusinessReturnDocument } from "@/components/pdf/business-return-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { getPdfPageCount } from "@/lib/pdf/page-count";
import { compactReturnLayout } from "@/lib/pdf/compact-return-layout";
import {
  MAX_RETURN_PHOTOS,
  type ReturnRow,
  parseReturnInput,
  recomputeReturnWarnings,
  normalizePeriod,
} from "@/lib/csv/parseReturn";
import { resizeImageToDataUrl } from "@/lib/images/resize";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  getReturnSettings,
  getReturnLayoutSettings,
  type ReturnApprovalCell,
  type ReturnApprovalCellType,
  type ReturnSettings,
  type ReturnLayoutSettings,
} from "@/lib/firebase/firestore";

type AppStep = "input" | "validate" | "result";

const STEPS: { id: AppStep; label: string; desc: string }[] = [
  { id: "input", label: "자료", desc: "파일" },
  { id: "validate", label: "검토", desc: "내용" },
  { id: "result", label: "끝", desc: "저장" },
];

const CELL_TITLES = ["담당", "팀장", "본부장"] as const;

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

function returnPdfName(row: ReturnRow): string {
  const pk = fileSafe(row.primaryKey || "UNKNOWN");
  const name = row.name?.trim() ? fileSafe(row.name) : "UNKNOWN";
  const dest = row.destination?.trim() ? fileSafe(row.destination).slice(0, 30) : "UNKNOWN";
  const date = row.startYymmdd || "UNKNOWN";
  return `${pk}_3. 내부결재문서_출장복명서_${name}_${dest}_${date}.pdf`;
}

function zipName() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `출장복명서_모음_${date}_${hh}시${mm}분.zip`;
}

/* ─────────────────────────────────────────────────────────────────
 * 결재 셀 에디터
 * ─────────────────────────────────────────────────────────────── */

function ApprovalCellEditor({
  index,
  cell,
  onChange,
  isFixedTextSync,
  syncedText,
}: {
  index: number;
  cell: ReturnApprovalCell;
  onChange: (next: ReturnApprovalCell) => void;
  /** 셀 0 (담당)은 type=text 고정 + 본문이 출장자 성명과 동기화 */
  isFixedTextSync?: boolean;
  syncedText?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageFile = async (file: File) => {
    try {
      const dataUrl = await readDataUrl(file);
      onChange({ ...cell, type: "image", imageUrl: dataUrl });
    } catch {
      toast.error("이미지를 읽지 못했어요.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          셀 {index + 1} · 기본 {CELL_TITLES[index]}
        </span>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">헤더 라벨</Label>
        <Input
          value={cell.label}
          onChange={(e) => onChange({ ...cell, label: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">내용 종류</Label>
        <div className="flex gap-2">
          {(["text", "image", "diagonal"] as ReturnApprovalCellType[]).map((t) => {
            const disabled = isFixedTextSync && t !== "text";
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...cell, type: t })}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  cell.type === t
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:bg-muted",
                  disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                {t === "text" ? "글자" : t === "image" ? "이미지" : "대각선(/)"}
              </button>
            );
          })}
        </div>
        {isFixedTextSync && (
          <p className="text-[10px] text-muted-foreground">
            담당 셀은 글자 고정. 출장자 성명이 자동 매핑돼요.
          </p>
        )}
      </div>
      {cell.type === "text" && (
        <div className="space-y-1.5">
          <Label className="text-xs">본문</Label>
          <Input
            value={isFixedTextSync ? (syncedText ?? cell.text) : cell.text}
            disabled={isFixedTextSync}
            onChange={(e) => onChange({ ...cell, text: e.target.value })}
          />
        </div>
      )}
      {cell.type === "image" && (
        <div className="space-y-1.5">
          <Label className="text-xs">서명 이미지</Label>
          <div className="flex items-center gap-3">
            <div
              className="size-16 shrink-0 overflow-hidden rounded border bg-muted/30 flex items-center justify-center"
            >
              {cell.imageUrl ? (
                <img src={cell.imageUrl} alt="서명" className="size-full object-contain" />
              ) : (
                <ImageIcon className="size-5 text-muted-foreground/50" />
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageFile(f);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {cell.imageUrl ? "교체" : "업로드"}
            </Button>
            {cell.imageUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => onChange({ ...cell, imageUrl: "" })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">셀 하단 작은 글씨 (선택, 예: 전결)</Label>
        <Input
          value={cell.annotation}
          onChange={(e) => onChange({ ...cell, annotation: e.target.value })}
          placeholder=""
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Row 편집 다이얼로그
 * ─────────────────────────────────────────────────────────────── */

function ReturnRowEditDialog({
  row,
  index,
  open,
  onOpenChange,
  onSave,
}: {
  row: ReturnRow;
  index: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated: ReturnRow) => void;
}) {
  const [draft, setDraft] = useState<ReturnRow>(row);

  useEffect(() => {
    if (open) setDraft(row);
  }, [open, row]);

  // 출장자 이름 변경 시 셀 0(담당, type=text)의 text를 자동 동기화
  useEffect(() => {
    setDraft((d) => {
      const cell0 = d.approval[0];
      if (cell0.type === "text" && cell0.text !== d.name) {
        const newApproval = [...d.approval] as [ReturnApprovalCell, ReturnApprovalCell, ReturnApprovalCell];
        newApproval[0] = { ...cell0, text: d.name };
        return { ...d, approval: newApproval };
      }
      return d;
    });
  }, [draft.name]);

  const handleSave = () => {
    // 출장기간 재파싱
    const periodNorm = normalizePeriod(draft.periodRaw);
    const updated = recomputeReturnWarnings({
      ...draft,
      periodText: periodNorm.periodText,
      startYymmdd: periodNorm.startYymmdd,
      invalidPeriod: periodNorm.invalid,
    });
    onSave(updated);
    onOpenChange(false);
    toast.success(`#${index + 1}번 행을 수정했어요`);
  };

  const setApprovalCell = (i: 0 | 1 | 2, next: ReturnApprovalCell) => {
    setDraft((d) => {
      const arr = [...d.approval] as [ReturnApprovalCell, ReturnApprovalCell, ReturnApprovalCell];
      arr[i] = next;
      return { ...d, approval: arr };
    });
  };

  const dialogPhotoInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const handleDialogAddPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("이미지 파일만 업로드할 수 있어요");
      return;
    }
    try {
      const dataUrls = await Promise.all(list.map((f) => resizeImageToDataUrl(f)));
      const remain = Math.max(MAX_RETURN_PHOTOS - draftRef.current.photos.length, 0);
      const take = dataUrls.slice(0, remain);
      const added = take.length;
      const skipped = dataUrls.length - added;
      if (added === 0) {
        toast.error(`사진은 최대 ${MAX_RETURN_PHOTOS}장까지 첨부할 수 있어요`);
        return;
      }
      setDraft((d) => ({ ...d, photos: [...d.photos, ...take].slice(0, MAX_RETURN_PHOTOS) }));
      if (skipped > 0) {
        toast.success(`사진 ${added}장 추가 (${skipped}장 제외)`);
      }
    } catch {
      toast.error("사진 처리 중 오류가 발생했어요");
    }
  };
  const removeDialogPhoto = (i: number) => {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, idx) => idx !== i) }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>#{index + 1}번 행 수정 ({draft.primaryKey || "UNKNOWN"})</DialogTitle>
          <DialogDescription>
            기본 필드와 결재 3 셀을 직접 수정해요. 저장하면 PDF에 즉시 반영돼요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* 기본 필드 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Primary Key</Label>
              <Input
                value={draft.primaryKey}
                onChange={(e) => setDraft((d) => ({ ...d, primaryKey: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">출장자 성명</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm font-medium">출장자 소속</Label>
              <Input
                value={draft.org}
                onChange={(e) => setDraft((d) => ({ ...d, org: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm font-medium">출장기간</Label>
              <Input
                value={draft.periodRaw}
                onChange={(e) => setDraft((d) => ({ ...d, periodRaw: e.target.value }))}
                placeholder="2025.07.16. ~ 2025.07.16. 또는 25년 7월 8일 ~ 25년 7월 8일"
              />
              <p className="text-xs text-muted-foreground">
                현재 인식: <span className="font-mono">{normalizePeriod(draft.periodRaw).periodText || "(파싱 실패)"}</span>
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm font-medium">출장지</Label>
              <Input
                value={draft.destination}
                onChange={(e) => setDraft((d) => ({ ...d, destination: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm font-medium">출장목적</Label>
              <Input
                value={draft.purpose}
                onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">출장경비</Label>
              <Input
                value={draft.cost}
                onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">정산방법</Label>
              <Input
                value={draft.payment}
                onChange={(e) => setDraft((d) => ({ ...d, payment: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">출장경비 주석 (작은 글씨)</Label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      costAnnotation: d.costAnnotation
                        ? ""
                        : "*출장비 산정 내역서 별도 첨부",
                    }))
                  }
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {draft.costAnnotation ? "주석 제거" : "별도첨부 문구 자동 입력"}
                </button>
              </div>
              <Input
                value={draft.costAnnotation}
                onChange={(e) => setDraft((d) => ({ ...d, costAnnotation: e.target.value }))}
                placeholder="비워두면 표시되지 않아요"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">업무내용</Label>
            <textarea
              className="flex min-h-40 w-full rounded-xl border border-input bg-card px-3 py-2 font-mono text-xs transition-colors outline-none focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10"
              value={draft.workContent}
              onChange={(e) => setDraft((d) => ({ ...d, workContent: e.target.value }))}
              placeholder="- 면담 개요 | -- 학교: ... | --- 일정: ..."
            />
            <p className="text-xs text-muted-foreground">
              ` | `로 항목 구분, `-`/`--`/`---`로 계층 표시 (작성규칙 참조)
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">특이사항</Label>
            <textarea
              className="flex min-h-20 w-full rounded-xl border border-input bg-card px-3 py-2 font-mono text-xs transition-colors outline-none focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="없음 (또는 -- 항목)"
            />
          </div>

          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                첨부 사진 <span className="font-normal text-muted-foreground">({draft.photos.length}/{MAX_RETURN_PHOTOS})</span>
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={draft.photos.length >= MAX_RETURN_PHOTOS}
                onClick={() => dialogPhotoInputRef.current?.click()}
              >
                <ImageIcon className="size-4" /> 사진 추가
              </Button>
              <input
                ref={dialogPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleDialogAddPhotos(e.target.files);
                  if (dialogPhotoInputRef.current) dialogPhotoInputRef.current.value = "";
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              사진을 첨부하면 PDF 2페이지가 자동 생성돼요. 최대 {MAX_RETURN_PHOTOS}장.
            </p>
            {draft.photos.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
                첨부된 사진이 없어요
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {draft.photos.map((src, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`사진 ${i + 1}`} className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeDialogPhoto(i)}
                      className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover:opacity-100"
                      aria-label={`사진 ${i + 1} 삭제`}
                    >
                      <X className="size-3.5" />
                    </button>
                    <span className="absolute bottom-1 left-1 inline-flex size-5 items-center justify-center rounded bg-background/80 text-[10px] font-medium text-foreground">
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">결재 라인 (3 셀)</h3>
            <p className="text-xs text-muted-foreground">
              헤더 라벨, 내용 종류(글자/이미지/대각선), 본문/이미지, 하단 작은 글씨를 셀별로 설정해요.
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <ApprovalCellEditor
                index={0}
                cell={draft.approval[0]}
                onChange={(c) => setApprovalCell(0, c)}
                isFixedTextSync
                syncedText={draft.name}
              />
              <ApprovalCellEditor
                index={1}
                cell={draft.approval[1]}
                onChange={(c) => setApprovalCell(1, c)}
              />
              <ApprovalCellEditor
                index={2}
                cell={draft.approval[2]}
                onChange={(c) => setApprovalCell(2, c)}
              />
            </div>
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

/* ─────────────────────────────────────────────────────────────────
 * Row 카드
 * ─────────────────────────────────────────────────────────────── */

function ReturnRowCard({
  r,
  index,
  selected,
  pageInfo,
  onSelect,
  onEdit,
  onRemove,
  onAddPhotos,
}: {
  r: ReturnRow;
  index: number;
  selected: boolean;
  pageInfo?: { pageCount: number; compacted: boolean };
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onAddPhotos: (files: FileList | null) => void;
}) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const remaining = MAX_RETURN_PHOTOS - r.photos.length;
  return (
    <div
      className={cn(
        "relative w-full rounded-lg border p-3 text-left transition",
        selected ? "border-foreground/20 bg-muted shadow-sm" : "border-border bg-card hover:bg-muted/50"
      )}
    >
      <button
        type="button"
        className="absolute inset-0 outline-none"
        onClick={onSelect}
        aria-label={`${index + 1}번 행 선택`}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            <span className="text-muted-foreground">#{index + 1}</span>{" "}
            <span className="font-mono text-xs text-muted-foreground">{r.primaryKey || "UNKNOWN"}</span>{" "}
            · {r.name || "—"} · {r.destination || "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.periodText || "(기간 미인식)"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {r.approval.map((c, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {c.label}: {c.type === "text" ? "글자" : c.type === "image" ? (c.imageUrl ? "이미지✓" : "이미지✗") : "대각선"}
              </Badge>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-1.5 shrink-0">
          {pageInfo && pageInfo.compacted && (
            <Badge variant="secondary" className="text-[10px] sm:text-xs">압축</Badge>
          )}
          {pageInfo && pageInfo.pageCount >= 2 && (() => {
            const expected = 1 + (r.photos.length > 0 ? 1 : 0);
            const overflow = pageInfo.pageCount > expected;
            return (
              <Badge
                variant={overflow ? "destructive" : "secondary"}
                className="text-[10px] sm:text-xs"
              >
                {pageInfo.pageCount}장
              </Badge>
            );
          })()}
          {r.hasEmpty ? (
            <Badge variant="destructive" className="text-[10px] sm:text-xs">누락</Badge>
          ) : (
            <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] sm:text-xs">
              양호
            </Badge>
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
            className="relative inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            onClick={(e) => {
              e.stopPropagation();
              if (remaining > 0) photoInputRef.current?.click();
            }}
            disabled={remaining <= 0}
            aria-label={`${index + 1}번 행 사진 추가 (현재 ${r.photos.length}/${MAX_RETURN_PHOTOS})`}
            title={remaining > 0 ? `사진 추가 (${r.photos.length}/${MAX_RETURN_PHOTOS})` : `최대 ${MAX_RETURN_PHOTOS}장`}
          >
            <ImageIcon className="size-3.5" />
            {r.photos.length > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-foreground text-[8px] font-bold text-background">
                {r.photos.length}
              </span>
            )}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onAddPhotos(e.target.files);
              if (photoInputRef.current) photoInputRef.current.value = "";
            }}
          />
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
      {r.hasEmpty && r.fieldWarnings.length > 0 && (
        <ul className="relative z-10 mt-2 list-inside list-disc text-[10px] text-amber-700 dark:text-amber-400 sm:text-xs">
          {r.fieldWarnings.map((w) => (
            <li key={w} className="line-clamp-2">{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * StepIndicator
 * ─────────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────────
 * Main
 * ─────────────────────────────────────────────────────────────── */

export function ReturnTool() {
  const [step, setStep] = useState<AppStep>("input");
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const rowsRef = useRef<ReturnRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const [settings, setSettings] = useState<ReturnSettings | null>(null);
  const [layout, setLayout] = useState<ReturnLayoutSettings | null>(null);
  const [parsePending, setParsePending] = useState(false);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [genPending, setGenPending] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultFiles, setResultFiles] = useState<{ name: string; pageCount: number; compacted: boolean; hasPhotos: boolean }[]>([]);
  const [previewI, setPreviewI] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [pageInfo, setPageInfo] = useState<Record<number, { pageCount: number; compacted: boolean }>>({});
  const [pageInfoProgress, setPageInfoProgress] = useState<{ done: number; total: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewStart = useRef(false);
  const measureToken = useRef(0);

  const okCount = useMemo(() => rows.filter((r) => !r.hasEmpty).length, [rows]);
  const warnCount = useMemo(() => rows.filter((r) => r.hasEmpty).length, [rows]);

  useEffect(() => {
    getReturnSettings().then(setSettings).catch(console.error);
    getReturnLayoutSettings().then(setLayout).catch(console.error);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!settings) {
        toast.error("어드민 설정 로딩 중이에요. 잠시 후 다시 시도해주세요.");
        return;
      }
      setParsePending(true);
      try {
        const text = await readFileText(file);
        const parsed = parseReturnInput(file.name, text, settings);
        if (!parsed.length) {
          toast.error("출장복명서 데이터를 찾지 못했어요.");
          return;
        }
        setRows(parsed);
        setStep("validate");
        toast.success(`${parsed.length}행을 읽었어요.`);
      } catch (e) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "파일을 읽지 못했어요.");
      } finally {
        setParsePending(false);
      }
    },
    [settings]
  );

  const updateRow = useCallback((index: number, updated: ReturnRow) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const addPhotosToRow = useCallback(async (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("이미지 파일만 업로드할 수 있어요");
      return;
    }
    try {
      const dataUrls = await Promise.all(list.map((f) => resizeImageToDataUrl(f)));
      const current = rowsRef.current[index];
      if (!current) return;
      const remain = Math.max(MAX_RETURN_PHOTOS - current.photos.length, 0);
      const take = dataUrls.slice(0, remain);
      const added = take.length;
      const skipped = dataUrls.length - added;
      if (added === 0) {
        toast.error(`사진은 최대 ${MAX_RETURN_PHOTOS}장까지 첨부할 수 있어요`);
        return;
      }
      setRows((prev) => {
        const next = [...prev];
        const r = next[index];
        if (!r) return prev;
        next[index] = { ...r, photos: [...r.photos, ...take].slice(0, MAX_RETURN_PHOTOS) };
        return next;
      });
      if (skipped > 0) {
        toast.success(`사진 ${added}장 추가 (${skipped}장은 ${MAX_RETURN_PHOTOS}장 한도 초과로 제외)`);
      } else {
        toast.success(`사진 ${added}장 추가`);
      }
    } catch {
      toast.error("사진 처리 중 오류가 발생했어요");
    }
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

  const makeBlobFor = useCallback(
    async (row: ReturnRow, layoutOverride?: ReturnLayoutSettings) => {
      registerPdfFonts();
      return pdf(
        <BusinessReturnDocument row={row} layout={layoutOverride ?? layout ?? undefined} />
      ).toBlob();
    },
    [layout]
  );

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
        toast.error("미리보기 생성 실패");
      } finally {
        setPreviewPending(false);
      }
    },
    [rows, settings, makeBlobFor]
  );

  // 검토 진입 시 첫 행 미리보기
  useEffect(() => {
    if (step !== "validate" || !rows.length || !settings || previewStart.current) return;
    previewStart.current = true;
    void onPreviewIndex(0);
  }, [step, rows.length, settings, onPreviewIndex]);

  // 검토 진입 시 모든 행의 PDF 페이지 수 측정 (배경 작업)
  useEffect(() => {
    if (step !== "validate" || !rows.length || !settings) return;
    const token = ++measureToken.current;
    setPageInfo({});
    setPageInfoProgress({ done: 0, total: rows.length });
    let cancelled = false;
    (async () => {
      for (let i = 0; i < rows.length; i++) {
        if (cancelled || measureToken.current !== token) return;
        try {
          let blob = await makeBlobFor(rows[i]);
          let pageCount = await getPdfPageCount(blob);
          let compacted = false;
          if (pageCount > 1 && layout) {
            blob = await makeBlobFor(rows[i], compactReturnLayout(layout));
            const c = await getPdfPageCount(blob);
            if (c <= pageCount) {
              pageCount = c;
              compacted = true;
            }
          }
          if (cancelled || measureToken.current !== token) return;
          setPageInfo((prev) => ({ ...prev, [i]: { pageCount, compacted } }));
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
  }, [step, rows, settings, layout, makeBlobFor]);

  // input 진입 시 미리보기 정리
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

  // unmount 시 미리보기 URL 정리
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const doGenerate = useCallback(async () => {
    if (!settings) return;
    setGenPending(true);
    setResultFiles([]);
    setGenProgress({ current: 0, total: rows.length });
    try {
      const z = new JSZip();
      const files: { name: string; pageCount: number; compacted: boolean; hasPhotos: boolean }[] = [];
      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i + 1, total: rows.length });
        const hasPhotos = rows[i].photos.length > 0;
        const expectedPages = 1 + (hasPhotos ? 1 : 0);
        let blob = await makeBlobFor(rows[i]);
        let pageCount = await getPdfPageCount(blob);
        let compacted = false;
        // 본문이 1페이지를 넘어 예상보다 많은 페이지가 나온 경우만 compact 시도
        if (pageCount > expectedPages && layout) {
          const compactBlob = await makeBlobFor(rows[i], compactReturnLayout(layout));
          const compactCount = await getPdfPageCount(compactBlob);
          if (compactCount <= pageCount) {
            blob = compactBlob;
            pageCount = compactCount;
            compacted = true;
          }
        }
        const name = returnPdfName(rows[i]);
        z.file(name, blob);
        files.push({ name, pageCount, compacted, hasPhotos });
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
  }, [rows, settings, makeBlobFor, layout]);

  return (
    <div
      className={cn(
        "mx-auto space-y-6 p-4 transition-[max-width] md:p-8",
        step === "validate" ? "max-w-7xl" : "max-w-3xl"
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">출장복명서</h1>
          <p className="text-sm text-muted-foreground">CSV 또는 JSON에서 출장복명서 PDF를 자동 생성합니다.</p>
        </div>
        <StepIndicator steps={STEPS} current={step} onBack={(id) => setStep(id)} />
      </div>

      {/* STEP 1: 자료 */}
      {step === "input" && (
        <Card className="mx-auto max-w-4xl">
          <CardContent className="space-y-6 pt-6">
            {!settings && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
                어드민에서 출장복명서 기본 결재라인을 먼저 저장해주세요.
              </div>
            )}
            <section className="space-y-3">
              <h2 className="text-sm font-medium">CSV 또는 JSON 파일</h2>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setCsvDragOver(true); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setCsvDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setCsvDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCsvDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (!f) return;
                  const name = f.name.toLowerCase();
                  if (name.endsWith(".csv") || name.endsWith(".json")) handleFile(f);
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-muted/20 px-4 py-10 hover:border-primary hover:bg-muted/40",
                  csvDragOver && "border-primary bg-muted/40"
                )}
              >
                {parsePending ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  <FileUp className="size-8 text-muted-foreground" />
                )}
                <p className="text-sm font-medium">
                  {parsePending ? "파일 읽는 중..." : "CSV 또는 JSON 파일 클릭 또는 드래그하여 업로드"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Primary Key, 출장자_소속, 출장자_성명, 출장기간, 출장지, 출장목적, 업무내용, 특이사항, 출장경비, 출장경비_주석, 정산방법
                </p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </section>

            {settings && (
              <>
                <Separator />
                <section className="space-y-3">
                  <h2 className="text-sm font-medium">결재 서명 미리보기</h2>
                  <p className="text-xs text-muted-foreground">
                    출장자 이름에 따라 자동 매핑됨 — 장인선·김성윤 본인 출장은 팀장 셀이 대각선이 되고, 그 외에는 채영지(팀장) + 장인선(본부장) 서명 사용. 행별 검토 단계에서 오버라이드 가능.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { key: "manager", label: "팀장 (채영지)", url: settings.signatures.manager },
                        { key: "director", label: "본부장 (장인선)", url: settings.signatures.director },
                        { key: "ceo", label: "대표이사 (김성윤)", url: settings.signatures.ceo },
                      ] as const
                    ).map((s) => (
                      <div key={s.key} className="rounded-lg border bg-card p-3">
                        <p className="mb-1.5 text-xs font-semibold">{s.label}</p>
                        <div className="size-16 overflow-hidden rounded border bg-muted/30">
                          {s.url ? (
                            <img src={s.url} alt={s.label} className="size-full object-contain" />
                          ) : (
                            <div className="flex size-full items-center justify-center">
                              <ImageIcon className="size-4 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 2: 검토 */}
      {step === "validate" && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold sm:text-xl">{rows.length}건 읽었어요</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Check className="size-3" /> 양호 {okCount}
            </span>
            {warnCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <AlertTriangle className="size-3" /> 누락 {warnCount}
              </span>
            )}
          </div>

          {rows.length > 0 && (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
              <div className="w-full shrink-0 space-y-3 lg:w-[480px] xl:w-[560px] 2xl:w-[640px]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    PDF 미리보기
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      행 {previewI + 1} / {rows.length}{previewPending ? " · 만드는 중" : ""}
                    </span>
                  </p>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={previewI <= 0} onClick={() => void onPreviewIndex(previewI - 1)}>
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="min-w-12 text-center text-xs font-medium tabular-nums">
                      {previewI + 1} / {rows.length}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={previewI >= rows.length - 1} onClick={() => void onPreviewIndex(previewI + 1)}>
                      <ChevronLeft className="size-4 rotate-180" />
                    </Button>
                  </div>
                </div>
                <div className="relative w-full">
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

              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">행 목록</p>
                  {pageInfoProgress && (
                    <p className="text-[11px] text-muted-foreground">
                      페이지 검사 {pageInfoProgress.done}/{pageInfoProgress.total}
                    </p>
                  )}
                </div>
                <div className="max-h-[min(80vh,56rem)] overflow-y-auto rounded-xl border p-2 lg:max-h-[calc(100vh-14rem)]">
                  <div className="grid gap-2">
                    {rows.map((row, i) => (
                      <ReturnRowCard
                        key={i}
                        r={row}
                        index={i}
                        selected={previewI === i}
                        pageInfo={pageInfo[i]}
                        onSelect={() => void onPreviewIndex(i)}
                        onEdit={() => setEditingRowIdx(i)}
                        onRemove={() => removeRow(i)}
                        onAddPhotos={(files) => void addPhotosToRow(i, files)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setStep("input")}>
              <ChevronLeft className="size-4" />
              이전
            </Button>
            <Button
              size="lg"
              className="w-full gap-2 sm:w-auto sm:min-w-48"
              disabled={genPending || !rows.length || !settings}
              onClick={doGenerate}
            >
              {genPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {genProgress ? `${genProgress.current}/${genProgress.total}` : "준비 중…"}
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  PDF {rows.length}개 ZIP으로 받기
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 행 편집 다이얼로그 */}
      {editingRowIdx !== null && rows[editingRowIdx] && (
        <ReturnRowEditDialog
          row={rows[editingRowIdx]}
          index={editingRowIdx}
          open={editingRowIdx !== null}
          onOpenChange={(v) => { if (!v) setEditingRowIdx(null); }}
          onSave={(updated) => {
            updateRow(editingRowIdx, updated);
            if (previewI === editingRowIdx) void onPreviewIndex(editingRowIdx);
          }}
        />
      )}

      {/* STEP 3: 결과 */}
      {step === "result" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green-500" />
                <h2 className="text-base font-semibold">ZIP 다운로드 완료</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                총 {resultFiles.length}개의 PDF가 ZIP으로 저장됐어요.
                {(() => {
                  const over = resultFiles.filter((f) => f.pageCount > 1 + (f.hasPhotos ? 1 : 0)).length;
                  return over > 0 ? ` · 예상 페이지 초과 ${over}건` : "";
                })()}
              </p>
              <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto">
                {resultFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50">
                    <CheckCircle2 className="size-3 shrink-0 text-green-500" />
                    <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
                    {f.compacted && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">압축 적용</Badge>
                    )}
                    {f.pageCount >= 2 && (
                      <Badge
                        variant={f.pageCount > 1 + (f.hasPhotos ? 1 : 0) ? "destructive" : "secondary"}
                        className="shrink-0 text-[10px]"
                      >
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
