"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  type AuditOptions,
  type AuditWorkbook,
  type IssueCategory,
  type AuditCell,
  type Issue,
} from "@/lib/audit/types";
import {
  applyAutofix,
  defaultAuditOptions,
  reauditWorkbook,
  revertCell,
  runAudit,
} from "@/lib/audit/run";
import { writeWorkbookWithEdits } from "@/lib/audit/excel";
import { buildEditsCsv, buildMarkdownReport } from "@/lib/audit/report";
import {
  getAuditExpenseSettings,
  DEFAULT_AUDIT_EXPENSE_SETTINGS,
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AppStep = "input" | "validate" | "result";

const STEPS: { id: AppStep; label: string }[] = [
  { id: "input", label: "자료" },
  { id: "validate", label: "검토" },
  { id: "result", label: "끝" },
];

type LoadedFile = {
  fileName: string;
  workbook: AuditWorkbook;
  xlsxRef: XLSX.WorkBook;
};

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

function formatCellValue(v: AuditCell["current"]): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toLocaleString() : String(v);
  }
  return String(v);
}

export function AuditExpenseTool() {
  const [step, setStep] = useState<AppStep>("input");
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [loaded, setLoaded] = useState<LoadedFile[]>([]);
  const [options, setOptions] = useState<AuditOptions>(defaultAuditOptions());
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [activeSheetName, setActiveSheetName] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "error" | "warning" | "info">("all");

  // 어드민 설정 로드 → options 디폴트 반영
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await getAuditExpenseSettings();
        if (!active) return;
        setOptions((cur) => ({
          ...cur,
          projectPeriod: s.projectPeriod,
          vatRate: s.vatRate,
          paymentMethods: s.paymentMethods,
          officialOrgNames: s.officialOrgNames,
          enabledCategories: { ...cur.enabledCategories, ...s.defaultCategoryEnabled },
        }));
      } catch {
        // ignore — use defaults
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onPickFiles = (fs: FileList | null) => {
    if (!fs) return;
    const next = Array.from(fs).filter((f) => /\.xlsx$/i.test(f.name));
    if (next.length === 0) {
      toast.error("xlsx 파일만 올릴 수 있어요");
      return;
    }
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, j) => j !== i));
  };

  const doRunAudit = useCallback(async () => {
    if (files.length === 0) {
      toast.error("xlsx 파일을 1개 이상 선택해 주세요");
      return;
    }
    setParsing(true);
    try {
      const out: LoadedFile[] = [];
      for (const f of files) {
        const r = await runAudit(f, options);
        out.push({ fileName: f.name, workbook: r.workbook, xlsxRef: r.xlsxRef });
      }
      setLoaded(out);
      setActiveFileIdx(0);
      setActiveSheetName(out[0]?.workbook.sheets[0]?.name ?? "");
      setStep("validate");
      const totalIssues = out.reduce(
        (acc, lf) =>
          acc +
          lf.workbook.issues.length +
          lf.workbook.sheets.reduce((a, s) => a + s.issues.length, 0),
        0,
      );
      toast.success(`${out.length}개 파일 검사 완료 — 총 ${totalIssues}건 발견`);
    } catch (e) {
      console.error(e);
      toast.error(`검사 실패: ${(e as Error).message?.slice(0, 200)}`);
    } finally {
      setParsing(false);
    }
  }, [files, options]);

  const reaudit = useCallback(async () => {
    if (loaded.length === 0) return;
    setParsing(true);
    try {
      const next: LoadedFile[] = [];
      for (const lf of loaded) {
        // 동일 파일 재검사하려면 원본 ArrayBuffer 필요. 대신 현재 cells 상태 유지하고 검증만 다시.
        // 간단화: 파일을 다시 읽지 않고 sheets/issues 만 재계산하기엔 코드 중복 → 우선은 원본 파일 재호출
        // (사용자가 검토 단계에서 편집한 셀 상태는 유지해야 하므로 단순 재검사로는 안 됨)
        // → cells 상태를 보존한 새 검증을 실행.
        const refreshed = revalidateLoaded(lf, options);
        next.push(refreshed);
      }
      setLoaded(next);
      toast.success("재검증 완료");
    } finally {
      setParsing(false);
    }
  }, [loaded, options]);

  const updateCell = (
    fileIdx: number,
    sheetName: string,
    address: string,
    next: Partial<AuditCell> & { current: AuditCell["current"] },
  ) => {
    setLoaded((prev) => {
      const nextLoaded = [...prev];
      const lf = nextLoaded[fileIdx];
      if (!lf) return prev;
      const wb = lf.workbook;
      const sheet = wb.sheets.find((s) => s.name === sheetName);
      if (!sheet) return prev;
      for (const r of sheet.rows) {
        for (const k of Object.keys(r.cells)) {
          if (r.cells[k].address === address) {
            r.cells[k] = { ...r.cells[k], ...next };
          }
        }
      }
      return nextLoaded;
    });
  };

  const applyFix = (fileIdx: number, sheetName: string, issue: Issue) => {
    if (!issue.cellAddress) return;
    const lf = loaded[fileIdx];
    if (!lf) return;
    const sheet = lf.workbook.sheets.find((s) => s.name === sheetName);
    if (!sheet) return;
    let cell: AuditCell | undefined;
    for (const r of sheet.rows) {
      for (const k of Object.keys(r.cells)) {
        if (r.cells[k].address === issue.cellAddress) {
          cell = r.cells[k];
          break;
        }
      }
      if (cell) break;
    }
    if (!cell) return;
    const fixed = applyAutofix(cell, issue);
    updateCell(fileIdx, sheetName, issue.cellAddress, fixed);
    toast.success(`자동수정 적용`);
  };

  const revertOne = (fileIdx: number, sheetName: string, address: string) => {
    const lf = loaded[fileIdx];
    if (!lf) return;
    const sheet = lf.workbook.sheets.find((s) => s.name === sheetName);
    if (!sheet) return;
    for (const r of sheet.rows) {
      for (const k of Object.keys(r.cells)) {
        if (r.cells[k].address === address) {
          updateCell(fileIdx, sheetName, address, revertCell(r.cells[k]));
          return;
        }
      }
    }
  };

  const downloadAll = useCallback(async () => {
    if (loaded.length === 0) return;
    try {
      const z = new JSZip();
      for (const lf of loaded) {
        const buf = writeWorkbookWithEdits(lf.xlsxRef, lf.workbook.sheets);
        z.file(`수정_${lf.fileName}`, buf);
      }
      const md = buildMarkdownReport(loaded.map((lf) => lf.workbook));
      const csv = buildEditsCsv(loaded.map((lf) => lf.workbook));
      z.file("검증리포트.md", md);
      z.file("변경일지.csv", csv);
      const blob = await z.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `집행내역서_검증결과_${ts}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStep("result");
    } catch (e) {
      console.error(e);
      toast.error(`다운로드 실패: ${(e as Error).message?.slice(0, 200)}`);
    }
  }, [loaded]);

  const activeFile = loaded[activeFileIdx];
  const activeSheet = activeFile?.workbook.sheets.find((s) => s.name === activeSheetName);

  const filteredIssues: Issue[] = useMemo(() => {
    if (!activeSheet) return [];
    return activeSheet.issues.filter((i) =>
      severityFilter === "all" ? true : i.severity === severityFilter,
    );
  }, [activeSheet, severityFilter]);

  return (
    <div className="mx-auto max-w-[110rem] space-y-6 p-4 transition-[max-width] md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">집행내역서 검증</h1>
          <p className="text-sm text-muted-foreground">
            세부비목별집행내역서 xlsx 휴먼 에러 사전 검사 + 셀 단위 수정 + 검증 리포트
          </p>
        </div>
        <StepIndicator current={step} onBack={(id) => setStep(id)} />
      </div>

      {step === "input" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. 자료</CardTitle>
            <CardDescription className="text-xs">
              세부비목별집행내역서 xlsx 1~3개를 올리세요. 파일명에서 기관(아포폴/디미/건대)을 자동 감지합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">xlsx 파일</Label>
              <Input
                type="file"
                accept=".xlsx"
                multiple
                onChange={(e) => {
                  onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {files.length > 0 && (
                <ul className="space-y-1 pt-2">
                  {files.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <FileSpreadsheet className="size-4 text-muted-foreground" />
                        {f.name}
                      </span>
                      <button
                        onClick={() => removeFile(i)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">사업기간 시작</Label>
                <Input
                  type="date"
                  value={options.projectPeriod.start}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, projectPeriod: { ...o.projectPeriod, start: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">사업기간 종료</Label>
                <Input
                  type="date"
                  value={options.projectPeriod.end}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, projectPeriod: { ...o.projectPeriod, end: e.target.value } }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">검증 카테고리 (총 {ALL_CATEGORIES.length}개)</Label>
              <div className="grid grid-cols-2 gap-1 text-xs md:grid-cols-3 lg:grid-cols-4">
                {ALL_CATEGORIES.map((c) => (
                  <label
                    key={c}
                    className="flex cursor-pointer items-center gap-1.5 rounded border bg-muted/10 px-2 py-1 hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={options.enabledCategories[c] !== false}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          enabledCategories: { ...o.enabledCategories, [c]: e.target.checked },
                        }))
                      }
                    />
                    <span className="font-mono text-[10px] opacity-60">{c}</span>
                    <span className="truncate">{CATEGORY_LABELS[c]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <Button onClick={doRunAudit} disabled={parsing || files.length === 0} className="gap-2">
                {parsing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                검사 시작
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "validate" && activeFile && activeSheet && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* 좌측: 파일 + 시트 트리 */}
          <Card className="self-start">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">파일·시트</CardTitle>
              <div className="space-y-0.5 pt-1 text-[10px] text-muted-foreground">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="border-red-300 px-1 text-[9px] text-red-700">N</Badge>
                  <span>에러</span>
                  <Badge variant="outline" className="border-amber-300 px-1 text-[9px] text-amber-700">N</Badge>
                  <span>경고</span>
                  <Badge variant="outline" className="border-sky-300 px-1 text-[9px] text-sky-700">N</Badge>
                  <span>정보</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="border-amber-300 px-1 text-[9px] text-amber-700">비표준</Badge>
                  <span>= 제출 X (검수/원본/대시보드)</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="border-slate-300 px-1 text-[9px] text-slate-600">숨김</Badge>
                  <span>= Excel hidden — 제거 필요</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loaded.map((lf, fi) => {
                const totalErr = lf.workbook.sheets.reduce(
                  (a, s) => a + s.issues.filter((i) => i.severity === "error").length,
                  0,
                );
                const totalWarn = lf.workbook.sheets.reduce(
                  (a, s) => a + s.issues.filter((i) => i.severity === "warning").length,
                  0,
                );
                return (
                  <div key={fi} className="space-y-1">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold",
                        fi === activeFileIdx && "bg-primary/10",
                      )}
                    >
                      <FileSpreadsheet className="size-3.5" />
                      <span className="truncate">{lf.fileName}</span>
                      <Badge variant="outline" className="border-amber-300 text-[10px]">
                        {lf.workbook.orgCode}
                      </Badge>
                    </div>
                    <div className="ml-4 space-y-0.5">
                      {lf.workbook.sheets.map((s) => {
                        const err = s.issues.filter((i) => i.severity === "error").length;
                        const warn = s.issues.filter((i) => i.severity === "warning").length;
                        const info = s.issues.filter((i) => i.severity === "info").length;
                        const active = fi === activeFileIdx && s.name === activeSheetName;
                        return (
                          <button
                            key={s.name}
                            onClick={() => {
                              setActiveFileIdx(fi);
                              setActiveSheetName(s.name);
                            }}
                            title={
                              !s.isStandardData
                                ? "비표준 시트 — 제출용 xlsx 에 포함되면 안 됨 (검수데이터/원본/매칭/대시보드 등)"
                                : s.hidden
                                  ? "숨겨진 시트 — 제출 전 가시화하거나 제거 필요"
                                  : undefined
                            }
                            className={cn(
                              "flex w-full items-center justify-between gap-1.5 rounded px-2 py-1 text-left text-[11px] hover:bg-muted/30",
                              active && "bg-primary/10",
                              !s.isStandardData && "italic text-muted-foreground",
                              s.hidden && "opacity-60",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-1">
                              <span className="truncate">{s.name}</span>
                              {!s.isStandardData && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-amber-300 px-1 text-[9px] text-amber-700"
                                >
                                  비표준
                                </Badge>
                              )}
                              {s.hidden && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-slate-300 px-1 text-[9px] text-slate-600"
                                >
                                  숨김
                                </Badge>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-0.5">
                              {err > 0 && (
                                <Badge
                                  variant="outline"
                                  title={`에러 ${err}건`}
                                  className="border-red-300 px-1 text-[10px] text-red-700"
                                >
                                  {err}
                                </Badge>
                              )}
                              {warn > 0 && (
                                <Badge
                                  variant="outline"
                                  title={`경고 ${warn}건`}
                                  className="border-amber-300 px-1 text-[10px] text-amber-700"
                                >
                                  {warn}
                                </Badge>
                              )}
                              {info > 0 && (
                                <Badge
                                  variant="outline"
                                  title={`정보 ${info}건`}
                                  className="border-sky-300 px-1 text-[10px] text-sky-700"
                                >
                                  {info}
                                </Badge>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="ml-4 flex items-center gap-2 text-[10px]">
                      <span className="text-red-700">에러 {totalErr}</span>
                      <span className="text-amber-700">· 경고 {totalWarn}</span>
                    </div>
                  </div>
                );
              })}
              <Separator className="my-2" />
              <Button variant="outline" size="sm" onClick={reaudit} disabled={parsing} className="w-full gap-1">
                <Wand2 className="size-3.5" /> 재검증
              </Button>
              <Button onClick={downloadAll} size="sm" className="w-full gap-1">
                <Download className="size-3.5" /> 전체 다운로드 (ZIP)
              </Button>
            </CardContent>
          </Card>

          {/* 우측: 시트 그리드 + 이슈 리스트 */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {activeSheet.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({activeSheet.rows.length} 행 · {activeSheet.columns.length} 컬럼)
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs">
                    <Filter className="size-3.5 text-muted-foreground" />
                    {(["all", "error", "warning", "info"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSeverityFilter(s)}
                        className={cn(
                          "rounded border px-2 py-0.5",
                          severityFilter === s
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted/30",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* 이슈 리스트 */}
                {filteredIssues.length === 0 ? (
                  <p className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                    이슈 없음 · 양호
                  </p>
                ) : (
                  <ul className="max-h-[40vh] space-y-1 overflow-y-auto text-xs">
                    {filteredIssues.map((i) => (
                      <li
                        key={i.id}
                        className={cn(
                          "rounded border p-2",
                          i.severity === "error" && "border-red-300 bg-red-50/60",
                          i.severity === "warning" && "border-amber-300 bg-amber-50/60",
                          i.severity === "info" && "border-sky-300 bg-sky-50/60",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {i.category}
                          </Badge>
                          {i.cellAddress && (
                            <span className="font-mono text-[10px] text-muted-foreground">{i.cellAddress}</span>
                          )}
                          {i.rowIndex && !i.cellAddress && (
                            <span className="text-[10px] text-muted-foreground">Row {i.rowIndex}</span>
                          )}
                          <span className="flex-1 truncate">{i.message}</span>
                          {i.autofix && i.cellAddress && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 gap-1 px-2 text-[10px]"
                              onClick={() => applyFix(activeFileIdx, activeSheet.name, i)}
                            >
                              <Sparkles className="size-3" /> 자동수정
                            </Button>
                          )}
                          {i.cellAddress && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 gap-1 px-2 text-[10px]"
                              onClick={() =>
                                revertOne(activeFileIdx, activeSheet.name, i.cellAddress!)
                              }
                            >
                              <RotateCcw className="size-3" />
                              원복
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* 셀 그리드 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">데이터 ({activeSheet.rows.length} 행)</CardTitle>
                <CardDescription className="text-xs">
                  셀을 클릭하면 인라인 편집됩니다. 빨강=에러 / 노랑=경고 / 회색=정보. 우측 ↺ 버튼으로 원복.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-auto">
                <SheetGrid
                  sheet={activeSheet}
                  onChange={(addr, next) =>
                    updateCell(activeFileIdx, activeSheet.name, addr, next)
                  }
                  onRevert={(addr) => revertOne(activeFileIdx, activeSheet.name, addr)}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {step === "result" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" /> 완료
            </CardTitle>
            <CardDescription>
              수정된 xlsx + 검증리포트 + 변경일지가 ZIP 으로 다운로드됐어요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              onClick={() => {
                setStep("input");
                setLoaded([]);
                setFiles([]);
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

/* ============================================================
   시트 그리드 — 인라인 편집
   ============================================================ */

function SheetGrid({
  sheet,
  onChange,
  onRevert,
}: {
  sheet: AuditWorkbook["sheets"][number];
  onChange: (addr: string, next: Partial<AuditCell> & { current: AuditCell["current"] }) => void;
  onRevert: (addr: string) => void;
}) {
  // 이슈 셀 매핑 → 빠른 hover 표시
  const issueByAddr = new Map<string, Issue>();
  for (const i of sheet.issues) {
    if (i.cellAddress) issueByAddr.set(i.cellAddress, i);
  }

  // 가시 컬럼만 (숨겨진 컬럼은 흐리게)
  const cols = sheet.columns;
  return (
    <div className="min-w-full">
      <table className="border-collapse text-xs">
        <thead className="sticky top-0 bg-background">
          <tr>
            <th className="border bg-muted/40 px-1 py-0.5 font-mono text-[10px] text-muted-foreground">#</th>
            {cols.map((c) => (
              <th
                key={c.idx}
                className={cn(
                  "border bg-muted/30 px-1 py-1 text-left text-[10px] font-medium",
                  c.key.startsWith("_col") && "italic text-amber-700",
                )}
                title={`${c.top} / ${c.sub}`}
              >
                <div className="font-mono text-[9px] opacity-60">{XLSX.utils.encode_col(c.idx)}</div>
                <div className="line-clamp-2 max-w-[120px]">{c.key}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((r) => (
            <tr key={r.rowIndex}>
              <td className="border bg-muted/20 px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                {r.rowIndex}
              </td>
              {cols.map((c) => {
                const cell = r.cells[c.key];
                if (!cell) {
                  return (
                    <td key={c.idx} className="border px-1 py-0.5">
                      &nbsp;
                    </td>
                  );
                }
                const issue = issueByAddr.get(cell.address);
                return (
                  <CellInput
                    key={cell.address}
                    cell={cell}
                    issue={issue}
                    onChange={(next) => onChange(cell.address, next)}
                    onRevert={() => onRevert(cell.address)}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellInput({
  cell,
  issue,
  onChange,
  onRevert,
}: {
  cell: AuditCell;
  issue?: Issue;
  onChange: (next: Partial<AuditCell> & { current: AuditCell["current"] }) => void;
  onRevert: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(formatCellValue(cell.current));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(formatCellValue(cell.current));
  }, [cell.current, editing]);

  const commit = () => {
    setEditing(false);
    if (draft === formatCellValue(cell.current)) return;
    let next: AuditCell["current"] = draft;
    // 숫자 문자열이면 number 로 캐스팅
    if (draft && /^-?[\d,]+(\.\d+)?$/.test(draft.replace(/\s/g, ""))) {
      const n = Number(draft.replace(/,/g, ""));
      if (Number.isFinite(n)) next = n;
    }
    onChange({ current: next, editSource: "manual" });
  };

  const sevClass =
    issue?.severity === "error"
      ? "border-red-400 bg-red-50/60"
      : issue?.severity === "warning"
        ? "border-amber-400 bg-amber-50/60"
        : issue?.severity === "info"
          ? "border-sky-400 bg-sky-50/60"
          : "border-border";
  const editedDot = cell.editSource !== "none";

  return (
    <td
      className={cn("relative border px-1 py-0.5", sevClass)}
      title={issue ? `${issue.category}: ${issue.message}` : undefined}
    >
      {editing ? (
        <input
          ref={ref}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(formatCellValue(cell.current));
              setEditing(false);
            }
          }}
          className="w-full bg-transparent outline-none"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="block w-full max-w-[160px] truncate text-left"
        >
          {formatCellValue(cell.current) || <span className="text-muted-foreground">∅</span>}
        </button>
      )}
      {editedDot && (
        <button
          onClick={onRevert}
          title="원복"
          className="absolute right-0 top-0 rounded-bl bg-foreground/80 px-1 text-[9px] text-background hover:bg-foreground"
        >
          ↺
        </button>
      )}
    </td>
  );
}

/* ============================================================
   재검증 — 현재 cells 상태 기반으로 issues 재계산
   (간단 버전: workbook.sheets 의 issues 만 재실행. 셀 상태는 보존)
   ============================================================ */

function revalidateLoaded(lf: LoadedFile, opts: AuditOptions): LoadedFile {
  // 셀 상태 보존 재검증 — issues 만 재계산
  return { ...lf, workbook: reauditWorkbook(lf.workbook, opts) };
}
