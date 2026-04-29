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
  getSomyeongSettings,
  saveSomyeongSettings,
  getSomyeongLayoutSettings,
  saveSomyeongLayoutSettings,
  getReturnSettings,
  saveReturnSettings,
  getReturnLayoutSettings,
  saveReturnLayoutSettings,
  getSwRequestSettings,
  saveSwRequestSettings,
  getSwRequestLayoutSettings,
  saveSwRequestLayoutSettings,
  getExpenseSettings,
  saveExpenseSettings,
  getExpenseLayoutSettings,
  saveExpenseLayoutSettings,
  getMeetingOperationsSettings,
  saveMeetingOperationsSettings,
  getMeetingOperationsLayoutSettings,
  saveMeetingOperationsLayoutSettings,
  DEFAULT_PDF_LAYOUT,
  DEFAULT_SOMYEONG_SETTINGS,
  DEFAULT_SOMYEONG_LAYOUT,
  DEFAULT_RETURN_SETTINGS,
  DEFAULT_RETURN_LAYOUT,
  DEFAULT_SW_REQUEST_SETTINGS,
  DEFAULT_SW_REQUEST_LAYOUT,
  DEFAULT_EXPENSE_SETTINGS,
  DEFAULT_EXPENSE_LAYOUT,
  DEFAULT_MEETING_OP_SETTINGS,
  DEFAULT_MEETING_OP_LAYOUT,
  DEFAULT_RESUME_COORDINATOR_LAYOUT,
  DEFAULT_RESUME_INSTRUCTOR_LAYOUT,
  getResumeCoordinatorLayoutSettings,
  saveResumeCoordinatorLayoutSettings,
  getResumeInstructorLayoutSettings,
  saveResumeInstructorLayoutSettings,
  SEOMOK_LIST,
  type ApprovalSettings,
  type GroupSettings,
  type PdfLayoutSettings,
  type SomyeongSettings,
  type SomyeongLayoutSettings,
  type ReturnSettings,
  type ReturnLayoutSettings,
  type SwRequestSettings,
  type SwRequestLayoutSettings,
  type ExpenseSettings,
  type ExpenseGroupSettings,
  type ExpenseLayoutSettings,
  type MeetingOperationsSettings,
  type MeetingOperationsLayoutSettings,
  type ResumeCoordinatorLayoutSettings,
  type ResumeInstructorLayoutSettings,
} from "@/lib/firebase/firestore";
import { PDF_FONT_FAMILIES, registerPdfFonts } from "@/lib/pdf/register-pdf-fonts";
import { resolveHardcodedPdfLogoSrc } from "@/lib/pdf/group-logos";
import { pdf } from "@react-pdf/renderer";
import { BusinessTripDocument } from "@/components/pdf/business-trip-document";
import { SomyeongDocument } from "@/components/pdf/somyeong-document";
import { BusinessReturnDocument } from "@/components/pdf/business-return-document";
import { SwRequestDocument } from "@/components/pdf/sw-request-document";
import { ExpenseDocument } from "@/components/pdf/expense-document";
import { MeetingOperationsDocument } from "@/components/pdf/meeting-operations-document";
import { ResumeCoordinatorDocument } from "@/components/pdf/resume-coordinator-document";
import { ResumeInstructorDocument } from "@/components/pdf/resume-instructor-document";
import {
  emptyRow as emptyResumeRow,
  recomputeWarnings as recomputeResumeWarnings,
} from "@/lib/resume/types";
import type { TripRow } from "@/lib/csv/parseD4";
import type { SomyeongRow } from "@/lib/csv/parseSomyeong";
import type { ReturnRow } from "@/lib/csv/parseReturn";
import type { SwRequestRow } from "@/lib/sw/types";
import type { MeetingOperationsRow } from "@/lib/meeting/types";
import type { ExpenseRow } from "@/lib/expense/types";
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
import { cn } from "@/lib/utils";

