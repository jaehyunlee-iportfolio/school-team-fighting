"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  getApprovalSettings,
  saveApprovalSettings,
  getAdminEmails,
  addAdminEmail,
  removeAdminEmail,
  type ApprovalSettings,
  type SignatureMode,
  type GroupLabels,
} from "@/lib/firebase/firestore";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Upload,
  Trash2,
  Plus,
  Shield,
  ShieldAlert,
  Save,
  ImageIcon,
  Type,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const { user, isAdmin, adminLoading } = useAuth();
  const [settings, setSettings] = useState<ApprovalSettings | null>(null);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, emails] = await Promise.all([
        getApprovalSettings(),
        getAdminEmails(),
      ]);
      setSettings(s);
      setAdminEmails(emails);
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

  if (!settings) return null;

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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <Shield className="size-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">어드민 설정</h1>
          <p className="text-sm text-muted-foreground">
            서명 정책, 결재 그룹, 사용자 관리
          </p>
        </div>
      </div>

      <Tabs defaultValue="signature" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="signature">서명 정책</TabsTrigger>
          <TabsTrigger value="groups">결재 그룹</TabsTrigger>
          <TabsTrigger value="users">어드민 사용자</TabsTrigger>
        </TabsList>

        {/* --- 서명 정책 --- */}
        <TabsContent value="signature" className="space-y-4">
          <DrafterSection settings={settings} onChange={setSettings} />
          <Separator />
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
   Drafter Section
   =================================================================== */

function DrafterSection({
  settings,
  onChange,
}: {
  settings: ApprovalSettings;
  onChange: (s: ApprovalSettings) => void;
}) {
  const d = settings.drafter;
  const setDrafter = (patch: Partial<typeof d>) =>
    onChange({ ...settings, drafter: { ...d, ...patch } });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">기안자 서명</CardTitle>
        <CardDescription>기안자의 서명 표시 방식을 설정해요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={d.mode}
          onValueChange={(v) => setDrafter({ mode: v as SignatureMode })}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="text" id="drafter-text" />
            <Label htmlFor="drafter-text" className="flex items-center gap-1.5 cursor-pointer">
              <Type className="size-4" /> 글자 (손글씨 폰트)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="image" id="drafter-image" />
            <Label htmlFor="drafter-image" className="flex items-center gap-1.5 cursor-pointer">
              <ImageIcon className="size-4" /> 이미지
            </Label>
          </div>
        </RadioGroup>

        {d.mode === "text" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">폰트</Label>
              <Input value={d.fontFamily} readOnly className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">최대 글자 수</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={d.maxChars}
                onChange={(e) => setDrafter({ maxChars: Number(e.target.value) || 3 })}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ===================================================================
   Approver Group Section (iPF / 디미)
   =================================================================== */

const GROUP_LABELS: Record<string, string> = {
  ipf: "iPF (아이포트폴리오)",
  dimi: "디미 (디지털미디어교육콘텐츠)",
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
          {GROUP_LABELS[groupId] ?? groupId} — 결재자 서명
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
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

function ApproverRow({
  groupId,
  role,
  roleLabel,
  settings,
  onChange,
}: {
  groupId: string;
  role: string;
  roleLabel: string;
  settings: ApprovalSettings;
  onChange: (s: ApprovalSettings) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const approverKey = role as "approver1" | "approver2";
  const approverSettings = settings[approverKey];
  const currentUrl = approverSettings.imageUrl;

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange({
        ...settings,
        [approverKey]: { ...approverSettings, mode: "image" as SignatureMode, imageUrl: dataUrl },
      });
      toast.success("서명 이미지가 설정되었어요.");
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
        <div className="shrink-0 size-20 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
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
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => {
                onChange({
                  ...settings,
                  [approverKey]: { ...approverSettings, imageUrl: "" },
                });
              }}
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
  const setGroup = (gid: string, patch: Partial<GroupLabels>) => {
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
