param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$appPort = if ($env:RW_PORT) { [int]$env:RW_PORT } else { 4173 }
if ($appPort -lt 1 -or $appPort -gt 65535) { throw 'RW_PORT must be between 1 and 65535.' }
$baseUrl = "http://127.0.0.1:$appPort"
$dataDirectory = if ($env:RW_DATA_DIR) { [IO.Path]::GetFullPath($env:RW_DATA_DIR) } else { Join-Path $projectRoot 'data' }
try { $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2; $info = Invoke-RestMethod -Uri "$baseUrl/api/info" -TimeoutSec 2; if ($health.app -eq 'release-workbench' -and $health.status -eq 'ready' -and $info.dataDirectory -eq $dataDirectory) { Write-Host "Already running: $baseUrl/"; exit 0 } } catch { }
if (Get-NetTCPConnection -State Listen -LocalPort $appPort -ErrorAction SilentlyContinue) { throw "Port $appPort is occupied. Stop the existing process or set RW_PORT." }
$nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = & $nodeCommand --version
if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw 'Node.js 24 or newer is required.' }
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
try { $lockHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash([IO.File]::ReadAllBytes((Join-Path $projectRoot 'package-lock.json')))).Replace('-', '') } finally { $hashAlgorithm.Dispose() }
$dependencyStamp = Join-Path $projectRoot 'node_modules/.workbench-lock.sha256'
if (-not (Test-Path -LiteralPath $dependencyStamp) -or (Get-Content -LiteralPath $dependencyStamp -Raw).Trim() -ne $lockHash) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }; Set-Content -LiteralPath $dependencyStamp -Value $lockHash -Encoding ASCII }
if (-not $SkipBuild -or -not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' } }
$logDirectory = Join-Path $dataDirectory 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdout = Join-Path $logDirectory "server-$stamp.log"
$stderr = Join-Path $logDirectory "server-$stamp.error.log"
$entry = Join-Path $projectRoot 'server/index.mjs'
$process = Start-Process -FilePath $nodeCommand -ArgumentList @(('"' + $entry + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
for ($attempt = 0; $attempt -lt 80; $attempt++) {
  Start-Sleep -Milliseconds 250
  if ($process.HasExited) { throw "Application exited. Check $stderr" }
  try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 1
    if ($health.app -eq 'release-workbench' -and $health.status -eq 'ready' -and $health.pid -eq $process.Id) {
      @{ pid = $process.Id; startedAtUtc = $process.StartTime.ToUniversalTime().ToString('o'); instanceId = $health.instanceId; port = $appPort; root = $projectRoot; dataDirectory = $dataDirectory; stdout = $stdout; stderr = $stderr } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDirectory '.runtime.json') -Encoding UTF8
      Write-Host "Started: $baseUrl/"
      Write-Host "PID: $($process.Id)"
      Write-Host "Data: $dataDirectory"
      Write-Host "Logs: $logDirectory"
      exit 0
    }
  } catch { }
}
throw "Application did not become ready. Check $stderr. PID $($process.Id)."