export default function AdminPage() {
  const { user, isAdmin, adminLoading } = useAuth();
  const [settings, setSettings] = useState<ApprovalSettings | null>(null);
  const [pdfLayout, setPdfLayout] = useState<PdfLayoutSettings | null>(null);
  const [somyeongSettings, setSomyeongSettings] = useState<SomyeongSettings | null>(null);
  const [somyeongLayout, setSomyeongLayout] = useState<SomyeongLayoutSettings | null>(null);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [savingSomyeong, setSavingSomyeong] = useState(false);
  const [savingSomyeongLayout, setSavingSomyeongLayout] = useState(false);
  const [activeGroup, setActiveGroup] = useState<"trip" | "somyeong" | "return" | "swRequest" | "expense" | "meetingOp" | "resume" | "common">("trip");
  const [tripSub, setTripSub] = useState<"signApproval" | "layout">("signApproval");
  const [somyeongSub, setSomyeongSub] = useState<"info" | "layout">("info");
  const [returnSub, setReturnSub] = useState<"approval" | "layout">("approval");
  const [swRequestSub, setSwRequestSub] = useState<"info" | "layout">("info");
  const [expenseSub, setExpenseSub] = useState<"info" | "layout">("info");
  const [meetingOpSub, setMeetingOpSub] = useState<"info" | "layout">("info");
  const [meetingOpSettings, setMeetingOpSettings] = useState<MeetingOperationsSettings | null>(null);
  const [meetingOpLayout, setMeetingOpLayout] = useState<MeetingOperationsLayoutSettings | null>(null);
  const [savingMeetingOp, setSavingMeetingOp] = useState(false);
  const [savingMeetingOpLayout, setSavingMeetingOpLayout] = useState(false);
  const [resumeSub, setResumeSub] = useState<"coordinator" | "instructor">("coordinator");
  const [resumeCoordLayout, setResumeCoordLayout] = useState<ResumeCoordinatorLayoutSettings | null>(null);
  const [resumeInstLayout, setResumeInstLayout] = useState<ResumeInstructorLayoutSettings | null>(null);
  const [savingResumeCoord, setSavingResumeCoord] = useState(false);
  const [savingResumeInst, setSavingResumeInst] = useState(false);
  const [returnSettings, setReturnSettings] = useState<ReturnSettings | null>(null);
  const [returnLayout, setReturnLayout] = useState<ReturnLayoutSettings | null>(null);
  const [savingReturn, setSavingReturn] = useState(false);
  const [savingReturnLayout, setSavingReturnLayout] = useState(false);
  const [swRequestSettings, setSwRequestSettings] = useState<SwRequestSettings | null>(null);
  const [swRequestLayout, setSwRequestLayout] = useState<SwRequestLayoutSettings | null>(null);
  const [savingSwRequest, setSavingSwRequest] = useState(false);
  const [savingSwRequestLayout, setSavingSwRequestLayout] = useState(false);
  const [expenseSettings, setExpenseSettings] = useState<ExpenseSettings | null>(null);
  const [expenseLayout, setExpenseLayout] = useState<ExpenseLayoutSettings | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingExpenseLayout, setSavingExpenseLayout] = useState(false);
  /** 미리보기 샘플 텍스트 — 어드민 세션 동안만 유지, 저장 안 됨 */
  const [expensePreviewSample, setExpensePreviewSample] = useState<{
    note: string;
    purpose: string;
    useDetail: string;
    includeUseDetail: boolean;
    includeUseDetailInNote: boolean;
    vendor: string;
    executionDate: string;
    evidenceNo: string;
    payment: string;
    supply: string;
    vat: string;
    total: string;
  }>({
    note: "교통비 지급(20,000원)",
    purpose: "05.24 코디강사역량강화세미나(참석)를 위한 교통비 지급의 건 (대상자: 신예진)",
    useDetail:
      "1. 전문가명(신예진)\n2. 산출내역 및 활용내용\n- 5/24: 코디강사역량강화세미나(참석) 교통비 20,000원(이동거리 50km 이내)",
    includeUseDetail: false,
    includeUseDetailInNote: false,
    vendor: "신예진",
    executionDate: "2026. 3. 31",
    evidenceNo: "D-1-100",
    payment: "계좌이체",
    supply: "20000",
    vat: "",
    total: "20000",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, emails, pdf, somyeong, somyeongLay, ret, retLay, swReq, swReqLay, exp, expLay, mop, mopLay, rcLay, riLay] = await Promise.all([
        getApprovalSettings(),
        getAdminEmails(),
        getPdfLayoutSettings(),
        getSomyeongSettings(),
        getSomyeongLayoutSettings(),
        getReturnSettings(),
        getReturnLayoutSettings(),
        getSwRequestSettings(),
        getSwRequestLayoutSettings(),
        getExpenseSettings(),
        getExpenseLayoutSettings(),
        getMeetingOperationsSettings(),
        getMeetingOperationsLayoutSettings(),
        getResumeCoordinatorLayoutSettings(),
        getResumeInstructorLayoutSettings(),
      ]);
      setSettings(s);
      setAdminEmails(emails);
      setPdfLayout(pdf);
      setSomyeongSettings(somyeong);
      setSomyeongLayout(somyeongLay);
      setReturnSettings(ret);
      setReturnLayout(retLay);
      setSwRequestSettings(swReq);
      setSwRequestLayout(swReqLay);
      setExpenseSettings(exp);
      setExpenseLayout(expLay);
      setMeetingOpSettings(mop);
      setMeetingOpLayout(mopLay);
      setResumeCoordLayout(rcLay);
      setResumeInstLayout(riLay);
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

  if (!settings || !pdfLayout || !somyeongSettings || !somyeongLayout || !returnSettings || !returnLayout || !swRequestSettings || !swRequestLayout || !expenseSettings || !expenseLayout || !meetingOpSettings || !meetingOpLayout || !resumeCoordLayout || !resumeInstLayout) return null;

  const handleSaveReturn = async () => {
    setSavingReturn(true);
    try {
      await saveReturnSettings(returnSettings);
      toast.success("출장복명서 결재라인 저장 완료");
    } catch {
      toast.error("저장 실패");
    } finally {
      setSavingReturn(false);
    }
  };

  const handleSaveReturnLayout = async () => {
    setSavingReturnLayout(true);
    try {
      await saveReturnLayoutSettings(returnLayout);
      toast.success("출장복명서 레이아웃 저장 완료");
    } catch {
      toast.error("저장 실패");
    } finally {
      setSavingReturnLayout(false);
    }
  };

  const handleSaveSwRequest = async () => {
    setSavingSwRequest(true);
    try {
      await saveSwRequestSettings(swRequestSettings);
      toast.success("소프트웨어 요청서 설정 저장 완료");
    } catch {
      toast.error("저장 실패");
    } finally {
      setSavingSwRequest(false);
    }
  };

  const handleSaveSwRequestLayout = async () => {
    setSavingSwRequestLayout(true);
    try {
      await saveSwRequestLayoutSettings(swRequestLayout);
      toast.success("소프트웨어 요청서 레이아웃 저장 완료");
    } catch {
      toast.error("저장 실패");
    } finally {
      setSavingSwRequestLayout(false);
    }
  };

  const handleSaveExpense = async () => {
    setSavingExpense(true);
    try {
      await saveExpenseSettings(expenseSettings);
      toast.success("지출결의서 설정 저장 완료");
    } catch (e) {
      console.error("saveExpenseSettings failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`저장 실패: ${msg.slice(0, 200)}`);
    } finally {
      setSavingExpense(false);
    }
  };

  const handleSaveExpenseLayout = async () => {
    setSavingExpenseLayout(true);
    try {
      await saveExpenseLayoutSettings(expenseLayout);
      toast.success("지출결의서 레이아웃 저장 완료");
    } catch (e) {
      console.error("saveExpenseLayoutSettings failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`저장 실패: ${msg.slice(0, 200)}`);
    } finally {
      setSavingExpenseLayout(false);
    }
  };

  const handleSaveMeetingOp = async () => {
    setSavingMeetingOp(true);
    try {
      await saveMeetingOperationsSettings(meetingOpSettings);
      toast.success("운영회의록 설정 저장 완료");
    } catch (e) {
      console.error("[운영회의록 저장 실패] settings:", meetingOpSettings, "error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`저장 실패: ${msg.slice(0, 240)}`);
    } finally {
      setSavingMeetingOp(false);
    }
  };

  const handleSaveMeetingOpLayout = async () => {
    setSavingMeetingOpLayout(true);
    try {
      await saveMeetingOperationsLayoutSettings(meetingOpLayout);
      toast.success("운영회의록 레이아웃 저장 완료");
    } catch (e) {
      console.error("[운영회의록 레이아웃 저장 실패] error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`저장 실패: ${msg.slice(0, 240)}`);
    } finally {
      setSavingMeetingOpLayout(false);
    }
  };

  const handleSaveResumeCoord = async () => {
    setSavingResumeCoord(true);
    try {
      await saveResumeCoordinatorLayoutSettings(resumeCoordLayout);
      toast.success("코디네이터 이력서 레이아웃 저장 완료");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`저장 실패: ${msg.slice(0, 200)}`);
    } finally {
      setSavingResumeCoord(false);
    }
  };

  const handleSaveResumeInst = async () => {
    setSavingResumeInst(true);
    try {
      await saveResumeInstructorLayoutSettings(resumeInstLayout);
      toast.success("강사 이력서 레이아웃 저장 완료");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`저장 실패: ${msg.slice(0, 200)}`);
    } finally {
      setSavingResumeInst(false);
    }
  };

  const handleSaveSomyeong = async () => {
    setSavingSomyeong(true);
    try {
      await saveSomyeongSettings(somyeongSettings);
      toast.success("소명서 설정이 저장되었어요.");
    } catch {
      toast.error("저장에 실패했어요.");
    } finally {
      setSavingSomyeong(false);
    }
  };

  const handleSaveSomyeongLayout = async () => {
    setSavingSomyeongLayout(true);
    try {
      await saveSomyeongLayoutSettings(somyeongLayout);
      toast.success("소명서 레이아웃이 저장되었어요.");
    } catch {
      toast.error("저장에 실패했어요.");
    } finally {
      setSavingSomyeongLayout(false);
    }
  };

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

  const isWideTab =
    (activeGroup === "trip" && tripSub === "layout") ||
    (activeGroup === "somyeong" && somyeongSub === "layout") ||
    (activeGroup === "return" && returnSub === "layout") ||
    (activeGroup === "swRequest" && swRequestSub === "layout") ||
    (activeGroup === "expense" && expenseSub === "layout") ||
    (activeGroup === "meetingOp" && meetingOpSub === "layout") ||
    activeGroup === "resume";

  return (
    <div
      className={cn(
        "mx-auto space-y-6 p-4 md:p-8 transition-[max-width]",
        isWideTab ? "max-w-[110rem]" : "max-w-7xl"
      )}
    >
      <div className="flex items-center gap-3">
        <Shield className="size-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">어드민 설정</h1>
          <p className="text-sm text-muted-foreground">
            자동화 도구별 설정과 사용자 관리
          </p>
        </div>
      </div>

      {/* 1단계: 도구 그룹 */}
      <Tabs
        value={activeGroup}
        onValueChange={(v) => setActiveGroup(v as "trip" | "somyeong" | "return" | "swRequest" | "expense" | "meetingOp" | "resume" | "common")}
        className="flex flex-col space-y-4"
      >
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="trip">출장신청서</TabsTrigger>
          <TabsTrigger value="somyeong">소명서</TabsTrigger>
          <TabsTrigger value="return">출장복명서</TabsTrigger>
          <TabsTrigger value="swRequest">SW 요청서</TabsTrigger>
          <TabsTrigger value="expense">지출결의서</TabsTrigger>
          <TabsTrigger value="meetingOp">운영회의록</TabsTrigger>
          <TabsTrigger value="resume">이력서</TabsTrigger>
          <TabsTrigger value="common">공통</TabsTrigger>
        </TabsList>

        {/* ── 출장신청서 ── */}
        <TabsContent value="trip" className="space-y-4">
          <Tabs
            value={tripSub}
            onValueChange={(v) => setTripSub(v as "signApproval" | "layout")}
            className="flex flex-col space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signApproval">서명·결재</TabsTrigger>
              <TabsTrigger value="layout">PDF 레이아웃</TabsTrigger>
            </TabsList>

            {/* 서명·결재 (서명 정책 + 결재 그룹 통합) */}
            <TabsContent value="signApproval" className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-base font-semibold">결재자 서명</h2>
                {(["ipf", "dimi"] as const).map((gid) => (
                  <ApproverGroupSection
                    key={gid}
                    groupId={gid}
                    settings={settings}
                    onChange={setSettings}
                  />
                ))}
              </div>
              <Separator />
              <div className="space-y-4">
                <h2 className="text-base font-semibold">결재자 직위</h2>
                <GroupLabelsSection settings={settings} onChange={setSettings} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  저장
                </Button>
              </div>
            </TabsContent>

            {/* PDF 레이아웃 */}
            <TabsContent value="layout">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[420px]">
                  <div className="sticky top-4">
                    <PdfPreview layout={pdfLayout} />
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
          </Tabs>
        </TabsContent>

        {/* ── 소명서 ── */}
        <TabsContent value="somyeong" className="space-y-4">
          <Tabs
            value={somyeongSub}
            onValueChange={(v) => setSomyeongSub(v as "info" | "layout")}
            className="flex flex-col space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">소명자 정보·서명</TabsTrigger>
              <TabsTrigger value="layout">PDF 레이아웃</TabsTrigger>
            </TabsList>

            {/* 소명자 정보·서명·세목 N */}
            <TabsContent value="info" className="space-y-4">
              <SomyeongSettingsSection
                settings={somyeongSettings}
                onChange={setSomyeongSettings}
              />
              <div className="flex justify-end">
                <Button onClick={handleSaveSomyeong} disabled={savingSomyeong} className="gap-2">
                  {savingSomyeong ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  저장
                </Button>
              </div>
            </TabsContent>

            {/* PDF 레이아웃 */}
            <TabsContent value="layout">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[420px]">
                  <div className="sticky top-4">
                    <SomyeongPreview layout={somyeongLayout} settings={somyeongSettings} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <SomyeongLayoutSection layout={somyeongLayout} onChange={setSomyeongLayout} />
                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setSomyeongLayout(DEFAULT_SOMYEONG_LAYOUT);
                        toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                      }}
                    >
                      <RotateCcw className="size-4" />
                      기본값 초기화
                    </Button>
                    <Button onClick={handleSaveSomyeongLayout} disabled={savingSomyeongLayout} className="gap-2">
                      {savingSomyeongLayout ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      저장
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── 출장복명서 ── */}
        <TabsContent value="return" className="space-y-4">
          <Tabs
            value={returnSub}
            onValueChange={(v) => setReturnSub(v as "approval" | "layout")}
            className="flex flex-col space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="approval">기본 결재라인</TabsTrigger>
              <TabsTrigger value="layout">PDF 레이아웃</TabsTrigger>
            </TabsList>

            <TabsContent value="approval" className="space-y-4">
              <ReturnApprovalSettingsSection
                settings={returnSettings}
                onChange={setReturnSettings}
              />
              <div className="flex items-center justify-between border-t pt-4">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setReturnSettings(DEFAULT_RETURN_SETTINGS);
                    toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                  }}
                >
                  <RotateCcw className="size-4" />
                  기본값 초기화
                </Button>
                <Button onClick={handleSaveReturn} disabled={savingReturn} className="gap-2">
                  {savingReturn ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  저장
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="layout">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[420px]">
                  <div className="sticky top-4">
                    <ReturnPreview layout={returnLayout} settings={returnSettings} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <ReturnLayoutSection layout={returnLayout} onChange={setReturnLayout} />
                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setReturnLayout(DEFAULT_RETURN_LAYOUT);
                        toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                      }}
                    >
                      <RotateCcw className="size-4" />
                      기본값 초기화
                    </Button>
                    <Button onClick={handleSaveReturnLayout} disabled={savingReturnLayout} className="gap-2">
                      {savingReturnLayout ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      저장
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── SW 요청서 ── */}
        <TabsContent value="swRequest" className="space-y-4">
          <Tabs
            value={swRequestSub}
            onValueChange={(v) => setSwRequestSub(v as "info" | "layout")}
            className="flex flex-col space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">기본 문구</TabsTrigger>
              <TabsTrigger value="layout">PDF 레이아웃</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <SwRequestInfoSection
                settings={swRequestSettings}
                onChange={setSwRequestSettings}
              />
              <div className="flex items-center justify-between border-t pt-4">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setSwRequestSettings(DEFAULT_SW_REQUEST_SETTINGS);
                    toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                  }}
                >
                  <RotateCcw className="size-4" />
                  기본값 초기화
                </Button>
                <Button onClick={handleSaveSwRequest} disabled={savingSwRequest} className="gap-2">
                  {savingSwRequest ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  저장
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="layout">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[420px]">
                  <div className="sticky top-4">
                    <SwRequestPreview layout={swRequestLayout} settings={swRequestSettings} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <SwRequestLayoutSection layout={swRequestLayout} onChange={setSwRequestLayout} />
                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setSwRequestLayout(DEFAULT_SW_REQUEST_LAYOUT);
                        toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                      }}
                    >
                      <RotateCcw className="size-4" />
                      기본값 초기화
                    </Button>
                    <Button onClick={handleSaveSwRequestLayout} disabled={savingSwRequestLayout} className="gap-2">
                      {savingSwRequestLayout ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      저장
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── 지출결의서 ── */}
        <TabsContent value="expense" className="space-y-4">
          <Tabs
            value={expenseSub}
            onValueChange={(v) => setExpenseSub(v as "info" | "layout")}
            className="flex flex-col space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">기본 설정</TabsTrigger>
              <TabsTrigger value="layout">PDF 레이아웃</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <ExpenseInfoSection
                settings={expenseSettings}
                onChange={setExpenseSettings}
              />
              <div className="flex items-center justify-between border-t pt-4">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setExpenseSettings(DEFAULT_EXPENSE_SETTINGS);
                    toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                  }}
                >
                  <RotateCcw className="size-4" />
                  기본값 초기화
                </Button>
                <Button onClick={handleSaveExpense} disabled={savingExpense} className="gap-2">
                  {savingExpense ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  저장
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="layout">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[420px]">
                  <div className="sticky top-4 space-y-3">
                    <ExpensePreview
                      layout={expenseLayout}
                      group={expenseSettings.groups.ipf}
                      sampleOverrides={{
                        note: expensePreviewSample.note,
                        purpose: expensePreviewSample.purpose,
                        useDetail: expensePreviewSample.useDetail,
                        includeUseDetail: expensePreviewSample.includeUseDetail,
                        includeUseDetailInNote: expensePreviewSample.includeUseDetailInNote,
                        vendor: expensePreviewSample.vendor,
                        executionDate: expensePreviewSample.executionDate,
                        evidenceNo: expensePreviewSample.evidenceNo,
                        payment: expensePreviewSample.payment,
                        supply: Number(expensePreviewSample.supply) || 0,
                        vat: expensePreviewSample.vat === "" ? null : (Number(expensePreviewSample.vat) || 0),
                        total: Number(expensePreviewSample.total) || 0,
                      }}
                    />
                    <ExpenseSampleEditor
                      sample={expensePreviewSample}
                      onChange={setExpensePreviewSample}
                    />
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <ExpenseLayoutSection layout={expenseLayout} onChange={setExpenseLayout} />
                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setExpenseLayout(DEFAULT_EXPENSE_LAYOUT);
                        toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                      }}
                    >
                      <RotateCcw className="size-4" />
                      기본값 초기화
                    </Button>
                    <Button onClick={handleSaveExpenseLayout} disabled={savingExpenseLayout} className="gap-2">
                      {savingExpenseLayout ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      저장
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── 운영회의록 ── */}
        <TabsContent value="meetingOp" className="space-y-4">
          <Tabs
            value={meetingOpSub}
            onValueChange={(v) => setMeetingOpSub(v as "info" | "layout")}
            className="flex flex-col space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">기본 설정·로고</TabsTrigger>
              <TabsTrigger value="layout">PDF 레이아웃</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <MeetingOpInfoSection
                settings={meetingOpSettings}
                onChange={setMeetingOpSettings}
              />
              <div className="flex items-center justify-between border-t pt-4">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setMeetingOpSettings(DEFAULT_MEETING_OP_SETTINGS);
                    toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                  }}
                >
                  <RotateCcw className="size-4" />
                  기본값 초기화
                </Button>
                <Button onClick={handleSaveMeetingOp} disabled={savingMeetingOp} className="gap-2">
                  {savingMeetingOp ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  저장
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="layout">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[420px]">
                  <div className="sticky top-4">
                    <MeetingOpPreview
                      layout={meetingOpLayout}
                      settings={meetingOpSettings}
                    />
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <MeetingOpLayoutSection
                    layout={meetingOpLayout}
                    onChange={setMeetingOpLayout}
                  />
                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setMeetingOpLayout(DEFAULT_MEETING_OP_LAYOUT);
                        toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
                      }}
                    >
                      <RotateCcw className="size-4" />
                      기본값 초기화
                    </Button>
                    <Button onClick={handleSaveMeetingOpLayout} disabled={savingMeetingOpLayout} className="gap-2">
                      {savingMeetingOpLayout ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      저장
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── 이력서 ── */}
        <TabsContent value="resume" className="space-y-4">
          <Tabs
            value={resumeSub}
            onValueChange={(v) => setResumeSub(v as "coordinator" | "instructor")}
            className="flex flex-col space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="coordinator">코디네이터</TabsTrigger>
              <TabsTrigger value="instructor">강사</TabsTrigger>
            </TabsList>

            <TabsContent value="coordinator">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[420px]">
                  <div className="sticky top-4">
                    <ResumePreview kind="coordinator" layout={resumeCoordLayout} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <ResumeLayoutSection
                    layout={resumeCoordLayout}
                    onChange={setResumeCoordLayout as (l: ResumeCoordinatorLayoutSettings) => void}
                  />
                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setResumeCoordLayout(DEFAULT_RESUME_COORDINATOR_LAYOUT);
                        toast("코디네이터 이력서 기본값으로 초기화");
                      }}
                    >
                      <RotateCcw /> 기본값
                    </Button>
                    <Button onClick={handleSaveResumeCoord} disabled={savingResumeCoord}>
                      {savingResumeCoord ? <Loader2 className="animate-spin" /> : <Save />} 저장
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="instructor">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[420px]">
                  <div className="sticky top-4">
                    <ResumePreview kind="instructor" layout={resumeInstLayout} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <ResumeLayoutSection
                    layout={resumeInstLayout}
                    onChange={(l) => setResumeInstLayout({ ...resumeInstLayout, ...l })}
                  />
                  <ResumeInstructorExtraSection
                    layout={resumeInstLayout}
                    onChange={setResumeInstLayout}
                  />
                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setResumeInstLayout(DEFAULT_RESUME_INSTRUCTOR_LAYOUT);
                        toast("강사 이력서 기본값으로 초기화");
                      }}
                    >
                      <RotateCcw /> 기본값
                    </Button>
                    <Button onClick={handleSaveResumeInst} disabled={savingResumeInst}>
                      {savingResumeInst ? <Loader2 className="animate-spin" /> : <Save />} 저장
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── 공통 ── */}
        <TabsContent value="common" className="space-y-4">
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
  partners: ["홍길동"],
  orgName: "(주)아이포트폴리오",
  outPlace: "서울특별시 강남구",
  payMethod: "법인카드",
  detail: "출장자명: 홍길동 / 프로젝트 미팅",
  writerName: "홍길동",
  nameSource: "georae",
  drafter3: "홍길동",
  memberText: "홍길동 외 2명",
  periodText: "2026. 04. 01 ~ 2026. 04. 03",
  purposeText: "신규 프로젝트 킥오프 미팅 참석 및 현장 조사",
  evidenceNo: "D-4-1",
  totalAmount: 0,
  expenseLines: [],
  orgGroup: "ipf",
  approver1: "팀장",
  approver2: "대표이사",
  hasEmpty: false,
  fieldWarnings: [],
  approvalGroupOverride: "auto",
};

function PdfPreview({ layout }: { layout: PdfLayoutSettings }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        registerPdfFonts();
        const mockLogoSrc = resolveHardcodedPdfLogoSrc(MOCK_TRIP_ROW.orgGroup);
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
  }, [layout]);

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
   Somyeong PDF Preview (mock data + live iframe)
   =================================================================== */

const MOCK_SOMYEONG_ROW: SomyeongRow = {
  rowIndex: 1,
  folderRaw: "C-9",
  folders: ["C-9"],
  title: "웨일북 대여비용 정산 지연 미치 오입금 처리 경위",
  detail:
    "1. 대금 지급 지연 사유: 당 사업단은 네이버 웨일북 대여비용에 대한 세금계산서(발행일: 2025.12.25)를 수취하였으나, 내부 정산 프로세스 확인 및 관련 행정 절차 소요로 인해 대금 지급이 당초 예정보다 약 3개월 지연되었습니다.\n\n2. 오입금 발생 경위: 이후 지연된 대금을 지급하는 과정에서, 담당자의 행정적 착오로 인해 수납 계좌가 아닌 잘못된 계좌(네이버 관련)로 대금이 송금되었습니다. (2026.3.31)\n\n3. 인지 및 조치 사항: 정산 미감일 후 해당 오입금 사실을 인지하였으며, 오입금된 금액에 대한 환수 조치를 취하여 전액 회수를 완료하였습니다.\n\n4. 최종 처리 결과: 환수 완료 즉시 실제 수납 계좌로 재입금 처리를 완료(2026.4.1)하였으며, 현재 대여비용 전액이 정상적으로 지급 완료된 상태입니다.\n\n5. 의견 및 최종 확인: 상기 내용은 사실과 다름없으며, 관련 증빙 자료를 첨부하여 소명합니다.",
  attachments:
    "1. 오입금 이체확인증 1부\n2. 오입금액 환수 내역 증빙 1부\n3. 정상 계좌 재입금 이체확인증 1부",
  seomok: "사업시설장비비",
  subSeomok: "장비/시설임차비",
  hasEmpty: false,
  fieldWarnings: [],
};

