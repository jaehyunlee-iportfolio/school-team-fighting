"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  getApprovalSettings,
  saveApprovalSettings,
  getAdminEmails,
  addAdminEmail,
  removeAdminEmail,
  getPdfLayoutSettings,
  savePdfLayoutSettings,
  DEFAULT_PDF_LAYOUT,
  type ApprovalSettings,
  type GroupSettings,
  type PdfLayoutSettings,
} from "@/lib/firebase/firestore";
import { PDF_FONT_FAMILIES, registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { pdf } from "@react-pdf/renderer";
import { BusinessTripDocument } from "@/components/pdf/business-trip-document";
import type { TripRow } from "@/lib/csv/parseD4";
import ReactCrop, { type PercentCrop, type PixelCrop, convertToPixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  removeWhiteBackground,
  autoCropBounds,
  cropCanvas,
  loadImage,
} from "@/lib/image/remove-bg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Upload,
  Trash2,
  Plus,
  Shield,
  ShieldAlert,
  Save,
  ImageIcon,
  RotateCcw,
  FileText,
  AlertCircle,
  Scissors,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const { user, isAdmin, adminLoading } = useAuth();
  const [settings, setSettings] = useState<ApprovalSettings | null>(null);
  const [pdfLayout, setPdfLayout] = useState<PdfLayoutSettings | null>(null);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState("signature");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, emails, pdf] = await Promise.all([
        getApprovalSettings(),
        getAdminEmails(),
        getPdfLayoutSettings(),
      ]);
      setSettings(s);
      setAdminEmails(emails);
      setPdfLayout(pdf);
    } catch (err) {
      toast.error("설정을 불러오는 데 실패했어요.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin, loadData]);

  if (adminLoading || loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-2 px-4 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">접근 권한 없음</h2>
        <p className="text-sm text-muted-foreground">
          어드민 권한이 있는 계정으로 로그인해 주세요.
        </p>
      </div>
    );
  }

  if (!settings || !pdfLayout) return null;

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await saveApprovalSettings(settings);
      toast.success("설정이 저장되었어요.");
    } catch {
      toast.error("저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePdfLayout = async () => {
    setSavingPdf(true);
    try {
      await savePdfLayoutSettings(pdfLayout);
      toast.success("PDF 레이아웃이 저장되었어요.");
    } catch {
      toast.error("저장에 실패했어요.");
    } finally {
      setSavingPdf(false);
    }
  };

  return (
    <div className={`mx-auto space-y-6 p-4 md:p-8 transition-[max-width] ${activeTab === "pdfLayout" ? "max-w-7xl" : "max-w-3xl"}`}>
      <div className="flex items-center gap-3">
        <Shield className="size-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">어드민 설정</h1>
          <p className="text-sm text-muted-foreground">
            서명 정책, 결재 그룹, PDF 레이아웃, 사용자 관리
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="signature">서명 정책</TabsTrigger>
          <TabsTrigger value="groups">결재 그룹</TabsTrigger>
          <TabsTrigger value="pdfLayout">PDF 레이아웃</TabsTrigger>
          <TabsTrigger value="users">어드민 사용자</TabsTrigger>
        </TabsList>

        {/* --- 서명 정책 --- */}
        <TabsContent value="signature" className="space-y-4">
          {(["ipf", "dimi"] as const).map((gid) => (
            <ApproverGroupSection
              key={gid}
              groupId={gid}
              settings={settings}
              onChange={setSettings}
            />
          ))}
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              저장
            </Button>
          </div>
        </TabsContent>

        {/* --- 결재 그룹 --- */}
        <TabsContent value="groups" className="space-y-4">
          <GroupLabelsSection settings={settings} onChange={setSettings} />
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              저장
            </Button>
          </div>
        </TabsContent>

        {/* --- PDF 레이아웃 --- */}
        <TabsContent value="pdfLayout">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="w-full shrink-0 lg:w-[420px]">
              <div className="sticky top-4">
                <PdfPreview layout={pdfLayout} approvalSettings={settings} />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <PdfLayoutSection layout={pdfLayout} onChange={setPdfLayout} />
              <div className="flex items-center justify-between border-t pt-4">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setPdfLayout(DEFAULT_PDF_LAYOUT);
                    toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                  }}
                >
                  <RotateCcw className="size-4" />
                  기본값 초기화
                </Button>
                <Button onClick={handleSavePdfLayout} disabled={savingPdf} className="gap-2">
                  {savingPdf ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  저장
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- 어드민 사용자 --- */}
        <TabsContent value="users" className="space-y-4">
          <AdminUsersSection
            currentEmail={user?.email ?? ""}
            emails={adminEmails}
            onReload={loadData}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ===================================================================
   PDF Preview (mock data + live iframe)
   =================================================================== */

