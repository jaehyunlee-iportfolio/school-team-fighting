export type ApprovalGroup = "ipf" | "dimi" | "unknown";

export function detectApprovalGroup(org: string | undefined | null): ApprovalGroup {
  if (!org) return "unknown";
  const t = org.replace(/\s+/g, " ").toLowerCase();
  if (t.includes("디미") || t.includes("dimi") || t.includes("디지털미디어교육콘텐츠")) return "dimi";
  if (
    t.includes("아이포트") ||
    t.includes("iportfolio") ||
    t.includes("ipf") ||
    t.includes("아이포")
  ) {
    return "ipf";
  }
  return "unknown";
}

export function detectGroupFromFilename(filename: string): ApprovalGroup | null {
  const t = filename.replace(/\s+/g, " ").toLowerCase();
  if (t.includes("디미") || t.includes("dimi") || t.includes("디지털미디어")) return "dimi";
  if (
    t.includes("아이포트") ||
    t.includes("iportfolio") ||
    t.includes("ipf") ||
    t.includes("아이포")
  ) {
    return "ipf";
  }
  return null;
}

export function resolveGroup(
  org: string | null | undefined,
  override: ApprovalGroup | "auto" = "auto"
): ApprovalGroup {
  return override === "auto" ? detectApprovalGroup(org ?? undefined) : override;
}

export function getApprovalHeaderLabels(
  org: string | null | undefined,
  override: ApprovalGroup | "auto" = "auto"
): { approver1: string; approver2: string; group: ApprovalGroup } {
  const group = override === "auto" ? detectApprovalGroup(org ?? undefined) : override;
  if (group === "dimi") {
    return { approver1: "사무국장", approver2: "대표이사", group };
  }
  if (group === "ipf") {
    return { approver1: "팀장", approver2: "본부장", group };
  }
  return { approver1: "결재1", approver2: "결재2", group: "unknown" };
}