function SomyeongPreview({
  layout,
  settings,
}: {
  layout: SomyeongLayoutSettings;
  settings: SomyeongSettings;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  const generation = useRef(0);

  // 빈 값일 때 미리보기에서만 채우는 mock 설정
  const previewSettings: SomyeongSettings = {
    ...settings,
    name: settings.name || "채영지",
    orgPosition: settings.orgPosition || "(주)아이포트폴리오 / 팀장",
    phone: settings.phone || "010-0000-0000",
    birthdate: settings.birthdate || "1985. 06. 26.",
    address: settings.address || "서울특별시 강서구 마곡중앙8로 57, B동 8층",
    date: settings.date || "2026년 4월 28일",
    writerName: settings.writerName || "채영지",
    recipient: settings.recipient || "한국과학창의재단 귀하",
  };

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        registerPdfFonts();
        const blob = await pdf(
          <SomyeongDocument row={MOCK_SOMYEONG_ROW} settings={previewSettings} layout={layout} />
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, settings]);

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
            title="소명서 PDF 미리보기"
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
   Return PDF Preview (mock data + live iframe)
   =================================================================== */

const MOCK_RETURN_ROW_BASE: Omit<ReturnRow, "approval"> = {
  rowIndex: 0,
  primaryKey: "R-2026-001",
  org: "(주)아이포트폴리오",
  name: "홍길동",
  periodRaw: "2026.04.01 ~ 2026.04.03",
  periodText: "2026. 4. 1 ~ 2026. 4. 3",
  startYymmdd: "260401",
  invalidPeriod: false,
  destination: "서울특별시 강남구 / 테헤란로 123",
  purpose: "신규 프로젝트 킥오프 미팅 참석 및 현장 조사",
  workContent:
    "1. 프로젝트 요구사항 정의 회의 참석\n2. 협력사 담당자 인터뷰 진행\n3. 현장 시설 점검 및 사진 촬영\n4. 차주 일정 및 산출물 협의",
  notes: "특이사항 없음",
  cost: "350,000원",
  costAnnotation: "",
  payment: "법인카드",
  photos: [],
  hasEmpty: false,
  fieldWarnings: [],
};

function ReturnPreview({
  layout,
  settings,
}: {
  layout: ReturnLayoutSettings;
  settings: ReturnSettings;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        registerPdfFonts();
        const row: ReturnRow = {
          ...MOCK_RETURN_ROW_BASE,
          approval: settings.approval,
        };
        const blob = await pdf(
          <BusinessReturnDocument row={row} layout={layout} />,
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
  }, [layout, settings]);

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
            title="출장복명서 PDF 미리보기"
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
   SW Request 미리보기 + 정보·레이아웃 섹션
   =================================================================== */

const MOCK_SW_REQUEST_ROW: SwRequestRow = {
  rowIndex: 0,
  evidenceNo: "D-3-1",
  schoolRaw: "인천갈월초",
  schoolName: "인천갈월초등학교",
  applicantName: "홍길동",
  applicantPhone: "010-0000-0000",
  applicantTarget: "교원",
  quoteDateRaw: "2026 년 04 월 27 일",
  quoteYymmdd: "260427",
  quoteY: "2026",
  quoteM: "4",
  quoteD: "27",
  items: [
    { user: "홍길동", product: "패들렛 platinum", quantity: "2개", period: "6개월", warnings: [] },
    { user: "홍길동", product: "ZEP 퀴즈 베이직", quantity: "2개", period: "5개월", warnings: [] },
    { user: "홍길동", product: "Chat GPT Plus", quantity: "1개", period: "5개월", warnings: [] },
  ],
  hasEmpty: false,
  fieldWarnings: [],
};

function SwRequestPreview({
  layout,
  settings,
}: {
  layout: SwRequestLayoutSettings;
  settings: SwRequestSettings;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        registerPdfFonts();
        const blob = await pdf(
          <SwRequestDocument row={MOCK_SW_REQUEST_ROW} settings={settings} layout={layout} />,
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
  }, [layout, settings]);

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
            title="소프트웨어 요청서 PDF 미리보기"
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

function SwRequestInfoSection({
  settings,
  onChange,
}: {
  settings: SwRequestSettings;
  onChange: (s: SwRequestSettings) => void;
}) {
  const set = <K extends keyof SwRequestSettings>(k: K, v: SwRequestSettings[K]) =>
    onChange({ ...settings, [k]: v });
  return (
    <Card>
      <CardHeader>
        <CardTitle>기본 문구</CardTitle>
        <CardDescription>모든 학교 PDF에 공통으로 들어가는 문구를 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">제목</Label>
          <Input value={settings.titleText} onChange={(e) => set("titleText", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">신청 대상 (기본값)</Label>
          <Input value={settings.defaultTarget} onChange={(e) => set("defaultTarget", e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            행별로 비어있을 때 채워지는 기본값. 검토 단계에서 행마다 수정 가능.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">마무리 문구</Label>
          <Input value={settings.closingText} onChange={(e) => set("closingText", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">수신처</Label>
          <Input value={settings.recipientText} onChange={(e) => set("recipientText", e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function SwRequestLayoutSection({
  layout,
  onChange,
}: {
  layout: SwRequestLayoutSettings;
  onChange: (l: SwRequestLayoutSettings) => void;
}) {
  const set = <K extends keyof SwRequestLayoutSettings>(
    k: K,
    patch: Partial<SwRequestLayoutSettings[K]>,
  ) => onChange({ ...layout, [k]: { ...layout[k], ...patch } });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>페이지</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">폰트</Label>
            <Select
              value={layout.page.fontFamily}
              onValueChange={(v) => { if (v) set("page", { fontFamily: v }); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PDF_FONT_FAMILIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">기본 폰트 크기</Label>
            <Input type="number" value={layout.page.baseFontSize}
              onChange={(e) => set("page", { baseFontSize: Number(e.target.value) || 10 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">여백 (mm)</Label>
            <Input type="number" value={layout.page.marginMm}
              onChange={(e) => set("page", { marginMm: Number(e.target.value) || 20 })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>제목</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">크기</Label>
            <Input type="number" value={layout.title.fontSize}
              onChange={(e) => set("title", { fontSize: Number(e.target.value) || 18 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">하단 여백</Label>
            <Input type="number" value={layout.title.marginBottom}
              onChange={(e) => set("title", { marginBottom: Number(e.target.value) || 32 })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>신청자 정보 표</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">헤더 배경</Label>
            <Input value={layout.infoTable.headerBg}
              onChange={(e) => set("infoTable", { headerBg: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">라벨 배경</Label>
            <Input value={layout.infoTable.labelBg}
              onChange={(e) => set("infoTable", { labelBg: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">테두리 색</Label>
            <Input value={layout.infoTable.borderColor}
              onChange={(e) => set("infoTable", { borderColor: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">라벨 폭 (pt)</Label>
            <Input type="number" value={layout.infoTable.labelWidth}
              onChange={(e) => set("infoTable", { labelWidth: Number(e.target.value) || 90 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">행 높이</Label>
            <Input type="number" value={layout.infoTable.rowHeight}
              onChange={(e) => set("infoTable", { rowHeight: Number(e.target.value) || 28 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">하단 여백</Label>
            <Input type="number" value={layout.infoTable.marginBottom}
              onChange={(e) => set("infoTable", { marginBottom: Number(e.target.value) || 28 })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>요청 사항 표</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">헤더 배경</Label>
            <Input value={layout.itemsTable.headerBg}
              onChange={(e) => set("itemsTable", { headerBg: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">테두리 색</Label>
            <Input value={layout.itemsTable.borderColor}
              onChange={(e) => set("itemsTable", { borderColor: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">행 높이</Label>
            <Input type="number" value={layout.itemsTable.rowHeight}
              onChange={(e) => set("itemsTable", { rowHeight: Number(e.target.value) || 26 })} />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label className="text-xs">컬럼 비율 (사용자 / 품목 / 수량 / 기간)</Label>
            <div className="grid grid-cols-4 gap-2">
              {layout.itemsTable.colRatios.map((r, i) => (
                <Input
                  key={i}
                  type="number"
                  step="0.01"
                  value={r}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0.01;
                    const next = [...layout.itemsTable.colRatios] as [number, number, number, number];
                    next[i] = v;
                    set("itemsTable", { colRatios: next });
                  }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>마무리 문구 / 날짜 / 수신처</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">마무리 폰트 크기</Label>
            <Input type="number" value={layout.closing.fontSize}
              onChange={(e) => set("closing", { fontSize: Number(e.target.value) || 11 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">마무리 상단 여백</Label>
            <Input type="number" value={layout.closing.marginTop}
              onChange={(e) => set("closing", { marginTop: Number(e.target.value) || 36 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">날짜 폰트</Label>
            <Input type="number" value={layout.date.fontSize}
              onChange={(e) => set("date", { fontSize: Number(e.target.value) || 11 })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">수신처 폰트</Label>
            <Input type="number" value={layout.recipient.fontSize}
              onChange={(e) => set("recipient", { fontSize: Number(e.target.value) || 12 })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>빈칸 표시</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">빈칸 텍스트</Label>
            <Input value={layout.placeholders.emptyField}
              onChange={(e) => set("placeholders", { emptyField: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">빈칸 색상</Label>
            <Input value={layout.placeholders.emptyFieldColor}
              onChange={(e) => set("placeholders", { emptyFieldColor: e.target.value })} />
          </div>
        </CardContent>
      </Card>
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
  ipf: "iPF ((주)아이포트폴리오)",
  dimi: "디미교연 ((사)디지털미디어교육콘텐츠 교사연구협회)",
};

/**
 * 로고는 `public/logos/ipf.jpg`, `public/logos/dimi.png` 하드코딩 사용.
 * Firestore에 data URL 저장 시 문서 크기 제한으로 저장이 실패할 수 있어 업로드 UI는 끕니다.
 * 다시 쓰려면 true로 바꾸고 `trip-tool`에서 `logoImageUrl`을 우선하도록 되돌리면 됩니다.
 */
const SHOW_ADMIN_LOGO_IMAGE_UPLOAD = false;

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
          {GROUP_LABELS[groupId] ?? groupId} — 결재자 서명
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {SHOW_ADMIN_LOGO_IMAGE_UPLOAD && (
          <>
            <LogoRow groupId={groupId} settings={settings} onChange={onChange} />
            <Separator />
          </>
        )}
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
   Somyeong Layout Section
   =================================================================== */

const TEXT_ALIGN_OPTIONS = ["left", "center", "right"] as const;

function AlignField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "left" | "center" | "right";
  onChange: (v: "left" | "center" | "right") => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => { if (v) onChange(v as "left" | "center" | "right"); }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {TEXT_ALIGN_OPTIONS.map((a) => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SomyeongLayoutSection({
  layout,
  onChange,
}: {
  layout: SomyeongLayoutSettings;
  onChange: (l: SomyeongLayoutSettings) => void;
}) {
  const set = <K extends keyof SomyeongLayoutSettings>(
    section: K,
    patch: Partial<SomyeongLayoutSettings[K]>
  ) => onChange({ ...layout, [section]: { ...layout[section], ...patch } });

  return (
    <div className="space-y-4">
      {/* 페이지 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">페이지</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">폰트</Label>
              <Select
                value={layout.page.fontFamily}
                onValueChange={(v) => { if (v) set("page", { fontFamily: v }); }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PDF_FONT_FAMILIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
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

      {/* 테두리 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">테두리 선</CardTitle>
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
          <CardTitle className="text-base">제목 (소명서)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="크기" value={layout.title.fontSize} onChange={(v) => set("title", { fontSize: v })} unit="pt" />
            <NumField label="굵기" value={layout.title.fontWeight} onChange={(v) => set("title", { fontWeight: v })} step={100} min={100} />
            <AlignField label="정렬" value={layout.title.textAlign} onChange={(v) => set("title", { textAlign: v })} />
            <NumField label="하단 여백" value={layout.title.marginBottom} onChange={(v) => set("title", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 섹션 헤더 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">섹션 헤더</CardTitle>
          <CardDescription>소명자 정보 / 소명서 상세 내용 헤더 행</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="크기" value={layout.sectionHeader.fontSize} onChange={(v) => set("sectionHeader", { fontSize: v })} unit="pt" />
            <NumField label="굵기" value={layout.sectionHeader.fontWeight} onChange={(v) => set("sectionHeader", { fontWeight: v })} step={100} min={100} />
            <NumField label="최소 높이" value={layout.sectionHeader.minHeight} onChange={(v) => set("sectionHeader", { minHeight: v })} unit="pt" />
            <ColorField label="배경색" value={layout.sectionHeader.bgColor} onChange={(v) => set("sectionHeader", { bgColor: v })} />
          </div>
        </CardContent>
      </Card>

      {/* 소명자 정보 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">소명자 정보 테이블</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="라벨 칸 가로" value={layout.infoTable.labelWidth} onChange={(v) => set("infoTable", { labelWidth: v })} unit="pt" />
            <NumField label="행 최소 높이" value={layout.infoTable.rowMinHeight} onChange={(v) => set("infoTable", { rowMinHeight: v })} unit="pt" />
            <NumField label="테이블 하단 여백" value={layout.infoTable.marginBottom} onChange={(v) => set("infoTable", { marginBottom: v })} unit="pt" />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ColorField label="라벨 배경색" value={layout.infoTable.labelBgColor} onChange={(v) => set("infoTable", { labelBgColor: v })} />
            <NumField label="라벨 패딩 세로" value={layout.infoTable.labelPaddingV} onChange={(v) => set("infoTable", { labelPaddingV: v })} unit="pt" />
            <NumField label="라벨 패딩 가로" value={layout.infoTable.labelPaddingH} onChange={(v) => set("infoTable", { labelPaddingH: v })} unit="pt" />
            <NumField label="라벨 크기" value={layout.infoTable.labelFontSize} onChange={(v) => set("infoTable", { labelFontSize: v })} unit="pt" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="라벨 굵기" value={layout.infoTable.labelFontWeight} onChange={(v) => set("infoTable", { labelFontWeight: v })} step={100} min={100} />
            <NumField label="값 패딩 세로" value={layout.infoTable.valuePaddingV} onChange={(v) => set("infoTable", { valuePaddingV: v })} unit="pt" />
            <NumField label="값 패딩 가로" value={layout.infoTable.valuePaddingH} onChange={(v) => set("infoTable", { valuePaddingH: v })} unit="pt" />
            <NumField label="값 크기" value={layout.infoTable.valueFontSize} onChange={(v) => set("infoTable", { valueFontSize: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 상세 내용 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">소명서 상세 내용</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <NumField label="패딩 세로" value={layout.detailSection.paddingV} onChange={(v) => set("detailSection", { paddingV: v })} unit="pt" />
            <NumField label="패딩 가로" value={layout.detailSection.paddingH} onChange={(v) => set("detailSection", { paddingH: v })} unit="pt" />
            <NumField label="크기" value={layout.detailSection.fontSize} onChange={(v) => set("detailSection", { fontSize: v })} unit="pt" />
            <NumField label="줄 높이" value={layout.detailSection.lineHeight} onChange={(v) => set("detailSection", { lineHeight: v })} step={0.1} />
            <NumField label="하단 여백" value={layout.detailSection.marginBottom} onChange={(v) => set("detailSection", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 구분선 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">구분선</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <NumField label="상단 여백" value={layout.divider.marginTop} onChange={(v) => set("divider", { marginTop: v })} unit="pt" />
            <NumField label="하단 여백" value={layout.divider.marginBottom} onChange={(v) => set("divider", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 첨부서류 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">첨부서류</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="제목 크기" value={layout.attachSection.titleFontSize} onChange={(v) => set("attachSection", { titleFontSize: v })} unit="pt" />
            <NumField label="제목 굵기" value={layout.attachSection.titleFontWeight} onChange={(v) => set("attachSection", { titleFontWeight: v })} step={100} min={100} />
            <NumField label="제목 하단 여백" value={layout.attachSection.titleMarginBottom} onChange={(v) => set("attachSection", { titleMarginBottom: v })} unit="pt" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="내용 크기" value={layout.attachSection.fontSize} onChange={(v) => set("attachSection", { fontSize: v })} unit="pt" />
            <NumField label="줄 높이" value={layout.attachSection.lineHeight} onChange={(v) => set("attachSection", { lineHeight: v })} step={0.1} />
            <NumField label="하단 여백" value={layout.attachSection.marginBottom} onChange={(v) => set("attachSection", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      {/* 누락 데이터 표시 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">누락 데이터 표시</CardTitle>
          <CardDescription>
            소명자 정보·건명·상세내용·첨부서류 등이 비어있을 때 PDF에 표시되는 대체 문구와 색상이에요.
            눈에 띄는 색상을 설정하면 누락된 곳을 바로 찾을 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PlaceholderRow
            label="빈 필드 대체 문구"
            desc="성명·연락처·건명·상세내용·첨부서류 등이 비어있을 때"
            text={layout.placeholders.emptyField}
            color={layout.placeholders.emptyFieldColor}
            onTextChange={(v) => set("placeholders", { emptyField: v })}
            onColorChange={(v) => set("placeholders", { emptyFieldColor: v })}
          />
          <Separator />
          <PlaceholderRow
            label="작성자 서명 없음"
            desc="어드민에 서명 이미지가 등록되지 않았을 때"
            text={layout.placeholders.signEmpty}
            color={layout.placeholders.signEmptyColor}
            onTextChange={(v) => set("placeholders", { signEmpty: v })}
            onColorChange={(v) => set("placeholders", { signEmptyColor: v })}
          />
        </CardContent>
      </Card>

      {/* 문구 / 날짜 / 서명 / 수신처 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">서명 영역</CardTitle>
          <CardDescription>소명 문구, 날짜, 서명, 수신처</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs font-medium text-muted-foreground">소명 문구</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="크기" value={layout.closingText.fontSize} onChange={(v) => set("closingText", { fontSize: v })} unit="pt" />
            <AlignField label="정렬" value={layout.closingText.textAlign} onChange={(v) => set("closingText", { textAlign: v })} />
            <NumField label="상단 여백" value={layout.closingText.marginTop} onChange={(v) => set("closingText", { marginTop: v })} unit="pt" />
            <NumField label="하단 여백" value={layout.closingText.marginBottom} onChange={(v) => set("closingText", { marginBottom: v })} unit="pt" />
          </div>
          <Separator />
          <p className="text-xs font-medium text-muted-foreground">날짜</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="크기" value={layout.dateText.fontSize} onChange={(v) => set("dateText", { fontSize: v })} unit="pt" />
            <AlignField label="정렬" value={layout.dateText.textAlign} onChange={(v) => set("dateText", { textAlign: v })} />
            <NumField label="하단 여백" value={layout.dateText.marginBottom} onChange={(v) => set("dateText", { marginBottom: v })} unit="pt" />
          </div>
          <Separator />
          <p className="text-xs font-medium text-muted-foreground">서명 행 (작성자)</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="글자 크기" value={layout.signature.fontSize} onChange={(v) => set("signature", { fontSize: v })} unit="pt" />
            <NumField label="서명 이미지 최대 높이" value={layout.signature.signImageMaxHeight} onChange={(v) => set("signature", { signImageMaxHeight: v })} unit="pt" />
            <NumField label="하단 여백" value={layout.signature.marginBottom} onChange={(v) => set("signature", { marginBottom: v })} unit="pt" />
          </div>
          <Separator />
          <p className="text-xs font-medium text-muted-foreground">수신처</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="크기" value={layout.recipient.fontSize} onChange={(v) => set("recipient", { fontSize: v })} unit="pt" />
            <NumField label="굵기" value={layout.recipient.fontWeight} onChange={(v) => set("recipient", { fontWeight: v })} step={100} min={100} />
            <AlignField label="정렬" value={layout.recipient.textAlign} onChange={(v) => set("recipient", { textAlign: v })} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ===================================================================
   Somyeong Settings Section
   =================================================================== */

function SomyeongSettingsSection({
  settings,
  onChange,
}: {
  settings: SomyeongSettings;
  onChange: (s: SomyeongSettings) => void;
}) {
  const set = (patch: Partial<SomyeongSettings>) => onChange({ ...settings, ...patch });

  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [rawDataUrl, setRawDataUrl] = useState("");

  const handleSignatureFile = async (file: File) => {
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

  const FIELDS: { key: keyof SomyeongSettings; label: string; placeholder?: string }[] = [
    { key: "name", label: "성명", placeholder: "채영지" },
    { key: "orgPosition", label: "소속/직위", placeholder: "(주)아이포트폴리오 / 팀장" },
    { key: "phone", label: "연락처", placeholder: "010-0000-0000" },
    { key: "birthdate", label: "생년월일", placeholder: "1985. 06. 26." },
    { key: "address", label: "사업장 주소", placeholder: "서울특별시 강서구 마곡중앙8로 57, B동 8층" },
    { key: "date", label: "날짜", placeholder: "2026년 4월 28일" },
    { key: "writerName", label: "작성자 이름", placeholder: "채영지" },
    { key: "recipient", label: "수신처", placeholder: "한국과학창의재단 귀하" },
  ];

  return (
    <div className="space-y-4">
      {/* 소명자 정보 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">소명자 정보</CardTitle>
          <CardDescription>소명서 PDF에 고정으로 들어가는 인적사항이에요.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                value={settings[key] as string}
                placeholder={placeholder}
                onChange={(e) => set({ [key]: e.target.value })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 서명 이미지 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">서명 이미지</CardTitle>
          <CardDescription>작성자 서명 이미지를 업로드해요. 배경 제거 + 크롭 기능이 제공돼요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <div
              className="size-20 shrink-0 rounded-lg border flex items-center justify-center overflow-hidden"
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
                <img src={settings.signatureImageUrl} alt="서명" className="size-full object-contain" />
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
                  if (f) handleSignatureFile(f);
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
                {settings.signatureImageUrl ? "교체" : "업로드"}
              </Button>
              {settings.signatureImageUrl && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setRawDataUrl(settings.signatureImageUrl);
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
                    onClick={() => set({ signatureImageUrl: "" })}
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
              set({ signatureImageUrl: dataUrl });
              setCropDialogOpen(false);
              toast.success("서명 이미지가 설정되었어요.");
            }}
            onCancel={() => setCropDialogOpen(false)}
          />
        </CardContent>
      </Card>

      {/* 세목별 N값 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">세목별 N값</CardTitle>
          <CardDescription>
            파일명 형식: <code className="rounded bg-muted px-1 text-xs">폴더명_N.소명서_건명.pdf</code>
            <br />세목별로 N을 다르게 설정할 수 있어요. 기본값은 0이에요.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SEOMOK_LIST.map((s) => (
            <div key={s} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{s}</Label>
              <Input
                type="number"
                min={0}
                value={settings.seomokN[s] ?? 0}
                onChange={(e) =>
                  set({
                    seomokN: { ...settings.seomokN, [s]: Number(e.target.value) || 0 },
                  })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 기본값 초기화 */}
      <div className="flex">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            onChange(DEFAULT_SOMYEONG_SETTINGS);
            toast("기본값으로 초기화했어요.", { description: "저장을 눌러야 반영돼요." });
          }}
        >
          <RotateCcw className="size-4" />
          기본값 초기화
        </Button>
      </div>
    </div>
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

/* ===================================================================
   Return Approval Settings Section (출장복명서 결재 서명 — 이름별 자동 매핑)
   =================================================================== */

function ReturnSignatureUploader({
  label,
  description,
  url,
  onChange,
}: {
  label: string;
  description: string;
  url: string;
  onChange: (next: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [rawDataUrl, setRawDataUrl] = useState("");

  const handleFile = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setRawDataUrl(dataUrl);
      setCropOpen(true);
    } catch {
      toast.error("이미지 읽기 실패");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div
            className="shrink-0 size-20 rounded-lg border flex items-center justify-center overflow-hidden"
            style={{
              backgroundImage: url
                ? "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)"
                : undefined,
              backgroundSize: "12px 12px",
              backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
              backgroundColor: url ? undefined : "hsl(var(--muted))",
            }}
          >
            {url ? (
              <img src={url} alt={`${label} 서명`} className="size-full object-contain" />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
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
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {url ? "교체" : "업로드"}
            </Button>
            {url && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setRawDataUrl(url);
                    setCropOpen(true);
                  }}
                >
                  <Scissors className="size-3.5" />
                  편집
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => onChange("")}
                >
                  <Trash2 className="size-3.5" />
                  삭제
                </Button>
              </>
            )}
          </div>
        </div>

        <SignatureCropDialog
          open={cropOpen}
          rawDataUrl={rawDataUrl}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setCropOpen(false);
            toast.success("서명 이미지 설정 완료");
          }}
          onCancel={() => setCropOpen(false)}
        />
      </CardContent>
    </Card>
  );
}

function ReturnApprovalSettingsSection({
  settings,
  onChange,
}: {
  settings: ReturnSettings;
  onChange: (s: ReturnSettings) => void;
}) {
  const setSig = (key: keyof ReturnSettings["signatures"], url: string) => {
    onChange({
      ...settings,
      signatures: { ...settings.signatures, [key]: url },
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">이름 기반 자동 매핑 규칙</CardTitle>
          <CardDescription>
            출장자 성명에 따라 결재라인이 자동 구성돼요. 행별로 도구에서 오버라이드할 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• <span className="font-semibold text-foreground">장인선</span> 출장: 담당(장인선) · 팀장(/) · 본부장(장인선 서명)</li>
            <li>• <span className="font-semibold text-foreground">김성윤</span> 출장: 담당(김성윤) · 팀장(/) · 대표이사(김성윤 서명)</li>
            <li>• 그 외 출장자: 담당(이름) · 팀장(채영지 서명) · 본부장(장인선 서명)</li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReturnSignatureUploader
          label="팀장 — 채영지"
          description="다른 출장자의 팀장 셀에 사용"
          url={settings.signatures.manager}
          onChange={(u) => setSig("manager", u)}
        />
        <ReturnSignatureUploader
          label="본부장 — 장인선"
          description="장인선 본인 출장 + 다른 출장자의 본부장 셀에 사용"
          url={settings.signatures.director}
          onChange={(u) => setSig("director", u)}
        />
        <ReturnSignatureUploader
          label="대표이사 — 김성윤"
          description="김성윤 본인 출장에만 사용"
          url={settings.signatures.ceo}
          onChange={(u) => setSig("ceo", u)}
        />
      </div>
    </div>
  );
}

/* ===================================================================
   Return Layout Section (출장복명서 PDF 레이아웃)
   =================================================================== */

function ReturnLayoutSection({
  layout,
  onChange,
}: {
  layout: ReturnLayoutSettings;
  onChange: (l: ReturnLayoutSettings) => void;
}) {
  const set = <K extends keyof ReturnLayoutSettings>(
    section: K,
    patch: Partial<ReturnLayoutSettings[K]>
  ) => onChange({ ...layout, [section]: { ...layout[section], ...patch } });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">페이지</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">폰트</Label>
              <Select value={layout.page.fontFamily} onValueChange={(v) => { if (v) set("page", { fontFamily: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PDF_FONT_FAMILIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <NumField label="기본 크기" value={layout.page.baseFontSize} onChange={(v) => set("page", { baseFontSize: v })} step={0.5} unit="pt" />
            <NumField label="줄 높이" value={layout.page.baseLineHeight} onChange={(v) => set("page", { baseLineHeight: v })} step={0.1} />
            <NumField label="여백" value={layout.page.marginMm} onChange={(v) => set("page", { marginMm: v })} unit="mm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">제목</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="크기" value={layout.title.fontSize} onChange={(v) => set("title", { fontSize: v })} unit="pt" />
            <NumField label="굵기" value={layout.title.fontWeight} onChange={(v) => set("title", { fontWeight: v })} step={100} min={100} />
            <NumField label="자간" value={layout.title.letterSpacing} onChange={(v) => set("title", { letterSpacing: v })} unit="pt" />
            <NumField label="하단 여백" value={layout.title.marginBottom} onChange={(v) => set("title", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">결재란</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="가로" value={layout.approval.tableWidth} onChange={(v) => set("approval", { tableWidth: v })} unit="pt" />
            <NumField label="헤더 높이" value={layout.approval.headerMinHeight} onChange={(v) => set("approval", { headerMinHeight: v })} unit="pt" />
            <NumField label="셀 높이" value={layout.approval.cellMinHeight} onChange={(v) => set("approval", { cellMinHeight: v })} unit="pt" />
            <NumField label="헤더 글자" value={layout.approval.headerFontSize} onChange={(v) => set("approval", { headerFontSize: v })} unit="pt" />
            <ColorField label="헤더 배경" value={layout.approval.headerBgColor} onChange={(v) => set("approval", { headerBgColor: v })} />
            <NumField label="셀 패딩" value={layout.approval.cellPadding} onChange={(v) => set("approval", { cellPadding: v })} unit="pt" />
            <NumField label="텍스트 글자" value={layout.approval.textFontSize} onChange={(v) => set("approval", { textFontSize: v })} unit="pt" />
            <NumField label="이미지 최대 높이" value={layout.approval.imageMaxHeight} onChange={(v) => set("approval", { imageMaxHeight: v })} unit="pt" />
            <NumField label="annotation 글자" value={layout.approval.annotationFontSize} onChange={(v) => set("approval", { annotationFontSize: v })} step={0.5} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">데이터 테이블</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="라벨 너비" value={layout.dataTable.labelWidth} onChange={(v) => set("dataTable", { labelWidth: v })} unit="pt" />
            <NumField label="행 높이" value={layout.dataTable.rowMinHeight} onChange={(v) => set("dataTable", { rowMinHeight: v })} unit="pt" />
            <ColorField label="라벨 배경" value={layout.dataTable.labelBgColor} onChange={(v) => set("dataTable", { labelBgColor: v })} />
            <NumField label="라벨 글자" value={layout.dataTable.labelFontSize} onChange={(v) => set("dataTable", { labelFontSize: v })} unit="pt" />
            <NumField label="라벨 굵기" value={layout.dataTable.labelFontWeight} onChange={(v) => set("dataTable", { labelFontWeight: v })} step={100} min={100} />
            <NumField label="값 글자" value={layout.dataTable.valueFontSize} onChange={(v) => set("dataTable", { valueFontSize: v })} unit="pt" />
            <NumField label="값 패딩 세로" value={layout.dataTable.valuePaddingV} onChange={(v) => set("dataTable", { valuePaddingV: v })} unit="pt" />
            <NumField label="값 패딩 가로" value={layout.dataTable.valuePaddingH} onChange={(v) => set("dataTable", { valuePaddingH: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">업무내용 (계층 불릿)</CardTitle>
          <CardDescription>depth별 들여쓰기 + 마커. 1단계 마커가 `1.` 형태이면 자동 번호 매김.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="최소 높이" value={layout.workContent.minHeight} onChange={(v) => set("workContent", { minHeight: v })} unit="pt" />
            <NumField label="패딩 세로" value={layout.workContent.paddingV} onChange={(v) => set("workContent", { paddingV: v })} unit="pt" />
            <NumField label="패딩 가로" value={layout.workContent.paddingH} onChange={(v) => set("workContent", { paddingH: v })} unit="pt" />
            <NumField label="글자 크기" value={layout.workContent.fontSize} onChange={(v) => set("workContent", { fontSize: v })} unit="pt" />
            <NumField label="줄 높이" value={layout.workContent.lineHeight} onChange={(v) => set("workContent", { lineHeight: v })} step={0.05} />
            <NumField label="depth별 들여쓰기" value={layout.workContent.indentPerDepth} onChange={(v) => set("workContent", { indentPerDepth: v })} unit="pt" />
            <NumField label="항목 간격" value={layout.workContent.itemSpacing} onChange={(v) => set("workContent", { itemSpacing: v })} unit="pt" />
          </div>
          <Separator />
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">depth 1 마커</Label>
              <Input value={layout.workContent.depthMarkers[0]} onChange={(e) => set("workContent", { depthMarkers: [e.target.value, layout.workContent.depthMarkers[1], layout.workContent.depthMarkers[2]] })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">depth 2 마커</Label>
              <Input value={layout.workContent.depthMarkers[1]} onChange={(e) => set("workContent", { depthMarkers: [layout.workContent.depthMarkers[0], e.target.value, layout.workContent.depthMarkers[2]] })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">depth 3 마커</Label>
              <Input value={layout.workContent.depthMarkers[2]} onChange={(e) => set("workContent", { depthMarkers: [layout.workContent.depthMarkers[0], layout.workContent.depthMarkers[1], e.target.value] })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">특이사항</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="최소 높이" value={layout.notes.minHeight} onChange={(v) => set("notes", { minHeight: v })} unit="pt" />
            <NumField label="패딩 세로" value={layout.notes.paddingV} onChange={(v) => set("notes", { paddingV: v })} unit="pt" />
            <NumField label="패딩 가로" value={layout.notes.paddingH} onChange={(v) => set("notes", { paddingH: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">테두리 / 누락 표시</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <NumField label="선 두께" value={layout.border.width} onChange={(v) => set("border", { width: v })} step={0.25} unit="pt" />
            <ColorField label="선 색상" value={layout.border.color} onChange={(v) => set("border", { color: v })} />
          </div>
          <Separator />
          <PlaceholderRow
            label="빈 필드 대체 문구"
            desc="필드가 비어있을 때 PDF에 표시되는 색상 강조 문구"
            text={layout.placeholders.emptyField}
            color={layout.placeholders.emptyFieldColor}
            onTextChange={(v) => set("placeholders", { emptyField: v })}
            onColorChange={(v) => set("placeholders", { emptyFieldColor: v })}
          />
          <Separator />
          <PlaceholderRow
            label="날짜 인식 실패 문구"
            desc="출장기간을 날짜로 변환 못 했을 때"
            text={layout.placeholders.dateInvalid}
            color={layout.placeholders.dateInvalidColor}
            onTextChange={(v) => set("placeholders", { dateInvalid: v })}
            onColorChange={(v) => set("placeholders", { dateInvalidColor: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ===================================================================
   Expense (지출결의서) — 모크 데이터 + Preview + 기본정보·레이아웃 섹션
   =================================================================== */

const MOCK_EXPENSE_ROW: ExpenseRow = {
  rowIndex: 0,
  sourceTab: "D-1.외부 전문가 기술 활용비",
  semok: "사업활동비",
  sesemok: "외부 전문가 기술 활용비",
  evidenceNo: "D-1-100",
  vendor: "신예진",
  useDate: "2025. 5. 24",
  executionDate: "2026. 3. 31",
  supply: 20000,
  vat: null,
  total: 20000,
  useDetail:
    "1. 전문가명(신예진)\n2. 산출내역 및 활용내용\n- 5/24: 코디강사역량강화세미나(참석) 교통비 20,000원(이동거리 50km 이내)",
  includeUseDetail: false,
  includeUseDetailInNote: false,
  purpose: "05.24 코디강사역량강화세미나(참석)를 위한 교통비 지급의 건 (대상자: 신예진)",
  payment: "계좌이체",
  note: "교통비 지급(20,000원)",
  serial: "IPF-20260331-R1234",
  writerDate: "2026. 03. 27",
  handlerApprovalDate: "2026. 03. 30",
  approverApprovalDate: "2026. 03. 30",
  hasEmpty: false,
  fieldWarnings: [],
};

/** 어드민 미리보기에서 덮어쓸 수 있는 샘플 텍스트 입력 */
export type ExpenseSampleOverrides = Partial<Pick<
  ExpenseRow,
  "useDetail" | "includeUseDetail" | "includeUseDetailInNote" | "purpose" | "note" | "vendor" | "executionDate" | "evidenceNo" | "payment" | "supply" | "vat" | "total"
>>;

type ExpenseSampleState = {
  note: string;
  purpose: string;
  useDetail: string;
  includeUseDetail: boolean;
  includeUseDetailInNote: boolean;
  vendor: string;
  executionDate: string;
  evidenceNo: string;
  payment: string;
  supply: string;
  vat: string;
  total: string;
};

function ExpenseSampleEditor({
  sample,
  onChange,
}: {
  sample: ExpenseSampleState;
  onChange: (next: ExpenseSampleState) => void;
}) {
  const set = <K extends keyof ExpenseSampleState>(k: K, v: ExpenseSampleState[K]) => onChange({ ...sample, [k]: v });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">미리보기 샘플 텍스트</CardTitle>
        <CardDescription className="text-[11px]">
          저장되지 않아요. 비고·사용내역이 길어질 때 PDF에 어떻게 들어가는지 확인용.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">증빙번호</Label>
            <Input value={sample.evidenceNo} onChange={(e) => set("evidenceNo", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">거래처</Label>
            <Input value={sample.vendor} onChange={(e) => set("vendor", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">집행일자</Label>
            <Input value={sample.executionDate} onChange={(e) => set("executionDate", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">지급방법</Label>
            <Input value={sample.payment} onChange={(e) => set("payment", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">공급가액</Label>
            <Input
              type="number"
              value={sample.supply}
              onChange={(e) => set("supply", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">세액 (빈칸 = -)</Label>
            <Input
              type="number"
              value={sample.vat}
              onChange={(e) => set("vat", e.target.value)}
              className="h-8 text-xs"
              placeholder="-"
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-[11px]">합계금액 (지출금액)</Label>
            <Input
              type="number"
              value={sample.total}
              onChange={(e) => set("total", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">지출목적 (PDF &quot;2. 지출 목적&quot;에 들어감)</Label>
          <textarea
            value={sample.purpose}
            onChange={(e) => set("purpose", e.target.value)}
            className="min-h-[80px] w-full rounded-md border bg-background px-2 py-1.5 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">사용내역(수령인)</Label>
          <textarea
            value={sample.useDetail}
            onChange={(e) => set("useDetail", e.target.value)}
            className="min-h-[60px] w-full rounded-md border bg-background px-2 py-1.5 text-xs"
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                checked={sample.includeUseDetail}
                onChange={(e) => set("includeUseDetail", e.target.checked)}
              />
              <span>지출 목적에 함께 표시</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                checked={sample.includeUseDetailInNote}
                onChange={(e) => set("includeUseDetailInNote", e.target.checked)}
              />
              <span>비고에 함께 표시</span>
            </label>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">비고</Label>
          <textarea
            value={sample.note}
            onChange={(e) => set("note", e.target.value)}
            className="min-h-[60px] w-full rounded-md border bg-background px-2 py-1.5 text-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ExpensePreview({
  layout,
  group,
  sampleOverrides,
}: {
  layout: ExpenseLayoutSettings;
  group: ExpenseGroupSettings;
  sampleOverrides?: ExpenseSampleOverrides;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        registerPdfFonts();
        const row: ExpenseRow = { ...MOCK_EXPENSE_ROW, ...(sampleOverrides ?? {}) };
        const blob = await pdf(
          <ExpenseDocument row={row} group={group} layout={layout} />,
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
  }, [layout, group, sampleOverrides]);

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
      <div
        className="relative overflow-hidden rounded-lg border bg-muted/30"
        style={{ aspectRatio: "1 / 1.414" }}
      >
        {url && (
          <iframe
            src={url}
            title="지출결의서 PDF 미리보기"
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

function ExpenseGroupCard({
  groupId,
  group,
  onChange,
}: {
  groupId: string;
  group: ExpenseGroupSettings;
  onChange: (g: ExpenseGroupSettings) => void;
}) {
  const groupLabel = groupId === "ipf"
    ? "iPF / (주)아이포트폴리오"
    : "디미교연 / (사)디지털미디어교육콘텐츠 교사연구협회";
  const set = <K extends keyof ExpenseGroupSettings>(k: K, v: ExpenseGroupSettings[K]) => {
    onChange({ ...group, [k]: v });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{groupLabel}</CardTitle>
        <CardDescription>
          작성자/결재자 정보, 일련번호 코드, 4종 이미지(로고·작성자서명·결재자서명·직인)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">작성자명</Label>
            <Input value={group.writerName} onChange={(e) => set("writerName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">작성자 직책</Label>
            <Input value={group.writerTitle} onChange={(e) => set("writerTitle", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">결재자명</Label>
            <Input value={group.approverName} onChange={(e) => set("approverName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">결재자 직책</Label>
            <Input value={group.approverTitle} onChange={(e) => set("approverTitle", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">소속기관 코드 (3자, 일련번호 prefix)</Label>
            <Input value={group.orgCode} onChange={(e) => set("orgCode", e.target.value)} placeholder="IPF" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">일련번호 알파벳 (1자)</Label>
            <Input value={group.serialAlpha} onChange={(e) => set("serialAlpha", e.target.value)} placeholder="R" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">소속·상호 풀네임</Label>
            <Input value={group.companyFullName} onChange={(e) => set("companyFullName", e.target.value)} />
          </div>
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          <ExpenseImageField
            label="로고"
            value={group.logoImageUrl}
            onChange={(v) => set("logoImageUrl", v)}
          />
          <ExpenseImageField
            label="작성자 서명"
            value={group.writerSigImageUrl}
            onChange={(v) => set("writerSigImageUrl", v)}
            useCrop
          />
          <ExpenseImageField
            label="결재자 서명"
            value={group.approverSigImageUrl}
            onChange={(v) => set("approverSigImageUrl", v)}
            useCrop
          />
          <ExpenseImageField
            label="회사 직인"
            value={group.stampImageUrl}
            onChange={(v) => set("stampImageUrl", v)}
            useCrop
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseImageField({
  label,
  value,
  onChange,
  useCrop,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  useCrop?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [rawDataUrl, setRawDataUrl] = useState("");

  const handleFile = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (useCrop) {
        setRawDataUrl(dataUrl);
        setCropOpen(true);
      } else {
        onChange(dataUrl);
      }
    } catch {
      toast.error("이미지를 읽지 못했어요.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded border bg-muted/30 flex items-center justify-center">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="size-full object-contain" />
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
            if (f) handleFile(f);
          }}
        />
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" />
          {value ? "교체" : "업로드"}
        </Button>
        {value && useCrop && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5"
            onClick={() => { setRawDataUrl(value); setCropOpen(true); }}>
            <Scissors className="size-3.5" />
            편집
          </Button>
        )}
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onChange("")}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {useCrop && (
        <SignatureCropDialog
          open={cropOpen}
          rawDataUrl={rawDataUrl}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setCropOpen(false);
            toast.success(`${label} 설정 완료`);
          }}
          onCancel={() => setCropOpen(false)}
        />
      )}
    </div>
  );
}

function ExpenseInfoSection({
  settings,
  onChange,
}: {
  settings: ExpenseSettings;
  onChange: (s: ExpenseSettings) => void;
}) {
  return (
    <div className="space-y-4">
      <ExpenseGroupCard
        groupId="ipf"
        group={settings.groups.ipf}
        onChange={(g) => onChange({ ...settings, groups: { ...settings.groups, ipf: g } })}
      />
      <ExpenseGroupCard
        groupId="dimi"
        group={settings.groups.dimi}
        onChange={(g) => onChange({ ...settings, groups: { ...settings.groups, dimi: g } })}
      />
    </div>
  );
}

function ExpenseLayoutSection({
  layout,
  onChange,
}: {
  layout: ExpenseLayoutSettings;
  onChange: (l: ExpenseLayoutSettings) => void;
}) {
  const set = <K extends keyof ExpenseLayoutSettings>(
    section: K,
    patch: Partial<ExpenseLayoutSettings[K]>,
  ) => onChange({ ...layout, [section]: { ...layout[section], ...patch } });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">페이지</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">폰트</Label>
              <Select value={layout.page.fontFamily} onValueChange={(v) => { if (v) set("page", { fontFamily: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PDF_FONT_FAMILIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <NumField label="기본 크기" value={layout.page.baseFontSize} onChange={(v) => set("page", { baseFontSize: v })} step={0.5} unit="pt" />
            <NumField label="줄 높이" value={layout.page.baseLineHeight} onChange={(v) => set("page", { baseLineHeight: v })} step={0.05} />
            <NumField label="여백" value={layout.page.marginMm} onChange={(v) => set("page", { marginMm: v })} unit="mm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">제목 / 부제</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="제목 크기" value={layout.title.fontSize} onChange={(v) => set("title", { fontSize: v })} unit="pt" />
            <NumField label="제목 굵기" value={layout.title.fontWeight} onChange={(v) => set("title", { fontWeight: v })} step={100} min={100} />
            <NumField label="제목 자간" value={layout.title.letterSpacing} onChange={(v) => set("title", { letterSpacing: v })} step={0.5} unit="pt" />
            <NumField label="제목 하단 여백" value={layout.title.marginBottom} onChange={(v) => set("title", { marginBottom: v })} unit="pt" />
            <NumField label="부제 크기" value={layout.subtitle.fontSize} onChange={(v) => set("subtitle", { fontSize: v })} unit="pt" />
            <ColorField label="부제 색" value={layout.subtitle.color} onChange={(v) => set("subtitle", { color: v })} />
            <NumField label="부제 하단 여백" value={layout.subtitle.marginBottom} onChange={(v) => set("subtitle", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">섹션 헤딩 (1. / 2. / 3. ...)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="크기" value={layout.sectionHeading.fontSize} onChange={(v) => set("sectionHeading", { fontSize: v })} unit="pt" />
            <NumField label="굵기" value={layout.sectionHeading.fontWeight} onChange={(v) => set("sectionHeading", { fontWeight: v })} step={100} min={100} />
            <NumField label="상단 여백" value={layout.sectionHeading.marginTop} onChange={(v) => set("sectionHeading", { marginTop: v })} unit="pt" />
            <NumField label="하단 여백" value={layout.sectionHeading.marginBottom} onChange={(v) => set("sectionHeading", { marginBottom: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">1. 기본 정보</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="라벨 너비" value={layout.basicInfo.labelWidth} onChange={(v) => set("basicInfo", { labelWidth: v })} unit="pt" />
            <NumField label="글자 크기" value={layout.basicInfo.fontSize} onChange={(v) => set("basicInfo", { fontSize: v })} unit="pt" />
            <NumField label="라벨 굵기" value={layout.basicInfo.fontWeight} onChange={(v) => set("basicInfo", { fontWeight: v })} step={100} min={100} />
            <NumField label="줄 높이" value={layout.basicInfo.lineHeight} onChange={(v) => set("basicInfo", { lineHeight: v })} step={0.05} />
            <NumField label="행 간격" value={layout.basicInfo.rowGap} onChange={(v) => set("basicInfo", { rowGap: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">2. 지출 목적</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="글자 크기" value={layout.purpose.fontSize} onChange={(v) => set("purpose", { fontSize: v })} unit="pt" />
            <NumField label="줄 높이" value={layout.purpose.lineHeight} onChange={(v) => set("purpose", { lineHeight: v })} step={0.05} />
            <NumField label="패딩 세로" value={layout.purpose.paddingV} onChange={(v) => set("purpose", { paddingV: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">3. 지출결의 내용 표</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="헤더 높이" value={layout.expenseTable.headerHeight} onChange={(v) => set("expenseTable", { headerHeight: v })} unit="pt" />
            <NumField label="헤더 글자" value={layout.expenseTable.headerFontSize} onChange={(v) => set("expenseTable", { headerFontSize: v })} unit="pt" />
            <ColorField label="헤더 배경" value={layout.expenseTable.headerBgColor} onChange={(v) => set("expenseTable", { headerBgColor: v })} />
            <NumField label="행 높이" value={layout.expenseTable.rowHeight} onChange={(v) => set("expenseTable", { rowHeight: v })} unit="pt" />
            <NumField label="셀 글자" value={layout.expenseTable.fontSize} onChange={(v) => set("expenseTable", { fontSize: v })} unit="pt" />
            <NumField label="셀 패딩 세로" value={layout.expenseTable.paddingV} onChange={(v) => set("expenseTable", { paddingV: v })} unit="pt" />
            <NumField label="셀 패딩 가로" value={layout.expenseTable.paddingH} onChange={(v) => set("expenseTable", { paddingH: v })} unit="pt" />
            <NumField label="비고 행 높이" value={layout.expenseTable.noteRowHeight} onChange={(v) => set("expenseTable", { noteRowHeight: v })} unit="pt" />
            <NumField label="비고 글자" value={layout.expenseTable.noteFontSize} onChange={(v) => set("expenseTable", { noteFontSize: v })} unit="pt" />
            <NumField label="비고 줄 높이" value={layout.expenseTable.noteLineHeight} onChange={(v) => set("expenseTable", { noteLineHeight: v })} step={0.05} />
          </div>
          <Separator />
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <Label className="text-xs text-muted-foreground">컬럼 가로 비율 (%, 합계 100)</Label>
              <span className={cn(
                "text-[11px] font-mono",
                Math.abs(
                  layout.expenseTable.colDateWidth + layout.expenseTable.colSemokWidth +
                  layout.expenseTable.colSesemokWidth + layout.expenseTable.colSupplyWidth +
                  layout.expenseTable.colVatWidth + layout.expenseTable.colTotalWidth - 100
                ) > 0.01 ? "text-amber-600" : "text-muted-foreground"
              )}>
                합계: {(
                  layout.expenseTable.colDateWidth + layout.expenseTable.colSemokWidth +
                  layout.expenseTable.colSesemokWidth + layout.expenseTable.colSupplyWidth +
                  layout.expenseTable.colVatWidth + layout.expenseTable.colTotalWidth
                ).toFixed(1)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <NumField label="지출 일자" value={layout.expenseTable.colDateWidth} onChange={(v) => set("expenseTable", { colDateWidth: v })} step={0.5} unit="%" />
              <NumField label="세목" value={layout.expenseTable.colSemokWidth} onChange={(v) => set("expenseTable", { colSemokWidth: v })} step={0.5} unit="%" />
              <NumField label="세세목" value={layout.expenseTable.colSesemokWidth} onChange={(v) => set("expenseTable", { colSesemokWidth: v })} step={0.5} unit="%" />
              <NumField label="공급가액" value={layout.expenseTable.colSupplyWidth} onChange={(v) => set("expenseTable", { colSupplyWidth: v })} step={0.5} unit="%" />
              <NumField label="세액" value={layout.expenseTable.colVatWidth} onChange={(v) => set("expenseTable", { colVatWidth: v })} step={0.5} unit="%" />
              <NumField label="지출금액(원)" value={layout.expenseTable.colTotalWidth} onChange={(v) => set("expenseTable", { colTotalWidth: v })} step={0.5} unit="%" />
            </div>
          </div>
          <Separator />
          <div>
            <Label className="mb-2 block text-xs text-muted-foreground">컬럼별 텍스트 정렬</Label>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <AlignField label="지출 일자" value={layout.expenseTable.colDateAlign} onChange={(v) => set("expenseTable", { colDateAlign: v })} />
              <AlignField label="세목" value={layout.expenseTable.colSemokAlign} onChange={(v) => set("expenseTable", { colSemokAlign: v })} />
              <AlignField label="세세목" value={layout.expenseTable.colSesemokAlign} onChange={(v) => set("expenseTable", { colSesemokAlign: v })} />
              <AlignField label="공급가액" value={layout.expenseTable.colSupplyAlign} onChange={(v) => set("expenseTable", { colSupplyAlign: v })} />
              <AlignField label="세액" value={layout.expenseTable.colVatAlign} onChange={(v) => set("expenseTable", { colVatAlign: v })} />
              <AlignField label="지출금액(원)" value={layout.expenseTable.colTotalAlign} onChange={(v) => set("expenseTable", { colTotalAlign: v })} />
              <AlignField label="비고 본문" value={layout.expenseTable.colNoteAlign} onChange={(v) => set("expenseTable", { colNoteAlign: v })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">4. 지출 방식</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="글자 크기" value={layout.paymentMethod.fontSize} onChange={(v) => set("paymentMethod", { fontSize: v })} unit="pt" />
            <NumField label="패딩 세로" value={layout.paymentMethod.paddingV} onChange={(v) => set("paymentMethod", { paddingV: v })} unit="pt" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">5. 지출 승인 표</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="헤더 높이" value={layout.approvalTable.headerHeight} onChange={(v) => set("approvalTable", { headerHeight: v })} unit="pt" />
            <NumField label="헤더 글자" value={layout.approvalTable.headerFontSize} onChange={(v) => set("approvalTable", { headerFontSize: v })} unit="pt" />
            <ColorField label="헤더 배경" value={layout.approvalTable.headerBgColor} onChange={(v) => set("approvalTable", { headerBgColor: v })} />
            <NumField label="행 높이" value={layout.approvalTable.rowHeight} onChange={(v) => set("approvalTable", { rowHeight: v })} unit="pt" />
            <NumField label="셀 글자" value={layout.approvalTable.fontSize} onChange={(v) => set("approvalTable", { fontSize: v })} unit="pt" />
            <NumField label="셀 패딩 세로" value={layout.approvalTable.paddingV} onChange={(v) => set("approvalTable", { paddingV: v })} unit="pt" />
            <NumField label="셀 패딩 가로" value={layout.approvalTable.paddingH} onChange={(v) => set("approvalTable", { paddingH: v })} unit="pt" />
            <NumField label="서명 이미지 max-h" value={layout.approvalTable.sigImageMaxHeight} onChange={(v) => set("approvalTable", { sigImageMaxHeight: v })} unit="pt" />
            <NumField label="직인 이미지 max-h" value={layout.approvalTable.stampImageMaxHeight} onChange={(v) => set("approvalTable", { stampImageMaxHeight: v })} unit="pt" />
          </div>
          <Separator />
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <Label className="text-xs text-muted-foreground">컬럼 가로 비율 (%, 합계 100)</Label>
              <span className={cn(
                "text-[11px] font-mono",
                Math.abs(
                  layout.approvalTable.colStageWidth + layout.approvalTable.colNameWidth +
                  layout.approvalTable.colTitleWidth + layout.approvalTable.colSigWidth +
                  layout.approvalTable.colDateWidth + layout.approvalTable.colNoteWidth - 100
                ) > 0.01 ? "text-amber-600" : "text-muted-foreground"
              )}>
                합계: {(
                  layout.approvalTable.colStageWidth + layout.approvalTable.colNameWidth +
                  layout.approvalTable.colTitleWidth + layout.approvalTable.colSigWidth +
                  layout.approvalTable.colDateWidth + layout.approvalTable.colNoteWidth
                ).toFixed(1)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <NumField label="승인 단계" value={layout.approvalTable.colStageWidth} onChange={(v) => set("approvalTable", { colStageWidth: v })} step={0.5} unit="%" />
              <NumField label="성명" value={layout.approvalTable.colNameWidth} onChange={(v) => set("approvalTable", { colNameWidth: v })} step={0.5} unit="%" />
              <NumField label="직책" value={layout.approvalTable.colTitleWidth} onChange={(v) => set("approvalTable", { colTitleWidth: v })} step={0.5} unit="%" />
              <NumField label="서명" value={layout.approvalTable.colSigWidth} onChange={(v) => set("approvalTable", { colSigWidth: v })} step={0.5} unit="%" />
              <NumField label="승인일" value={layout.approvalTable.colDateWidth} onChange={(v) => set("approvalTable", { colDateWidth: v })} step={0.5} unit="%" />
              <NumField label="비고" value={layout.approvalTable.colNoteWidth} onChange={(v) => set("approvalTable", { colNoteWidth: v })} step={0.5} unit="%" />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              상호 행에서 비고 칼럼은 &quot;회사 직인&quot; 텍스트와 직인 이미지로 분할돼요. 그 비율을 아래에서 조정.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <NumField
                label="회사 직인 텍스트 비율 (0~1)"
                value={layout.approvalTable.stampLabelRatio}
                onChange={(v) => set("approvalTable", { stampLabelRatio: Math.max(0, Math.min(1, v)) })}
                step={0.05}
              />
            </div>
          </div>
          <Separator />
          <div>
            <Label className="mb-2 block text-xs text-muted-foreground">데이터 행 컬럼별 텍스트 정렬</Label>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <AlignField label="성명" value={layout.approvalTable.colNameAlign} onChange={(v) => set("approvalTable", { colNameAlign: v })} />
              <AlignField label="직책" value={layout.approvalTable.colTitleAlign} onChange={(v) => set("approvalTable", { colTitleAlign: v })} />
              <AlignField label="승인일" value={layout.approvalTable.colDateAlign} onChange={(v) => set("approvalTable", { colDateAlign: v })} />
              <AlignField label="비고" value={layout.approvalTable.colNoteAlign} onChange={(v) => set("approvalTable", { colNoteAlign: v })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">로고 / 푸터 / 테두리</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="로고 너비" value={layout.logo.width} onChange={(v) => set("logo", { width: v })} unit="pt" />
            <NumField label="로고 높이" value={layout.logo.height} onChange={(v) => set("logo", { height: v })} unit="pt" />
            <NumField label="로고 X 오프셋" value={layout.logo.offsetX} onChange={(v) => set("logo", { offsetX: v })} unit="pt" />
            <NumField label="로고 Y 오프셋" value={layout.logo.offsetY} onChange={(v) => set("logo", { offsetY: v })} unit="pt" />
            <NumField label="푸터 글자" value={layout.footer.fontSize} onChange={(v) => set("footer", { fontSize: v })} unit="pt" />
            <NumField label="푸터 굵기" value={layout.footer.fontWeight} onChange={(v) => set("footer", { fontWeight: v })} step={100} min={100} />
            <ColorField label="푸터 색" value={layout.footer.color} onChange={(v) => set("footer", { color: v })} />
            <NumField label="푸터 상단 여백" value={layout.footer.marginTop} onChange={(v) => set("footer", { marginTop: v })} unit="pt" />
            <NumField label="테두리 두께" value={layout.border.width} onChange={(v) => set("border", { width: v })} step={0.25} unit="pt" />
            <ColorField label="테두리 색" value={layout.border.color} onChange={(v) => set("border", { color: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">누락 / 검증 표시</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <PlaceholderRow
            label="빈 필드 대체 문구"
            desc="필수 값이 비었을 때 PDF에 표시되는 색상 강조 문구"
            text={layout.placeholders.emptyField}
            color={layout.placeholders.emptyFieldColor}
            onTextChange={(v) => set("placeholders", { emptyField: v })}
            onColorChange={(v) => set("placeholders", { emptyFieldColor: v })}
          />
          <Separator />
          <PlaceholderRow
            label="비정상 값 강조"
            desc="검증 실패 행에서 강조 색상으로 사용"
            text={layout.placeholders.invalidValue}
            color={layout.placeholders.invalidValueColor}
            onTextChange={(v) => set("placeholders", { invalidValue: v })}
            onColorChange={(v) => set("placeholders", { invalidValueColor: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================
   운영회의록 어드민 섹션
   ============================================================ */

function MeetingOpInfoSection({
  settings,
  onChange,
}: {
  settings: MeetingOperationsSettings;
  onChange: (s: MeetingOperationsSettings) => void;
}) {
  const set = <K extends keyof MeetingOperationsSettings>(k: K, v: MeetingOperationsSettings[K]) =>
    onChange({ ...settings, [k]: v });

  const handleHeaderLogoUpload = async (file: File) => {
    const r = new FileReader();
    r.onload = () => set("headerLogoUrl", String(r.result ?? ""));
    r.readAsDataURL(file);
  };

  const setFooter = (
    i: number,
    patch: Partial<MeetingOperationsSettings["footerLogos"][number]>,
  ) => {
    const next = [...settings.footerLogos] as MeetingOperationsSettings["footerLogos"];
    next[i] = { ...next[i], ...patch };
    onChange({ ...settings, footerLogos: next });
  };

  const handleFooterLogoUpload = async (i: number, file: File) => {
    const r = new FileReader();
    r.onload = () => setFooter(i, { imageUrl: String(r.result ?? "") });
    r.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 문구·옵션</CardTitle>
          <CardDescription className="text-xs">
            파일명에 들어갈 회의 유형/번호와 작성자 누락 시 표시할 문구.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">파일명 prefix</Label>
            <Input
              value={settings.filenamePrefix}
              onChange={(e) => set("filenamePrefix", e.target.value)}
              placeholder="7. 회의록"
            />
            <p className="text-[11px] text-muted-foreground">
              예) {"{증빙}"}_<b>{settings.filenamePrefix}</b>_{settings.meetingType}_YYMMDD.pdf
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">회의 유형</Label>
            <Input
              value={settings.meetingType}
              onChange={(e) => set("meetingType", e.target.value)}
              placeholder="운영회의"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">작성자 누락 시 표시</Label>
            <Input
              value={settings.authorPlaceholder}
              onChange={(e) => set("authorPlaceholder", e.target.value)}
              placeholder="내용 확인 필요"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">서명부 한 페이지 행 수</Label>
            <Input
              type="number"
              min={5}
              max={40}
              value={settings.signatureRowsPerPage}
              onChange={(e) => set("signatureRowsPerPage", Number(e.target.value) || 20)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">우측 상단 헤더 로고</CardTitle>
          <CardDescription className="text-xs">
            모든 페이지 우측 상단에 표시 (찾학컨 로고).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-4">
          {settings.headerLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.headerLogoUrl}
              alt="header"
              className="h-16 max-w-[200px] rounded border bg-white object-contain p-2"
            />
          ) : (
            <div className="flex h-16 w-32 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
              미설정
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleHeaderLogoUpload(f);
                e.target.value = "";
              }}
            />
            {settings.headerLogoUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => set("headerLogoUrl", "")}
              >
                제거
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">푸터 로고 3개</CardTitle>
          <CardDescription className="text-xs">
            각 로고를 ON/OFF, 라벨 텍스트 편집, 이미지 업로드.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.footerLogos.map((logo, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_1fr] items-start gap-3 rounded-lg border p-3">
              <div className="flex flex-col items-center gap-2">
                <Switch
                  checked={logo.enabled}
                  onCheckedChange={(v) => setFooter(i, { enabled: v })}
                />
                <span className="text-[10px] text-muted-foreground">{logo.enabled ? "표시" : "숨김"}</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">라벨 텍스트 #{i + 1}</Label>
                <Input
                  value={logo.label}
                  onChange={(e) => setFooter(i, { label: e.target.value })}
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFooterLogoUpload(i, f);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="flex flex-col items-center gap-2">
                {logo.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo.imageUrl}
                    alt={logo.label}
                    className="h-12 max-w-[140px] rounded border bg-white object-contain p-1"
                  />
                ) : (
                  <div className="flex h-12 w-32 items-center justify-center rounded border border-dashed text-[11px] text-muted-foreground">
                    미설정
                  </div>
                )}
                {logo.imageUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFooter(i, { imageUrl: "" })}
                    className="h-7 px-2 text-[11px]"
                  >
                    이미지 제거
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">서명부 안내 문구</CardTitle>
          <CardDescription className="text-xs">
            서명부 페이지 상단에 표시되는 개인정보 처리 안내. 숨길 수도 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={settings.signaturePrivacyNotice.enabled}
              onCheckedChange={(v) =>
                set("signaturePrivacyNotice", { ...settings.signaturePrivacyNotice, enabled: v })
              }
            />
            <span className="text-xs">{settings.signaturePrivacyNotice.enabled ? "표시" : "숨김"}</span>
          </div>
          <Input
            value={settings.signaturePrivacyNotice.text}
            onChange={(e) =>
              set("signaturePrivacyNotice", {
                ...settings.signaturePrivacyNotice,
                text: e.target.value,
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MeetingOpLayoutSection({
  layout,
  onChange,
}: {
  layout: MeetingOperationsLayoutSettings;
  onChange: (l: MeetingOperationsLayoutSettings) => void;
}) {
  const set = <K extends keyof MeetingOperationsLayoutSettings>(
    k: K,
    patch: Partial<MeetingOperationsLayoutSettings[K]>,
  ) => onChange({ ...layout, [k]: { ...layout[k], ...patch } });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">페이지·여백</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumField
            label="기본 글자 크기"
            unit="pt"
            value={layout.page.baseFontSize}
            onChange={(v) => set("page", { baseFontSize: v })}
          />
          <NumField
            label="줄 간격"
            value={layout.page.baseLineHeight}
            step={0.05}
            onChange={(v) => set("page", { baseLineHeight: v })}
          />
          <NumField
            label="여백 위"
            unit="mm"
            value={layout.page.paddingTopMm}
            onChange={(v) => set("page", { paddingTopMm: v })}
          />
          <NumField
            label="여백 아래"
            unit="mm"
            value={layout.page.paddingBottomMm}
            onChange={(v) => set("page", { paddingBottomMm: v })}
          />
          <NumField
            label="여백 좌"
            unit="mm"
            value={layout.page.paddingLeftMm}
            onChange={(v) => set("page", { paddingLeftMm: v })}
          />
          <NumField
            label="여백 우"
            unit="mm"
            value={layout.page.paddingRightMm}
            onChange={(v) => set("page", { paddingRightMm: v })}
          />
          <NumField
            label="테두리 굵기"
            value={layout.border.width}
            step={0.05}
            onChange={(v) => set("border", { width: v })}
          />
          <ColorField
            label="테두리 색상"
            value={layout.border.color}
            onChange={(v) => set("border", { color: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">제목·헤더 로고</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumField
            label="제목 글자 크기"
            unit="pt"
            value={layout.title.fontSize}
            onChange={(v) => set("title", { fontSize: v })}
          />
          <NumField
            label="제목 위 여백"
            value={layout.title.marginTop}
            onChange={(v) => set("title", { marginTop: v })}
          />
          <NumField
            label="제목 아래 여백"
            value={layout.title.marginBottom}
            onChange={(v) => set("title", { marginBottom: v })}
          />
          <NumField
            label="헤더 로고 가로"
            value={layout.headerLogo.width}
            onChange={(v) => set("headerLogo", { width: v })}
          />
          <NumField
            label="헤더 로고 세로"
            value={layout.headerLogo.height}
            onChange={(v) => set("headerLogo", { height: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">상단 정보 표 (일시/시간/장소/작성자)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumField
            label="행 높이"
            value={layout.topInfoTable.rowHeight}
            onChange={(v) => set("topInfoTable", { rowHeight: v })}
          />
          <NumField
            label="라벨 셀 폭"
            value={layout.topInfoTable.labelWidth}
            onChange={(v) => set("topInfoTable", { labelWidth: v })}
          />
          <NumField
            label="값 셀 폭"
            value={layout.topInfoTable.valueWidth}
            onChange={(v) => set("topInfoTable", { valueWidth: v })}
          />
          <NumField
            label="라벨 글자 크기"
            value={layout.topInfoTable.labelFontSize}
            onChange={(v) => set("topInfoTable", { labelFontSize: v })}
          />
          <NumField
            label="값 글자 크기"
            value={layout.topInfoTable.valueFontSize}
            onChange={(v) => set("topInfoTable", { valueFontSize: v })}
          />
          <ColorField
            label="라벨 배경색"
            value={layout.topInfoTable.labelBgColor}
            onChange={(v) => set("topInfoTable", { labelBgColor: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">본문 표 (안건/내용/결정/일정)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumField
            label="라벨 셀 폭"
            value={layout.bodyTable.labelWidth}
            onChange={(v) => set("bodyTable", { labelWidth: v })}
          />
          <ColorField
            label="라벨 배경색"
            value={layout.bodyTable.labelBgColor}
            onChange={(v) => set("bodyTable", { labelBgColor: v })}
          />
          <NumField
            label="라벨 글자 크기"
            value={layout.bodyTable.labelFontSize}
            onChange={(v) => set("bodyTable", { labelFontSize: v })}
          />
          <NumField
            label="본문 글자 크기"
            value={layout.bodyTable.contentFontSize}
            onChange={(v) => set("bodyTable", { contentFontSize: v })}
          />
          <NumField
            label="본문 줄 간격"
            value={layout.bodyTable.contentLineHeight}
            step={0.05}
            onChange={(v) => set("bodyTable", { contentLineHeight: v })}
          />
          <NumField
            label="본문 여백"
            value={layout.bodyTable.contentPadding}
            onChange={(v) => set("bodyTable", { contentPadding: v })}
          />
          <NumField
            label="안건 최소 높이"
            value={layout.bodyTable.agendaMinHeight}
            onChange={(v) => set("bodyTable", { agendaMinHeight: v })}
          />
          <NumField
            label="회의 내용 최소 높이"
            value={layout.bodyTable.contentMinHeight}
            onChange={(v) => set("bodyTable", { contentMinHeight: v })}
          />
          <NumField
            label="결정사항 최소 높이"
            value={layout.bodyTable.decisionsMinHeight}
            onChange={(v) => set("bodyTable", { decisionsMinHeight: v })}
          />
          <NumField
            label="향후 일정 최소 높이"
            value={layout.bodyTable.scheduleMinHeight}
            onChange={(v) => set("bodyTable", { scheduleMinHeight: v })}
          />
          <NumField
            label="참석자 최소 높이"
            value={layout.bodyTable.attendeesMinHeight}
            onChange={(v) => set("bodyTable", { attendeesMinHeight: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">서명부</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumField
            label="제목 크기"
            value={layout.signature.titleFontSize}
            onChange={(v) => set("signature", { titleFontSize: v })}
          />
          <NumField
            label="제목 위 여백"
            value={layout.signature.titleMarginTop}
            onChange={(v) => set("signature", { titleMarginTop: v })}
          />
          <NumField
            label="제목 아래 여백"
            value={layout.signature.titleMarginBottom}
            onChange={(v) => set("signature", { titleMarginBottom: v })}
          />
          <NumField
            label="안내 문구 크기"
            value={layout.signature.noticeFontSize}
            onChange={(v) => set("signature", { noticeFontSize: v })}
          />
          <ColorField
            label="안내 문구 색"
            value={layout.signature.noticeColor}
            onChange={(v) => set("signature", { noticeColor: v })}
          />
          <NumField
            label="안내 위 여백"
            value={layout.signature.noticeMarginTop}
            onChange={(v) => set("signature", { noticeMarginTop: v })}
          />
          <NumField
            label="안내 아래 여백"
            value={layout.signature.noticeMarginBottom}
            onChange={(v) => set("signature", { noticeMarginBottom: v })}
          />
          <NumField
            label="헤더 행 높이"
            value={layout.signature.headerHeight}
            onChange={(v) => set("signature", { headerHeight: v })}
          />
          <NumField
            label="행 높이"
            value={layout.signature.rowHeight}
            onChange={(v) => set("signature", { rowHeight: v })}
          />
          <NumField
            label="헤더 글자"
            value={layout.signature.headerFontSize}
            onChange={(v) => set("signature", { headerFontSize: v })}
          />
          <ColorField
            label="헤더 배경"
            value={layout.signature.headerBgColor}
            onChange={(v) => set("signature", { headerBgColor: v })}
          />
          <NumField
            label="이름 글자"
            value={layout.signature.nameFontSize}
            onChange={(v) => set("signature", { nameFontSize: v })}
          />
          <NumField
            label="NO 칸 폭"
            value={layout.signature.colNoWidth}
            onChange={(v) => set("signature", { colNoWidth: v })}
          />
          <NumField
            label="이름 칸 폭"
            value={layout.signature.colNameWidth}
            onChange={(v) => set("signature", { colNameWidth: v })}
          />
          <NumField
            label="서명 칸 폭"
            value={layout.signature.colSignWidth}
            onChange={(v) => set("signature", { colSignWidth: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">사진/영수증 페이지 (2x3)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumField
            label="제목 크기"
            value={layout.photoPage.titleFontSize}
            onChange={(v) => set("photoPage", { titleFontSize: v })}
          />
          <NumField
            label="열 수"
            value={layout.photoPage.cols}
            onChange={(v) => set("photoPage", { cols: v })}
          />
          <NumField
            label="행 수"
            value={layout.photoPage.rows}
            onChange={(v) => set("photoPage", { rows: v })}
          />
          <NumField
            label="셀 간격"
            value={layout.photoPage.cellGap}
            onChange={(v) => set("photoPage", { cellGap: v })}
          />
          <NumField
            label="셀 테두리 굵기"
            value={layout.photoPage.cellBorderWidth}
            step={0.05}
            onChange={(v) => set("photoPage", { cellBorderWidth: v })}
          />
          <ColorField
            label="셀 테두리 색"
            value={layout.photoPage.cellBorderColor}
            onChange={(v) => set("photoPage", { cellBorderColor: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">푸터</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumField
            label="위 여백"
            value={layout.footer.marginTop}
            onChange={(v) => set("footer", { marginTop: v })}
          />
          <NumField
            label="로고 높이"
            value={layout.footer.logoHeight}
            onChange={(v) => set("footer", { logoHeight: v })}
          />
          <NumField
            label="로고 최대 폭"
            value={layout.footer.logoMaxWidth}
            onChange={(v) => set("footer", { logoMaxWidth: v })}
          />
          <NumField
            label="간격"
            value={layout.footer.gap}
            onChange={(v) => set("footer", { gap: v })}
          />
          <NumField
            label="라벨 글자 크기"
            value={layout.footer.labelFontSize}
            onChange={(v) => set("footer", { labelFontSize: v })}
          />
          <ColorField
            label="라벨 색"
            value={layout.footer.labelColor}
            onChange={(v) => set("footer", { labelColor: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">빈 값 강조 색상</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <ColorField
            label="작성자 누락 (노란/주황)"
            value={layout.placeholders.emptyAuthorColor}
            onChange={(v) => set("placeholders", { emptyAuthorColor: v })}
          />
          <ColorField
            label="기타 빈 값 (회색)"
            value={layout.placeholders.emptyFieldColor}
            onChange={(v) => set("placeholders", { emptyFieldColor: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================
   운영회의록 PDF 미리보기 (mock 데이터)
   ============================================================ */

const MOCK_MEETING_OP_ROW: MeetingOperationsRow = {
  rowIndex: 0,
  evidenceNos: ["D-2-1"],
  groupKey: "2025년7월28일|10:30~12:30|iportfolio사내회의실",
  date: {
    candidates: [{ evidenceNo: "D-2-1", value: "2025년 7월 28일" }],
    selectedIndex: 0,
    override: "",
  },
  time: {
    candidates: [{ evidenceNo: "D-2-1", value: "10:30~12:30" }],
    selectedIndex: 0,
    override: "",
  },
  location: {
    candidates: [{ evidenceNo: "D-2-1", value: "iPortfolio 사내 회의실" }],
    selectedIndex: 0,
    override: "",
  },
  author: {
    candidates: [{ evidenceNo: "D-2-1", value: "채영지" }],
    selectedIndex: 0,
    override: "",
  },
  agenda: {
    candidates: [
      {
        evidenceNo: "D-2-1",
        value:
          "· 플랫폼 운영 현황 및 강사풀 관리 점검 자문\n· 기술 지원 및 현장 대응 체계 보완 필요 확인 → 학교별 운영 협의 절차 정비 및 지원 체계 보강",
      },
    ],
    selectedIndex: 0,
    override: "",
  },
  content: {
    candidates: [
      {
        evidenceNo: "D-2-1",
        value:
          "금일 회의는 현재 운영 중인 플랫폼의 전반적인 운영 현황을 점검하고, 강사풀 관리 실태에 대한 전문 자문을 수렴하기 위해 진행되었습니다. 플랫폼 운용 과정에서 기술 지원 및 현장 대응 체계의 일부 미비점이 확인되었으며, 학교별 운영 상황에 따른 유연한 협의 구조의 필요성이 제기되었습니다. 이에 따라 현행 지원 체계를 면밀히 재검토하고, 학교별 운영 협의 절차를 체계적으로 정비하는 한편, 현장 밀착형 지원 체계를 보강하는 방향으로 후속 조치를 추진하기로 합의하였습니다.",
      },
    ],
    selectedIndex: 0,
    override: "",
  },
  decisions: {
    candidates: [
      {
        evidenceNo: "D-2-1",
        value:
          "플랫폼 운영 현황 점검 및 강사풀 관리 개선: 현재 등록된 강사풀 현황을 재정비하고, 강사 배정 기준 및 관리 절차의 표준화 방안 수립\n기술 지원 체계 보완: 현장에서 발생하는 기술적 문제에 신속하게 대응할 수 있도록 담당자 역할 분담 및 지원 매뉴얼 정비\n학교별 운영 협의 절차 정비: 학교별 운영 여건 차이를 반영한 맞춤형 협의 절차를 마련하고, 소통 창구 일원화를 통한 현장 혼선 방지 체계 구축",
      },
    ],
    selectedIndex: 0,
    override: "",
  },
  schedule: {
    candidates: [
      {
        evidenceNo: "D-2-1",
        value:
          "현황 데이터를 기반으로 강사 등록 정보를 갱신하고 배정 기준안 확정. 기술 지원 매뉴얼 작성: 현장 대응 시나리오별 처리 절차를 문서화하여 담당자 공유. 학교별 협의 절차 가이드 배포: 운영 협의 표준 절차를 정리한 안내자료를 작성하여 참여 학교에 순차 배포.",
      },
    ],
    selectedIndex: 0,
    override: "",
  },
  attendees: {
    candidates: [
      {
        evidenceNo: "D-2-1",
        value:
          "장인선, 채영지, 홍수민, 임성경, 안석진, 김유, 박지예, 박관석, 조연주, 이영규, 이창환, 이정은",
      },
    ],
    selectedIndex: 0,
    override: "",
  },
  dateY: "2025",
  dateM: "7",
  dateD: "28",
  dateYymmdd: "250728",
  photos: [],
  hasEmpty: false,
  fieldWarnings: [],
};

function MeetingOpPreview({
  layout,
  settings,
}: {
  layout: MeetingOperationsLayoutSettings;
  settings: MeetingOperationsSettings;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        registerPdfFonts();
        const blob = await pdf(
          <MeetingOperationsDocument
            row={MOCK_MEETING_OP_ROW}
            settings={settings}
            layout={layout}
          />,
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
  }, [layout, settings]);

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
      <div
        className="relative overflow-hidden rounded-lg border bg-muted/30"
        style={{ aspectRatio: "1 / 1.414" }}
      >
        {url && (
          <iframe
            src={url}
            title="운영회의록 PDF 미리보기"
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
      <p className="text-[10px] text-muted-foreground">
        설정 변경 후 0.8초 디바운스로 미리보기가 재생성돼요. 실제 데이터는 운영회의록 도구에서 확인.
      </p>
    </div>
  );
}

/* ===================================================================
   이력서 — Preview / Layout sections
   =================================================================== */

const MOCK_RESUME_NAME = "홍길동";

function buildMockResumeRow(kind: "coordinator" | "instructor") {
  const r = emptyResumeRow(0);
  return recomputeResumeWarnings({
    ...r,
    kind,
    gubun: kind === "coordinator" ? "코디네이터" : "강사",
    basic: {
      ...r.basic,
      name: MOCK_RESUME_NAME,
      gender: "여",
      birth: "1985. 03. 21",
      organization: "○○초등학교",
      position: "교사",
    },
    contact: "010-0000-0000",
    motivation:
      "디지털 대전환기에 학생들의 창의적 사고와 협업 역량을 키우기 위해 본 사업에 지원합니다. 학교 현장에서 에듀테크와 AI 도구를 수업에 통합한 경험을 바탕으로, 교사 연수 운영과 콘텐츠 개발에 기여하고자 합니다. 앞으로도 디지털 교육의 안정적 정착을 위해 학교 현장과 정책의 가교 역할을 수행하겠습니다.",
  });
}

function ResumePreview({
  kind,
  layout,
}: {
  kind: "coordinator" | "instructor";
  layout: ResumeCoordinatorLayoutSettings | ResumeInstructorLayoutSettings;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const debouncedLayout = useDebouncedValue(layout, 800);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        registerPdfFonts();
        const row = buildMockResumeRow(kind);
        let blob: Blob;
        if (kind === "coordinator") {
          blob = await pdf(
            <ResumeCoordinatorDocument
              row={row}
              layout={debouncedLayout as ResumeCoordinatorLayoutSettings}
            />,
          ).toBlob();
        } else {
          const inst = debouncedLayout as ResumeInstructorLayoutSettings;
          const { instructor, ...common } = inst;
          blob = await pdf(
            <ResumeInstructorDocument row={row} layout={common} extra={instructor} />,
          ).toBlob();
        }
        if (cancelled) return;
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, debouncedLayout]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">미리보기</div>
      <div className="aspect-[1/1.4] w-full overflow-hidden rounded-md border bg-muted/30">
        {url ? (
          <iframe src={url} className="size-full" title="이력서 미리보기" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        설정 변경 후 0.8초 디바운스로 미리보기가 재생성됩니다.
      </p>
    </div>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ResumeLayoutSection({
  layout,
  onChange,
}: {
  layout: ResumeCoordinatorLayoutSettings | ResumeInstructorLayoutSettings;
  onChange: (l: ResumeCoordinatorLayoutSettings | ResumeInstructorLayoutSettings) => void;
}) {
  const set = <K extends keyof ResumeCoordinatorLayoutSettings>(
    key: K,
    patch: Partial<ResumeCoordinatorLayoutSettings[K]>,
  ) => {
    onChange({ ...layout, [key]: { ...(layout[key] as object), ...patch } });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">페이지·여백·기본 폰트</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField
            label="페이지 폰트 크기"
            value={layout.page.fontSize}
            onChange={(v) => set("page", { fontSize: v })}
            unit="pt"
          />
          <NumField
            label="줄 간격"
            value={layout.page.lineHeight}
            step={0.1}
            onChange={(v) => set("page", { lineHeight: v })}
          />
          <NumField
            label="상단 여백"
            value={layout.page.paddingTop}
            onChange={(v) => set("page", { paddingTop: v })}
            unit="pt"
          />
          <NumField
            label="하단 여백"
            value={layout.page.paddingBottom}
            onChange={(v) => set("page", { paddingBottom: v })}
            unit="pt"
          />
          <NumField
            label="좌우 여백"
            value={layout.page.paddingHorizontal}
            onChange={(v) => set("page", { paddingHorizontal: v })}
            unit="pt"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">테두리·색상</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField
            label="테두리 두께"
            value={layout.border.width}
            step={0.1}
            onChange={(v) => set("border", { width: v })}
            unit="pt"
          />
          <ColorField
            label="테두리 색"
            value={layout.border.color}
            onChange={(v) => set("border", { color: v })}
          />
          <ColorField
            label="제목 배경"
            value={layout.colors.titleBg}
            onChange={(v) => set("colors", { titleBg: v })}
          />
          <ColorField
            label="섹션 배경"
            value={layout.colors.sectionBg}
            onChange={(v) => set("colors", { sectionBg: v })}
          />
          <ColorField
            label="라벨 글자색"
            value={layout.colors.labelText}
            onChange={(v) => set("colors", { labelText: v })}
          />
          <ColorField
            label="빈칸 글자색"
            value={layout.colors.empty}
            onChange={(v) => set("colors", { empty: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">제목·섹션 헤더</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField
            label="제목 폰트 크기"
            value={layout.title.fontSize}
            onChange={(v) => set("title", { fontSize: v })}
            unit="pt"
          />
          <NumField
            label="제목 셀 패딩(상하)"
            value={layout.title.paddingV}
            onChange={(v) => set("title", { paddingV: v })}
            unit="pt"
          />
          <NumField
            label="섹션 헤더 폰트"
            value={layout.sectionHeader.fontSize}
            onChange={(v) => set("sectionHeader", { fontSize: v })}
            unit="pt"
          />
          <NumField
            label="섹션 헤더 패딩(상하)"
            value={layout.sectionHeader.paddingV}
            onChange={(v) => set("sectionHeader", { paddingV: v })}
            unit="pt"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">표 셀·텍스트 크기</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField
            label="셀 패딩(상하)"
            value={layout.cell.paddingV}
            onChange={(v) => set("cell", { paddingV: v })}
            unit="pt"
          />
          <NumField
            label="셀 패딩(좌우)"
            value={layout.cell.paddingH}
            onChange={(v) => set("cell", { paddingH: v })}
            unit="pt"
          />
          <NumField
            label="셀 최소 높이"
            value={layout.cell.minHeight}
            onChange={(v) => set("cell", { minHeight: v })}
            unit="pt"
          />
          <NumField
            label="기본 텍스트 크기"
            value={layout.text.fontSize}
            onChange={(v) => set("text", { fontSize: v })}
            unit="pt"
          />
          <NumField
            label="작은 텍스트 크기"
            value={layout.text.fontSizeSm}
            step={0.5}
            onChange={(v) => set("text", { fontSizeSm: v })}
            unit="pt"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">빈 row 갯수 (시각적 부담 조절)</CardTitle>
          <CardDescription className="text-xs">
            narrow CSV에는 연수·자격증·강의·사업 정보가 없으므로 모두 빈칸. 여기서 row 수를 줄이세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField
            label="연수 이수 (그룹별)"
            value={layout.emptyRows.training}
            min={1}
            onChange={(v) => set("emptyRows", { training: v })}
          />
          <NumField
            label="자격증"
            value={layout.emptyRows.certificate}
            min={1}
            onChange={(v) => set("emptyRows", { certificate: v })}
          />
          <NumField
            label="강의 경험"
            value={layout.emptyRows.lecture}
            min={1}
            onChange={(v) => set("emptyRows", { lecture: v })}
          />
          <NumField
            label="정부사업"
            value={layout.emptyRows.project}
            min={1}
            onChange={(v) => set("emptyRows", { project: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">「지원 동기 및 포부」 박스</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField
            label="최소 높이"
            value={layout.motivation.minHeight}
            onChange={(v) => set("motivation", { minHeight: v })}
            unit="pt"
          />
          <NumField
            label="패딩(상하)"
            value={layout.motivation.paddingV}
            onChange={(v) => set("motivation", { paddingV: v })}
            unit="pt"
          />
          <NumField
            label="폰트 크기"
            value={layout.motivation.fontSize}
            onChange={(v) => set("motivation", { fontSize: v })}
            unit="pt"
          />
          <NumField
            label="줄 간격"
            value={layout.motivation.lineHeight}
            step={0.1}
            onChange={(v) => set("motivation", { lineHeight: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ResumeInstructorExtraSection({
  layout,
  onChange,
}: {
  layout: ResumeInstructorLayoutSettings;
  onChange: (l: ResumeInstructorLayoutSettings) => void;
}) {
  const set = (patch: Partial<ResumeInstructorLayoutSettings["instructor"]["practiceBox"]>) => {
    onChange({
      ...layout,
      instructor: {
        ...layout.instructor,
        practiceBox: { ...layout.instructor.practiceBox, ...patch },
      },
    });
  };
  const p = layout.instructor.practiceBox;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">「수업실행 경험」 박스 (강사 전용)</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField
          label="최소 높이"
          value={p.minHeight}
          onChange={(v) => set({ minHeight: v })}
          unit="pt"
        />
        <NumField
          label="패딩(상하)"
          value={p.paddingV}
          onChange={(v) => set({ paddingV: v })}
          unit="pt"
        />
        <NumField
          label="패딩(좌우)"
          value={p.paddingH}
          onChange={(v) => set({ paddingH: v })}
          unit="pt"
        />
        <NumField
          label="폰트 크기"
          value={p.fontSize}
          onChange={(v) => set({ fontSize: v })}
          unit="pt"
        />
        <NumField
          label="줄 간격"
          value={p.lineHeight}
          step={0.1}
          onChange={(v) => set({ lineHeight: v })}
        />
      </CardContent>
    </Card>
  );
}
