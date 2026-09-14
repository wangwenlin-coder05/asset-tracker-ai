"""Diagnose WeChat window structure - deep probe into conversation/message items"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'python_libs'))
import uiautomation as auto

root = auto.GetRootControl()
win = None
for w in root.GetChildren():
    try:
        name = (w.Name or '').strip()
        cn = (w.ClassName or '')
        if name in ('微信', 'Weixin') or 'mmui' in cn.lower():
            rect = w.BoundingRectangle
            if rect.width() >= 650 and rect.height() >= 450:
                win = w
                break
    except Exception:
        pass

if not win:
    print('NO_WECHAT_WINDOW')
    sys.exit(1)

def safe_children(ctrl):
    """Get children safely, return empty list on failure"""
    try:
        return ctrl.GetChildren()
    except Exception:
        return []

def find_descendant(ctrl, class_name_substr, max_depth=12):
    """Recursively find a descendant by partial class name match"""
    if max_depth <= 0:
        return None
    try:
        cn = ctrl.ClassName or ''
        if class_name_substr in cn:
            return ctrl
    except Exception:
        pass
    for child in safe_children(ctrl):
        result = find_descendant(child, class_name_substr, max_depth - 1)
        if result:
            return result
    return None

def find_all_descendants(ctrl, class_name_substr, max_depth=12):
    """Recursively find all descendants by partial class name match"""
    results = []
    if max_depth <= 0:
        return results
    try:
        cn = ctrl.ClassName or ''
        if class_name_substr in cn:
            results.append(ctrl)
    except Exception:
        pass
    for child in safe_children(ctrl):
        results.extend(find_all_descendants(child, class_name_substr, max_depth - 1))
    return results

def dump_with_children(ctrl, label, max_depth=5):
    """Dump a control and its children"""
    print(f'\n=== {label} ===')
    try:
        r = ctrl.BoundingRectangle
        print(f'Size: {r.width()}x{r.height()} at ({r.left},{r.top})')
    except Exception:
        pass
    def _dump(c, depth=0):
        if depth > max_depth:
            return
        try:
            r = c.BoundingRectangle
            indent = '  ' * depth
            print(f'{indent}[{c.ControlTypeName}] Name={c.Name!r} Class={c.ClassName!r} {r.width()}x{r.height()} at ({r.left},{r.top})')
        except Exception:
            pass
        for child in safe_children(c):
            _dump(child, depth + 1)
    _dump(ctrl)

# Find the main splitter
splitter = find_descendant(win, 'XSplitterView')
if not splitter:
    print('XSplitterView not found')
    sys.exit(1)

# Find ChatMasterView and ChatDetailView
chat_master = find_descendant(splitter, 'ChatMasterView')
chat_detail = find_descendant(splitter, 'ChatDetailView')

if chat_master:
    dump_with_children(chat_master, 'ChatMasterView (Conversation List)', max_depth=6)
    # Count conversation items
    items = safe_children(chat_master)
    print(f'\nChatMasterView direct children: {len(items)}')
    for i, item in enumerate(items[:3]):
        try:
            r = item.BoundingRectangle
            texts = []
            for c in safe_children(item):
                try:
                    n = c.Name
                    if n and n.strip():
                        texts.append(n.strip())
                except Exception:
                    pass
            print(f'  [{i}] {r.width()}x{r.height()} Name={item.Name!r} Class={item.ClassName!r} Texts={texts}')
        except Exception as e:
            print(f'  [{i}] Error: {e}')

if chat_detail:
    dump_with_children(chat_detail, 'ChatDetailView (Message Area)', max_depth=6)
    # Count message items
    items = safe_children(chat_detail)
    print(f'\nChatDetailView direct children: {len(items)}')
    for i, item in enumerate(items[:3]):
        try:
            r = item.BoundingRectangle
            texts = []
            for c in safe_children(item):
                try:
                    n = c.Name
                    if n and n.strip():
                        texts.append(n.strip())
                except Exception:
                    pass
            print(f'  [{i}] {r.width()}x{r.height()} Name={item.Name!r} Class={item.ClassName!r} Texts={texts}')
        except Exception as e:
            print(f'  [{i}] Error: {e}')

# Also try to find the inner XSplitterView inside ChatDetailView (message list area)
if chat_detail:
    inner_splitter = find_descendant(chat_detail, 'XSplitterView')
    if inner_splitter:
        dump_with_children(inner_splitter, 'Inner XSplitterView (Message List)', max_depth=6)

# Find XVBoxView inside ChatMasterView (conversation items container)
if chat_master:
    vbox = find_descendant(chat_master, 'XVBoxView')
    if vbox:
        dump_with_children(vbox, 'XVBoxView (Conversation Items)', max_depth=6)
        items = safe_children(vbox)
        print(f'\nXVBoxView direct children: {len(items)}')
        for i, item in enumerate(items[:5]):
            try:
                r = item.BoundingRectangle
                texts = []
                for c in safe_children(item):
                    try:
                        n = c.Name
                        if n and n.strip():
                            texts.append(n.strip())
                    except Exception:
                        pass
                    try:
                        for cc in safe_children(c):
                            try:
                                n = cc.Name
                                if n and n.strip():
                                    texts.append(n.strip())
                            except Exception:
                                pass
                    except Exception:
                        pass
                print(f'  [{i}] {r.width()}x{r.height()} Name={item.Name!r} Class={item.ClassName!r} Texts={texts[:10]}')
            except Exception as e:
                print(f'  [{i}] Error: {e}')

print('\nDONE')