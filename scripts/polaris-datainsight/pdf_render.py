"""추출 JSON → 보고서 PDF (reportlab)."""
from __future__ import annotations

from pathlib import Path
from typing import Any


def render_report_pdf(data: dict[str, Any], output_path: Path, image_dir: Path | None = None) -> Path:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.platypus import (
        Image,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    pdfmetrics.registerFont(UnicodeCIDFont("HYGothic-Medium"))
    KFONT = "HYSMyeongJo-Medium"
    KFONT_BOLD = "HYGothic-Medium"

    from extract import _fix_text  # type: ignore

    base = ParagraphStyle("Base", fontName=KFONT, fontSize=10, leading=14)
    h1 = ParagraphStyle("H1", parent=base, fontName=KFONT_BOLD, fontSize=18, leading=22, spaceAfter=10)
    h2 = ParagraphStyle("H2", parent=base, fontName=KFONT_BOLD, fontSize=13, leading=17, spaceAfter=6, textColor=colors.HexColor("#444"))
    meta = ParagraphStyle("Meta", parent=base, fontSize=9, leading=12, textColor=colors.HexColor("#666"))
    cell_style = ParagraphStyle("Cell", fontName=KFONT, fontSize=8, leading=10)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
    )

    story: list[Any] = []
    doc_name = _fix_text(data.get("docName", "(이름 없음)"))
    story.append(Paragraph(_esc(doc_name), h1))

    core = (data.get("metadata") or {}).get("coreProperties", {}) or {}
    meta_lines = []
    for k, label in [("title", "제목"), ("creator", "작성자"), ("created", "생성일"),
                     ("lastModifiedBy", "수정자"), ("modified", "수정일")]:
        if core.get(k):
            meta_lines.append(f"{label}: {core[k]}")
    if meta_lines:
        story.append(Paragraph(_esc(" · ".join(meta_lines)), meta))
    story.append(Paragraph(f"총 페이지: {data.get('totalPages', 0)}", meta))
    story.append(Spacer(1, 6 * mm))

    pages = data.get("pages", []) or []
    for pi, page in enumerate(pages):
        if pi > 0:
            story.append(PageBreak())
        story.append(Paragraph(f"Page {page.get('pageNum', '?')}", h2))

        for el in page.get("elements", []) or []:
            t = el.get("type")
            content = el.get("content") or {}
            if t == "text":
                text = content.get("text") or ""
                if text:
                    story.append(Paragraph(_esc(text), base))
                    story.append(Spacer(1, 2 * mm))
            elif t == "table":
                tbl = _build_table(content, el.get("structure") or {}, cell_style)
                if tbl is not None:
                    story.append(tbl)
                    story.append(Spacer(1, 4 * mm))
            elif t == "image":
                src = content.get("src") or ""
                if image_dir and src:
                    img_path = image_dir / src
                    if img_path.exists():
                        try:
                            story.append(Image(str(img_path), width=120 * mm, height=80 * mm, kind="proportional"))
                            story.append(Spacer(1, 3 * mm))
                            continue
                        except Exception:  # noqa: BLE001
                            pass
                story.append(Paragraph(f"[이미지: {_esc(src)}]", meta))
            elif t == "chart":
                csv_data = content.get("csv") or ""
                story.append(Paragraph(f"[차트 {el.get('id', '')}]", meta))
                if csv_data:
                    story.append(Paragraph(_esc(csv_data[:800]), base))
                story.append(Spacer(1, 2 * mm))
            else:
                story.append(Paragraph(f"[{_esc(t)} {_esc(el.get('id', ''))}]", meta))

    doc.build(story)
    return output_path


def _esc(text: Any) -> str:
    if not isinstance(text, str):
        text = str(text) if text is not None else ""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )


def _cell_text(cell: dict[str, Any]) -> str:
    parts: list[str] = []
    for p in cell.get("para") or []:
        for c in p.get("content", []) or []:
            if isinstance(c, dict) and c.get("text"):
                parts.append(str(c["text"]))
    return " ".join(parts).strip()


def _build_table(content: dict[str, Any], structure: dict[str, Any], cell_style):
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle

    cells_json = content.get("json")
    if not cells_json:
        return None

    rows = structure.get("rows", 0) or 0
    cols = structure.get("cols", 0) or 0
    if not rows or not cols:
        for cell in cells_json:
            m = cell.get("metrics", {}) or {}
            rows = max(rows, (m.get("rowaddr") or 0) + (m.get("rowspan") or 1))
            cols = max(cols, (m.get("coladdr") or 0) + (m.get("colspan") or 1))
    if not rows or not cols:
        return None

    grid: list[list[Any]] = [["" for _ in range(cols)] for _ in range(rows)]
    span_cmds: list[tuple] = []
    for cell in cells_json:
        m = cell.get("metrics", {}) or {}
        r = m.get("rowaddr") or 0
        c = m.get("coladdr") or 0
        rspan = max(1, m.get("rowspan") or 1)
        cspan = max(1, m.get("colspan") or 1)
        text = _cell_text(cell)
        if 0 <= r < rows and 0 <= c < cols:
            grid[r][c] = Paragraph(_esc(text), cell_style) if text else ""
            if rspan > 1 or cspan > 1:
                span_cmds.append(("SPAN", (c, r), (c + cspan - 1, r + rspan - 1)))

    available_w = 180 * mm
    col_w = available_w / cols
    style_cmds: list[tuple] = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999")),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ] + span_cmds
    return Table(grid, colWidths=[col_w] * cols, style=TableStyle(style_cmds), repeatRows=0)
