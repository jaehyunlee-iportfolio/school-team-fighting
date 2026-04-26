"""Core logic for organizing prefixed PDFs into Drive Desktop subfolders.

CLI (`upload_to_drive.py`) and GUI (`upload_to_drive_gui.py`) 모두 이 모듈을 사용한다.
UI 의존성 없음 (print/argparse/tkinter 미사용).
"""
from __future__ import annotations

import errno
import json
import re
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable

PREFIX_RE = re.compile(r"^([A-Za-z]-\d+(?:-\d+)*)_(.+\.pdf)$", re.IGNORECASE)
REPORT_SCHEMA_VERSION = 1


@dataclass
class TaskResult:
    status: str           # OK / MISSING_PREFIX / FOLDER_NOT_FOUND / ERROR / SKIPPED
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


def find_target_folder(
    drive_root: Path,
    evidence_no: str,
    *,
    max_depth: int = 2,
) -> Path | None:
    """drive_root 아래에서 evidence_no와 정확히 일치하는 폴더 탐색.

    - max_depth=1: drive_root/{evidence_no} 만 확인 (부모 폴더를 직접 지정한 경우)
    - max_depth=2: drive_root/{어떤폴더}/{evidence_no} 도 확인 (조부모 폴더 지정한 경우)

    예) drive_root="(주)아이포트폴리오", evidence_no="A-1-1"
        → "(주)아이포트폴리오/A-1.내부인건비/A-1-1" 찾음
    """
    def _safe_is_dir(p: Path) -> bool:
        try:
            return p.is_dir()
        except OSError as e:
            if e.errno == errno.ENAMETOOLONG:
                return False
            raise

    direct = drive_root / evidence_no
    if _safe_is_dir(direct):
        return direct

    if max_depth >= 2:
        try:
            for parent in drive_root.iterdir():
                if not _safe_is_dir(parent):
                    continue
                candidate = parent / evidence_no
                if _safe_is_dir(candidate):
                    return candidate
        except OSError:
            return None

    return None


def _safe_exists(p: Path) -> bool:
    """ENAMETOOLONG 발생 시 False로 처리 (해당 경로엔 파일 없다고 간주)."""
    try:
        return p.exists()
    except OSError as e:
        if e.errno == errno.ENAMETOOLONG:
            return False
        raise


def resolve_dup_name(target_dir: Path, name: str) -> Path:
    """대상 폴더에 동명 파일이 있으면 _dup1, _dup2 ... suffix 부여."""
    base, _, ext = name.rpartition(".")
    ext = f".{ext}" if ext else ""
    if not base:
        base = name
        ext = ""
    candidate = target_dir / name
    i = 1
    while _safe_exists(candidate):
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

    target_folder = find_target_folder(drive_root, evidence_no, max_depth=2)
    if target_folder is None:
        return TaskResult(
            status="FOLDER_NOT_FOUND",
            src_filename=name,
            evidence_no=evidence_no,
            target_folder=str(drive_root / evidence_no),
            target_filename=stripped,
            reason=f"Drive 트리에서 {evidence_no} 폴더를 찾지 못함 (2단계까지 검색)",
        )

    target_path = target_folder / stripped if overwrite else resolve_dup_name(target_folder, stripped)

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
        else:  # copy
            shutil.copy2(str(src_file), str(target_path))
    except OSError as e:
        if e.errno == errno.ENAMETOOLONG:
            full_bytes = len(str(target_path).encode("utf-8"))
            return TaskResult(
                status="ERROR",
                src_filename=name,
                evidence_no=evidence_no,
                target_folder=str(target_folder),
                target_filename=target_path.name,
                reason=(
                    f"경로가 너무 길어 Drive가 거부함 ({full_bytes}바이트). "
                    f"Drive 폴더를 더 짧은 위치로 옮기거나 단축 경로를 만들어 주세요."
                ),
            )
        return TaskResult(
            status="ERROR",
            src_filename=name,
            evidence_no=evidence_no,
            target_folder=str(target_folder),
            target_filename=target_path.name,
            reason=f"{type(e).__name__}: {e}",
        )
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


