#!/usr/bin/env python3
"""Polaris AI DataInsight Doc Extract — PySide6 GUI 테스터.

실행: python3 scripts/polaris-datainsight/gui_qt.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from PySide6.QtCore import QObject, QThread, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QFont
from PySide6.QtWidgets import (
    QApplication,
    QFileDialog,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QProgressBar,
    QPushButton,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from extract import (
    SUPPORTED_EXTS,
    ExtractResult,
    collect_tables_markdown,
    collect_text,
    extract_document,
    load_api_key,
    summarize,
)
from pdf_render import render_report_pdf

HERE = Path(__file__).parent
DEFAULT_OUTPUT = HERE / "output"
ENV_FILE = HERE / ".env"


# ─── 워커 ────────────────────────────────────────────────────────────
class ExtractWorker(QObject):
    finished = Signal(object)  # ExtractResult
    error = Signal(str)

    def __init__(self, file_path: Path, api_key: str, output_dir: Path):
        super().__init__()
        self.file_path = file_path
        self.api_key = api_key
        self.output_dir = output_dir

    def run(self) -> None:
        try:
            result = extract_document(self.file_path, self.api_key, self.output_dir)
            self.finished.emit(result)
        except Exception as e:  # noqa: BLE001
            self.error.emit(str(e))


class RenderPdfWorker(QObject):
    finished = Signal(object)  # Path
    error = Signal(str)

    def __init__(self, data: dict, out_pdf: Path, image_dir: Path):
        super().__init__()
        self.data = data
        self.out_pdf = out_pdf
        self.image_dir = image_dir

    def run(self) -> None:
        try:
            pdf = render_report_pdf(self.data, self.out_pdf, image_dir=self.image_dir)
            self.finished.emit(pdf)
        except Exception as e:  # noqa: BLE001
            self.error.emit(str(e))


# ─── 메인 윈도우 ─────────────────────────────────────────────────────
class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Polaris DataInsight Doc Extract — Tester")
        self.resize(960, 720)

        self.last_result: ExtractResult | None = None
        self._extract_thread: QThread | None = None
        self._extract_worker: ExtractWorker | None = None
        self._pdf_thread: QThread | None = None
        self._pdf_worker: RenderPdfWorker | None = None

        self._build_ui()

    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(10, 10, 10, 10)
        root.setSpacing(8)

        # 입력 영역 (Grid)
        top = QGridLayout()
        top.setHorizontalSpacing(6)
        top.setVerticalSpacing(6)
        top.setColumnStretch(1, 1)

        # API Key
        top.addWidget(QLabel("API Key:"), 0, 0)
        self.api_key_input = QLineEdit(load_api_key(ENV_FILE) or "")
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        top.addWidget(self.api_key_input, 0, 1)
        status = "✓ .env에서 로드됨" if self.api_key_input.text() else "⚠ .env에 키 없음"
        top.addWidget(QLabel(status), 0, 2)

        # 입력 파일
        top.addWidget(QLabel("입력 파일:"), 1, 0)
        self.file_path_input = QLineEdit()
        top.addWidget(self.file_path_input, 1, 1)
        pick_file_btn = QPushButton("선택...")
        pick_file_btn.clicked.connect(self._pick_file)
        top.addWidget(pick_file_btn, 1, 2)

        # 출력 폴더
        top.addWidget(QLabel("출력 폴더:"), 2, 0)
        self.output_dir_input = QLineEdit(str(DEFAULT_OUTPUT))
        top.addWidget(self.output_dir_input, 2, 1)
        pick_outdir_btn = QPushButton("선택...")
        pick_outdir_btn.clicked.connect(self._pick_outdir)
        top.addWidget(pick_outdir_btn, 2, 2)

        root.addLayout(top)

        # 액션 버튼 + 진행률
        actions = QHBoxLayout()
        self.run_btn = QPushButton("추출 시작")
        self.run_btn.clicked.connect(self._run)
        actions.addWidget(self.run_btn)

        self.pdf_btn = QPushButton("보고서 PDF 생성")
        self.pdf_btn.setEnabled(False)
        self.pdf_btn.clicked.connect(self._run_pdf_report)
        actions.addWidget(self.pdf_btn)

        open_outdir_btn = QPushButton("결과 폴더 열기")
        open_outdir_btn.clicked.connect(self._open_outdir)
        actions.addWidget(open_outdir_btn)

        self.progress = QProgressBar()
        self.progress.setRange(0, 1)  # idle
        self.progress.setValue(0)
        actions.addWidget(self.progress, 1)
        root.addLayout(actions)

        # 로그
        root.addWidget(QLabel("로그"))
        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumBlockCount(5000)
        self.log.setFixedHeight(150)
        root.addWidget(self.log)

        # 결과 탭
        self.tabs = QTabWidget()
        mono = QFont("Menlo", 11)

        self.summary_view = QPlainTextEdit(); self.summary_view.setReadOnly(True); self.summary_view.setFont(mono)
        self.tables_view = QPlainTextEdit(); self.tables_view.setReadOnly(True); self.tables_view.setFont(mono)
        self.text_view = QPlainTextEdit(); self.text_view.setReadOnly(True); self.text_view.setFont(mono)
        self.json_view = QPlainTextEdit(); self.json_view.setReadOnly(True); self.json_view.setFont(mono)

        self.tabs.addTab(self.summary_view, "요약")
        self.tabs.addTab(self.tables_view, "표 (Markdown)")
        self.tabs.addTab(self.text_view, "본문 텍스트")
        self.tabs.addTab(self.json_view, "원본 JSON")
        root.addWidget(self.tabs, 1)

    # ─── 핸들러 ───────────────────────────────────────────────────────
    def _pick_file(self) -> None:
        exts = " ".join(f"*{e}" for e in sorted(SUPPORTED_EXTS))
        path, _ = QFileDialog.getOpenFileName(
            self,
            "추출할 문서 선택",
            "",
            f"지원 문서 ({exts});;모든 파일 (*.*)",
        )
        if path:
            self.file_path_input.setText(path)

    def _pick_outdir(self) -> None:
        d = QFileDialog.getExistingDirectory(
            self,
            "출력 폴더 선택",
            self.output_dir_input.text(),
        )
        if d:
            self.output_dir_input.setText(d)

    def _open_outdir(self) -> None:
        out = Path(self.output_dir_input.text())
        out.mkdir(parents=True, exist_ok=True)
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(out)))

    def _log(self, msg: str) -> None:
        self.log.appendPlainText(msg)

    def _set_progress_busy(self, busy: bool) -> None:
        if busy:
            self.progress.setRange(0, 0)  # indeterminate
        else:
            self.progress.setRange(0, 1)
            self.progress.setValue(0)

    # ─── 추출 ───────────────────────────────────────────────────────
    def _run(self) -> None:
        api_key = self.api_key_input.text().strip()
        file_path = self.file_path_input.text().strip()
        output_dir = self.output_dir_input.text().strip()
        if not api_key:
            QMessageBox.critical(self, "오류", "API Key가 필요합니다.")
            return
        if not file_path or not Path(file_path).exists():
            QMessageBox.critical(self, "오류", "파일을 선택하세요.")
            return

        self.run_btn.setEnabled(False)
        self._set_progress_busy(True)
        self._log(f"[추출 시작] {Path(file_path).name}")

        self._extract_thread = QThread(self)
        self._extract_worker = ExtractWorker(Path(file_path), api_key, Path(output_dir))
        self._extract_worker.moveToThread(self._extract_thread)
        self._extract_thread.started.connect(self._extract_worker.run)
        self._extract_worker.finished.connect(self._on_extract_done)
        self._extract_worker.error.connect(self._on_extract_error)
        self._extract_worker.finished.connect(self._extract_thread.quit)
        self._extract_worker.error.connect(self._extract_thread.quit)
        self._extract_thread.finished.connect(self._extract_worker.deleteLater)
        self._extract_thread.finished.connect(self._extract_thread.deleteLater)
        self._extract_thread.start()

    def _on_extract_done(self, result: object) -> None:
        assert isinstance(result, ExtractResult)
        self._set_progress_busy(False)
        self.run_btn.setEnabled(True)
        self.last_result = result
        self.pdf_btn.setEnabled(True)
        self._log(f"[성공] ZIP: {result.zip_path}")
        self._log(f"  JSON: {result.json_path}")
        self._log(f"  이미지: {len(result.images)}개")

        self.summary_view.setPlainText(summarize(result.data))
        self.tables_view.setPlainText(collect_tables_markdown(result.data))
        self.text_view.setPlainText(collect_text(result.data))
        self.json_view.setPlainText(json.dumps(result.data, ensure_ascii=False, indent=2))

    def _on_extract_error(self, msg: str) -> None:
        self._set_progress_busy(False)
        self.run_btn.setEnabled(True)
        self._log(f"[실패] {msg}")
        QMessageBox.critical(self, "추출 실패", msg)

    # ─── 보고서 PDF ─────────────────────────────────────────────────
    def _run_pdf_report(self) -> None:
        if not self.last_result:
            QMessageBox.critical(self, "오류", "먼저 추출을 실행하세요.")
            return
        result = self.last_result
        stem = result.json_path.stem.replace(".hwp", "").replace(".hwpx", "")
        out_pdf = result.json_path.parent.parent / f"{stem}.report.pdf"

        self.pdf_btn.setEnabled(False)
        self._set_progress_busy(True)
        self._log("[보고서 PDF 생성 시작]")

        self._pdf_thread = QThread(self)
        self._pdf_worker = RenderPdfWorker(result.data, out_pdf, image_dir=result.json_path.parent)
        self._pdf_worker.moveToThread(self._pdf_thread)
        self._pdf_thread.started.connect(self._pdf_worker.run)
        self._pdf_worker.finished.connect(self._on_pdf_done)
        self._pdf_worker.error.connect(self._on_pdf_error)
        self._pdf_worker.finished.connect(self._pdf_thread.quit)
        self._pdf_worker.error.connect(self._pdf_thread.quit)
        self._pdf_thread.finished.connect(self._pdf_worker.deleteLater)
        self._pdf_thread.finished.connect(self._pdf_thread.deleteLater)
        self._pdf_thread.start()

    def _on_pdf_done(self, pdf_path: object) -> None:
        path = Path(str(pdf_path))
        self._set_progress_busy(False)
        self.pdf_btn.setEnabled(True)
        self._log(f"[보고서 PDF 완료] {path}")
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))

    def _on_pdf_error(self, msg: str) -> None:
        self._set_progress_busy(False)
        self.pdf_btn.setEnabled(True)
        self._log(f"[보고서 PDF 실패] {msg}")
        QMessageBox.critical(self, "보고서 PDF 실패", msg)


def main() -> int:
    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
