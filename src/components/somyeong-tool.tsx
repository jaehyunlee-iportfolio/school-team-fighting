"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  Download,
} from "lucide-react";
import { SomyeongDocument } from "@/components/pdf/somyeong-document";
import { registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import {
  type SomyeongRow,
  parseSomyeongCsv,
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getSomyeongSettings,
  getSomyeongLayoutSettings,
  SEOMOK_LIST,
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

function somyeongPdfName(folder: string, n: number, title: string) {
  const safeFolder = fileSafe(folder || "UNKNOWN");
  const safeTitle = fileSafe(title || "소명서");
  return `${safeFolder}_${n}.소명서_${safeTitle}.pdf`;
}

function zipName() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `소명서_모음_${date}_${hh}시${mm}분.zip`;
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
  const [genPending, setGenPending] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultFiles, setResultFiles] = useState<string[]>([]);

  const csvInputRef = useRef<HTMLInputElement>(null);

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
      const files: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        setGenProgress({ current: i + 1, total: rows.length });
        const row = rows[i];
        const n = settings.seomokN[row.seomok] ?? 0;
        const blob = await makeBlobFor(row);

        for (const folder of row.folders) {
          const name = somyeongPdfName(folder, n, row.title);
          z.file(name, blob);
          files.push(name);
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
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
        <div className="space-y-4">
          {!settings && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
              어드민에서 소명서 설정(소명자 정보, 서명 등)을 먼저 저장해주세요.
            </div>
          )}
          <Card
            className="cursor-pointer border-dashed transition-colors hover:border-primary hover:bg-muted/30"
            onClick={() => csvInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
              {parsePending ? (
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              ) : (
                <FileUp className="size-8 text-muted-foreground" />
              )}
              <p className="text-sm font-medium">
                {parsePending ? "파일 읽는 중..." : "CSV 파일을 클릭하거나 드래그하여 업로드"}
              </p>
              <p className="text-xs text-muted-foreground">
                증빙폴더번호, 건명, 상세내용, 첨부서류, 세목 컬럼이 필요해요.
              </p>
            </CardContent>
          </Card>
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
            onDrop={(e) => {
              const f = e.dataTransfer?.files?.[0];
              if (f) handleCsvFile(f);
            }}
          />
        </div>
      )}

      {/* ── STEP 2: 검토 ── */}
      {step === "validate" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">파싱 결과</CardTitle>
              <CardDescription>
                {rows.length}행 인식 · PDF {totalPdfCount}개 생성 예정
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    #{row.rowIndex}
                  </span>
                  <span className="font-medium">{row.title || "(건명 없음)"}</span>
                  <div className="flex flex-wrap gap-1">
                    {row.folders.map((f) => (
                      <Badge key={f} variant="secondary" className="font-mono text-xs">
                        {f}
                      </Badge>
                    ))}
                  </div>
                  {row.seomok && (
                    <Badge variant="outline" className="text-xs">
                      {row.seomok} (N={settings?.seomokN[row.seomok] ?? 0})
                    </Badge>
                  )}
                  {row.folders.length > 1 && (
                    <span className="text-xs text-muted-foreground">
                      → PDF {row.folders.length}개
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 세목별 N값 요약 */}
          {settings && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">세목별 N값 (어드민 설정 기준)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {SEOMOK_LIST.map((s) => (
                    <div key={s} className="rounded border px-3 py-1.5 text-xs">
                      <span className="font-medium">{s}</span>
                      <span className="ml-2 text-muted-foreground">N={settings.seomokN[s] ?? 0}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  N값을 변경하려면 어드민 &gt; 소명서 설정에서 수정 후 다시 업로드하세요.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setStep("input")}>
              다시 업로드
            </Button>
            <Button
              onClick={doGenerate}
              disabled={genPending || !settings}
              className="gap-2"
            >
              {genPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {genProgress
                    ? `생성 중 ${genProgress.current}/${genProgress.total}`
                    : "생성 중..."}
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  PDF {totalPdfCount}개 생성 및 다운로드
                </>
              )}
            </Button>
          </div>
        </div>
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
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="max-h-96 space-y-1 overflow-y-auto">
                {resultFiles.map((name, i) => (
                  <li key={i} className="flex items-center gap-2 rounded px-2 py-1 text-xs font-mono hover:bg-muted/50">
                    <CheckCircle2 className="size-3 shrink-0 text-green-500" />
                    {name}
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
