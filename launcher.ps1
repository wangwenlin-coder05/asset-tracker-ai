param(
  [switch]$StopOnly,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ProjectDir = $PSScriptRoot
$FrontendDir = Join-Path $ProjectDir 'frontend'
$StateDir = Join-Path $ProjectDir '.launcher'
$BackendPidFile = Join-Path $StateDir 'backend.pid'
$FrontendPidFile = Join-Path $StateDir 'frontend.pid'
$BackendOutLog = Join-Path $StateDir 'backend.out.log'
$BackendErrLog = Join-Path $StateDir 'backend.err.log'
$FrontendOutLog = Join-Path $StateDir 'frontend.out.log'
$FrontendErrLog = Join-Path $StateDir 'frontend.err.log'
$ProjectPorts = @(3000) + (5173..5180)

New-Item -ItemType Directory -Path $StateDir -Force | Out-Null

function Stop-ProcessTree {
  param([int]$ProcessId)
  if ($ProcessId -le 0 -or $ProcessId -eq $PID) { return }
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue)
  foreach ($child in $children) { Stop-ProcessTree -ProcessId $child.ProcessId }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-PidFromFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $raw = (Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue | Select-Object -First 1)
  $trackedPid = 0
  if ([int]::TryParse([string]$raw, [ref]$trackedPid)) { Stop-ProcessTree -ProcessId $trackedPid }
  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Stop-ExistingProject {
  Write-Host '[1/5] Stopping old project processes...'
  Stop-PidFromFile -Path $BackendPidFile
  Stop-PidFromFile -Path $FrontendPidFile

  $portOwners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $ProjectPorts -contains $_.LocalPort } |
    Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($ownerPid in $portOwners) { Stop-ProcessTree -ProcessId $ownerPid }

  $escapedProject = [regex]::Escape($ProjectDir)
  $orphans = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessId -ne $PID -and
    $_.Name -in @('node.exe', 'cmd.exe') -and
    $_.CommandLine -match $escapedProject -and
    ($_.CommandLine -match 'server\.js' -or $_.CommandLine -match 'vite[\\/]bin[\\/]vite\.js' -or $_.CommandLine -match 'npm-cli\.js.+run dev')
  })
  foreach ($orphan in $orphans) { Stop-ProcessTree -ProcessId $orphan.ProcessId }

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $busy = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ProjectPorts -contains $_.LocalPort })
    if ($busy.Count -eq 0) { break }
    Start-Sleep -Milliseconds 200
  }
}

function Get-LogTail {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) { return (Get-Content -LiteralPath $Path -Tail 30 -ErrorAction SilentlyContinue) -join [Environment]::NewLine }
  return ''
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [System.Diagnostics.Process]$Process,
    [string]$Name,
    [string]$ErrorLog
  )
  for ($attempt = 0; $attempt -lt 80; $attempt++) {
    if ($Process.HasExited) {
      $tail = Get-LogTail -Path $ErrorLog
      throw "$Name exited during startup.`n$tail"
    }
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { return }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  $tail = Get-LogTail -Path $ErrorLog
  throw "$Name did not become ready: $Url`n$tail"
}

Stop-ExistingProject
if ($StopOnly) {
  Write-Host 'Stock Calculator processes stopped.' -ForegroundColor Green
  exit 0
}

$node = Get-Command node.exe -ErrorAction Stop
$npm = Get-Command npm.cmd -ErrorAction Stop
Remove-Item -LiteralPath $BackendOutLog,$BackendErrLog,$FrontendOutLog,$FrontendErrLog -Force -ErrorAction SilentlyContinue

$backend = $null
$frontend = $null
try {
  Write-Host '[2/5] Starting backend on port 3000...'
  $backend = Start-Process -FilePath $node.Source -ArgumentList @('server.js') -WorkingDirectory $ProjectDir -WindowStyle Hidden -RedirectStandardOutput $BackendOutLog -RedirectStandardError $BackendErrLog -PassThru
  [System.IO.File]::WriteAllText($BackendPidFile, [string]$backend.Id, [System.Text.Encoding]::ASCII)
  Wait-HttpReady -Url 'http://127.0.0.1:3000/api/heartbeat' -Process $backend -Name 'Backend' -ErrorLog $BackendErrLog

  Write-Host '[3/5] Checking backend data endpoints...'
  foreach ($url in @('http://127.0.0.1:3000/api/stocks?board=stock', 'http://127.0.0.1:3000/api/stocks?board=gold', 'http://127.0.0.1:3000/api/deposits')) {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -ne 200) { throw "Backend health check failed: $url ($($response.StatusCode))" }
  }

  Write-Host '[4/5] Starting frontend on fixed port 5173...'
  $frontend = Start-Process -FilePath $npm.Source -ArgumentList @('run','dev','--','--host','127.0.0.1','--port','5173','--strictPort') -WorkingDirectory $FrontendDir -WindowStyle Hidden -RedirectStandardOutput $FrontendOutLog -RedirectStandardError $FrontendErrLog -PassThru
  [System.IO.File]::WriteAllText($FrontendPidFile, [string]$frontend.Id, [System.Text.Encoding]::ASCII)
  Wait-HttpReady -Url 'http://127.0.0.1:5173' -Process $frontend -Name 'Frontend' -ErrorLog $FrontendErrLog

  Write-Host '[5/5] Ready: http://localhost:5173' -ForegroundColor Green
  if (-not $NoBrowser) { Start-Process 'http://localhost:5173' }
  exit 0
} catch {
  Write-Host ''
  Write-Host ('Startup failed: ' + $_.Exception.Message) -ForegroundColor Red
  $backendTail = Get-LogTail -Path $BackendErrLog
  if ($backendTail) { Write-Host "`nBackend error log:`n$backendTail" -ForegroundColor DarkRed }
  $frontendTail = Get-LogTail -Path $FrontendErrLog
  if ($frontendTail) { Write-Host "`nFrontend error log:`n$frontendTail" -ForegroundColor DarkRed }
  if ($frontend) { Stop-ProcessTree -ProcessId $frontend.Id }
  if ($backend) { Stop-ProcessTree -ProcessId $backend.Id }
  Remove-Item -LiteralPath $BackendPidFile,$FrontendPidFile -Force -ErrorAction SilentlyContinue
  Read-Host 'Press Enter to close'
  exit 1
}