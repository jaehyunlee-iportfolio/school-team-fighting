#!/usr/bin/env python3
"""
출장신청서 PDF를 Drive Desktop 동기화 폴더의 증빙번호별 하위 폴더로 이동/복사한다.

사용법:
    python3 scripts/upload_to_drive.py --src <PDF폴더> --drive <Drive 경로> [--dry-run]

자세한 설명은 scripts/README_upload.md 참조.

GUI 버전: scripts/upload_to_drive_gui.py
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# 모듈 경로 추가 (스크립트 직접 실행 대응)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _drive_lib import (
    TaskResult,
    make_report_paths,
    process_all,
    rollback_from_json,
    summarize,
    write_csv_report,
    write_json_report,
)

try:
    from tqdm import tqdm
except ImportError:
    print("⚠️  tqdm 모듈이 없어요. 설치: pip3 install --user --break-system-packages tqdm", file=sys.stderr)
    print("   진행률 표시 없이 계속할게요.\n", file=sys.stderr)

    def tqdm(iterable, **kwargs):  # type: ignore[no-redef]
        return iterable


# ANSI 컬러
class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"
    BLUE = "\033[34m"
    CYAN = "\033[36m"


def print_summary(results: list[TaskResult]) -> None:
    by_status: dict[str, list[TaskResult]] = {}
    for r in results:
        by_status.setdefault(r.status, []).append(r)

    s = summarize(results)
    print()
    print(f"{C.BOLD}처리 결과 요약{C.RESET}  (총 {s['total']}건)")
    print(f"  {C.GREEN}✅ 성공         {s['ok']}{C.RESET}")
    if s["missing_prefix"]:
        print(f"  {C.YELLOW}⚠️  증빙번호 누락 {s['missing_prefix']}{C.RESET}")
    if s["folder_not_found"]:
        print(f"  {C.YELLOW}⚠️  폴더 없음     {s['folder_not_found']}{C.RESET}")
    if s["error"]:
        print(f"  {C.RED}❌ 오류         {s['error']}{C.RESET}")

    fail_total = s["missing_prefix"] + s["folder_not_found"] + s["error"]
    if fail_total:
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


def cmd_organize(args: argparse.Namespace) -> int:
    src = Path(args.src).expanduser().resolve()
    drive = Path(args.drive).expanduser().resolve()

    if not src.is_dir():
        print(f"{C.RED}❌ --src 폴더를 찾을 수 없어요: {src}{C.RESET}", file=sys.stderr)
        return 1
    if not drive.is_dir():
        print(f"{C.RED}❌ --drive 폴더를 찾을 수 없어요: {drive}{C.RESET}", file=sys.stderr)
        return 1

    print(f"{C.CYAN}── 출장신청서 PDF 정리 ──{C.RESET}")
    print(f"  src:    {src}")
    print(f"  drive:  {drive}")
    print(f"  mode:   {args.mode}{' (dry-run)' if args.dry_run else ''}")

    # 진행률 표시
    pbar: object | None = None

    def on_progress(cur: int, total: int, _res: TaskResult) -> None:
        nonlocal pbar
        if pbar is None:
            pbar = tqdm(total=total, desc="처리 중", unit="개")
        pbar.update(1)  # type: ignore[union-attr]

    # backward-compat: --overwrite > --conflict
    conflict = "overwrite" if args.overwrite else args.conflict
    results = process_all(
        src,
        drive,
        mode=args.mode,
        conflict=conflict,
        dry_run=args.dry_run,
        on_progress=on_progress,
    )
    if pbar is not None:
        pbar.close()  # type: ignore[union-attr]

    csv_path, json_path = make_report_paths(src)
    if args.report:
        csv_path = Path(args.report).expanduser().resolve()
        json_path = csv_path.with_suffix(".json")
    write_csv_report(results, csv_path)
    write_json_report(results, src=src, drive=drive, mode=args.mode, dry_run=args.dry_run, path=json_path)

    print_summary(results)
    print()
    print(f"📄 CSV 보고서: {C.BLUE}{csv_path}{C.RESET}")
    print(f"📄 JSON (롤백용): {C.BLUE}{json_path}{C.RESET}")

    failed = sum(1 for r in results if r.status != "OK")
    return 0 if failed == 0 else 2


def cmd_rollback(args: argparse.Namespace) -> int:
    json_path = Path(args.json).expanduser().resolve()
    if not json_path.is_file():
        print(f"{C.RED}❌ JSON 보고서를 찾을 수 없어요: {json_path}{C.RESET}", file=sys.stderr)
        return 1

    print(f"{C.CYAN}── 롤백 ──{C.RESET}")
    print(f"  보고서: {json_path}")

    pbar: object | None = None

    def on_progress(cur: int, total: int, _res) -> None:
        nonlocal pbar
        if pbar is None:
            pbar = tqdm(total=total, desc="원복 중", unit="개")
        pbar.update(1)  # type: ignore[union-attr]

    results, meta = rollback_from_json(json_path, on_progress=on_progress)
    if pbar is not None:
        pbar.close()  # type: ignore[union-attr]

    ok = sum(1 for r in results if r.status == "OK")
    skip = sum(1 for r in results if r.status == "SKIPPED")
    err = sum(1 for r in results if r.status == "ERROR")
    print()
    print(f"{C.BOLD}롤백 결과{C.RESET}  (총 {len(results)}건)")
    print(f"  {C.GREEN}✅ 원복         {ok}{C.RESET}")
    if skip:
        print(f"  {C.DIM}⏭  건너뜀       {skip}{C.RESET}")
    if err:
        print(f"  {C.RED}❌ 오류         {err}{C.RESET}")

    return 0 if err == 0 else 2


def main() -> int:
    ap = argparse.ArgumentParser(description="출장신청서 PDF 정리 / 롤백")
    sub = ap.add_subparsers(dest="cmd")

    # 기본 (정리)
    org = sub.add_parser("organize", help="PDF를 증빙번호 폴더로 이동/복사")
    org.add_argument("--src", required=True, help="PDF가 있는 원본 폴더")
    org.add_argument("--drive", required=True, help="Drive Desktop D-4.출장비 경로")
    org.add_argument("--mode", choices=["move", "copy"], default="move")
    org.add_argument("--report", help="CSV 보고서 경로 (기본 자동)")
    org.add_argument("--dry-run", action="store_true")
    org.add_argument("--overwrite", action="store_true",
                     help="동일 이름 파일을 덮어씀 (--conflict overwrite 와 동일)")
    org.add_argument("--conflict", choices=["overwrite", "rename", "skip"],
                     default="rename",
                     help="동일 이름 시 처리: overwrite/rename(_dup1)/skip")
    org.set_defaults(func=cmd_organize)

    # 롤백
    rb = sub.add_parser("rollback", help="JSON 보고서로 이전 작업 원복")
    rb.add_argument("--json", required=True, help="이전 작업의 JSON 보고서 경로")
    rb.set_defaults(func=cmd_rollback)

    # 하위명령 없으면 organize 동작 (하위호환)
    args, remaining = ap.parse_known_args()
    if args.cmd is None:
        # 기본은 organize: 인자를 organize에 전달
        return cmd_organize(org.parse_args(remaining))
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
