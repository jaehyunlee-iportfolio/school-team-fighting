#!/usr/bin/env python3
"""Polaris AI DataInsight Doc Extract — tkinter GUI 테스터.

실행: python3 scripts/polaris-datainsight/gui.py
"""
from __future__ import annotations

import json
import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

import sys
sys.path.insert(0, str(Path(__file__).parent))

from extract import (
    SUPPORTED_EXTS,
    ExtractResult,
    collect_tables_markdown,
    collect_text,
    extract_document,
    load_api_key,
    summarize,
)
from pdf_render import convert_original_to_pdf, render_report_pdf

HERE = Path(__file__).parent
DEFAULT_OUTPUT = HERE / "output"
ENV_FILE = HERE / ".env"


class App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        root.title("Polaris DataInsight Doc Extract — Tester")
        root.geometry("960x720")

        self.q: queue.Queue[tuple[str, object]] = queue.Queue()
        self.api_key = tk.StringVar(value=load_api_key(ENV_FILE) or "")
        self.file_path = tk.StringVar()
        self.output_dir = tk.StringVar(value=str(DEFAULT_OUTPUT))
        self.last_result: ExtractResult | None = None

        self._build_ui()
        self.root.after(120, self._poll)

    def _build_ui(self) -> None:
        top = ttk.Frame(self.root, padding=10)
        top.pack(fill="x")

        ttk.Label(top, text="API Key:").grid(row=0, column=0, sticky="w")
        key_entry = ttk.Entry(top, textvariable=self.api_key, show="•", width=70)
        key_entry.grid(row=0, column=1, sticky="we", padx=4)
        status = "✓ .env에서 로드됨" if self.api_key.get() else "⚠ .env에 키 없음"
        ttk.Label(top, text=status).grid(row=0, column=2, sticky="w")

        ttk.Label(top, text="입력 파일:").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(top, textvariable=self.file_path).grid(row=1, column=1, sticky="we", padx=4, pady=(8, 0))
        ttk.Button(top, text="선택...", command=self._pick_file).grid(row=1, column=2, sticky="w", pady=(8, 0))

        ttk.Label(top, text="출력 폴더:").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(top, textvariable=self.output_dir).grid(row=2, column=1, sticky="we", padx=4, pady=(8, 0))
        ttk.Button(top, text="선택...", command=self._pick_outdir).grid(row=2, column=2, sticky="w", pady=(8, 0))

        top.columnconfigure(1, weight=1)

        actions = ttk.Frame(self.root, padding=(10, 0, 10, 10))
        actions.pack(fill="x")
        self.run_btn = ttk.Button(actions, text="추출 시작", command=self._run)
        self.run_btn.pack(side="left")
        self.pdf_a_btn = ttk.Button(actions, text="A. hwp → PDF (HTML 경유)", command=self._run_pdf_original)
        self.pdf_a_btn.pack(side="left", padx=4)
        self.pdf_b_btn = ttk.Button(actions, text="B. 보고서 PDF", command=self._run_pdf_report, state="disabled")
        self.pdf_b_btn.pack(side="left", padx=4)
        ttk.Button(actions, text="결과 폴더 열기", command=self._open_outdir).pack(side="left", padx=8)
        self.progress = ttk.Progressbar(actions, mode="indeterminate")
        self.progress.pack(side="left", fill="x", expand=True, padx=8)

        ttk.Label(self.root, text="로그", padding=(10, 0)).pack(anchor="w")
        self.log = scrolledtext.ScrolledText(self.root, height=8, wrap="word")
        self.log.pack(fill="x", padx=10)

        nb = ttk.Notebook(self.root)
        nb.pack(fill="both", expand=True, padx=10, pady=10)
        self.summary_view = self._add_tab(nb, "요약")
        self.tables_view = self._add_tab(nb, "표 (Markdown)")
        self.text_view = self._add_tab(nb, "본문 텍스트")
        self.json_view = self._add_tab(nb, "원본 JSON")

    def _add_tab(self, nb: ttk.Notebook, title: str) -> scrolledtext.ScrolledText:
        frame = ttk.Frame(nb)
        nb.add(frame, text=title)
        text = scrolledtext.ScrolledText(frame, wrap="word", font=("Menlo", 11))
        text.pack(fill="both", expand=True)
        return text

    def _pick_file(self) -> None:
        exts = " ".join(f"*{e}" for e in sorted(SUPPORTED_EXTS))
        path = filedialog.askopenfilename(
            title="추출할 문서 선택",
            filetypes=[("지원 문서", exts), ("모든 파일", "*.*")],
        )
        if path:
            self.file_path.set(path)

    def _pick_outdir(self) -> None:
        d = filedialog.askdirectory(title="출력 폴더 선택", initialdir=self.output_dir.get())
        if d:
            self.output_dir.set(d)

    def _open_outdir(self) -> None:
        out = Path(self.output_dir.get())
        out.mkdir(parents=True, exist_ok=True)
        import subprocess
        subprocess.run(["open", str(out)], check=False)

    def _log(self, msg: str) -> None:
        self.log.insert("end", msg + "\n")
        self.log.see("end")

    def _set_text(self, widget: scrolledtext.ScrolledText, content: str) -> None:
        widget.delete("1.0", "end")
        widget.insert("1.0", content)

    def _run(self) -> None:
        api_key = self.api_key.get().strip()
        file_path = self.file_path.get().strip()
        output_dir = self.output_dir.get().strip()
        if not api_key:
            messagebox.showerror("오류", "API Key가 필요합니다.")
            return
        if not file_path or not Path(file_path).exists():
            messagebox.showerror("오류", "파일을 선택하세요.")
            return

        self.run_btn.config(state="disabled")
        self.progress.start(10)
        self._log(f"[추출 시작] {Path(file_path).name}")

        def worker() -> None:
            try:
                result = extract_document(
                    Path(file_path), api_key, Path(output_dir)
                )
                self.q.put(("done", result))
            except Exception as e:  # noqa: BLE001
                self.q.put(("error", str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _run_pdf_original(self) -> None:
        file_path = self.file_path.get().strip()
        output_dir = self.output_dir.get().strip()
        if not file_path or not Path(file_path).exists():
            messagebox.showerror("오류", "파일을 선택하세요.")
            return
        self.pdf_a_btn.config(state="disabled")
        self.progress.start(10)
        self._log(f"[A. 원본 PDF 변환 시작] {Path(file_path).name}")

        def worker() -> None:
            try:
                pdf = convert_original_to_pdf(Path(file_path), Path(output_dir))
                self.q.put(("pdf_a_done", pdf))
            except Exception as e:  # noqa: BLE001
                self.q.put(("pdf_a_error", str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _run_pdf_report(self) -> None:
        if not self.last_result:
            messagebox.showerror("오류", "먼저 추출을 실행하세요.")
            return
        result = self.last_result
        out_pdf = result.json_path.parent.parent / f"{result.json_path.stem.replace('.hwp', '').replace('.hwpx', '')}.report.pdf"
        self.pdf_b_btn.config(state="disabled")
        self.progress.start(10)
        self._log(f"[B. 보고서 PDF 생성 시작]")

        image_dir = result.json_path.parent

        def worker() -> None:
            try:
                pdf = render_report_pdf(result.data, out_pdf, image_dir=image_dir)
                self.q.put(("pdf_b_done", pdf))
            except Exception as e:  # noqa: BLE001
                self.q.put(("pdf_b_error", str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _poll(self) -> None:
        try:
            while True:
                kind, payload = self.q.get_nowait()
                if kind == "done":
                    assert isinstance(payload, ExtractResult)
                    self._on_done(payload)
                elif kind == "error":
                    self._on_error(str(payload))
                elif kind == "pdf_a_done":
                    self._on_pdf_done("A. 원본 PDF", Path(str(payload)), self.pdf_a_btn)
                elif kind == "pdf_b_done":
                    self._on_pdf_done("B. 보고서 PDF", Path(str(payload)), self.pdf_b_btn)
                elif kind == "pdf_a_error":
                    self._on_pdf_error("A. 원본 PDF", str(payload), self.pdf_a_btn)
                elif kind == "pdf_b_error":
                    self._on_pdf_error("B. 보고서 PDF", str(payload), self.pdf_b_btn)
        except queue.Empty:
            pass
        self.root.after(120, self._poll)

    def _on_done(self, result: ExtractResult) -> None:
        self.progress.stop()
        self.run_btn.config(state="normal")
        self.last_result = result
        self.pdf_b_btn.config(state="normal")
        self._log(f"[성공] ZIP: {result.zip_path}")
        self._log(f"  JSON: {result.json_path}")
        self._log(f"  이미지: {len(result.images)}개")

        self._set_text(self.summary_view, summarize(result.data))
        self._set_text(self.tables_view, collect_tables_markdown(result.data))
        self._set_text(self.text_view, collect_text(result.data))
        self._set_text(self.json_view, json.dumps(result.data, ensure_ascii=False, indent=2))

    def _on_error(self, msg: str) -> None:
        self.progress.stop()
        self.run_btn.config(state="normal")
        self._log(f"[실패] {msg}")
        messagebox.showerror("추출 실패", msg)

    def _on_pdf_done(self, label: str, pdf_path: Path, btn: ttk.Button) -> None:
        self.progress.stop()
        btn.config(state="normal")
        self._log(f"[{label} 완료] {pdf_path}")
        import subprocess
        subprocess.run(["open", str(pdf_path)], check=False)

    def _on_pdf_error(self, label: str, msg: str, btn: ttk.Button) -> None:
        self.progress.stop()
        btn.config(state="normal")
        self._log(f"[{label} 실패] {msg}")
        messagebox.showerror(f"{label} 실패", msg)


def main() -> None:
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
