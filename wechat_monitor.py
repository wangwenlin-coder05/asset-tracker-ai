"""
WeChat Window Monitor - Python Edition (v2)
Uses uiautomation library with accurate Qt control tree targeting.
Output format: tab-separated with base64 encoding, compatible with WechatWindowMonitor.java
"""
import sys
import os
import time
import base64
import threading
import re
import traceback
import ctypes
import json
import urllib.request

# Add local libs to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'python_libs'))
import uiautomation as auto

# ── Thread-safe event flag ──────────────────────────────────
_event_lock = threading.Lock()
_event_triggered = False

def _on_structure_changed(sender, args):
    """UI Automation event handler - called on background MTA thread"""
    global _event_triggered
    try:
        if args.StructureChangeType in (
            auto.StructureChangeType.ChildAdded,
            auto.StructureChangeType.ChildrenInvalidated
        ):
            with _event_lock:
                _event_triggered = True
    except Exception:
        pass

def _check_event():
    """Thread-safe check and clear of the event flag"""
    global _event_triggered
    with _event_lock:
        triggered = _event_triggered
        _event_triggered = False
        return triggered

# ── Helpers ─────────────────────────────────────────────────
def b64(s):
    """Base64-encode a string for output compatibility"""
    return base64.b64encode((s or '').encode('utf-8', errors='replace')).decode('ascii')

def safe_children(ctrl, retries=2):
    """Get children safely with retries, return empty list on failure"""
    last_err = None
    for _ in range(retries):
        try:
            children = ctrl.GetChildren()
            if children is not None:
                return children
            time.sleep(0.05)
        except Exception as e:
            last_err = e
            time.sleep(0.05)
    if last_err:
        pass  # silently fail
    return []

def find_descendant(ctrl, class_name_substr, max_depth=16):
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

def find_all_descendants(ctrl, predicate, max_depth=16):
    """Collect descendants matching predicate without relying on fixed child indexes."""
    if max_depth <= 0:
        return []
    results = []
    try:
        if predicate(ctrl):
            results.append(ctrl)
    except Exception:
        pass
    for child in safe_children(ctrl):
        results.extend(find_all_descendants(child, predicate, max_depth - 1))
    return results

def collect_texts(ctrl, max_depth=8):
    """Collect all text-like properties from a control and its descendants, preserving order.
    Tries Name, Value, HelpText, AccessKey, AutomationId and ValuePattern to maximize text recovery."""
    texts = []
    if max_depth <= 0:
        return texts
    try:
        # Collect all text-like properties
        for attr_name in ('Name', 'Value', 'HelpText', 'AccessKey', 'AutomationId', 'AcceleratorKey'):
            try:
                val = getattr(ctrl, attr_name, '')
                if val and isinstance(val, str) and val.strip() and len(val.strip()) > 0:
                    texts.append(val.strip())
            except Exception:
                pass
        # Try ValuePattern for controls that support it (e.g., edit controls)
        try:
            val_pattern = ctrl.GetValuePattern()
            if val_pattern:
                val = val_pattern.Value
                if val and isinstance(val, str) and val.strip() and len(val.strip()) > 0:
                    texts.append(val.strip())
        except Exception:
            pass
        # Try GetTextPattern if available
        try:
            text_pattern = ctrl.GetTextPattern()
            if text_pattern:
                val = text_pattern.DocumentRange.Text if hasattr(text_pattern, 'DocumentRange') else ''
                if val and isinstance(val, str) and val.strip() and len(val.strip()) > 0:
                    texts.append(val.strip())
        except Exception:
            pass
    except Exception:
        pass
    for child in safe_children(ctrl):
        texts.extend(collect_texts(child, max_depth - 1))
    return texts

IMAGE_TEXT_MARKERS = frozenset([
    '图片', '[图片]', '【图片】', '照片', '[照片]', '【照片】',
    'image', '[image]', 'photo', '[photo]', 'picture', '[picture]',
])

