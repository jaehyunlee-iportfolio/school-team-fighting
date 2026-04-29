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
from typing import Callable, Iterable, Literal

SUPPORTED_EXTS = (".pdf", ".hwp", ".hwpx")
PREFIX_RE = re.compile(
    r"^([A-Za-z]-\d+(?:-\d+)*)_(.+\.(?:pdf|hwp|hwpx))$", re.IGNORECASE
)
REPORT_SCHEMA_VERSION = 1

# 충돌 정책: 같은 이름 파일이 대상 폴더에 이미 있을 때
ConflictPolicy = Literal["overwrite", "rename", "skip"]

# 지출결의서 stable key 패턴.
# 파일명 예: "1. 내부결의문서_지출결의서_IPF-20260206-R0125.pdf"
#         또는 "1.내부결재문서_지출결의서_KDI-20260205-R1500.pdf"
# stable key = "_지출결의서_<ORG>-<YYYYMMDD>" 까지. 뒤의 "-R0125" 같은 일련번호는
# 매번 랜덤이라 동일 문서 식별에 방해되므로 무시.
EXPENSE_SERIAL_RE = re.compile(
    r"^(.*?_지출결의서_[A-Za-z]+-\d{8})-[A-Za-z]\d+(\.[A-Za-z]+)$"
)


def expense_stable_key(filename: str) -> tuple[str, str] | None:
    """지출결의서 파일이면 (날짜까지 prefix, 확장자) 반환. 아니면 None.

    같은 날에 만든 같은 비목·증빙번호 지출결의서는 일련번호(R0125 등)가
    달라도 동일 문서로 간주하기 위함.
    """
    m = EXPENSE_SERIAL_RE.match(filename)
    if not m:
        return None
    return m.group(1), m.group(2)


def find_existing_expense_match(target_folder: Path, filename: str) -> Path | None:
    """target_folder 안에서 같은 stable key를 가진 지출결의서 파일 탐색.

    파일이 지출결의서가 아니거나 매칭이 없으면 None.
    동일 이름 파일은 매칭 결과로 우선 반환 (정확 일치).
    """
    key = expense_stable_key(filename)
    if key is None:
        return None
    prefix, ext = key
    direct = target_folder / filename
    try:
        if direct.is_file():
            return direct
    except OSError:
        pass
    try:
        for p in target_folder.iterdir():
            try:
                if not p.is_file():
                    continue
            except OSError:
                continue
            if p.suffix.lower() != ext.lower():
                continue
            other = expense_stable_key(p.name)
            if other is not None and other[0] == prefix:
                return p
    except OSError:
        return None
    return None


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
    dry_run: bool,
    conflict: ConflictPolicy = "rename",
    overwrite: bool | None = None,  # backward-compat: True→"overwrite", False→"rename"
    expense_match_by_date: bool = False,
) -> TaskResult:
    if overwrite is not None:
        conflict = "overwrite" if overwrite else "rename"

    name = src_file.name
    evidence_no, stripped = parse_prefix(name)

    if evidence_no is None or stripped is None:
        return TaskResult(
            status="MISSING_PREFIX",
            src_filename=name,
            evidence_no="",
            target_folder="",
            target_filename="",
            reason="파일명에 증빙번호 prefix 없음 또는 미지원 확장자 (예: D-4-1_파일명.pdf, .hwp, .hwpx 지원)",
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

    # 충돌 감지: 정확 일치 + (옵션) 지출결의서 stable key 매칭
    direct_path = target_folder / stripped
    existing: Path | None = direct_path if _safe_exists(direct_path) else None
    expense_dup_note = ""
    if expense_match_by_date and existing is None:
        matched = find_existing_expense_match(target_folder, stripped)
        if matched is not None and matched != direct_path:
            existing = matched
            expense_dup_note = f" (같은 날짜 다른 일련번호: {matched.name})"

    # 충돌 정책 적용
    if conflict == "skip" and existing is not None:
        return TaskResult(
            status="SKIPPED",
            src_filename=name,
            evidence_no=evidence_no,
            target_folder=str(target_folder),
            target_filename=existing.name,
            reason=f"동일 문서 이미 존재 — skip{expense_dup_note}",
        )
    if conflict == "overwrite":
        # 정확 일치는 그 경로에 그대로 덮어쓰기.
        # 지출결의서 stable key 매칭(다른 일련번호)이면 기존 파일 삭제 후 새 이름으로 저장.
        if existing is not None and existing.name != stripped:
            try:
                if not dry_run:
                    existing.unlink()
            except OSError:
                pass
        target_path = direct_path
    else:  # "rename"
        # 정확 일치면 _dup1 부여. 지출결의서 stable key 매칭(다른 이름)은 자기 이름 그대로
        # 저장(둘 다 보관). 자기 이름이 우연히 정확 일치하는 경우만 _dup 부여.
        if _safe_exists(direct_path):
            target_path = resolve_dup_name(target_folder, stripped)
        else:
            target_path = direct_path

    if dry_run:
        return TaskResult(
            status="OK",
            src_filename=name,
            evidence_no=evidence_no,
            target_folder=str(target_folder),
            target_filename=target_path.name,
            reason=f"[dry-run] {mode} 예정{expense_dup_note}",
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
        reason=f"{mode} 완료{expense_dup_note}",
    )


def list_pdfs(src: Path) -> list[Path]:
    """이름은 list_pdfs지만 .pdf / .hwp / .hwpx 모두 포함."""
    return sorted(
        [p for p in src.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS]
    )


def process_all(
    src: Path,
    drive: Path,
    *,
    mode: str = "move",
    dry_run: bool = False,
    conflict: ConflictPolicy = "rename",
    overwrite: bool | None = None,  # backward-compat
    expense_match_by_date: bool = False,
    on_progress: Callable[[int, int, TaskResult], None] | None = None,
) -> list[TaskResult]:
    """모든 지원 파일 처리. on_progress(현재, 전체, 결과)로 진행 상황 보고."""
    if overwrite is not None:
        conflict = "overwrite" if overwrite else "rename"
    pdfs = list_pdfs(src)
    total = len(pdfs)
    results: list[TaskResult] = []
    for i, f in enumerate(pdfs):
        res = process_one(
            f, drive,
            mode=mode, conflict=conflict, dry_run=dry_run,
            expense_match_by_date=expense_match_by_date,
        )
        results.append(res)
        if on_progress:
            on_progress(i + 1, total, res)
    return results


# ─────────────────────────────────────────────────────────────────────────
# 보고서
# ─────────────────────────────────────────────────────────────────────────

def summarize(results: Iterable[TaskResult]) -> dict[str, int]:
    s = {"total": 0, "ok": 0, "skipped": 0, "missing_prefix": 0, "folder_not_found": 0, "error": 0}
    for r in results:
        s["total"] += 1
        key = {
            "OK": "ok",
            "SKIPPED": "skipped",
            "MISSING_PREFIX": "missing_prefix",
            "FOLDER_NOT_FOUND": "folder_not_found",
            "ERROR": "error",
        }.get(r.status)
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
