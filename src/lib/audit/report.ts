/**
 * 검증 리포트 — markdown + diff csv 생성.
 */
import { CATEGORY_LABELS, type AuditWorkbook, type Issue } from "@/lib/audit/types";

export function buildMarkdownReport(wbs: AuditWorkbook[]): string {
  const lines: string[] = [];
  lines.push(`# 세부비목별집행내역서 검증 리포트`);
  lines.push(`생성: ${new Date().toLocaleString("ko-KR")}`);
  lines.push("");
  for (const wb of wbs) {
    lines.push(`## ${wb.fileName} (${wb.orgCode})`);
    const allIssues: Issue[] = [
      ...wb.issues,
      ...wb.sheets.flatMap((s) => s.issues),
    ];
    const errs = allIssues.filter((i) => i.severity === "error").length;
    const warns = allIssues.filter((i) => i.severity === "warning").length;
    const infos = allIssues.filter((i) => i.severity === "info").length;
    lines.push(`- 에러 ${errs} / 경고 ${warns} / 정보 ${infos}`);
    lines.push("");

    // 카테고리별 집계
    const byCat = new Map<string, number>();
    for (const i of allIssues) byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);
    if (byCat.size > 0) {
      lines.push(`### 카테고리별`);
      for (const [c, n] of [...byCat.entries()].sort()) {
        lines.push(`- ${c}: ${CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c} — ${n}건`);
      }
      lines.push("");
    }

    // 시트별 디테일
    for (const s of wb.sheets) {
      if (s.issues.length === 0) continue;
      lines.push(`### ${s.name}`);
      for (const i of s.issues) {
        const loc = i.cellAddress ? `[${i.cellAddress}]` : i.rowIndex ? `[Row ${i.rowIndex}]` : "[시트]";
        lines.push(`- ${i.severity.toUpperCase()} ${i.category} ${loc} ${i.message}`);
      }
      lines.push("");
    }

    // 수정된 셀 diff
    const edits: { sheet: string; addr: string; original: unknown; current: unknown; src: string }[] = [];
    for (const s of wb.sheets) {
      for (const r of s.rows) {
        for (const c of Object.values(r.cells)) {
          if (c.editSource !== "none") {
            edits.push({
              sheet: s.name,
              addr: c.address,
              original: c.original,
              current: c.current,
              src: c.editSource,
            });
          }
        }
      }
    }
    if (edits.length > 0) {
      lines.push(`### 수정된 셀 (${edits.length})`);
      for (const e of edits) {
        lines.push(
          `- [${e.sheet}!${e.addr}] ${JSON.stringify(e.original)} → ${JSON.stringify(e.current)} (${e.src})`,
        );
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function buildEditsCsv(wbs: AuditWorkbook[]): string {
  const rows: string[] = ["파일,시트,셀,이전값,새값,변경유형,자동수정종류"];
  for (const wb of wbs) {
    for (const s of wb.sheets) {
      for (const r of s.rows) {
        for (const c of Object.values(r.cells)) {
          if (c.editSource === "none") continue;
          const cell = (v: unknown) =>
            v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
          rows.push(
            [
              cell(wb.fileName),
              cell(s.name),
              cell(c.address),
              cell(c.original),
              cell(c.current),
              cell(c.editSource),
              cell(c.lastAutofix ?? ""),
            ].join(","),
          );
        }
      }
    }
  }
  return rows.join("\n");
}