def is_image_message_item(ctrl, raw_texts, max_depth=8):
    """判断消息项是否为图片消息，并排除头像等装饰图片控件。"""
    for value in raw_texts:
        normalized = str(value or '').strip().lower()
        if normalized in IMAGE_TEXT_MARKERS:
            return True
        if re.search(r'(?:^|[._-])(image|photo|picture)(?:$|[._-])', normalized):
            if not re.search(r'avatar|head|profile|portrait', normalized):
                return True

    all_image_control_count = 0
    content_image_control_count = 0
    explicit_image_hint = False

    def walk(node, depth):
        nonlocal all_image_control_count, content_image_control_count, explicit_image_hint
        if depth <= 0:
            return
        try:
            control_type = str(getattr(node, 'ControlTypeName', '') or '').lower()
            class_name = str(getattr(node, 'ClassName', '') or '').lower()
            automation_id = str(getattr(node, 'AutomationId', '') or '').lower()
            name = str(getattr(node, 'Name', '') or '').lower()
            metadata = ' '.join((class_name, automation_id, name))
            evidence = f'{control_type} {metadata}'
            is_avatar = bool(re.search(r'avatar|head|profile|portrait|touxiang|头像', evidence))
            if 'image' in control_type or '图片' in control_type:
                all_image_control_count += 1
                if not is_avatar:
                    content_image_control_count += 1
            if not is_avatar and re.search(r'image.?message|message.?image|photo.?message|picture.?message|chat.?image|图片消息|照片消息', metadata):
                explicit_image_hint = True
        except Exception:
            pass
        for child in safe_children(node):
            walk(child, depth - 1)

    walk(ctrl, max_depth)
    return explicit_image_hint or (content_image_control_count >= 1 and all_image_control_count >= 2)

# ── Window & Control Discovery ──────────────────────────────
def find_wechat_window(retries=3):
    """Find the main WeChat window with retries"""
    for attempt in range(retries):
        try:
            root = auto.GetRootControl()
            for window in root.GetChildren():
                try:
                    rect = window.BoundingRectangle
                    if rect.width() < 650 or rect.height() < 450:
                        continue
                    name = (window.Name or '').strip()
                    cn = (window.ClassName or '').lower()
                    if name in ('微信', 'Weixin') or 'mmui' in cn:
                        return window
                except Exception:
                    pass
            # If no window found in this attempt, wait a bit
            if attempt < retries - 1:
                time.sleep(0.3)
        except Exception:
            if attempt < retries - 1:
                time.sleep(0.3)
    return None

def find_conv_list(window):
    """Find the visible conversation list without relying on fixed splitter indexes."""
    # ── Strategy 1: Dynamic search inside ChatMasterView ──
    try:
        chat_master = find_descendant(window, 'ChatMasterView', max_depth=14) or window
        candidates = find_all_descendants(
            chat_master,
            lambda ctrl: (
                getattr(ctrl, 'ControlTypeName', '') == 'ListControl'
                and (
                    'XTableView' in str(getattr(ctrl, 'ClassName', '') or '')
                    or str(getattr(ctrl, 'Name', '') or '').strip() == '会话'
                )
            ),
            max_depth=12,
        )
        if candidates:
            def candidate_score(ctrl):
                score = 0
                try:
                    class_name = str(ctrl.ClassName or '')
                    name = str(ctrl.Name or '').strip()
                    rect = ctrl.BoundingRectangle
                    children = safe_children(ctrl)
                    session_cells = sum(
                        1 for child in children
                        if 'ChatSessionCell' in str(getattr(child, 'ClassName', '') or '')
                    )
                    if 'XTableView' in class_name:
                        score += 120
                    if name == '会话':
                        score += 100
                    if rect.width() > 250 and rect.height() > 300:
                        score += 50
                    score += min(session_cells * 8, 80)
                    score += min(rect.width() * rect.height() / 100000, 30)
                except Exception:
                    pass
                return score
            return max(candidates, key=candidate_score)
    except Exception:
        pass

    # ── Strategy 2: Legacy path traversal ──
    try:
        qwidget = safe_children(window)[0]
        qstacked = safe_children(qwidget)[0]
        mainview1 = safe_children(qstacked)[0]
        qwidget2_list = safe_children(mainview1)
        if len(qwidget2_list) < 2:
            raise IndexError("mainview1 children < 2")
        qwidget2 = qwidget2_list[1]
        mainview2 = safe_children(qwidget2)[0]
        splitter = safe_children(mainview2)[0]
        inner = safe_children(splitter)[0]
        xview_list = safe_children(inner)
        if len(xview_list) < 2:
            raise IndexError("inner splitter children < 2")
        xview = xview_list[1]
        chat_master = safe_children(xview)[0]
        vbox = safe_children(chat_master)[0]
        xview_inner_list = safe_children(vbox)
        if len(xview_inner_list) < 2:
            raise IndexError("vbox children < 2")
        xview_inner = xview_inner_list[1]
        xview_inner2 = safe_children(xview_inner)[0]
        session_list = safe_children(xview_inner2)[0]
        table = safe_children(session_list)[0]
        if table.ControlTypeName == 'ListControl' and 'XTableView' in str(table.ClassName or ''):
            return table
    except Exception:
        pass

    # ── Strategy 3: Fallback - recursive search ──
    # Search for a ListControl whose Name contains '会话'
    try:
        table = find_descendant(window, 'XTableView', max_depth=14)
        if table and table.ControlTypeName == 'ListControl':
            return table
    except Exception:
        pass

    return None

