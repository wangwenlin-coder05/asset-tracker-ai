[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32Click {
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx; public int dy; public uint mouseData;
        public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUT {
        [FieldOffset(0)] public uint type;
        [FieldOffset(4)] public MOUSEINPUT mi;
    }
    public const uint INPUT_MOUSE = 0;
    public const uint MOUSEEVENTF_MOVE = 0x0001;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;
    public const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
    public const uint WHEEL_DELTA = 120;

    public static void ClickAt(int screenX, int screenY) {
        POINT oldPos;
        GetCursorPos(out oldPos);
        SetCursorPos(screenX, screenY);
        System.Threading.Thread.Sleep(10);
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
        inputs[1].type = INPUT_MOUSE;
        inputs[1].mi.dwFlags = MOUSEEVENTF_LEFTUP;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
        System.Threading.Thread.Sleep(40);
        SetCursorPos(oldPos.X, oldPos.Y);
    }

    public static void ScrollAt(int screenX, int screenY, int delta) {
        POINT oldPos;
        GetCursorPos(out oldPos);
        SetCursorPos(screenX, screenY);
        System.Threading.Thread.Sleep(10);
        INPUT[] inputs = new INPUT[1];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dwFlags = MOUSEEVENTF_WHEEL;
        inputs[0].mi.mouseData = (uint)(delta * WHEEL_DELTA);
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        System.Threading.Thread.Sleep(30);
        SetCursorPos(oldPos.X, oldPos.Y);
    }
}
'@

# ── Thread-safe event flag ──────────────────────────────────
$script:syncRoot = New-Object object
$script:convChanged = $false
$script:recentSwitches = @{}

# ── Event handler delegate (kept in script scope to avoid GC) ──
$script:structureChangedHandler = [System.Windows.Automation.StructureChangedEventHandler]{
    param($sender, $e)
    if ($e.StructureChangeType -eq 'ChildAdded' -or $e.StructureChangeType -eq 'ChildrenInvalidated') {
        [System.Threading.Monitor]::Enter($script:syncRoot)
        try { $script:convChanged = $true }
        finally { [System.Threading.Monitor]::Exit($script:syncRoot) }
    }
}

function Convert-ToBase64([string]$value) {
  if ($null -eq $value) { $value = '' }
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value))
}

function Get-TextCandidates($element) {
  $values = New-Object System.Collections.Generic.List[string]
  try {
    $name = [string]$element.Current.Name
    if (-not [string]::IsNullOrWhiteSpace($name)) { $values.Add($name.Trim()) }
  } catch {}
  try {
    $descendants = $element.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($child in $descendants) {
      try {
        $name = [string]$child.Current.Name
        if (-not [string]::IsNullOrWhiteSpace($name) -and -not $values.Contains($name.Trim())) { $values.Add($name.Trim()) }
      } catch {}
    }
  } catch {}
  $values
}

