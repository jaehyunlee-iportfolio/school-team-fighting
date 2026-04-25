#!/usr/bin/env python3
"""
출장신청서 PDF 정리 GUI (tkinter)

- 정리: PDF 폴더 + Drive 폴더 선택 → 증빙번호별 하위 폴더로 이동/복사
- 롤백: 이전 작업의 JSON 보고서를 골라 원복

실행: python3 scripts/upload_to_drive_gui.py
"""
from __future__ import annotations

import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

# 모듈 경로
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _drive_lib import (
    RollbackResult,
    TaskResult,
    make_report_paths,
    process_all,
    rollback_from_json,
    summarize,
    write_csv_report,
    write_json_report,
)


def open_in_finder(path: Path) -> None:
    """macOS Finder에서 경로 열기."""
    if sys.platform == "darwin":
        subprocess.run(["open", "-R", str(path)] if path.is_file() else ["open", str(path)])
    elif sys.platform.startswith("linux"):
        subprocess.run(["xdg-open", str(path.parent if path.is_file() else path)])
    elif sys.platform == "win32":
        os.startfile(str(path.parent if path.is_file() else path))  # type: ignore[attr-defined]


# ─────────────────────────────────────────────────────────────────────────
# Worker thread → UI 메시지 큐
# ─────────────────────────────────────────────────────────────────────────
class WorkerMessage:
    LOG = "log"
    PROGRESS = "progress"
    DONE = "done"
    ERROR = "error"