def list_pdfs(src: Path) -> list[Path]:
    return sorted([p for p in src.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"])


def process_all(
    src: Path,
    drive: Path,
    *,
    mode: str = "move",
    overwrite: bool = False,
    dry_run: bool = False,
    on_progress: Callable[[int, int, TaskResult], None] | None = None,
) -> list[TaskResult]:
    """모든 PDF 처리. on_progress(현재, 전체, 결과)로 진행 상황 보고."""
    pdfs = list_pdfs(src)
    total = len(pdfs)
    results: list[TaskResult] = []
    for i, f in enumerate(pdfs):
        res = process_one(f, drive, mode=mode, overwrite=overwrite, dry_run=dry_run)
        results.append(res)
        if on_progress:
            on_progress(i + 1, total, res)
    return results


# ─────────────────────────────────────────────────────────────────────────
# 보고서
# ─────────────────────────────────────────────────────────────────────────

def summarize(results: Iterable[TaskResult]) -> dict[str, int]:
    s = {"total": 0, "ok": 0, "missing_prefix": 0, "folder_not_found": 0, "error": 0}
    for r in results:
        s["total"] += 1
        key = {"OK": "ok", "MISSING_PREFIX": "missing_prefix", "FOLDER_NOT_FOUND": "folder_not_found", "ERROR": "error"}.get(r.status)
        if key:
            s[key] += 1
    return s


def write_csv_report(results: list[TaskResult], path: Path) -> None:
    import csv
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["status", "filename", "evidence_no", "target_folder", "target_filename", "reason"])
        for r in results:
            w.writerow([r.status, r.src_filename, r.evidence_no, r.target_folder, r.target_filename, r.reason])


def write_json_report(
    results: list[TaskResult],
    *,
    src: Path,
    drive: Path,
    mode: str,
    dry_run: bool,
    path: Path,
) -> None:
    """롤백에 사용할 수 있는 구조화 보고서."""
    data = {
        "version": REPORT_SCHEMA_VERSION,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "src": str(src),
        "drive": str(drive),
        "mode": mode,
        "dry_run": dry_run,
        "summary": summarize(results),
        "items": [asdict(r) for r in results],
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def make_report_paths(src: Path, prefix: str = "upload_report") -> tuple[Path, Path]:
    """기본 (CSV, JSON) 보고서 경로를 src 폴더 안에 생성."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return src / f"{prefix}_{ts}.csv", src / f"{prefix}_{ts}.json"


# ─────────────────────────────────────────────────────────────────────────
# 롤백
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class RollbackResult:
    status: str   # OK / SKIPPED / ERROR
    target_path: str
    restored_to: str
    reason: str


def rollback_from_json(
    json_path: Path,
    *,
    on_progress: Callable[[int, int, RollbackResult], None] | None = None,
) -> tuple[list[RollbackResult], dict]:
    """이전 작업의 JSON 보고서를 보고 롤백 수행.

    move 모드:  대상 폴더의 파일 → src 폴더로 이동, prefix 다시 부착
    copy 모드:  대상 폴더의 파일 삭제 (원본은 src에 그대로 있음)
    """
    data = json.loads(json_path.read_text(encoding="utf-8"))
    src = Path(data["src"])
    mode = data["mode"]
    items = data["items"]

    if not src.is_dir():
        # move 모드라면 복원 불가 → 에러로 처리
        if mode == "move":
            raise FileNotFoundError(f"원본 폴더가 사라졌어요: {src}")
        # copy 모드는 삭제만 하므로 src 없어도 OK

    results: list[RollbackResult] = []
    ok_items = [it for it in items if it.get("status") == "OK"]
    total = len(ok_items)

    for i, it in enumerate(ok_items):
        target_folder = Path(it["target_folder"])
        target_path = target_folder / it["target_filename"]
        src_filename = it["src_filename"]
        restored_to = src / src_filename

        if not target_path.exists():
            res = RollbackResult(
                status="SKIPPED",
                target_path=str(target_path),
                restored_to=str(restored_to),
                reason="대상 파일이 이미 없음 (이미 롤백된 듯)",
            )
            results.append(res)
            if on_progress:
                on_progress(i + 1, total, res)
            continue

        try:
            if mode == "move":
                # 동명 파일 충돌 처리
                if restored_to.exists():
                    base, _, ext = src_filename.rpartition(".")
                    ext = f".{ext}" if ext else ""
                    j = 1
                    while True:
                        candidate = src / f"{base}_restored{j}{ext}"
                        if not candidate.exists():
                            restored_to = candidate
                            break
                        j += 1
                shutil.move(str(target_path), str(restored_to))
                res = RollbackResult(
                    status="OK",
                    target_path=str(target_path),
                    restored_to=str(restored_to),
                    reason="원복 완료 (move)",
                )
            else:  # copy
                target_path.unlink()
                res = RollbackResult(
                    status="OK",
                    target_path=str(target_path),
                    restored_to="",
                    reason="대상 파일 삭제 (copy 모드는 원본이 src에 그대로 있음)",
                )
        except Exception as e:
            res = RollbackResult(
                status="ERROR",
                target_path=str(target_path),
                restored_to=str(restored_to),
                reason=f"{type(e).__name__}: {e}",
            )

        results.append(res)
        if on_progress:
            on_progress(i + 1, total, res)

    return results, data