def find_msg_list(window):
    """Find the message list (RecyclerListView) via known path with fallback.
    Strategy:
    1. Try exact path traversal first
    2. Fallback: search for RecyclerListView descendant with name '消息'
    """
    # ── Strategy 1: Dynamic search inside ChatDetailView ──
    # Opening/closing the link preview panel rebuilds ChatDetailView and inserts splitter nodes,
    # so fixed child indexes are not stable. Select the most likely visible message list instead.
    try:
        chat_detail = find_descendant(window, 'ChatDetailView', max_depth=14) or window
        candidates = find_all_descendants(
            chat_detail,
            lambda ctrl: (
                getattr(ctrl, 'ControlTypeName', '') == 'ListControl'
                and (
                    'RecyclerListView' in str(getattr(ctrl, 'ClassName', '') or '')
                    or str(getattr(ctrl, 'Name', '') or '').strip() == '消息'
                )
            ),
            max_depth=12,
        )
        if candidates:
            def candidate_score(ctrl):
                score = 0
                try:
                    class_name = str(ctrl.ClassName or '')
                    name = str(ctrl.Name or '').strip()
                    rect = ctrl.BoundingRectangle
                    if 'RecyclerListView' in class_name:
                        score += 100
                    if name == '消息':
                        score += 80
                    if rect.width() > 300 and rect.height() > 200:
                        score += 40
                    score += min(rect.width() * rect.height() / 100000, 30)
                except Exception:
                    pass
                return score
            return max(candidates, key=candidate_score)
    except Exception:
        pass

    # ── Strategy 2: Legacy path traversal ──
    try:
        qwidget = safe_children(window)[0]
        qstacked = safe_children(qwidget)[0]
        mainview1 = safe_children(qstacked)[0]
        qwidget2_list = safe_children(mainview1)
        if len(qwidget2_list) < 2:
            raise IndexError("mainview1 children < 2")
        qwidget2 = qwidget2_list[1]
        mainview2 = safe_children(qwidget2)[0]
        splitter = safe_children(mainview2)[0]
        inner = safe_children(splitter)[0]
        xstacked = safe_children(inner)[0]
        chat_detail = safe_children(xstacked)[0]
        inner_splitter = safe_children(chat_detail)[0]
        inner_stacked = safe_children(inner_splitter)[0]
        chat_page = safe_children(inner_stacked)[0]
        msg_splitter_list = safe_children(chat_page)
        if len(msg_splitter_list) < 2:
            raise IndexError("chat_page children < 2")
        msg_splitter = msg_splitter_list[1]
        vbox_list = safe_children(msg_splitter)
        if len(vbox_list) < 2:
            raise IndexError("msg_splitter children < 2")
        vbox = vbox_list[1]
        msg_view = safe_children(vbox)[0]
        msg_list = safe_children(msg_view)[0]
        if msg_list.ControlTypeName == 'ListControl':
            return msg_list
    except Exception:
        pass

    # ── Strategy 3: Fallback - recursive search ──
    try:
        msg_list = find_descendant(window, 'RecyclerListView', max_depth=14)
        if msg_list and msg_list.ControlTypeName == 'ListControl':
            return msg_list
    except Exception:
        pass

    return None

def get_chat_name(window, retries=3, retry_delay=0.12):
    """Read the authoritative contact/group name from the top-left chat title control."""
    invalid_names = frozenset([
        '', '微信', 'Weixin', '聊天记录', '从手机导入聊天记录', '语音通话', '聊天信息',
    ])
    for attempt in range(max(1, retries)):
        try:
            title_bar = (
                find_descendant(window, 'ChatTitleBarChatSingleView', max_depth=18)
                or find_descendant(window, 'ChatTitleBarChatRoomView', max_depth=18)
                or find_descendant(window, 'ChatTitleBarMasterView', max_depth=18)
            )
            if title_bar:
                candidates = find_all_descendants(
                    title_bar,
                    lambda ctrl: (
                        getattr(ctrl, 'ControlTypeName', '') == 'TextControl'
                        and bool(str(getattr(ctrl, 'Name', '') or '').strip())
                    ),
                    max_depth=12,
                )

                def title_score(ctrl):
                    score = 0
                    try:
                        name = str(ctrl.Name or '').strip()
                        automation_id = str(ctrl.AutomationId or '')
                        class_name = str(ctrl.ClassName or '')
                        rect = ctrl.BoundingRectangle
                        if name in invalid_names:
                            return -1000
                        if automation_id.endswith('current_chat_name_label'):
                            score += 300
                        if 'big_title_line_h_view' in automation_id:
                            score += 150
                        if 'XTextView' in class_name:
                            score += 60
                        if rect.width() > 0 and rect.height() > 0:
                            score += 30
                        if rect.top < title_bar.BoundingRectangle.bottom:
                            score += 10
                    except Exception:
                        pass
                    return score

                if candidates:
                    best = max(candidates, key=title_score)
                    name = str(best.Name or '').strip()
                    if name not in invalid_names and title_score(best) > 0:
                        return name
        except Exception:
            pass
        if attempt < retries - 1:
            time.sleep(retry_delay)
    return ''

