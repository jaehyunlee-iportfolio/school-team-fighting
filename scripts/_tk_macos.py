"""macOS tkinter용 Cmd 단축키 바인딩.

tkinter는 기본적으로 Ctrl 키 기반 단축키(Linux/Windows 관례)만 매핑되어 있어
macOS 사용자가 익숙한 Cmd+A/C/V/X/Z가 동작하지 않는다. 이 모듈은 Entry/Text
위젯에 Cmd 단축키를 클래스 레벨로 등록한다.

사용법:
    import tkinter as tk
    from _tk_macos import enable_macos_shortcuts

    root = tk.Tk()
    enable_macos_shortcuts(root)
"""
from __future__ import annotations

import tkinter as tk


def _is_macos(root: tk.Misc) -> bool:
    try:
        return root.tk.call("tk", "windowingsystem") == "aqua"
    except Exception:  # noqa: BLE001
        return False


def enable_macos_shortcuts(root: tk.Misc) -> None:
    """Entry/Text 위젯에 Cmd+A/C/V/X/Z 바인딩 추가. macOS 외엔 no-op."""
    if not _is_macos(root):
        return

    # Entry: select_all / copy / paste / cut
    def entry_select_all(e: tk.Event) -> str:
        widget = e.widget
        widget.selection_range(0, "end")
        widget.icursor("end")
        return "break"

    root.bind_class("Entry", "<Command-a>", entry_select_all)
    root.bind_class("Entry", "<Command-A>", entry_select_all)
    root.bind_class("Entry", "<Command-c>", lambda e: e.widget.event_generate("<<Copy>>") or "break")
    root.bind_class("Entry", "<Command-v>", lambda e: e.widget.event_generate("<<Paste>>") or "break")
    root.bind_class("Entry", "<Command-x>", lambda e: e.widget.event_generate("<<Cut>>") or "break")

    # Text/ScrolledText: select_all / copy / paste / cut / undo / redo
    def text_select_all(e: tk.Event) -> str:
        widget = e.widget
        widget.tag_add("sel", "1.0", "end-1c")
        widget.mark_set("insert", "1.0")
        widget.see("insert")
        return "break"

    root.bind_class("Text", "<Command-a>", text_select_all)
    root.bind_class("Text", "<Command-A>", text_select_all)
    root.bind_class("Text", "<Command-c>", lambda e: e.widget.event_generate("<<Copy>>") or "break")
    root.bind_class("Text", "<Command-v>", lambda e: e.widget.event_generate("<<Paste>>") or "break")
    root.bind_class("Text", "<Command-x>", lambda e: e.widget.event_generate("<<Cut>>") or "break")
    root.bind_class("Text", "<Command-z>", lambda e: e.widget.event_generate("<<Undo>>") or "break")
    root.bind_class("Text", "<Command-Shift-z>", lambda e: e.widget.event_generate("<<Redo>>") or "break")
    root.bind_class("Text", "<Command-Shift-Z>", lambda e: e.widget.event_generate("<<Redo>>") or "break")