function Find-WeChatWindow {
  $processIds = @(Get-Process -Name Weixin,WeChatAppEx,WeChat -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  if (-not $processIds.Count) { return $null }
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  $best = $null
  $bestArea = 0
  foreach ($window in $windows) {
    try {
      if ($processIds -notcontains $window.Current.ProcessId -or $window.Current.IsOffscreen) { continue }
      $rect = $window.Current.BoundingRectangle
      $area = $rect.Width * $rect.Height
      if ($rect.Width -ge 650 -and $rect.Height -ge 450 -and $area -gt $bestArea) { $best = $window; $bestArea = $area }
    } catch {}
  }
  $best
}

function Get-Lists($window) {
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::List)
  $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

function Find-MessageList($window) {
  $windowRect = $window.Current.BoundingRectangle
  $lists = Get-Lists $window
  $best = $null
  $bestScore = -1
  foreach ($list in $lists) {
    try {
      $rect = $list.Current.BoundingRectangle
      if ($rect.Width -lt 260 -or $rect.Height -lt 180) { continue }
      $score = $rect.Width * $rect.Height
      $name = [string]$list.Current.Name
      if ($name -match '消息|Message|聊天记录') { $score += 10000000 }
      if ($rect.Left -gt ($windowRect.Left + $windowRect.Width * 0.30)) { $score += 3000000 }
      if ($score -gt $bestScore) { $best = $list; $bestScore = $score }
    } catch {}
  }
  $best
}

function Find-ConversationList($window, $messageList) {
  $windowRect = $window.Current.BoundingRectangle
  $messageRect = $messageList.Current.BoundingRectangle
  $lists = Get-Lists $window
  $best = $null
  $bestScore = -1
  foreach ($list in $lists) {
    try {
      $rect = $list.Current.BoundingRectangle
      if ($rect.Width -lt 160 -or $rect.Width -gt 520 -or $rect.Height -lt 240) { continue }
      if ($rect.Right -gt ($messageRect.Left + 80)) { continue }
      $score = $rect.Width * $rect.Height
      $name = [string]$list.Current.Name
      if ($name -match '会话|聊天|Session|Conversation') { $score += 10000000 }
      if ($rect.Left -gt ($windowRect.Left + 45)) { $score += 1000000 }
      if ($score -gt $bestScore) { $best = $list; $bestScore = $score }
    } catch {}
  }
  $best
}

function Find-ChatName($window, $messageList) {
  $windowRect = $window.Current.BoundingRectangle
  $messageRect = $messageList.Current.BoundingRectangle
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)
  $texts = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  $candidates = New-Object System.Collections.Generic.List[object]
  foreach ($text in $texts) {
    try {
      $name = ([string]$text.Current.Name).Trim()
      $rect = $text.Current.BoundingRectangle
      if ([string]::IsNullOrWhiteSpace($name) -or $name.Length -gt 60) { continue }
      if ($rect.Top -le ($windowRect.Top + 105) -and $rect.Left -ge ($messageRect.Left - 30)) { $candidates.Add([pscustomobject]@{ Name=$name; Top=$rect.Top; Left=$rect.Left }) }
    } catch {}
  }
  $candidate = $candidates | Sort-Object Top,Left | Select-Object -First 1
  if ($candidate) { return [string]$candidate.Name }
  ([string]$window.Current.Name).Trim()
}

function Get-ConversationName($item) {
  $values = @(Get-TextCandidates $item)
  foreach ($value in $values) {
    foreach ($part in ($value -split "`r?`n")) {
      $name = $part.Trim()
      if ([string]::IsNullOrWhiteSpace($name) -or $name.Length -gt 60) { continue }
      if ($name -match '^\d{1,2}:\d{2}$|^\d+$|未读|条新消息|new messages?|\[\d+条\]|已置顶|消息免打扰') { continue }
      $name = $name -replace '\s+\d{1,2}:\d{2}\b.*$', ''
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      return $name
    }
  }
  ''
}

function Test-IsUnread($item) {
  try {
    $itemRect = $item.Current.BoundingRectangle
    $all = $item.FindAll([System.Windows.Automation.TreeScope]::Subtree, [System.Windows.Automation.Condition]::TrueCondition)
    $hasMuted = $false
    $hasUnread = $false
    foreach ($element in $all) {
      try {
        $name = ([string]$element.Current.Name).Trim()
        $help = ([string]$element.Current.HelpText).Trim()
        $status = ([string]$element.Current.ItemStatus).Trim()
        $automationId = ([string]$element.Current.AutomationId).Trim()
        $evidence = "$name $help $status $automationId"
        if ($evidence -match '消息免打扰') { $hasMuted = $true }
        if ($evidence -match '未读|条新消息|new\s*messages?|unread|badge|\[\d+条\]') { $hasUnread = $true }
        if ($name -match '^\d{1,3}$') {
          $rect = $element.Current.BoundingRectangle
          if ($rect.Width -le 42 -and $rect.Height -le 42 -and $rect.Right -ge ($itemRect.Right - 70)) { $hasUnread = $true }
        }
        $foreground = $element.Current.ForegroundColor
        if ($foreground -and $foreground.R -gt 200 -and $foreground.G -lt 120 -and $foreground.B -lt 120) { $hasUnread = $true }
      } catch {}
    }
    if ($hasMuted -and -not $hasUnread) { return $false }
    return $hasUnread
  } catch {}
  $false
}