# ── Conversation Parsing ────────────────────────────────────
def parse_session_name(name_text):
    """Parse conversation name from ChatSessionCell Name.
    Format: 'Name\n已置顶\n[2条] \nPreview\nTime\n' or 'Name\n[2条] Preview\nTime\n'
    """
    if not name_text:
        return ''
    lines = name_text.split('\n')
    for line in lines:
        part = line.strip()
        if not part:
            continue
        if part in ('已置顶', '消息免打扰', '有人@我', '@所有人'):
            continue
        if re.match(r'^\[\d+条\]\s*$', part):
            continue
        if re.match(r'^\d{1,2}:\d{2}$', part):
            continue
        if re.match(r'^\[\d+条\]\s+', part):
            # Has unread prefix before preview
            continue
        # First meaningful line is the conversation name
        return part
    return ''

def parse_session_unread(name_text):
    """Check if session has unread messages from the Name text"""
    if not name_text:
        return False
    return bool(re.search(r'\[\d+条\]', name_text))

def parse_session_preview(name_text):
    """Extract the preview text (last meaningful line before time)"""
    if not name_text:
        return ''
    lines = name_text.split('\n')
    # Find the preview: the line before the time
    preview_lines = []
    for line in lines:
        part = line.strip()
        if not part:
            continue
        if re.match(r'^\d{1,2}:\d{2}$', part):
            break
        if part in ('已置顶', '消息免打扰'):
            continue
        if re.match(r'^\[\d+条\]\s*$', part):
            continue
        preview_lines.append(part)
    # The first line is the name, skip it
    if len(preview_lines) > 1:
        return preview_lines[-1]
    return ''

def is_session_muted(item):
    """Check if a conversation is muted (消息免打扰).
    Note: ChatSessionCell children may be empty in some UIA contexts,
    so we fall back to checking the Name text."""
    # Check Name text for mute indicator
    try:
        name_text = (item.Name or '').strip()
        if '消息免打扰' in name_text:
            return True
    except Exception:
        pass
    # Check children for mute icon
    try:
        for child in safe_children(item):
            for cc in safe_children(child):
                try:
                    name = (cc.Name or '').strip()
                    if '消息免打扰' in name:
                        return True
                except Exception:
                    pass
    except Exception:
        pass
    return False

# ── Session Filtering ────────────────────────────────────────
# 默认跳过关键词（兜底，在无法连接后端 API 时使用）
DEFAULT_SKIP_KEYWORDS = frozenset([
    '公众号', '服务号', '订阅号', '小程序', '视频号',
    '企业号', '企业微信', '企业服务', '通讯录',
])

# 后端 API 地址（可通过启动参数覆盖）
SERVER_API_BASE = os.environ.get('WECHAT_MONITOR_API', 'http://localhost:3000')
SESSION_SKIP_RULES_URL = f'{SERVER_API_BASE}/api/wechat/session-skip-rules'

# 动态缓存：从后端拉取的会话跳过关键词
_dynamic_skip_keywords = set(DEFAULT_SKIP_KEYWORDS)
_dynamic_skip_fetch_time = 0.0
_DYNAMIC_SKIP_TTL = 30.0  # 30秒刷新一次

def fetch_skip_keywords():
    """从后端 API 拉取会话跳过规则，拉取失败则保留当前缓存"""
    global _dynamic_skip_keywords, _dynamic_skip_fetch_time
    now = time.monotonic()
    if now - _dynamic_skip_fetch_time < _DYNAMIC_SKIP_TTL:
        return _dynamic_skip_keywords
    try:
        req = urllib.request.Request(SESSION_SKIP_RULES_URL, headers={'User-Agent': 'wechat-monitor/1.0'})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            keywords = set(data.get('keywords', []))
            # 合并默认值和数据库值（数据库值可覆盖默认行为：用户没加的默认值仍然保留）
            merged = set(DEFAULT_SKIP_KEYWORDS) | keywords
            _dynamic_skip_keywords = merged
            _dynamic_skip_fetch_time = now
            return merged
    except Exception:
        # 拉取失败 → 返回当前缓存（首次失败则返回默认值）
        _dynamic_skip_fetch_time = now
        return _dynamic_skip_keywords

