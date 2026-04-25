#!/usr/bin/env python3
"""
출장신청서 PDF를 Drive Desktop 동기화 폴더의 증빙번호별 하위 폴더로 이동/복사한다.

파일명 규칙:
    <증빙번호>_<원본파일명>.pdf
    예) D-4-1_1. 내부결재문서_출장신청서_이영규_제주_250624.pdf

처리:
    - prefix(D-4-1) 파싱
    - <drive>/<prefix>/ 폴더 존재 확인
    - prefix 제거한 이름으로 이동/복사
    - 결과 CSV 보고서 생성

사용법:
    python scripts/upload_to_drive.py \\
        --src ~/Downloads/출장신청서_PDFs/ \\
        --drive "~/Library/CloudStorage/GoogleDrive-isprofound@iportfolio.co.kr/My Drive/D-4.출장비"

옵션:
    --mode {move,copy}     기본 move
    --report PATH          CSV 보고서 출력 경로 (기본 자동 생성)
    --dry-run              실제 이동 없이 시뮬레이션
    --overwrite            대상에 동명 파일 있으면 덮어쓰기 (기본은 _dup1, _dup2 suffix)
"""
from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

try:
    from tqdm import tqdm
except ImportError:
    print("⚠️  tqdm 모듈이 없어요. 설치: pip3 install tqdm", file=sys.stderr)
    print("   진행률 표시 없이 계속할게요.\n", file=sys.stderr)

    def tqdm(iterable: Iterable, **kwargs):  # type: ignore[no-redef]
        return iterable


PREFIX_RE = re.compile(r"^([A-Za-z]-\d+(?:-\d+)*)_(.+\.pdf)$", re.IGNORECASE)


# ─────────────────────────────────────────────────────────────────────────
# ANSI 컬러 (Windows에서도 대부분 동작)
# ─────────────────────────────────────────────────────────────────────────
class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"
    BLUE = "\033[34m"
    CYAN = "\033[36m"


@dataclass
class TaskResult:
    status: str           # OK / MISSING_PREFIX / FOLDER_NOT_FOUND / ERROR
    src_filename: str
    evidence_no: str
    target_folder: str
    target_filename: str
    reason: str


def parse_prefix(filename: str) -> tuple[str | None, str | None]:
    """파일명 → (증빙번호, prefix 제거된 파일명) 또는 (None, None)."""
    m = PREFIX_RE.match(filename)
    if not m:
        return None, None
    return m.group(1), m.group(2)


def resolve_dup_name(target_dir: Path, name: str) -> Path:
    """대상 폴더에 동명 파일이 있으면 _dup1, _dup2 ... suffix 부여."""
    base, ext = (name.rsplit(".", 1) + [""])[:2]
    ext = f".{ext}" if ext else ""
    candidate = target_dir / name
    i = 1
    while candidate.exists():
        candidate = target_dir / f"{base}_dup{i}{ext}"
        i += 1
    return candidate


def process_one(
    src_file: Path,
    drive_root: Path,
    *,
    mode: str,
    overwrite: bool,
    dry_run: bool,
) -> TaskResult:
    name = src_file.name
    evidence_no, stripped = parse_prefix(name)

    if evidence_no is None or stripped is None:
        return TaskResult(
            status="MISSING_PREFIX",
            src_filename=name,
            evidence_no="",
            target_folder="",
            target_filename="",
            reason="파일명에 증빙번호 prefix 없음 (예: D-4-1_파일명.pdf)",
        )

    target_folder = drive_root / evidence_no
    if not target_folder.is_dir():
        return TaskResult(
            status="FOLDER_NOT_FOUND",
            src_filename=name,
            evidence_no=evidence_no,
            target_folder=str(target_folder),
            target_filename=stripped,
            reason=f"Drive에 {evidence_no} 폴더 없음",
        )

    if overwrite:
        target_path = target_folder / stripped
    else:
        target_path = resolve_dup_name(target_folder, stripped)

    if dry_run:
        return TaskResult(
            status="OK",
            src_filename=name,
            evidence_no=evidence_no,
            target_folder=str(target_folder),
            target_filename=target_path.name,
            reason=f"[dry-run] {mode} 예정",
        )

    try:
        if mode == "move":
            shutil.move(str(src_file), str(target_path))
        else:
            shutil.copy2(str(src_file), str(target_path))
    except Exception as e:
        return TaskResult(
            status="ERROR",
            src_filename=name,
            evidence_no=evidence_no,
            target_folder=str(target_folder),
            target_filename=target_path.name,
            reason=f"{type(e).__name__}: {e}",
        )

    return TaskResult(
        status="OK",
        src_filename=name,
        evidence_no=evidence_no,
        target_folder=str(target_folder),
        target_filename=target_path.name,
        reason=f"{mode} 완료",
    )