function Select-Conversation($window, $item) {
  try {
    $pattern = $null
    if ($item.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) {
      ([System.Windows.Automation.SelectionItemPattern]$pattern).Select()
      return $true
    }
  } catch {}
  try {
    $pattern = $null
    if ($item.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
      ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
      return $true
    }
  } catch {}
  try {
    $pattern = $null
    if ($item.TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern, [ref]$pattern)) {
      ([System.Windows.Automation.LegacyIAccessiblePattern]$pattern).DoDefaultAction()
      return $true
    }
  } catch {}

  try {
    $itemRect = $item.Current.BoundingRectangle
    if ($itemRect.Width -le 0 -or $itemRect.Height -le 0) { return $false }
    $cx = [int]($itemRect.Left + $itemRect.Width / 2)
    $cy = [int]($itemRect.Top + $itemRect.Height / 2)
    [Win32Click]::ClickAt($cx, $cy)
    return $true
  } catch {}
  $false
}

function Scroll-ConversationList($conversationList, [int]$direction) {
  try {
    $pattern = $null
    if ($conversationList.TryGetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern, [ref]$pattern)) {
      $scroll = [System.Windows.Automation.ScrollPattern]$pattern
      if ($direction -gt 0 -and $scroll.Current.VerticallyScrollable) {
        $scroll.ScrollVertical([System.Windows.Automation.ScrollAmount]::SmallIncrement)
        return $true
      }
      if ($direction -lt 0 -and $scroll.Current.VerticallyScrollable) {
        $scroll.ScrollVertical([System.Windows.Automation.ScrollAmount]::SmallDecrement)
        return $true
      }
    }
  } catch {}
  try {
    $rect = $conversationList.Current.BoundingRectangle
    $cx = [int]($rect.Left + $rect.Width / 2)
    $cy = [int]($rect.Top + $rect.Height / 2)
    [Win32Click]::ScrollAt($cx, $cy, $direction)
    return $true
  } catch {}
  $false
}

function Find-NextUnreadConversation($conversationList, [int]$maxScrolls, [string]$currentChatName) {
  $scrolls = 0
  $visitedKeys = @{}
  do {
    $items = $conversationList.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($item in $items) {
      try {
        if (-not (Test-IsUnread $item)) { continue }
        $name = Get-ConversationName $item
        if ($name -and $currentChatName -and $name -eq $currentChatName) { continue }
        $key = if ($name) { $name } else { [string]$item.Current.AutomationId }
        if ($visitedKeys.ContainsKey($key)) { continue }
        $visitedKeys[$key] = $true
        $lastSwitch = $script:recentSwitches[$key]
        if ($lastSwitch -and ((Get-Date) - $lastSwitch).TotalSeconds -lt 4) { continue }
        return [pscustomobject]@{ Item=$item; Name=$name; Key=$key }
      } catch {}
    }
    if ($scrolls -lt $maxScrolls) {
      if (Scroll-ConversationList $conversationList 3) {
        $scrolls++
        Start-Sleep -Milliseconds 200
      } else { break }
    } else { break }
  } while ($scrolls -lt $maxScrolls)
  $null
}

function Select-Message($values) {
  $usable = @($values | Where-Object { $_ -and $_ -notmatch '^\d{1,2}:\d{2}$' -and $_ -notmatch '^(已读|未读|微信|WeChat)$' })
  if (-not $usable.Count) { return '' }
  [string]($usable | Sort-Object Length -Descending | Select-Object -First 1)
}

function Select-Sender($values, [string]$message, [string]$chatName) {
  foreach ($value in $values) {
    if ($value -eq $message -or $value.Length -gt 40) { continue }
    if ($value -match '^\d{1,2}:\d{2}$' -or $value -match '^(已读|未读|图片|文件|链接)$') { continue }
    if ($value -match '\d{6}' -or $value.Contains('【')) { continue }
    return $value
  }
  $chatName
}