def should_skip_session(item, name_text=''):
    """检查会话是否应该被跳过（公众号、服务号、订阅号、小程序等）。
    优先使用从后端 API 动态获取的关键词，API 不可用时回退到默认列表。"""
    keywords = fetch_skip_keywords()
    full_text = ''
    try:
        full_text = str(item.Name or '')
    except Exception:
        pass
    full_text += '\n' + str(name_text or '')
    for kw in keywords:
        if kw and kw in full_text:
            return True
    return False

# ── Scroll Helpers ───────────────────────────────────────────
def get_first_item_top(ctrl):
    """获取列表第一个可见子项的 top 坐标，用于判断滚动位置是否变化"""
    try:
        children = safe_children(ctrl)
        if children:
            return children[0].BoundingRectangle.top
    except Exception:
        pass
    return None

def get_last_item_bottom(ctrl):
    """获取列表最后一个可见子项的 bottom 坐标"""
    try:
        children = safe_children(ctrl)
        if children:
            return children[-1].BoundingRectangle.bottom
    except Exception:
        pass
    return None

def scroll_to_top(ctrl, max_attempts=30):
    """将列表滚动到最顶部"""
    last_top = None
    for _ in range(max_attempts):
        first_top = get_first_item_top(ctrl)
        if first_top is not None and last_top is not None and first_top == last_top:
            break
        last_top = first_top
        try:
            ctrl.WheelUp(5)
            time.sleep(0.15)
        except Exception:
            break
    time.sleep(0.2)

# ── Conversation Actions (Background Click via PostMessage) ──
WM_LBUTTONDOWN = 0x0201
WM_LBUTTONUP   = 0x0202
MK_LBUTTON     = 0x0001

def post_click(hwnd, screen_x, screen_y):
    """Send a mouse click to a window via PostMessage.
    Works even when the window is behind other windows (background mode).
    Converts screen coordinates to client coordinates."""
    try:
        pt = ctypes.wintypes.POINT()
        pt.x = screen_x
        pt.y = screen_y
        ctypes.windll.user32.ScreenToClient(hwnd, ctypes.byref(pt))
        cx, cy = pt.x, pt.y
        lparam = (cy << 16) | (cx & 0xFFFF)
        ctypes.windll.user32.PostMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lparam)
        time.sleep(0.05)
        ctypes.windll.user32.PostMessageW(hwnd, WM_LBUTTONUP, 0, lparam)
        return True
    except Exception:
        return False

