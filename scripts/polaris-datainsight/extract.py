"""Polaris AI DataInsight Doc Extract API 호출 + 결과 파싱 로직."""
from __future__ import annotations

import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

API_URL = "https://datainsight-api.polarisoffice.com/api/v1/datainsight/doc-extract"
SUPPORTED_EXTS = {".docx", ".pptx", ".xlsx", ".hwp", ".hwpx"}
MAX_BYTES = 25 * 1024 * 1024


def load_api_key(env_path: Path) -> str | None:
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == "POLARIS_DATAINSIGHT_API_KEY":
            return v.strip().strip('"').strip("'")
    return None


@dataclass
class ExtractResult:
    zip_path: Path
    json_path: Path
    data: dict[str, Any]
    images: list[Path]


def extract_document(file_path: Path, api_key: str, output_dir: Path, timeout: int = 600) -> ExtractResult:
    if file_path.suffix.lower() not in SUPPORTED_EXTS:
        raise ValueError(f"지원하지 않는 확장자: {file_path.suffix} (지원: {sorted(SUPPORTED_EXTS)})")
    size = file_path.stat().st_size
    if size == 0:
        raise ValueError("파일 크기가 0입니다.")
    if size > MAX_BYTES:
        raise ValueError(f"파일이 25MB를 초과합니다: {size / 1024 / 1024:.1f}MB")

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = file_path.stem
    zip_path = output_dir / f"{stem}.result.zip"

    with file_path.open("rb") as f:
        resp = requests.post(
            API_URL,
            headers={"x-po-di-apikey": api_key},
            files={"file": (file_path.name, f)},
            timeout=timeout,
        )
    if resp.status_code != 200:
        raise RuntimeError(f"API 오류 {resp.status_code}: {resp.text[:500]}")

    zip_path.write_bytes(resp.content)

    extract_dir = output_dir / f"{stem}.extracted"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_dir)

    json_files = sorted(extract_dir.glob("*.json"))
    if not json_files:
        raise RuntimeError("결과 ZIP에 JSON 파일이 없습니다.")
    json_path = json_files[0]
    data = json.loads(json_path.read_text(encoding="utf-8"))

    images = sorted(p for p in extract_dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".bmp"})

    return ExtractResult(zip_path=zip_path, json_path=json_path, data=data, images=images)


def summarize(data: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"문서명: {data.get('docName', '?')}")
    lines.append(f"총 페이지: {data.get('totalPages', '?')}")
    meta = data.get("metadata", {}).get("coreProperties", {}) if data.get("metadata") else {}
    if meta:
        for k in ("title", "creator", "created", "lastModifiedBy", "modified"):
            if meta.get(k):
                lines.append(f"  {k}: {meta[k]}")
    lines.append("")

    pages = data.get("pages", []) or []
    for page in pages:
        num = page.get("pageNum", "?")
        summary = page.get("extractionSummary") or {}
        elements = page.get("elements", []) or []
        parts = [f"{k}={v}" for k, v in summary.items() if v]
        lines.append(f"[Page {num}] elements={len(elements)} | {', '.join(parts) if parts else '-'}")
    return "\n".join(lines)


def _cell_text(cell: dict[str, Any]) -> str:
    paras = cell.get("para") or []
    parts: list[str] = []
    for p in paras:
        for c in p.get("content", []) or []:
            if isinstance(c, dict) and c.get("text"):
                parts.append(str(c["text"]))
    return " ".join(parts).replace("\n", " ").replace("|", "\\|").strip()


def table_to_markdown(table_content: dict[str, Any], structure: dict[str, Any] | None = None) -> str:
    cells_json = table_content.get("json")
    if not cells_json:
        html = table_content.get("html")
        if html:
            return f"(HTML 테이블 — 마크다운 변환 미지원)\n{html[:500]}"
        return "(빈 테이블)"

    rows = (structure or {}).get("rows", 0)
    cols = (structure or {}).get("cols", 0)
    if not rows or not cols:
        for cell in cells_json:
            m = cell.get("metrics", {}) or {}
            rows = max(rows, (m.get("rowaddr") or 0) + (m.get("rowspan") or 1))
            cols = max(cols, (m.get("coladdr") or 0) + (m.get("colspan") or 1))
    if rows == 0 or cols == 0:
        return "(테이블 크기 불명)"

    grid: list[list[str]] = [["" for _ in range(cols)] for _ in range(rows)]
    for cell in cells_json:
        m = cell.get("metrics", {}) or {}
        r = m.get("rowaddr") or 0
        c = m.get("coladdr") or 0
        text = _cell_text(cell)
        if 0 <= r < rows and 0 <= c < cols:
            grid[r][c] = text

    out: list[str] = []
    out.append("| " + " | ".join(grid[0]) + " |")
    out.append("| " + " | ".join(["---"] * cols) + " |")
    for r in range(1, rows):
        out.append("| " + " | ".join(grid[r]) + " |")
    return "\n".join(out)


def collect_tables_markdown(data: dict[str, Any]) -> str:
    chunks: list[str] = []
    pages = data.get("pages", []) or []
    for page in pages:
        page_num = page.get("pageNum", "?")
        for el in page.get("elements", []) or []:
            if el.get("type") != "table":
                continue
            content = el.get("content") or {}
            structure = el.get("structure") or {}
            md = table_to_markdown(content, structure)
            chunks.append(f"### Page {page_num} — Table {el.get('id', '')}\n{md}\n")
    if not chunks:
        return "(표 없음)"
    return "\n".join(chunks)


def collect_text(data: dict[str, Any]) -> str:
    chunks: list[str] = []
    for page in data.get("pages", []) or []:
        page_num = page.get("pageNum", "?")
        chunks.append(f"\n=== Page {page_num} ===")
        for el in page.get("elements", []) or []:
            t = el.get("type")
            content = el.get("content") or {}
            if t == "text":
                if content.get("text"):
                    chunks.append(str(content["text"]))
            elif t == "table":
                chunks.append(f"[표 {el.get('id', '')}: {(el.get('structure') or {}).get('rows', '?')}x{(el.get('structure') or {}).get('cols', '?')}]")
            elif t in ("image", "chart", "shape", "equation"):
                chunks.append(f"[{t} {el.get('id', '')}]")
    return "\n".join(chunks)