function Emit-VisibleMessages($window, $messageList, [ref]$chatNameResult) {
  $chatName = Find-ChatName $window $messageList
  $items = $messageList.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  $start = [Math]::Max(0, $items.Count - 40)
  for ($index = $start; $index -lt $items.Count; $index++) {
    $values = Get-TextCandidates $items.Item($index)
    $message = Select-Message $values
    if ([string]::IsNullOrWhiteSpace($message)) { continue }
    $sender = Select-Sender $values $message $chatName
    Write-Output ("MESSAGE`t{0}`t{1}`t{2}" -f (Convert-ToBase64 $chatName), (Convert-ToBase64 $sender), (Convert-ToBase64 $message))
  }
  $chatNameResult.Value = $chatName
}

function Register-ConversationEvent($conversationList) {
  try {
    [System.Windows.Automation.Automation]::RemoveAllEventHandlers()
  } catch {}
  [System.Windows.Automation.Automation]::AddStructureChangedEventHandler(
    $conversationList,
    [System.Windows.Automation.TreeScope]::Children,
    $script:structureChangedHandler
  )
}

function Check-AndClearEventFlag {
  [System.Threading.Monitor]::Enter($script:syncRoot)
  try {
    $changed = $script:convChanged
    $script:convChanged = $false
    return $changed
  } finally {
    [System.Threading.Monitor]::Exit($script:syncRoot)
  }
}

# ── Main Loop ──────────────────────────────────────────────
Write-Output 'READY'
$window = $null
$messageList = $null
$conversationList = $null
$chatName = ''
$lastFullScan = [DateTime]::MinValue
$eventRegistered = $false

while ($true) {
  try {
    # Ensure window
    if ($null -eq $window) {
      $window = Find-WeChatWindow
      if ($null -eq $window) { Write-Output "STATE`tNO_WINDOW"; Start-Sleep -Milliseconds 1200; continue }
    }

    # Ensure message list
    if ($null -eq $messageList) {
      $messageList = Find-MessageList $window
      if ($null -eq $messageList) { Write-Output "STATE`tNO_MESSAGE_LIST"; Start-Sleep -Milliseconds 1000; continue }
    }

    # Emit messages from current chat
    Emit-VisibleMessages $window $messageList ([ref]$chatName)

    # Ensure conversation list
    if ($null -eq $conversationList) {
      $conversationList = Find-ConversationList $window $messageList
      if ($null -eq $conversationList) {
        Write-Output ("STATE`tNO_CONVERSATION_LIST`t{0}" -f (Convert-ToBase64 $chatName))
        Start-Sleep -Milliseconds 900
        continue
      }
    }

    # Register event on conversation list (once)
    if (-not $eventRegistered) {
      Register-ConversationEvent $conversationList
      $eventRegistered = $true
    }

    # Event-driven: check if conversation list changed
    $shouldScan = Check-AndClearEventFlag

    # Also periodic full scan every 3 seconds as fallback
    $elapsed = (Get-Date) - $lastFullScan
    if ($elapsed.TotalSeconds -ge 3) {
      $shouldScan = $true
      $lastFullScan = Get-Date
    }

    if ($shouldScan) {
      $unread = Find-NextUnreadConversation $conversationList 3 $chatName
      if ($unread) {
        Write-Output ("STATE`tSWITCHING`t{0}" -f (Convert-ToBase64 $unread.Name))
        if (Select-Conversation $window $unread.Item) {
          $script:recentSwitches[$unread.Key] = Get-Date
          Start-Sleep -Milliseconds 1200
          # Re-find window and message list after switch
          $window = Find-WeChatWindow
          $messageList = $null
          $conversationList = $null
          $eventRegistered = $false
          if ($window) {
            $messageList = Find-MessageList $window
            if ($messageList) {
              $chatName = ''
              Emit-VisibleMessages $window $messageList ([ref]$chatName)
            }
          }
        }
      }
    }

    Write-Output ("STATE`tWATCHING_ALL`t{0}" -f (Convert-ToBase64 $chatName))
  } catch {
    Write-Output ("ERROR`t{0}" -f (Convert-ToBase64 $_.Exception.Message))
    $window = $null
    $messageList = $null
    $conversationList = $null
    $eventRegistered = $false
  }
  Start-Sleep -Milliseconds 200
}