def raw_click(x, y):
    """Send a real hardware mouse click at screen coordinates using Win32 API.
    Only used as fallback when PostMessage doesn't work."""
    try:
        pt = ctypes.wintypes.POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        old_x, old_y = pt.x, pt.y
        ctypes.windll.user32.SetCursorPos(x, y)
        time.sleep(0.03)
        ctypes.windll.user32.mouse_event(0x0002, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTDOWN
        time.sleep(0.05)
        ctypes.windll.user32.mouse_event(0x0004, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTUP
        time.sleep(0.03)
        ctypes.windll.user32.SetCursorPos(old_x, old_y)
        return True
    except Exception:
        return False

def click_foreground(hwnd, x, y):
    """Bring WeChat to foreground, click, then restore previous foreground window.
    Used as last-resort fallback."""
    try:
        old_fg = ctypes.windll.user32.GetForegroundWindow()
        ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        time.sleep(0.05)
        ctypes.windll.user32.SetForegroundWindow(hwnd)
        time.sleep(0.15)
        raw_click(x, y)
        time.sleep(0.2)
        if old_fg and old_fg != hwnd:
            ctypes.windll.user32.SetForegroundWindow(old_fg)
        return True
    except Exception:
        return False

def select_conversation(item, wechat_hwnd=None):
    """Select a conversation to open it.
    Strategy: PostMessage (background) → foreground click → InvokePattern."""
    name_text = ''
    try:
        name_text = (item.Name or '').strip()
    except Exception:
        pass

    # Step 1: Ensure item is visible (scroll into view)
    try:
        item.GetScrollItemPattern().ScrollIntoView()
        time.sleep(0.3)
    except Exception:
        pass

    # Get bounding rect
    try:
        rect = item.BoundingRectangle
        if rect.width() <= 0 or rect.height() <= 0:
            return False
    except Exception:
        return False

    cx = rect.left + rect.width() // 2
    cy = rect.top + rect.height() // 2

    # Strategy 1: PostMessage (background click, no visual disruption)
    if wechat_hwnd:
        print(f"PCLICK\t{b64(name_text)}\t{cx}\t{cy}", flush=True)
        if post_click(wechat_hwnd, cx, cy):
            time.sleep(0.5)
            return True

    # Strategy 2: PostMessage at left edge (avoid child widgets)
    if wechat_hwnd:
        lx = rect.left + 15
        print(f"PCLICK_L\t{b64(name_text)}\t{lx}\t{cy}", flush=True)
        if post_click(wechat_hwnd, lx, cy):
            time.sleep(0.5)
            return True

    # Strategy 3: Foreground click (briefly brings WeChat to front)
    if wechat_hwnd:
        print(f"FCLICK\t{b64(name_text)}\t{cx}\t{cy}", flush=True)
        if click_foreground(wechat_hwnd, cx, cy):
            time.sleep(0.3)
            return True

    # Strategy 4: Raw hardware click (last resort, requires foreground)
    print(f"RCLICK\t{b64(name_text)}\t{cx}\t{cy}", flush=True)
    if raw_click(cx, cy):
        time.sleep(0.3)
        return True

    # Strategy 5: InvokePattern
    try:
        item.GetInvokePattern().Invoke()
        return True
    except Exception:
        pass
    return False

def scroll_list(ctrl, direction, amount=3):
    """Scroll a list up (-1) or down (+1)"""
    try:
        if direction > 0:
            ctrl.WheelDown(amount)
        else:
            ctrl.WheelUp(amount)
        return True
    except Exception:
        return False

# ── Message Reading ─────────────────────────────────────────
def read_visible_messages(window, msg_list, current_chat_name=''):
    """Read visible messages from the current chat and emit them.
    Uses current_chat_name instead of window title for accurate chat identification."""
    title_chat_name = get_chat_name(window, retries=1)
    chat_name = title_chat_name or current_chat_name
    if not chat_name:
        return ''
    is_group_chat = bool(re.search(r'[（(]\s*\d+\s*[）)]\s*$', chat_name))
    try:
        items = safe_children(msg_list)
    except Exception:
        return chat_name

    SYSTEM_TEXTS = frozenset(['已读', '未读', '图片', '文件', '链接', '语音', '视频', '[图片]', '[文件]', '[语音]', '[视频]'])
    QT_NOISE_RE = re.compile(r'^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$')
    QT_NOISE_PREFIXES = ('chat_message_list.', 'qt_', 'mmui.', 'chat_', 'message_')
    TIME_RE = re.compile(r'^(?:昨天|前天|今天|星期[一二三四五六日天])?\s*\d{1,2}:\d{2}$')
    TIME_LOOSE_RE = re.compile(r'(?:昨天|前天|今天|星期[一二三四五六日天])?\s*(\d{1,2}:\d{2})')

    def dedup_texts(raw_texts):
        """Remove duplicates while preserving order"""
        seen = set()
        result = []
        for t in raw_texts:
            s = t.strip()
            if s and s not in seen:
                seen.add(s)
                result.append(s)
        return result

    # 同一轮扫描只上报每位发送人的最后一条可见消息，避免首次切换会话时
    # 把该发送人的历史消息全部重复识别。items 按界面从旧到新排列，后值覆盖前值。
    latest_by_sender = {}
    for i in range(0, len(items)):
        try:
            item = items[i]
            raw_texts = collect_texts(item, max_depth=8)
            texts = dedup_texts(raw_texts)
            image_message = is_image_message_item(item, raw_texts, max_depth=8)
            if not texts and not image_message:
                continue

            # Extract message time — match any time-like text
            msg_time = ''
            for t in texts:
                if TIME_RE.match(t):
                    msg_time = t
                    break
            # Fallback: try loose regex (time embedded in larger text)
            if not msg_time:
                for t in texts:
                    m = TIME_LOOSE_RE.search(t)
                    if m:
                        msg_time = m.group(1)
                        break

            def is_time(s):
                return bool(TIME_RE.match(s.strip())) or bool(TIME_LOOSE_RE.search(s.strip()))

            def is_system(s):
                if s.strip() in SYSTEM_TEXTS:
                    return True
                # Filter Qt control paths like "chat_message_list.qt_scrollarea_viewport"
                if QT_NOISE_RE.match(s.strip()):
                    return True
                # Filter Qt noise by prefix
                s_stripped = s.strip()
                for prefix in QT_NOISE_PREFIXES:
                    if s_stripped.startswith(prefix):
                        return True
                return False

            def looks_like_sender(s):
                s = s.strip()
                if not s or len(s) > 15:
                    return False
                if is_time(s) or is_system(s):
                    return False
                if re.search(r'\d{6}', s):
                    return False
                if '【' in s or '】' in s:
                    return False
                if s.startswith('[') and s.endswith(']'):
                    return False
                if s == chat_name:
                    return False
                # Sender is typically short (2-10 chars), no line breaks
                if '\n' in s:
                    return False
                return True

            # 单聊发送人以左上角 current_chat_name_label 为准，避免把消息正文短句误判成人名。
            # 群聊才从消息项中尝试识别具体成员；失败时仍回退到群聊标题。
            sender = chat_name
            sender_idx = -1
            if is_group_chat:
                for idx, t in enumerate(texts):
                    if looks_like_sender(t):
                        sender = t.strip()
                        sender_idx = idx
                        break

            # Collect all message body texts
            body_parts = []
            for idx, t in enumerate(texts):
                s = t.strip()
                if not s:
                    continue
                if is_time(s) or is_system(s):
                    continue
                if idx == sender_idx:
                    continue
                body_parts.append(s)

            sender_key = sender.strip() or chat_name.strip() or '__unknown__'

            # 图片是该发送人的最后一条消息时，用空值覆盖此前文字消息，最终不输出；
            # 这样不会因为图片无法提取文字而错误回退到倒数第二条消息。
            if image_message:
                latest_by_sender[sender_key] = None
                continue

            if not body_parts:
                continue

            # Join all parts with newline to preserve multi-line message structure
            message = '\n'.join(body_parts)

            latest_by_sender[sender_key] = (chat_name, sender, message, msg_time)
        except Exception:
            pass

    readable_latest = [entry for entry in latest_by_sender.values() if entry is not None]
    for latest_chat, latest_sender, latest_message, latest_time in readable_latest:
        sys.stdout.write(
            f"MESSAGE\t{b64(latest_chat)}\t{b64(latest_sender)}\t{b64(latest_message)}\t{b64(latest_time)}\n"
        )
    if readable_latest:
        sys.stdout.flush()
    return chat_name

# ── Event Registration ──────────────────────────────────────
def register_event(conv_list):
    """Register StructureChanged event on the conversation list.
    Note: uiautomation 2.0.29 doesn't support event registration directly.
    We fall back to polling-based detection."""
    # Event registration not supported in this version of uiautomation.
    # The main loop uses polling (checking conv_list children every cycle).
    pass

# ── Main Loop ───────────────────────────────────────────────
def main():
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

    print('READY', flush=True)

    window = None
    conv_list = None
    msg_list = None
    chat_name = ''
    event_registered = False
    wechat_hwnd = None
    recent_switches = {}
    fail_counts = {'window': 0, 'conv': 0, 'msg': 0}
    last_msg_list_refresh = 0.0
    last_conv_list_refresh = 0.0

    while True:
        try:
            # ── Ensure window ──
            if window is None:
                window = find_wechat_window()
                if window is None:
                    print('STATE\tNO_WINDOW', flush=True)
                    time.sleep(1.2)
                    continue
                fail_counts['window'] = 0
                try:
                    wechat_hwnd = window.NativeWindowHandle
                except Exception:
                    wechat_hwnd = None

            # ── Validate window is still alive (not invalidated) ──
            window_alive = False
            try:
                _ = window.BoundingRectangle
                window_alive = True
            except Exception:
                pass
            if not window_alive:
                print('STATE\tWINDOW_INVALID', flush=True)
                window = None
                conv_list = None
                msg_list = None
                event_registered = False
                wechat_hwnd = None
                time.sleep(0.3)
                continue

            # ── Ensure message list ──
            # Link preview panels rebuild the chat detail tree. Refresh the UIA reference regularly
            # so a stale RecyclerListView cannot silently return an empty child list forever.
            now_monotonic = time.monotonic()
            if msg_list is not None and now_monotonic - last_msg_list_refresh >= 1.0:
                refreshed_msg_list = find_msg_list(window)
                if refreshed_msg_list is not None:
                    msg_list = refreshed_msg_list
                else:
                    msg_list = None
                last_msg_list_refresh = now_monotonic

            if msg_list is None:
                msg_list = find_msg_list(window)
                if msg_list is None:
                    # No chat open — try to click the first conversation to open one
                    if fail_counts['msg'] == 0:
                        temp_conv = conv_list or find_conv_list(window)
                        if temp_conv:
                            items = safe_children(temp_conv)
                            if items:
                                first_name = (items[0].Name or '').strip()
                                print(f"STATE\tAUTO_OPEN_CHAT\t{b64(parse_session_name(first_name) or first_name)}", flush=True)
                                if select_conversation(items[0], wechat_hwnd):
                                    chat_name = parse_session_name(first_name) or first_name
                                    time.sleep(1.0)
                                    # Reset to re-find elements after opening
                                    window = None
                                    conv_list = None
                                    event_registered = False
                                    wechat_hwnd = None
                                    fail_counts['msg'] = 0
                                    continue
                    fail_counts['msg'] += 1
                    if fail_counts['msg'] > 5:
                        window = None
                        conv_list = None
                        wechat_hwnd = None
                        fail_counts['msg'] = 0
                    print('STATE\tNO_MESSAGE_LIST', flush=True)
                    time.sleep(0.6)
                    continue
                fail_counts['msg'] = 0
                last_msg_list_refresh = time.monotonic()

            # ── Resolve current contact from the top-left title ──
            # The title control can be recreated briefly after switching chats or opening link preview.
            # Do not capture until it becomes readable; keep retrying on the next loop.
            detected_chat_name = get_chat_name(window, retries=3)
            if not detected_chat_name:
                chat_name = ''
                print('STATE\tWAITING_CONTACT', flush=True)
                time.sleep(0.25)
                continue
            chat_name = detected_chat_name

            # ── Emit messages from current chat ──
            chat_name = read_visible_messages(window, msg_list, chat_name)

            # ── Ensure conversation list ──
            now_monotonic = time.monotonic()
            if conv_list is not None and now_monotonic - last_conv_list_refresh >= 1.0:
                refreshed_conv_list = find_conv_list(window)
                if refreshed_conv_list is not None:
                    conv_list = refreshed_conv_list
                    event_registered = False
                else:
                    conv_list = None
                last_conv_list_refresh = now_monotonic

            if conv_list is None:
                conv_list = find_conv_list(window)
                if conv_list is None:
                    fail_counts['conv'] += 1
                    if fail_counts['conv'] > 5:
                        window = None
                        msg_list = None
                        wechat_hwnd = None
                        fail_counts['conv'] = 0
                    print(f"STATE\tNO_CONVERSATION_LIST\t{b64(chat_name)}", flush=True)
                    time.sleep(0.6)
                    continue
                fail_counts['conv'] = 0
                last_conv_list_refresh = time.monotonic()

            # ── Register event (once) ──
            if not event_registered:
                try:
                    register_event(conv_list)
                    event_registered = True
                except Exception as e:
                    print(f"ERROR\t{b64(str(e))}", flush=True)

            # ── Polling: scan visible conversations (no scrolling, avoid stealing mouse) ──
            # 只扫当前可见项，不动滚轮，不抢鼠标。微信新消息会自动置顶到顶部可见区。

            try:
                conv_items = safe_children(conv_list)
            except Exception:
                conv_items = []
            if not conv_items:
                refreshed_conv_list = find_conv_list(window)
                if refreshed_conv_list is not None:
                    conv_list = refreshed_conv_list
                    conv_items = safe_children(conv_list)
                    last_conv_list_refresh = time.monotonic()

            for item in conv_items:
                try:
                    name_text = (item.Name or '').strip()
                    if not name_text:
                        continue

                    name = parse_session_name(name_text)
                    if not name or not parse_session_unread(name_text):
                        continue

                    # 跳过公众号、服务号、订阅号、小程序等
                    if should_skip_session(item, name_text):
                        continue

                    if is_session_muted(item):
                        continue

                    if name == chat_name:
                        continue

                    last_switch = recent_switches.get(name, 0)
                    if time.time() - last_switch < 4:
                        continue

                    print(f"STATE\tSWITCHING\t{b64(name)}", flush=True)
                    if select_conversation(item, wechat_hwnd):
                        print(f"STATE\tSWITCHED\t{b64(name)}", flush=True)
                        recent_switches[name] = time.time()
                        chat_name = name
                        time.sleep(1.0)
                        window = None
                        conv_list = None
                        msg_list = None
                        event_registered = False
                        break  # 一次只处理一个，等下一轮
                    else:
                        print(f"STATE\tSWITCH_FAILED\t{b64(name)}", flush=True)
                except Exception:
                    pass

            print(f"STATE\tWATCHING_ALL\t{b64(chat_name)}", flush=True)

        except Exception as e:
            tb = traceback.format_exc()
            print(f"ERROR\t{b64(tb)}", flush=True)
            window = None
            conv_list = None
            msg_list = None
            event_registered = False
            wechat_hwnd = None

        time.sleep(0.3)


if __name__ == '__main__':
    main()
