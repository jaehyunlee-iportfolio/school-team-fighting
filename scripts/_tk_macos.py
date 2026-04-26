"""macOS tkinter용 Cmd 단축키 바인딩.

macOS Tk는 시스템 메뉴 바를 자동 생성하면서 Cmd+C/V/X/Z를 가로채기 때문에
그냥 bind_all/bind_class로 등록하면 핸들러까지 이벤트가 도달하지 못한다.
해결법은 명시적으로 Edit 메뉴(name="edit")를 만들어 주는 것이다.
이렇게 하면 macOS Tk가 시스템 메뉴와 병합하면서 단축키가 정상 동작한다.

사용법:
    import tkinter as tk
    from _tk_macos import enable_macos_shortcuts

    root = tk.Tk()
    enable_macos_shortcuts(root)  # tk.Tk() 직후, 위젯 생성 전에 호출 권장
"""
from __future__ import annotations

import tkinter as tk


def _is_macos(root: tk.Misc) -> bool:
    try:
        return root.tk.call("tk", "windowingsystem") == "aqua"
    except Exception:  # noqa: BLE001
        return False


_TEXT_CLASSES = {"Text", "TText"}
_ENTRY_CLASSES = {"Entry", "TEntry", "Spinbox", "TSpinbox", "TCombobox"}


def _focus_widget(root: tk.Misc) -> tk.Misc | None:
    try:
        return root.focus_get()
    except Exception:  # noqa: BLE001
        return None


def _select_all_on(widget: tk.Misc) -> None:
    cls = widget.winfo_class()
    if cls in _TEXT_CLASSES:
        widget.tag_add("sel", "1.0", "end-1c")  # type: ignore[attr-defined]
        widget.mark_set("insert", "1.0")  # type: ignore[attr-defined]
        widget.see("insert")  # type: ignore[attr-defined]
    elif cls in _ENTRY_CLASSES:
        widget.selection_range(0, "end")  # type: ignore[attr-defined]
        widget.icursor("end")  # type: ignore[attr-defined]


def _gen_event(widget: tk.Misc, virtual: str) -> None:
    try:
        widget.event_generate(virtual)
    except tk.TclError:
        pass


def _route(root: tk.Misc, action: str) -> None:
    """현재 포커스 위젯에 동작 라우팅."""
    w = _focus_widget(root)
    if w is None:
        return
    cls = w.winfo_class()
    if cls not in _TEXT_CLASSES and cls not in _ENTRY_CLASSES:
        return
    if action == "select_all":
        _select_all_on(w)
    elif action == "copy":
        _gen_event(w, "<<Copy>>")
    elif action == "paste":
        _gen_event(w, "<<Paste>>")
    elif action == "cut":
        _gen_event(w, "<<Cut>>")
    elif action == "undo" and cls in _TEXT_CLASSES:
        _gen_event(w, "<<Undo>>")
    elif action == "redo" and cls in _TEXT_CLASSES:
        _gen_event(w, "<<Redo>>")


def enable_macos_shortcuts(root: tk.Tk) -> None:
    """macOS에서 Cmd+A/C/V/X/Z를 활성화. 다른 OS에선 no-op.

    핵심 메커니즘: name="edit" 메뉴를 만들면 macOS Tk가 시스템 Edit 메뉴와 병합해
    Cmd 단축키가 자동 등록된다. accelerator 인자는 표시 전용이고 실제 동작은
    command 콜백이 처리. menubar는 root.config(menu=...)로 부착해야 OS 메뉴바에 노출됨.
    """
    if not _is_macos(root):
        return

    menubar = tk.Menu(root)
    # name="edit"가 macOS에서 시스템 Edit 메뉴 인식 키
    edit_menu = tk.Menu(menubar, name="edit", tearoff=0)
    edit_menu.add_command(
        label="실행 취소", accelerator="Command+Z",
        command=lambda: _route(root, "undo"),
    )
    edit_menu.add_command(
        label="다시 실행", accelerator="Command+Shift+Z",
        command=lambda: _route(root, "redo"),
    )
    edit_menu.add_separator()
    edit_menu.add_command(
        label="잘라내기", accelerator="Command+X",
        command=lambda: _route(root, "cut"),
    )
    edit_menu.add_command(
        label="복사", accelerator="Command+C",
        command=lambda: _route(root, "copy"),
    )
    edit_menu.add_command(
        label="붙여넣기", accelerator="Command+V",
        command=lambda: _route(root, "paste"),
    )
    edit_menu.add_separator()
    edit_menu.add_command(
        label="모두 선택", accelerator="Command+A",
        command=lambda: _route(root, "select_all"),
    )
    menubar.add_cascade(label="편집", menu=edit_menu)
    root.config(menu=menubar)

    # bind_all은 메뉴가 가로채지 않은 경우(예: Cmd+A — 시스템 기본 매핑 없음)를 대비한 백업
    pairs = [
        ("a", "select_all"),
        ("c", "copy"),
        ("v", "paste"),
        ("x", "cut"),
        ("z", "undo"),
    ]
    for key, action in pairs:
        for seq in (f"<Command-{key}>", f"<Command-{key.upper()}>"):
            root.bind_all(seq, lambda _e, a=action: (_route(root, a), "break")[1])
    for seq in ("<Command-Shift-z>", "<Command-Shift-Z>"):
        root.bind_all(seq, lambda _e: (_route(root, "redo"), "break")[1])
