[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

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

# Find WeChat window
$processIds = @(Get-Process -Name Weixin,WeChatAppEx,WeChat -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
if (-not $processIds.Count) { Write-Output "NO_WECHAT_PROCESS"; exit 1 }
$root = [System.Windows.Automation.AutomationElement]::RootElement
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
$window = $null
$bestArea = 0
foreach ($w in $windows) {
  try {
    if ($processIds -notcontains $w.Current.ProcessId -or $w.Current.IsOffscreen) { continue }
    $rect = $w.Current.BoundingRectangle
    $area = $rect.Width * $rect.Height
    if ($rect.Width -ge 650 -and $rect.Height -ge 450 -and $area -gt $bestArea) { $window = $w; $bestArea = $area }
  } catch {}
}
if (-not $window) { Write-Output "NO_WECHAT_WINDOW"; exit 1 }

Write-Output ("Window: {0}x{1} at ({2},{3})" -f [int]$window.Current.BoundingRectangle.Width, [int]$window.Current.BoundingRectangle.Height, [int]$window.Current.BoundingRectangle.Left, [int]$window.Current.BoundingRectangle.Top)

# Find all lists
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::List)
$lists = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
Write-Output ("Total lists found: {0}" -f $lists.Count)

$windowRect = $window.Current.BoundingRectangle

# Find message list (right side)
$messageList = $null
$bestScore = -1
foreach ($list in $lists) {
  try {
    $rect = $list.Current.BoundingRectangle
    if ($rect.Width -lt 260 -or $rect.Height -lt 180) { continue }
    $score = $rect.Width * $rect.Height
    $name = [string]$list.Current.Name
    if ($name -match [regex]::new('\u6d88\u606f|\u804a\u5929\u8bb0\u5f55|Message')) { $score += 10000000 }
    if ($rect.Left -gt ($windowRect.Left + $windowRect.Width * 0.30)) { $score += 3000000 }
    if ($score -gt $bestScore) { $messageList = $list; $bestScore = $score }
  } catch {}
}
if (-not $messageList) { Write-Output "NO_MESSAGE_LIST"; exit 1 }
Write-Output ("MessageList: {0}x{1} at ({2},{3}) Name={4}" -f [int]$messageList.Current.BoundingRectangle.Width, [int]$messageList.Current.BoundingRectangle.Height, [int]$messageList.Current.BoundingRectangle.Left, [int]$messageList.Current.BoundingRectangle.Top, [string]$messageList.Current.Name)

# Find conversation list (left side)
$messageRect = $messageList.Current.BoundingRectangle
$conversationList = $null
$bestScore = -1
foreach ($list in $lists) {
  try {
    $rect = $list.Current.BoundingRectangle
    if ($rect.Width -lt 160 -or $rect.Width -gt 520 -or $rect.Height -lt 240) { continue }
    if ($rect.Right -gt ($messageRect.Left + 80)) { continue }
    $score = $rect.Width * $rect.Height
    $name = [string]$list.Current.Name
    if ($name -match [regex]::new('\u4f1a\u8bdd|\u804a\u5929|Session|Conversation')) { $score += 10000000 }
    if ($rect.Left -gt ($windowRect.Left + 45)) { $score += 1000000 }
    if ($score -gt $bestScore) { $conversationList = $list; $bestScore = $score }
  } catch {}
}
if (-not $conversationList) { Write-Output "NO_CONVERSATION_LIST"; exit 1 }
Write-Output ("ConversationList: {0}x{1} at ({2},{3}) Name={4}" -f [int]$conversationList.Current.BoundingRectangle.Width, [int]$conversationList.Current.BoundingRectangle.Height, [int]$conversationList.Current.BoundingRectangle.Left, [int]$conversationList.Current.BoundingRectangle.Top, [string]$conversationList.Current.Name)

# Dump conversation items
$convItems = $conversationList.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
Write-Output ("Conversation items: {0}" -f $convItems.Count)

$unreadRegex = [regex]::new('\u672a\u8bfb|\u6761\u65b0\u6d88\u606f|new\s*messages?|unread|badge|\[\d+\u6761\]')
$mutedRegex = [regex]::new('\u6d88\u606f\u514d\u6253\u6270')
$numberRegex = [regex]::new('^\d{1,3}$')

for ($i = 0; $i -lt $convItems.Count; $i++) {
  $item = $convItems.Item($i)
  try {
    $rect = $item.Current.BoundingRectangle
    $texts = @(Get-TextCandidates $item)
    $textsStr = ($texts | ForEach-Object { $_.Replace("`r","\\r").Replace("`n","\\n") }) -join ' | '
    $hasUnread = $false
    $hasMuted = $false
    $all = $item.FindAll([System.Windows.Automation.TreeScope]::Subtree, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($e in $all) {
      try {
        $n = ([string]$e.Current.Name).Trim()
        $help = ([string]$e.Current.HelpText).Trim()
        $status = ([string]$e.Current.ItemStatus).Trim()
        $automationId = ([string]$e.Current.AutomationId).Trim()
        $evidence = "$n $help $status $automationId"
        if ($mutedRegex.IsMatch($evidence)) { $hasMuted = $true }
        if ($unreadRegex.IsMatch($evidence)) { $hasUnread = $true }
        if ($numberRegex.IsMatch($n)) {
          $er = $e.Current.BoundingRectangle
          if ($er.Width -le 42 -and $er.Height -le 42 -and $er.Right -ge ($rect.Right - 70)) { $hasUnread = $true }
        }
      } catch {}
    }
    if ($hasMuted -and -not $hasUnread) { $hasUnread = $false }
    $pat = ''
    try {
      $p = $null
      if ($item.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $pat = 'SelItem' }
      elseif ($item.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $pat = 'Invoke' }
      elseif ($item.TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern, [ref]$p)) { $pat = 'LegacyIA' }
    } catch {}
    Write-Output ("  [{0}] rect={1}x{2} unread={3} muted={4} pat={5} texts=[{6}]" -f $i, [int]$rect.Width, [int]$rect.Height, $hasUnread, $hasMuted, $pat, $textsStr)
  } catch {
    Write-Output ("  [{0}] ERROR: {1}" -f $i, $_.Exception.Message)
  }
}

Write-Output "DONE"