const MOCK_TRIP_ROW: TripRow = {
  rowIndex: 0,
  usageDate: "2026.04.01",
  partnerRaw: "홍길동",
  orgName: "아이포트폴리오",
  outPlace: "서울특별시 강남구",
  payMethod: "법인카드",
  detail: "출장자명: 홍길동 / 프로젝트 미팅",
  writerName: "홍길동",
  nameSource: "georae",
  drafter3: "홍길동",
  memberText: "홍길동 외 2명",
  periodText: "2026. 04. 01 ~ 2026. 04. 03",
  purposeText: "신규 프로젝트 킥오프 미팅 참석 및 현장 조사",
  orgGroup: "ipf",
  approver1: "팀장",
  approver2: "대표이사",
  hasEmpty: false,
  fieldWarnings: [],
  approvalGroupOverride: "auto",
};

function PdfPreview({ layout, approvalSettings }: { layout: PdfLayoutSettings; approvalSettings: ApprovalSettings | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  const generation = useRef(0);

  const mockLogoSrc = approvalSettings?.groups[MOCK_TRIP_ROW.orgGroup ?? "ipf"]?.logoImageUrl || undefined;

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        registerPdfFonts();
        const blob = await pdf(
          <BusinessTripDocument row={MOCK_TRIP_ROW} layout={layout} logoSrc={mockLogoSrc} />,
        ).toBlob();
        if (gen !== generation.current) return;
        const newUrl = URL.createObjectURL(blob);
        setUrl(newUrl);
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        prevUrl.current = newUrl;
      } catch (e) {
        if (gen !== generation.current) return;
        setError(e instanceof Error ? e.message : "PDF 생성 실패");
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [layout, mockLogoSrc]);

  useEffect(() => {
    return () => {
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <FileText className="size-4" />
        미리보기 (목 데이터)
      </div>
      <div className="relative overflow-hidden rounded-lg border bg-muted/30" style={{ aspectRatio: "1 / 1.414" }}>
        {url && (
          <iframe
            src={url}
            title="PDF 미리보기"
            className="absolute inset-0 size-full"
          />
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertCircle className="size-6 text-destructive" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================================================================
   PDF Layout Section
   =================================================================== */

type NumFieldProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  unit?: string;
};

function NumField({ label, value, onChange, step = 1, min, unit }: NumFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}{unit ? ` (${unit})` : ""}
      </Label>
      <Input
        type="number"
        step={step}
        {...(min !== undefined ? { min } : {})}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-lg border bg-card p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}

function PlaceholderRow({
  label,
  desc,
  text,
  color,
  onTextChange,
  onColorChange,
}: {
  label: string;
  desc: string;
  text: string;
  color: string;
  onTextChange: (v: string) => void;
  onColorChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">문구</Label>
          <Input value={text} onChange={(e) => onTextChange(e.target.value)} />
        </div>
        <ColorField label="색상" value={color} onChange={onColorChange} />
      </div>
      <div className="rounded-md border bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">미리보기: </span>
        <span className="text-sm font-medium" style={{ color }}>{text}</span>
      </div>
    </div>
  );
}

function PdfLayoutSection({
  layout,
  onChange,
}: {
  layout: PdfLayoutSettings;
  onChange: (l: PdfLayoutSettings) => void;
}) {
  const set = <K extends keyof PdfLayoutSettings>(
    section: K,
    patch: Partial<PdfLayoutSettings[K]>
  ) => onChange({ ...layout, [section]: { ...layout[section], ...patch } });

  const setPh = (patch: Partial<PdfLayoutSettings["placeholders"]>) =>
    set("placeholders", patch);

  return (
    <div className="space-y-4">
      {/* 페이지 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">페이지</CardTitle>
          <CardDescription>
            기본 폰트, 크기, 여백을 설정해요.
            폰트 파일은 <code className="rounded bg-muted px-1 text-xs">public/fonts/</code>에
            OTF/TTF로 번들되어 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">폰트</Label>
              <Select
                value={layout.page.fontFamily}
                onValueChange={(v) => { if (v) set("page", { fontFamily: v }); }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PDF_FONT_FAMILIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumField label="기본 크기" value={layout.page.baseFontSize} onChange={(v) => set("page", { baseFontSize: v })} step={0.5} unit="pt" />
            <NumField label="줄 높이" value={layout.page.baseLineHeight} onChange={(v) => set("page", { baseLineHeight: v })} step={0.1} />
            <NumField label="여백" value={layout.page.marginMm} onChange={(v) => set("page", { marginMm: v })} unit="mm" />
          </div>
        </CardContent>
      </Card>

      {/* 로고 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">로고</CardTitle>
          <CardDescription>
            PDF 좌측 상단에 표시되는 로고의 크기, 간격, 위치(오프셋)를 조절해요.
            로고 이미지는 &quot;서명 정책&quot; 탭에서 그룹별로 업로드하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">표시</Label>
              <div className="flex h-10 items-center">
                <Switch
                  checked={layout.logo.enabled}
                  onCheckedChange={(v) => set("logo", { enabled: v })}
                />
              </div>
            </div>
            <NumField label="가로" value={layout.logo.width} onChange={(v) => set("logo", { width: v })} unit="pt" />
            <NumField label="세로" value={layout.logo.height} onChange={(v) => set("logo", { height: v })} unit="pt" />
            <NumField label="우측 여백" value={layout.logo.marginRight} onChange={(v) => set("logo", { marginRight: v })} unit="pt" />
            <NumField label="좌우 위치" value={layout.logo.offsetX} onChange={(v) => set("logo", { offsetX: v })} step={1} unit="pt" />
            <NumField label="상하 위치" value={layout.logo.offsetY} onChange={(v) => set("logo", { offsetY: v })} step={1} unit="pt" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            좌우·상하 위치는 pt 단위 오프셋이에요. 양수면 각각 오른쪽·아래로, 음수면 왼쪽·위로 이동합니다.
          </p>
        </CardContent>
      </Card>

      {/* 선 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">테두리 선</CardTitle>
          <CardDescription>선 두께와 색상만 변경 가능해요. 선의 존재 패턴은 레이아웃 구조상 고정이에요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <NumField label="두께" value={layout.border.width} onChange={(v) => set("border", { width: v })} step={0.25} unit="pt" />
            <ColorField label="색상" value={layout.border.color} onChange={(v) => set("border", { color: v })} />
          </div>
        </CardContent>
      </Card>

      {/* 제목 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">제목 영역</CardTitle>
          <CardDescription>&quot;출장신청서&quot; 제목의 스타일과 아래 간격이에요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="크기" value={layout.title.fontSize} onChange={(v) => set("title", { fontSize: v })} unit="pt" />
            <NumField label="굵기" value={layout.title.fontWeight} onChange={(v) => set("title", { fontWeight: v })} step={100} min={100} />
            <NumField label="줄 높이" value={layout.title.lineHeight} onChange={(v) => set("title", { lineHeight: v })} step={0.05} />
            <NumField label="하단 간격" value={layout.title.marginBottom} onChange={(v) => set("title", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 결재란 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">결재란</CardTitle>
          <CardDescription>우측 상단 결재 테이블의 치수와 폰트 설정이에요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="전체 가로" value={layout.approval.tableWidth} onChange={(v) => set("approval", { tableWidth: v })} unit="pt" />
            <NumField label="&quot;결재&quot; 칸 가로" value={layout.approval.labelColWidth} onChange={(v) => set("approval", { labelColWidth: v })} unit="pt" />
            <NumField label="&quot;결재&quot; 칸 최소 높이" value={layout.approval.labelColMinHeight} onChange={(v) => set("approval", { labelColMinHeight: v })} unit="pt" />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="&quot;결재&quot; 글자 크기" value={layout.approval.labelFontSize} onChange={(v) => set("approval", { labelFontSize: v })} unit="pt" />
            <NumField label="결/재 글자 간격" value={layout.approval.labelCharGap} onChange={(v) => set("approval", { labelCharGap: v })} unit="pt" />
            <NumField label="직위 행 최소 높이" value={layout.approval.headerMinHeight} onChange={(v) => set("approval", { headerMinHeight: v })} unit="pt" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="직위 텍스트 크기" value={layout.approval.headerFontSize} onChange={(v) => set("approval", { headerFontSize: v })} unit="pt" />
            <NumField label="직위 패딩 세로" value={layout.approval.headerPaddingV} onChange={(v) => set("approval", { headerPaddingV: v })} unit="pt" />
            <NumField label="직위 패딩 가로" value={layout.approval.headerPaddingH} onChange={(v) => set("approval", { headerPaddingH: v })} unit="pt" />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="서명 행 최소 높이" value={layout.approval.signMinHeight} onChange={(v) => set("approval", { signMinHeight: v })} unit="pt" />
            <NumField label="서명 셀 패딩" value={layout.approval.signPadding} onChange={(v) => set("approval", { signPadding: v })} unit="pt" />
            <NumField label="기안자 서명 크기" value={layout.approval.drafterFontSize} onChange={(v) => set("approval", { drafterFontSize: v })} unit="pt" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="플레이스홀더 크기" value={layout.approval.placeholderFontSize} onChange={(v) => set("approval", { placeholderFontSize: v })} step={0.5} unit="pt" />
            <ColorField label="플레이스홀더 색상" value={layout.approval.placeholderColor} onChange={(v) => set("approval", { placeholderColor: v })} />
            <NumField label="서명 이미지 최대 높이" value={layout.approval.signImageMaxHeight} onChange={(v) => set("approval", { signImageMaxHeight: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 데이터 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">데이터 테이블</CardTitle>
          <CardDescription>작성자 소속/성명, 출장 인원/기간/출장지 행의 스타일이에요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="라벨 칸 가로" value={layout.dataTable.labelWidth} onChange={(v) => set("dataTable", { labelWidth: v })} unit="pt" />
            <NumField label="행 최소 높이" value={layout.dataTable.rowMinHeight} onChange={(v) => set("dataTable", { rowMinHeight: v })} unit="pt" />
            <ColorField label="라벨 배경색" value={layout.dataTable.labelBgColor} onChange={(v) => set("dataTable", { labelBgColor: v })} />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="라벨 패딩 세로" value={layout.dataTable.labelPaddingV} onChange={(v) => set("dataTable", { labelPaddingV: v })} unit="pt" />
            <NumField label="라벨 패딩 가로" value={layout.dataTable.labelPaddingH} onChange={(v) => set("dataTable", { labelPaddingH: v })} unit="pt" />
            <NumField label="라벨 텍스트 크기" value={layout.dataTable.labelFontSize} onChange={(v) => set("dataTable", { labelFontSize: v })} unit="pt" />
            <NumField label="라벨 텍스트 굵기" value={layout.dataTable.labelFontWeight} onChange={(v) => set("dataTable", { labelFontWeight: v })} step={100} min={100} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="값 패딩 세로" value={layout.dataTable.valuePaddingV} onChange={(v) => set("dataTable", { valuePaddingV: v })} unit="pt" />
            <NumField label="값 패딩 가로" value={layout.dataTable.valuePaddingH} onChange={(v) => set("dataTable", { valuePaddingH: v })} unit="pt" />
            <NumField label="값 텍스트 크기" value={layout.dataTable.valueFontSize} onChange={(v) => set("dataTable", { valueFontSize: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 연결 문장 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">연결 문장</CardTitle>
          <CardDescription>&quot;아래와 같이 출장을 신청합니다.&quot; 문장의 스타일이에요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <NumField label="텍스트 크기" value={layout.intro.fontSize} onChange={(v) => set("intro", { fontSize: v })} unit="pt" />
            <NumField label="상단 여백" value={layout.intro.marginTop} onChange={(v) => set("intro", { marginTop: v })} unit="pt" />
            <NumField label="하단 여백" value={layout.intro.marginBottom} onChange={(v) => set("intro", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 출장 목적 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">출장 목적 행</CardTitle>
          <CardDescription>데이터 테이블 맨 아래 &quot;출장 목적&quot; 행의 스타일이에요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="최소 높이" value={layout.purpose.minHeight} onChange={(v) => set("purpose", { minHeight: v })} unit="pt" />
            <NumField label="패딩" value={layout.purpose.padding} onChange={(v) => set("purpose", { padding: v })} unit="pt" />
            <NumField label="텍스트 크기" value={layout.purpose.fontSize} onChange={(v) => set("purpose", { fontSize: v })} unit="pt" />
            <NumField label="줄 높이" value={layout.purpose.lineHeight} onChange={(v) => set("purpose", { lineHeight: v })} step={0.1} />
          </div>
        </CardContent>
      </Card>

      {/* 하단 기관명 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">하단 기관명</CardTitle>
          <CardDescription>PDF 하단 중앙에 표시되는 집행기관명의 스타일이에요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <NumField label="텍스트 크기" value={layout.footer.fontSize} onChange={(v) => set("footer", { fontSize: v })} unit="pt" />
            <NumField label="굵기" value={layout.footer.fontWeight} onChange={(v) => set("footer", { fontWeight: v })} step={100} min={100} />
            <NumField label="상단 여백" value={layout.footer.marginTop} onChange={(v) => set("footer", { marginTop: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 누락 데이터 표시 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">누락 데이터 표시</CardTitle>
          <CardDescription>
            데이터가 비어있거나 날짜가 불완전할 때 PDF에 표시되는 대체 문구와 색상이에요.
            눈에 띄는 색상을 설정하면 담당자가 수정해야 할 곳을 바로 찾을 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PlaceholderRow
            label="빈 필드 대체 문구"
            desc="소속, 성명, 출장지 등이 비어있을 때"
            text={layout.placeholders.emptyField}
            color={layout.placeholders.emptyFieldColor}
            onTextChange={(v) => setPh({ emptyField: v })}
            onColorChange={(v) => setPh({ emptyFieldColor: v })}
          />
          <Separator />
          <PlaceholderRow
            label="날짜 대체 문구 (종료일 누락)"
            desc="사용일자에 시작일만 있을 때 종료일에 들어가는 텍스트"
            text={layout.placeholders.dateFallback}
            color={layout.placeholders.dateFallbackColor}
            onTextChange={(v) => setPh({ dateFallback: v })}
            onColorChange={(v) => setPh({ dateFallbackColor: v })}
          />
          <Separator />
          <PlaceholderRow
            label="날짜 오류 문구"
            desc="사용일자를 날짜로 인식할 수 없을 때"
            text={layout.placeholders.dateInvalid}
            color={layout.placeholders.dateInvalidColor}
            onTextChange={(v) => setPh({ dateInvalid: v })}
            onColorChange={(v) => setPh({ dateInvalidColor: v })}
          />
          <Separator />
          <PlaceholderRow
            label="기안자 서명 없음"
            desc="기안자 이름을 찾지 못했을 때 결재란에 표시"
            text={layout.placeholders.drafterEmpty}
            color={layout.placeholders.drafterEmptyColor}
            onTextChange={(v) => setPh({ drafterEmpty: v })}
            onColorChange={(v) => setPh({ drafterEmptyColor: v })}
          />
          <Separator />
          <PlaceholderRow
            label="결재자 서명 없음"
            desc="결재자 서명 이미지가 없을 때 표시"
            text={layout.placeholders.signEmpty}
            color={layout.placeholders.signEmptyColor}
            onTextChange={(v) => setPh({ signEmpty: v })}
            onColorChange={(v) => setPh({ signEmptyColor: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ===================================================================
   Approver Group Section (iPF / 디미교연)
   =================================================================== */

const GROUP_LABELS: Record<string, string> = {
  ipf: "iPF (아이포트폴리오)",
  dimi: "디미교연 (디지털미디어교육콘텐츠)",
};

function ApproverGroupSection({
  groupId,
  settings,
  onChange,
}: {
  groupId: string;
  settings: ApprovalSettings;
  onChange: (s: ApprovalSettings) => void;
}) {
  const groupSettings = settings.groups[groupId];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {GROUP_LABELS[groupId] ?? groupId} — 결재자 서명 / 로고
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <LogoRow groupId={groupId} settings={settings} onChange={onChange} />
        <Separator />
        <ApproverRow
          groupId={groupId}
          role="approver1"
          roleLabel={`결재자 1 (${groupSettings?.approver1Label ?? ""})`}
          settings={settings}
          onChange={onChange}
        />
        <Separator />
        <ApproverRow
          groupId={groupId}
          role="approver2"
          roleLabel={`결재자 2 (${groupSettings?.approver2Label ?? ""})`}
          settings={settings}
          onChange={onChange}
        />
      </CardContent>
    </Card>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/* ===================================================================
   Signature Crop Dialog (background removal + manual crop)
   =================================================================== */

function SignatureCropDialog({
  open,
  rawDataUrl,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  rawDataUrl: string;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const [threshold, setThreshold] = useState(230);
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<PercentCrop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open || !rawDataUrl) return;
    let cancelled = false;
    setProcessing(true);

    (async () => {
      try {
        const img = await loadImage(rawDataUrl);
        if (cancelled) return;
        const canvas = removeWhiteBackground(img, threshold);
        canvasRef.current = canvas;
        setProcessedSrc(canvas.toDataURL("image/png"));

        const bounds = autoCropBounds(canvas);
        const percentCrop: PercentCrop = {
          unit: "%",
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
        setCrop(percentCrop);
        setCompletedCrop(undefined);
      } catch {
        toast.error("이미지 처리에 실패했어요.");
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, rawDataUrl, threshold]);

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
      const result = cropCanvas(canvas, completedCrop);
      onConfirm(result);
    } else if (crop && imgRef.current) {
      const pixelCrop = convertToPixelCrop(
        crop,
        imgRef.current.naturalWidth,
        imgRef.current.naturalHeight,
      );
      if (pixelCrop.width > 0 && pixelCrop.height > 0) {
        const result = cropCanvas(canvas, pixelCrop);
        onConfirm(result);
      } else {
        onConfirm(canvas.toDataURL("image/png"));
      }
    } else {
      onConfirm(canvas.toDataURL("image/png"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>서명 이미지 편집</DialogTitle>
          <DialogDescription>
            배경이 자동 제거돼요. 슬라이더로 민감도를 조절하고, 드래그로 크롭 영역을 지정하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">배경 제거 민감도</Label>
              <span className="font-mono text-xs text-muted-foreground">{threshold}</span>
            </div>
            <input
              type="range"
              min={150}
              max={255}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-primary outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 focus-visible:rounded"
            />
            <p className="text-xs text-muted-foreground">
              값이 낮을수록 더 어두운 배경까지 제거해요.
            </p>
          </div>

          <div
            className="relative overflow-hidden rounded-lg border"
            style={{
              backgroundImage:
                "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
            }}
          >
            {processing && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {processedSrc && !processing && (
              <ReactCrop
                crop={crop}
                onChange={(_, pc) => setCrop(pc)}
                onComplete={(px) => setCompletedCrop(px)}
                keepSelection
              >
                <img
                  ref={imgRef}
                  src={processedSrc}
                  alt="서명 미리보기"
                  className="max-h-[50vh] w-full object-contain"
                  onLoad={(e) => {
                    imgRef.current = e.currentTarget;
                  }}
                />
              </ReactCrop>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button onClick={handleApply} disabled={processing} className="gap-1.5">
            <Scissors className="size-3.5" />
            적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogoRow({
  groupId,
  settings,
  onChange,
}: {
  groupId: string;
  settings: ApprovalSettings;
  onChange: (s: ApprovalSettings) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const groupSettings = settings.groups[groupId];
  const currentUrl = groupSettings?.logoImageUrl ?? "";

  const updateLogo = (url: string) => {
    onChange({
      ...settings,
      groups: {
        ...settings.groups,
        [groupId]: { ...groupSettings, logoImageUrl: url },
      },
    });
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateLogo(dataUrl);
      toast.success("로고 이미지가 설정되었어요.");
    } catch {
      toast.error("이미지를 읽는 데 실패했어요.");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">로고 이미지</p>
      <div className="flex items-start gap-4">
        <div
          className="shrink-0 size-20 rounded-lg border flex items-center justify-center overflow-hidden bg-white"
        >
          {currentUrl ? (
            <img
              src={currentUrl}
              alt={`${groupId} 로고`}
              className="size-full object-contain"
            />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {currentUrl ? "교체" : "업로드"}
          </Button>
          {currentUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => updateLogo("")}
            >
              <Trash2 className="size-3.5" />
              삭제
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ApproverRow({
  groupId,
  role,
  roleLabel,
  settings,
  onChange,
}: {
  groupId: string;
  role: "approver1" | "approver2";
  roleLabel: string;
  settings: ApprovalSettings;
  onChange: (s: ApprovalSettings) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [rawDataUrl, setRawDataUrl] = useState("");

  const imageKey = role === "approver1" ? "approver1ImageUrl" : "approver2ImageUrl";
  const groupSettings = settings.groups[groupId];
  const currentUrl = groupSettings?.[imageKey] ?? "";

  const updateGroupImage = (url: string) => {
    onChange({
      ...settings,
      groups: {
        ...settings.groups,
        [groupId]: { ...groupSettings, [imageKey]: url },
      },
    });
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setRawDataUrl(dataUrl);
      setCropDialogOpen(true);
    } catch {
      toast.error("이미지를 읽는 데 실패했어요.");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{roleLabel}</p>
      <div className="flex items-start gap-4">
        <div
          className="shrink-0 size-20 rounded-lg border flex items-center justify-center overflow-hidden"
          style={{
            backgroundImage: currentUrl
              ? "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)"
              : undefined,
            backgroundSize: "12px 12px",
            backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
            backgroundColor: currentUrl ? undefined : "hsl(var(--muted))",
          }}
        >
          {currentUrl ? (
            <img
              src={currentUrl}
              alt={`${groupId}_${role} 서명`}
              className="size-full object-contain"
            />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {currentUrl ? "교체" : "업로드"}
          </Button>
          {currentUrl && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setRawDataUrl(currentUrl);
                  setCropDialogOpen(true);
                }}
              >
                <Scissors className="size-3.5" />
                편집
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => updateGroupImage("")}
              >
                <Trash2 className="size-3.5" />
                삭제
              </Button>
            </>
          )}
        </div>
      </div>

      <SignatureCropDialog
        open={cropDialogOpen}
        rawDataUrl={rawDataUrl}
        onConfirm={(dataUrl) => {
          updateGroupImage(dataUrl);
          setCropDialogOpen(false);
          toast.success("서명 이미지가 설정되었어요.");
        }}
        onCancel={() => setCropDialogOpen(false)}
      />
    </div>
  );
}

/* ===================================================================
   Group Labels Section
   =================================================================== */

function GroupLabelsSection({
  settings,
  onChange,
}: {
  settings: ApprovalSettings;
  onChange: (s: ApprovalSettings) => void;
}) {
  const setGroup = (gid: string, patch: Partial<GroupSettings>) => {
    onChange({
      ...settings,
      groups: {
        ...settings.groups,
        [gid]: { ...settings.groups[gid], ...patch },
      },
    });
  };

  return (
    <>
      {Object.entries(settings.groups).map(([gid, g]) => (
        <Card key={gid}>
          <CardHeader>
            <CardTitle className="text-base">
              {GROUP_LABELS[gid] ?? gid}
            </CardTitle>
            <CardDescription>결재자 직위 라벨을 편집해요.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">결재자 1 직위</Label>
              <Input
                value={g.approver1Label}
                onChange={(e) =>
                  setGroup(gid, { approver1Label: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">결재자 2 직위</Label>
              <Input
                value={g.approver2Label}
                onChange={(e) =>
                  setGroup(gid, { approver2Label: e.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

/* ===================================================================
   Admin Users Section
   =================================================================== */

function AdminUsersSection({
  currentEmail,
  emails,
  onReload,
}: {
  currentEmail: string;
  emails: string[];
  onReload: () => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.endsWith("@iportfolio.co.kr")) {
      toast.error("@iportfolio.co.kr 이메일만 추가할 수 있어요.");
      return;
    }
    if (emails.includes(trimmed)) {
      toast.error("이미 등록된 이메일이에요.");
      return;
    }
    setAdding(true);
    try {
      await addAdminEmail(trimmed, currentEmail);
      toast.success(`${trimmed}을(를) 추가했어요.`);
      setNewEmail("");
      onReload();
    } catch {
      toast.error("추가에 실패했어요.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (email: string) => {
    try {
      await removeAdminEmail(email);
      toast.success(`${email}을(를) 제거했어요.`);
      onReload();
    } catch {
      toast.error("제거에 실패했어요.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">어드민 사용자 관리</CardTitle>
        <CardDescription>
          어드민 권한이 있는 이메일 목록이에요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="email@iportfolio.co.kr"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={adding} className="gap-1.5 shrink-0">
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            추가
          </Button>
        </div>

        <div className="divide-y rounded-lg border">
          {emails.map((email) => {
            const isMe = email === currentEmail;
            return (
              <div
                key={email}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="truncate">
                  {email}
                  {isMe && (
                    <span className="ml-2 text-xs text-muted-foreground">(나)</span>
                  )}
                </span>
                {!isMe && (
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" />}
                    >
                      <Trash2 className="size-4" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>어드민 제거</AlertDialogTitle>
                        <AlertDialogDescription>
                          {email}의 어드민 권한을 제거할까요?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleRemove(email)}
                        >
                          제거
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            );
          })}
          {emails.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              등록된 어드민이 없어요.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