class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        root.title("출장신청서 PDF 정리")
        root.geometry("780x720")

        self.q: queue.Queue = queue.Queue()
        self.last_csv_path: Path | None = None
        self.last_json_path: Path | None = None
        self.last_results: list = []

        self._build_ui()
        self._poll_queue()

    # ── UI 구성 ──────────────────────────────────────────────────────────
    def _build_ui(self) -> None:
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill="both", expand=True, padx=12, pady=12)

        # 정리 탭
        organize_tab = ttk.Frame(notebook)
        notebook.add(organize_tab, text="📁 정리")
        self._build_organize_tab(organize_tab)

        # 롤백 탭
        rollback_tab = ttk.Frame(notebook)
        notebook.add(rollback_tab, text="↩️  롤백")
        self._build_rollback_tab(rollback_tab)

    def _build_organize_tab(self, parent: ttk.Frame) -> None:
        # 입력 영역
        frm = ttk.LabelFrame(parent, text="설정", padding=12)
        frm.pack(fill="x", padx=8, pady=8)

        # PDF 폴더
        ttk.Label(frm, text="PDF 폴더:").grid(row=0, column=0, sticky="w", pady=4)
        self.src_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.src_var, width=60).grid(row=0, column=1, sticky="ew", padx=6)
        ttk.Button(frm, text="폴더 선택", command=self._pick_src).grid(row=0, column=2)

        # Drive 폴더
        ttk.Label(frm, text="Drive 폴더:").grid(row=1, column=0, sticky="w", pady=4)
        self.drive_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.drive_var, width=60).grid(row=1, column=1, sticky="ew", padx=6)
        ttk.Button(frm, text="폴더 선택", command=self._pick_drive).grid(row=1, column=2)

        # 안내문
        ttk.Label(
            frm,
            text="부모(D-4.출장비) 또는 조부모((주)아이포트폴리오) 모두 OK — 2단계까지 자동 탐색",
            foreground="#666",
        ).grid(row=2, column=1, columnspan=2, sticky="w")

        # 모드 + dry-run
        opt_frm = ttk.Frame(frm)
        opt_frm.grid(row=3, column=0, columnspan=3, sticky="w", pady=(8, 0))
        self.mode_var = tk.StringVar(value="move")
        ttk.Label(opt_frm, text="모드:").pack(side="left", padx=(0, 6))
        ttk.Radiobutton(opt_frm, text="이동 (move)", variable=self.mode_var, value="move").pack(side="left")
        ttk.Radiobutton(opt_frm, text="복사 (copy)", variable=self.mode_var, value="copy").pack(side="left", padx=8)

        self.dry_run_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(opt_frm, text="미리보기 (dry-run, 실제 이동 안 함)", variable=self.dry_run_var).pack(side="left", padx=(20, 0))

        self.overwrite_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(opt_frm, text="덮어쓰기 허용", variable=self.overwrite_var).pack(side="left", padx=(12, 0))

        frm.columnconfigure(1, weight=1)

        # 실행 버튼
        btn_frm = ttk.Frame(parent)
        btn_frm.pack(fill="x", padx=8, pady=4)
        self.run_btn = ttk.Button(btn_frm, text="▶ 실행", command=self._on_run)
        self.run_btn.pack(side="left", padx=4)

        # 진행률
        self.progress = ttk.Progressbar(btn_frm, mode="determinate", length=300)
        self.progress.pack(side="left", padx=12, fill="x", expand=True)
        self.progress_label = ttk.Label(btn_frm, text="대기 중")
        self.progress_label.pack(side="left", padx=8)

        # 결과 요약
        self.summary_var = tk.StringVar(value="")
        summary_lbl = ttk.Label(parent, textvariable=self.summary_var, font=("", 11, "bold"))
        summary_lbl.pack(fill="x", padx=12, pady=(8, 0))

        # 보고서 버튼
        report_frm = ttk.Frame(parent)
        report_frm.pack(fill="x", padx=8, pady=4)
        self.open_csv_btn = ttk.Button(report_frm, text="📄 CSV 보고서 열기", command=self._open_csv, state="disabled")
        self.open_csv_btn.pack(side="left", padx=4)
        self.open_folder_btn = ttk.Button(report_frm, text="📁 폴더 열기", command=self._open_folder, state="disabled")
        self.open_folder_btn.pack(side="left", padx=4)

        # 로그
        log_frm = ttk.LabelFrame(parent, text="로그", padding=4)
        log_frm.pack(fill="both", expand=True, padx=8, pady=8)
        self.log = scrolledtext.ScrolledText(log_frm, height=14, wrap="word", font=("Menlo", 11))
        self.log.pack(fill="both", expand=True)
        self.log.tag_config("ok", foreground="#0a7a2f")
        self.log.tag_config("warn", foreground="#a06400")
        self.log.tag_config("err", foreground="#b00020")
        self.log.tag_config("dim", foreground="#888888")

    def _build_rollback_tab(self, parent: ttk.Frame) -> None:
        frm = ttk.LabelFrame(parent, text="롤백할 작업 선택", padding=12)
        frm.pack(fill="x", padx=8, pady=8)

        ttk.Label(frm, text="JSON 보고서:").grid(row=0, column=0, sticky="w", pady=4)
        self.rb_json_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.rb_json_var, width=60).grid(row=0, column=1, sticky="ew", padx=6)
        ttk.Button(frm, text="파일 선택", command=self._pick_json).grid(row=0, column=2)

        ttk.Label(
            frm,
            text="이전 정리 작업의 upload_report_*.json 파일을 선택하세요.\nmove 모드: Drive 폴더 → 원본 PDF 폴더로 prefix 다시 부착해 복원\ncopy 모드: Drive 폴더의 복사본만 삭제 (원본은 그대로)",
            foreground="#666",
            justify="left",
        ).grid(row=1, column=0, columnspan=3, sticky="w", pady=(8, 0))

        frm.columnconfigure(1, weight=1)

        # 실행
        btn_frm = ttk.Frame(parent)
        btn_frm.pack(fill="x", padx=8, pady=4)
        self.rb_run_btn = ttk.Button(btn_frm, text="↩️  원복 실행", command=self._on_rollback)
        self.rb_run_btn.pack(side="left", padx=4)

        self.rb_progress = ttk.Progressbar(btn_frm, mode="determinate", length=300)
        self.rb_progress.pack(side="left", padx=12, fill="x", expand=True)
        self.rb_progress_label = ttk.Label(btn_frm, text="대기 중")
        self.rb_progress_label.pack(side="left", padx=8)

        # 로그
        log_frm = ttk.LabelFrame(parent, text="로그", padding=4)
        log_frm.pack(fill="both", expand=True, padx=8, pady=8)
        self.rb_log = scrolledtext.ScrolledText(log_frm, height=14, wrap="word", font=("Menlo", 11))
        self.rb_log.pack(fill="both", expand=True)
        self.rb_log.tag_config("ok", foreground="#0a7a2f")
        self.rb_log.tag_config("warn", foreground="#a06400")
        self.rb_log.tag_config("err", foreground="#b00020")
        self.rb_log.tag_config("dim", foreground="#888888")

    # ── 핸들러 ───────────────────────────────────────────────────────────
    def _pick_src(self) -> None:
        p = filedialog.askdirectory(title="PDF가 들어 있는 폴더 선택")
        if p:
            self.src_var.set(p)

    def _pick_drive(self) -> None:
        p = filedialog.askdirectory(title="Drive 폴더 선택 (부모 또는 조부모)")
        if p:
            self.drive_var.set(p)

    def _pick_json(self) -> None:
        p = filedialog.askopenfilename(
            title="upload_report_*.json 파일 선택",
            filetypes=[("JSON 보고서", "*.json"), ("모든 파일", "*.*")],
        )
        if p:
            self.rb_json_var.set(p)

    def _open_csv(self) -> None:
        if self.last_csv_path:
            open_in_finder(self.last_csv_path)

    def _open_folder(self) -> None:
        if self.last_csv_path:
            open_in_finder(self.last_csv_path.parent)

    def _log(self, target: scrolledtext.ScrolledText, msg: str, tag: str = "") -> None:
        if tag:
            target.insert("end", msg + "\n", tag)
        else:
            target.insert("end", msg + "\n")
        target.see("end")

    # ── 실행 ────────────────────────────────────────────────────────────
    def _on_run(self) -> None:
        src = self.src_var.get().strip()
        drive = self.drive_var.get().strip()
        if not src or not drive:
            messagebox.showerror("입력 누락", "PDF 폴더와 Drive 폴더를 모두 지정해주세요.")
            return
        src_p = Path(src).expanduser()
        drive_p = Path(drive).expanduser()
        if not src_p.is_dir():
            messagebox.showerror("폴더 없음", f"PDF 폴더를 찾을 수 없어요:\n{src_p}")
            return
        if not drive_p.is_dir():
            messagebox.showerror("폴더 없음", f"Drive 폴더를 찾을 수 없어요:\n{drive_p}")
            return

        self.run_btn.config(state="disabled")
        self.open_csv_btn.config(state="disabled")
        self.open_folder_btn.config(state="disabled")
        self.log.delete("1.0", "end")
        self.summary_var.set("처리 중...")
        self.progress["value"] = 0

        mode = self.mode_var.get()
        dry_run = self.dry_run_var.get()
        overwrite = self.overwrite_var.get()

        self._log(self.log, f"── 정리 시작 ──", "dim")
        self._log(self.log, f"  src:    {src_p}", "dim")
        self._log(self.log, f"  drive:  {drive_p}", "dim")
        self._log(self.log, f"  mode:   {mode}{'  (dry-run)' if dry_run else ''}", "dim")
        self._log(self.log, "")

        threading.Thread(
            target=self._worker_organize,
            args=(src_p, drive_p, mode, dry_run, overwrite),
            daemon=True,
        ).start()

    def _worker_organize(self, src: Path, drive: Path, mode: str, dry_run: bool, overwrite: bool) -> None:
        try:
            def on_progress(cur: int, total: int, res: TaskResult) -> None:
                self.q.put((WorkerMessage.PROGRESS, ("organize", cur, total, res)))

            results = process_all(src, drive, mode=mode, overwrite=overwrite, dry_run=dry_run, on_progress=on_progress)

            csv_path, json_path = make_report_paths(src)
            write_csv_report(results, csv_path)
            write_json_report(results, src=src, drive=drive, mode=mode, dry_run=dry_run, path=json_path)

            self.q.put((WorkerMessage.DONE, ("organize", results, csv_path, json_path)))
        except Exception as e:
            self.q.put((WorkerMessage.ERROR, ("organize", repr(e))))

    def _on_rollback(self) -> None:
        json_str = self.rb_json_var.get().strip()
        if not json_str:
            messagebox.showerror("입력 누락", "JSON 보고서를 선택해주세요.")
            return
        json_p = Path(json_str).expanduser()
        if not json_p.is_file():
            messagebox.showerror("파일 없음", f"JSON 파일을 찾을 수 없어요:\n{json_p}")
            return

        if not messagebox.askyesno("확인", f"이 작업을 원복할까요?\n\n{json_p.name}"):
            return

        self.rb_run_btn.config(state="disabled")
        self.rb_log.delete("1.0", "end")
        self.rb_progress["value"] = 0
        self.rb_progress_label.config(text="처리 중...")

        self._log(self.rb_log, f"── 롤백 시작 ──", "dim")
        self._log(self.rb_log, f"  보고서: {json_p}", "dim")
        self._log(self.rb_log, "")

        threading.Thread(target=self._worker_rollback, args=(json_p,), daemon=True).start()

    def _worker_rollback(self, json_p: Path) -> None:
        try:
            def on_progress(cur: int, total: int, res: RollbackResult) -> None:
                self.q.put((WorkerMessage.PROGRESS, ("rollback", cur, total, res)))

            results, meta = rollback_from_json(json_p, on_progress=on_progress)
            self.q.put((WorkerMessage.DONE, ("rollback", results, meta)))
        except Exception as e:
            self.q.put((WorkerMessage.ERROR, ("rollback", repr(e))))

    # ── 큐 폴링 ─────────────────────────────────────────────────────────
    def _poll_queue(self) -> None:
        try:
            while True:
                kind, payload = self.q.get_nowait()
                if kind == WorkerMessage.PROGRESS:
                    self._handle_progress(payload)
                elif kind == WorkerMessage.DONE:
                    self._handle_done(payload)
                elif kind == WorkerMessage.ERROR:
                    self._handle_error(payload)
        except queue.Empty:
            pass
        self.root.after(80, self._poll_queue)

    def _handle_progress(self, payload) -> None:
        kind, cur, total, res = payload
        if kind == "organize":
            self.progress["maximum"] = total
            self.progress["value"] = cur
            self.progress_label.config(text=f"{cur} / {total}")
            tag = {"OK": "ok", "MISSING_PREFIX": "warn", "FOLDER_NOT_FOUND": "warn", "ERROR": "err"}.get(res.status, "")
            icon = {"OK": "✅", "MISSING_PREFIX": "⚠️", "FOLDER_NOT_FOUND": "⚠️", "ERROR": "❌"}.get(res.status, "·")
            line = f"{icon} {res.src_filename}"
            if res.status != "OK":
                line += f"  → {res.reason}"
            self._log(self.log, line, tag)
        else:  # rollback
            self.rb_progress["maximum"] = total
            self.rb_progress["value"] = cur
            self.rb_progress_label.config(text=f"{cur} / {total}")
            tag = {"OK": "ok", "SKIPPED": "dim", "ERROR": "err"}.get(res.status, "")
            icon = {"OK": "↩️", "SKIPPED": "⏭", "ERROR": "❌"}.get(res.status, "·")
            line = f"{icon} {Path(res.target_path).name}"
            if res.status != "OK":
                line += f"  → {res.reason}"
            self._log(self.rb_log, line, tag)

    def _handle_done(self, payload) -> None:
        kind = payload[0]
        if kind == "organize":
            _, results, csv_path, json_path = payload
            self.last_results = results
            self.last_csv_path = csv_path
            self.last_json_path = json_path
            s = summarize(results)
            summary_text = f"✅ 성공 {s['ok']}"
            if s["missing_prefix"]:
                summary_text += f"   ⚠️ 증빙번호 누락 {s['missing_prefix']}"
            if s["folder_not_found"]:
                summary_text += f"   ⚠️ 폴더 없음 {s['folder_not_found']}"
            if s["error"]:
                summary_text += f"   ❌ 오류 {s['error']}"
            summary_text += f"   (총 {s['total']}건)"
            self.summary_var.set(summary_text)

            self._log(self.log, "")
            self._log(self.log, f"📄 CSV 보고서: {csv_path}")
            self._log(self.log, f"📄 JSON (롤백용): {json_path}")
            self.run_btn.config(state="normal")
            self.open_csv_btn.config(state="normal")
            self.open_folder_btn.config(state="normal")
        else:  # rollback
            _, results, meta = payload
            ok = sum(1 for r in results if r.status == "OK")
            sk = sum(1 for r in results if r.status == "SKIPPED")
            er = sum(1 for r in results if r.status == "ERROR")
            self._log(self.rb_log, "")
            self._log(self.rb_log, f"롤백 완료: 원복 {ok}, 건너뜀 {sk}, 오류 {er}", "ok" if er == 0 else "warn")
            self.rb_progress_label.config(text=f"완료 (원복 {ok})")
            self.rb_run_btn.config(state="normal")

    def _handle_error(self, payload) -> None:
        kind, err_msg = payload
        if kind == "organize":
            self._log(self.log, f"❌ 오류: {err_msg}", "err")
            self.run_btn.config(state="normal")
            self.summary_var.set("처리 실패")
        else:
            self._log(self.rb_log, f"❌ 오류: {err_msg}", "err")
            self.rb_run_btn.config(state="normal")
            self.rb_progress_label.config(text="실패")
        messagebox.showerror("오류", err_msg)


def main() -> int:
    root = tk.Tk()
    try:
        # macOS: 메뉴바 깔끔하게
        root.tk.call("tk", "scaling", 1.2)
    except tk.TclError:
        pass
    App(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
