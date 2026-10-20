$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$dataDirectory = if ($env:RW_DATA_DIR) { [IO.Path]::GetFullPath($env:RW_DATA_DIR) } else { Join-Path $projectRoot 'data' }
$appPort = if ($env:RW_PORT) { [int]$env:RW_PORT } else { 4173 }
$baseUrl = "http://127.0.0.1:$appPort"
$runtimePath = Join-Path $dataDirectory '.runtime.json'
$runtime = if (Test-Path -LiteralPath $runtimePath) { Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json } else { $null }
$tokenPath = Join-Path $dataDirectory '.api-token'
$health = $null
try { $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2 } catch { }
if ($health -and $health.app -ne 'release-workbench') { throw 'The port is used by a different application. Nothing was stopped.' }
if ($health -and (Test-Path -LiteralPath $tokenPath)) {
  $token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
  Invoke-RestMethod -Uri "$baseUrl/api/shutdown" -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
  for ($attempt = 0; $attempt -lt 100; $attempt++) { Start-Sleep -Milliseconds 250; if (-not (Get-Process -Id $health.pid -ErrorAction SilentlyContinue)) { Write-Host 'Release Workbench stopped.'; exit 0 } }
}
if ($runtime -and $runtime.root -eq $projectRoot) {
  $ownedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($runtime.pid)" -ErrorAction SilentlyContinue
  $expectedEntry = Join-Path $projectRoot 'server\index.mjs'
  $sameCreation = $ownedProcess -and $runtime.startedAtUtc -and [Math]::Abs(($ownedProcess.CreationDate.ToUniversalTime() - [DateTime]::Parse($runtime.startedAtUtc).ToUniversalTime()).TotalSeconds) -lt 2
  if ($sameCreation -and $ownedProcess.CommandLine -and $ownedProcess.CommandLine.Contains($expectedEntry) -and (-not $health -or $health.instanceId -eq $runtime.instanceId)) {
    Stop-Process -Id $ownedProcess.ProcessId
    Write-Host 'Release Workbench process stopped. Remote Jenkins builds may continue.'
    exit 0
  }
}
if (-not $health -and (-not $runtime -or -not (Get-Process -Id $runtime.pid -ErrorAction SilentlyContinue))) { Write-Host 'Release Workbench is not running.'; exit 0 }
throw 'Could not verify process ownership. Nothing else was stopped.'