def write_report(results: list[TaskResult], path: Path) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["status", "filename", "evidence_no", "target_folder", "target_filename", "reason"])
        for r in results:
            w.writerow([r.status, r.src_filename, r.evidence_no, r.target_folder, r.target_filename, r.reason])


def print_summary(results: list[TaskResult]) -> None:
    by_status: dict[str, list[TaskResult]] = {}
    for r in results:
        by_status.setdefault(r.status, []).append(r)

    total = len(results)
    ok = len(by_status.get("OK", []))
    miss = len(by_status.get("MISSING_PREFIX", []))
    nofld = len(by_status.get("FOLDER_NOT_FOUND", []))
    err = len(by_status.get("ERROR", []))

    print()
    print(f"{C.BOLD}처리 결과 요약{C.RESET}  (총 {total}건)")
    print(f"  {C.GREEN}✅ 성공         {ok}{C.RESET}")
    if miss:
        print(f"  {C.YELLOW}⚠️  증빙번호 누락 {miss}{C.RESET}")
    if nofld:
        print(f"  {C.YELLOW}⚠️  폴더 없음     {nofld}{C.RESET}")
    if err:
        print(f"  {C.RED}❌ 오류         {err}{C.RESET}")

    # 실패 항목 상세
    if miss + nofld + err:
        print()
        print(f"{C.BOLD}실패 항목 상세{C.RESET}")
        for status, color, label in [
            ("MISSING_PREFIX", C.YELLOW, "증빙번호 누락"),
            ("FOLDER_NOT_FOUND", C.YELLOW, "폴더 없음"),
            ("ERROR", C.RED, "오류"),
        ]:
            items = by_status.get(status, [])
            if not items:
                continue
            print(f"\n  {color}[{label}] {len(items)}건{C.RESET}")
            for r in items[:20]:
                print(f"    {C.DIM}·{C.RESET} {r.src_filename}  {C.DIM}→ {r.reason}{C.RESET}")
            if len(items) > 20:
                print(f"    {C.DIM}... 외 {len(items) - 20}건 (CSV 보고서 참조){C.RESET}")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="출장신청서 PDF를 증빙번호 prefix에 따라 Drive Desktop 동기화 폴더로 정리합니다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("--src", required=True, type=Path, help="PDF가 있는 원본 폴더")
    ap.add_argument("--drive", required=True, type=Path, help="Drive Desktop 마운트 D-4.출장비 폴더 경로")
    ap.add_argument("--mode", choices=["move", "copy"], default="move", help="기본: move")
    ap.add_argument("--report", type=Path, help="CSV 보고서 경로 (기본: <src>/upload_report_<timestamp>.csv)")
    ap.add_argument("--dry-run", action="store_true", help="실제 이동 없이 시뮬레이션만")
    ap.add_argument("--overwrite", action="store_true", help="대상에 동명 파일 있으면 덮어쓰기")
    args = ap.parse_args()

    src: Path = args.src.expanduser().resolve()
    drive: Path = args.drive.expanduser().resolve()

    if not src.is_dir():
        print(f"{C.RED}❌ --src 폴더를 찾을 수 없어요: {src}{C.RESET}", file=sys.stderr)
        return 1
    if not drive.is_dir():
        print(f"{C.RED}❌ --drive 폴더를 찾을 수 없어요: {drive}{C.RESET}", file=sys.stderr)
        print(f"   Drive Desktop이 동기화한 D-4.출장비 폴더 경로를 정확히 입력해주세요.", file=sys.stderr)
        return 1

    pdf_files = sorted([p for p in src.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"])
    if not pdf_files:
        print(f"{C.YELLOW}⚠️  --src 폴더에 PDF가 없어요: {src}{C.RESET}")
        return 0

    print(f"{C.CYAN}── 출장신청서 PDF 정리 ──{C.RESET}")
    print(f"  src:    {src}")
    print(f"  drive:  {drive}")
    print(f"  mode:   {args.mode}{' (dry-run)' if args.dry_run else ''}")
    print(f"  files:  {len(pdf_files)}개")
    print()

    results: list[TaskResult] = []
    for f in tqdm(pdf_files, desc="처리 중", unit="개"):
        res = process_one(
            f,
            drive,
            mode=args.mode,
            overwrite=args.overwrite,
            dry_run=args.dry_run,
        )
        results.append(res)

    # 보고서 저장
    if args.report:
        report_path = args.report.expanduser().resolve()
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = src / f"upload_report_{ts}.csv"
    write_report(results, report_path)

    print_summary(results)
    print()
    print(f"📄 CSV 보고서: {C.BLUE}{report_path}{C.RESET}")

    # 실패가 있으면 비-0 exit code (자동화 파이프라인용)
    failed = sum(1 for r in results if r.status != "OK")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
