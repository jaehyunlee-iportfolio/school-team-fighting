#!/usr/bin/env python3
"""출장신청서 PDF 정리 GUI (PySide6).

- 정리: PDF 폴더 + Drive 폴더 선택 → 증빙번호별 하위 폴더로 이동/복사
- 롤백: 이전 작업의 JSON 보고서를 골라 원복

실행: python3 scripts/upload_to_drive_gui_qt.py
"""
from __future__ import annotations

import html
import os
import sys
import unicodedata
from pathlib import Path


def nfc(s: str) -> str:
    """macOS는 파일 시스템 한글을 NFD로 저장 → 클립보드 자모 분리 방지를 위해 NFC 정규화."""
    return unicodedata.normalize("NFC", s) if s else s

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PySide6.QtCore import QObject, QThread, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QFont
from PySide6.QtWidgets import (
    QApplication,
    QButtonGroup,
    QCheckBox,
    QFileDialog,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QRadioButton,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

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


# ─── 워커 ────────────────────────────────────────────────────────────
class OrganizeWorker(QObject):
    progress = Signal(int, int, object)  # cur, total, TaskResult
    finished = Signal(list, object, object)  # results, csv_path, json_path
    error = Signal(str)

    def __init__(self, src: Path, drive: Path, mode: str, dry_run: bool, overwrite: bool):
        super().__init__()
        self.src = src
        self.drive = drive
        self.mode = mode
        self.dry_run = dry_run
        self.overwrite = overwrite

    def run(self) -> None:
        try:
            def cb(cur: int, total: int, res: TaskResult) -> None:
                self.progress.emit(cur, total, res)

            results = process_all(
                self.src, self.drive,
                mode=self.mode, overwrite=self.overwrite, dry_run=self.dry_run,
                on_progress=cb,
            )
            csv_path, json_path = make_report_paths(self.src)
            write_csv_report(results, csv_path)
            write_json_report(
                results, src=self.src, drive=self.drive,
                mode=self.mode, dry_run=self.dry_run, path=json_path,
            )
            self.finished.emit(results, csv_path, json_path)
        except Exception as e:  # noqa: BLE001
            self.error.emit(repr(e))


class RollbackWorker(QObject):
    progress = Signal(int, int, object)  # cur, total, RollbackResult
    finished = Signal(list, object)  # results, meta
    error = Signal(str)

    def __init__(self, json_p: Path):
        super().__init__()
        self.json_p = json_p

    def run(self) -> None:
        try:
            def cb(cur: int, total: int, res: RollbackResult) -> None:
                self.progress.emit(cur, total, res)

            results, meta = rollback_from_json(self.json_p, on_progress=cb)
            self.finished.emit(results, meta)
        except Exception as e:  # noqa: BLE001
            self.error.emit(repr(e))


# ─── 색상 로그 헬퍼 ──────────────────────────────────────────────────
LOG_COLORS = {
    "ok": "#0a7a2f",
    "warn": "#a06400",
    "err": "#b00020",
    "dim": "#888888",
    "": "#000000",
}


def append_log(widget: QTextEdit, msg: str, level: str = "") -> None:
    msg = nfc(msg)
    color = LOG_COLORS.get(level, "#000000")
    safe = html.escape(msg).replace(" ", "&nbsp;") if msg.strip() == "" else html.escape(msg)
    widget.append(f'<span style="color:{color};">{safe}</span>')


# ─── 메인 윈도우 ─────────────────────────────────────────────────────
class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("출장신청서 PDF 정리")
        self.resize(780, 720)

        self.last_csv_path: Path | None = None
        self.last_json_path: Path | None = None

        self._org_thread: QThread | None = None
        self._org_worker: OrganizeWorker | None = None
        self._rb_thread: QThread | None = None
        self._rb_worker: RollbackWorker | None = None

        self._build_ui()

    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(12, 12, 12, 12)

        self.tabs = QTabWidget()
        self.tabs.addTab(self._build_organize_tab(), "📁 정리")
        self.tabs.addTab(self._build_rollback_tab(), "↩️  롤백")
        root.addWidget(self.tabs)

    # ─── 정리 탭 ─────────────────────────────────────────────────────
    def _build_organize_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(8, 8, 8, 8)

        # 설정 그룹박스
        gb = QGroupBox("설정")
        grid = QGridLayout(gb)
        grid.setColumnStretch(1, 1)

        # PDF 폴더
        grid.addWidget(QLabel("PDF 폴더:"), 0, 0)
        self.src_input = QLineEdit()
        grid.addWidget(self.src_input, 0, 1)
        pick_src_btn = QPushButton("폴더 선택")
        pick_src_btn.clicked.connect(self._pick_src)
        grid.addWidget(pick_src_btn, 0, 2)

        # Drive 폴더
        grid.addWidget(QLabel("Drive 폴더:"), 1, 0)
        self.drive_input = QLineEdit()
        grid.addWidget(self.drive_input, 1, 1)
        pick_drive_btn = QPushButton("폴더 선택")
        pick_drive_btn.clicked.connect(self._pick_drive)
        grid.addWidget(pick_drive_btn, 1, 2)

        # 안내문
        hint = QLabel(
            "부모(D-4.출장비) 또는 조부모((주)아이포트폴리오) 모두 OK — 2단계까지 자동 탐색"
        )
        hint.setStyleSheet("color: #666;")
        grid.addWidget(hint, 2, 1, 1, 2)

        # 모드 + 옵션
        opt_widget = QWidget()
        opt_layout = QHBoxLayout(opt_widget)
        opt_layout.setContentsMargins(0, 8, 0, 0)
        opt_layout.addWidget(QLabel("모드:"))
        self.mode_move = QRadioButton("이동 (move)")
        self.mode_move.setChecked(True)
        self.mode_copy = QRadioButton("복사 (copy)")
        self.mode_group = QButtonGroup(self)
        self.mode_group.addButton(self.mode_move)
        self.mode_group.addButton(self.mode_copy)
        opt_layout.addWidget(self.mode_move)
        opt_layout.addSpacing(8)
        opt_layout.addWidget(self.mode_copy)
        opt_layout.addSpacing(20)
        self.dry_run_chk = QCheckBox("미리보기 (dry-run, 실제 이동 안 함)")
        opt_layout.addWidget(self.dry_run_chk)
        opt_layout.addSpacing(12)
        self.overwrite_chk = QCheckBox("덮어쓰기 허용")
        opt_layout.addWidget(self.overwrite_chk)
        opt_layout.addStretch(1)
        grid.addWidget(opt_widget, 3, 0, 1, 3)

        layout.addWidget(gb)

        # 실행 버튼 + 진행률
        btn_row = QHBoxLayout()
        self.run_btn = QPushButton("▶ 실행")
        self.run_btn.clicked.connect(self._on_run)
        btn_row.addWidget(self.run_btn)
        self.progress = QProgressBar()
        self.progress.setRange(0, 1)
        self.progress.setValue(0)
        btn_row.addWidget(self.progress, 1)
        self.progress_label = QLabel("대기 중")
        btn_row.addWidget(self.progress_label)
        layout.addLayout(btn_row)

        # 결과 요약
        self.summary_label = QLabel("")
        f = QFont()
        f.setBold(True)
        f.setPointSize(11)
        self.summary_label.setFont(f)
        layout.addWidget(self.summary_label)

        # 보고서 버튼
        report_row = QHBoxLayout()
        self.open_csv_btn = QPushButton("📄 CSV 보고서 열기")
        self.open_csv_btn.setEnabled(False)
        self.open_csv_btn.clicked.connect(self._open_csv)
        report_row.addWidget(self.open_csv_btn)
        self.open_folder_btn = QPushButton("📁 폴더 열기")
        self.open_folder_btn.setEnabled(False)
        self.open_folder_btn.clicked.connect(self._open_folder)
        report_row.addWidget(self.open_folder_btn)
        report_row.addStretch(1)
        layout.addLayout(report_row)

        # 로그
        log_gb = QGroupBox("로그")
        log_layout = QVBoxLayout(log_gb)
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setFont(QFont("Menlo", 11))
        log_layout.addWidget(self.log)
        layout.addWidget(log_gb, 1)

        return tab

    # ─── 롤백 탭 ─────────────────────────────────────────────────────
    def _build_rollback_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(8, 8, 8, 8)

        gb = QGroupBox("롤백할 작업 선택")
        grid = QGridLayout(gb)
        grid.setColumnStretch(1, 1)

        grid.addWidget(QLabel("JSON 보고서:"), 0, 0)
        self.rb_json_input = QLineEdit()
        grid.addWidget(self.rb_json_input, 0, 1)
        pick_json_btn = QPushButton("파일 선택")
        pick_json_btn.clicked.connect(self._pick_json)
        grid.addWidget(pick_json_btn, 0, 2)

        hint = QLabel(
            "이전 정리 작업의 upload_report_*.json 파일을 선택하세요.\n"
            "move 모드: Drive 폴더 → 원본 PDF 폴더로 prefix 다시 부착해 복원\n"
            "copy 모드: Drive 폴더의 복사본만 삭제 (원본은 그대로)"
        )
        hint.setStyleSheet("color: #666;")
        grid.addWidget(hint, 1, 0, 1, 3)

        layout.addWidget(gb)

        # 실행
        btn_row = QHBoxLayout()
        self.rb_run_btn = QPushButton("↩️  원복 실행")
        self.rb_run_btn.clicked.connect(self._on_rollback)
        btn_row.addWidget(self.rb_run_btn)
        self.rb_progress = QProgressBar()
        self.rb_progress.setRange(0, 1)
        self.rb_progress.setValue(0)
        btn_row.addWidget(self.rb_progress, 1)
        self.rb_progress_label = QLabel("대기 중")
        btn_row.addWidget(self.rb_progress_label)
        layout.addLayout(btn_row)

        # 로그
        log_gb = QGroupBox("로그")
        log_layout = QVBoxLayout(log_gb)
        self.rb_log = QTextEdit()
        self.rb_log.setReadOnly(True)
        self.rb_log.setFont(QFont("Menlo", 11))
        log_layout.addWidget(self.rb_log)
        layout.addWidget(log_gb, 1)

        return tab

    # ─── 핸들러 ───────────────────────────────────────────────────────
    def _pick_src(self) -> None:
        p = QFileDialog.getExistingDirectory(self, "PDF가 들어 있는 폴더 선택")
        if p:
            self.src_input.setText(nfc(p))

    def _pick_drive(self) -> None:
        p = QFileDialog.getExistingDirectory(self, "Drive 폴더 선택 (부모 또는 조부모)")
        if p:
            self.drive_input.setText(nfc(p))

    def _pick_json(self) -> None:
        p, _ = QFileDialog.getOpenFileName(
            self,
            "upload_report_*.json 파일 선택",
            "",
            "JSON 보고서 (*.json);;모든 파일 (*.*)",
        )
        if p:
            self.rb_json_input.setText(nfc(p))

    def _open_csv(self) -> None:
        if self.last_csv_path:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.last_csv_path)))

    def _open_folder(self) -> None:
        if self.last_csv_path:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.last_csv_path.parent)))

    # ─── 정리 실행 ─────────────────────────────────────────────────
    def _on_run(self) -> None:
        src = self.src_input.text().strip()
        drive = self.drive_input.text().strip()
        if not src or not drive:
            QMessageBox.critical(self, "입력 누락", "PDF 폴더와 Drive 폴더를 모두 지정해주세요.")
            return
        src_p = Path(src).expanduser()
        drive_p = Path(drive).expanduser()
        if not src_p.is_dir():
            QMessageBox.critical(self, "폴더 없음", f"PDF 폴더를 찾을 수 없어요:\n{src_p}")
            return
        if not drive_p.is_dir():
            QMessageBox.critical(self, "폴더 없음", f"Drive 폴더를 찾을 수 없어요:\n{drive_p}")
            return

        mode = "move" if self.mode_move.isChecked() else "copy"
        dry_run = self.dry_run_chk.isChecked()
        overwrite = self.overwrite_chk.isChecked()

        self.run_btn.setEnabled(False)
        self.open_csv_btn.setEnabled(False)
        self.open_folder_btn.setEnabled(False)
        self.log.clear()
        self.summary_label.setText("처리 중...")
        self.progress.setRange(0, 1)
        self.progress.setValue(0)

        append_log(self.log, "── 정리 시작 ──", "dim")
        append_log(self.log, f"  src:    {src_p}", "dim")
        append_log(self.log, f"  drive:  {drive_p}", "dim")
        append_log(self.log, f"  mode:   {mode}{'  (dry-run)' if dry_run else ''}", "dim")
        append_log(self.log, "")

        self._org_thread = QThread(self)
        self._org_worker = OrganizeWorker(src_p, drive_p, mode, dry_run, overwrite)
        self._org_worker.moveToThread(self._org_thread)
        self._org_thread.started.connect(self._org_worker.run)
        self._org_worker.progress.connect(self._on_org_progress)
        self._org_worker.finished.connect(self._on_org_done)
        self._org_worker.error.connect(self._on_org_error)
        self._org_worker.finished.connect(self._org_thread.quit)
        self._org_worker.error.connect(self._org_thread.quit)
        self._org_thread.finished.connect(self._org_worker.deleteLater)
        self._org_thread.finished.connect(self._org_thread.deleteLater)
        self._org_thread.start()

    def _on_org_progress(self, cur: int, total: int, res: object) -> None:
        assert isinstance(res, TaskResult)
        if self.progress.maximum() != total:
            self.progress.setRange(0, total)
        self.progress.setValue(cur)
        self.progress_label.setText(f"{cur} / {total}")
        tag = {"OK": "ok", "MISSING_PREFIX": "warn", "FOLDER_NOT_FOUND": "warn", "ERROR": "err"}.get(res.status, "")
        icon = {"OK": "✅", "MISSING_PREFIX": "⚠️", "FOLDER_NOT_FOUND": "⚠️", "ERROR": "❌"}.get(res.status, "·")
        line = f"{icon} {res.src_filename}"
        if res.status != "OK":
            line += f"  → {res.reason}"
        append_log(self.log, line, tag)

    def _on_org_done(self, results: list, csv_path: object, json_path: object) -> None:
        # Path 객체는 NFC 정규화 불필요 (파일 시스템 호환성 유지)
        self.last_csv_path = Path(str(csv_path))
        self.last_json_path = Path(str(json_path))

        s = summarize(results)
        summary_text = f"✅ 성공 {s['ok']}"
        if s["missing_prefix"]:
            summary_text += f"   ⚠️ 증빙번호 누락 {s['missing_prefix']}"
        if s["folder_not_found"]:
            summary_text += f"   ⚠️ 폴더 없음 {s['folder_not_found']}"
        if s["error"]:
            summary_text += f"   ❌ 오류 {s['error']}"
        summary_text += f"   (총 {s['total']}건)"
        self.summary_label.setText(summary_text)

        append_log(self.log, "")
        append_log(self.log, f"📄 CSV 보고서: {csv_path}")
        append_log(self.log, f"📄 JSON (롤백용): {json_path}")
        self.run_btn.setEnabled(True)
        self.open_csv_btn.setEnabled(True)
        self.open_folder_btn.setEnabled(True)

    def _on_org_error(self, msg: str) -> None:
        append_log(self.log, f"❌ 오류: {msg}", "err")
        self.run_btn.setEnabled(True)
        self.summary_label.setText("처리 실패")
        QMessageBox.critical(self, "오류", msg)

    # ─── 롤백 실행 ─────────────────────────────────────────────────
    def _on_rollback(self) -> None:
        json_str = self.rb_json_input.text().strip()
        if not json_str:
            QMessageBox.critical(self, "입력 누락", "JSON 보고서를 선택해주세요.")
            return
        json_p = Path(json_str).expanduser()
        if not json_p.is_file():
            QMessageBox.critical(self, "파일 없음", f"JSON 파일을 찾을 수 없어요:\n{json_p}")
            return

        ans = QMessageBox.question(
            self, "확인", f"이 작업을 원복할까요?\n\n{json_p.name}",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if ans != QMessageBox.StandardButton.Yes:
            return

        self.rb_run_btn.setEnabled(False)
        self.rb_log.clear()
        self.rb_progress.setRange(0, 1)
        self.rb_progress.setValue(0)
        self.rb_progress_label.setText("처리 중...")

        append_log(self.rb_log, "── 롤백 시작 ──", "dim")
        append_log(self.rb_log, f"  보고서: {json_p}", "dim")
        append_log(self.rb_log, "")

        self._rb_thread = QThread(self)
        self._rb_worker = RollbackWorker(json_p)
        self._rb_worker.moveToThread(self._rb_thread)
        self._rb_thread.started.connect(self._rb_worker.run)
        self._rb_worker.progress.connect(self._on_rb_progress)
        self._rb_worker.finished.connect(self._on_rb_done)
        self._rb_worker.error.connect(self._on_rb_error)
        self._rb_worker.finished.connect(self._rb_thread.quit)
        self._rb_worker.error.connect(self._rb_thread.quit)
        self._rb_thread.finished.connect(self._rb_worker.deleteLater)
        self._rb_thread.finished.connect(self._rb_thread.deleteLater)
        self._rb_thread.start()

    def _on_rb_progress(self, cur: int, total: int, res: object) -> None:
        assert isinstance(res, RollbackResult)
        if self.rb_progress.maximum() != total:
            self.rb_progress.setRange(0, total)
        self.rb_progress.setValue(cur)
        self.rb_progress_label.setText(f"{cur} / {total}")
        tag = {"OK": "ok", "SKIPPED": "dim", "ERROR": "err"}.get(res.status, "")
        icon = {"OK": "↩️", "SKIPPED": "⏭", "ERROR": "❌"}.get(res.status, "·")
        line = f"{icon} {Path(res.target_path).name}"
        if res.status != "OK":
            line += f"  → {res.reason}"
        append_log(self.rb_log, line, tag)

    def _on_rb_done(self, results: list, _meta: object) -> None:
        ok = sum(1 for r in results if r.status == "OK")
        sk = sum(1 for r in results if r.status == "SKIPPED")
        er = sum(1 for r in results if r.status == "ERROR")
        append_log(self.rb_log, "")
        append_log(self.rb_log, f"롤백 완료: 원복 {ok}, 건너뜀 {sk}, 오류 {er}", "ok" if er == 0 else "warn")
        self.rb_progress_label.setText(f"완료 (원복 {ok})")
        self.rb_run_btn.setEnabled(True)

    def _on_rb_error(self, msg: str) -> None:
        append_log(self.rb_log, f"❌ 오류: {msg}", "err")
        self.rb_run_btn.setEnabled(True)
        self.rb_progress_label.setText("실패")
        QMessageBox.critical(self, "오류", msg)


def main() -> int:
    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
