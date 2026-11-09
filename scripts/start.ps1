# Arranque local: instala dependencias y levanta la app (webhooks + worker)
# Ejecutar desde la raiz del proyecto: .\scripts\start.ps1
# En otra terminal ejecuta .\scripts\ngrok.ps1 para exponer el webhook.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
    $ProjectRoot = (Get-Location).Path
}
Set-Location $ProjectRoot

Write-Host "=== Backend Callcenter - Arranque local ===" -ForegroundColor Cyan
Write-Host "Directorio: $ProjectRoot`n" -ForegroundColor Gray

if (-not (Test-Path (Join-Path $ProjectRoot ".env"))) {
    Write-Host "No hay archivo .env. Copia .env.example a .env y configuralo." -ForegroundColor Red
    exit 1
}

Write-Host "Instalando dependencias..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nIniciando app (webhooks + worker) en http://localhost:3000" -ForegroundColor Green
Write-Host "Para exponer Twilio: en otra terminal ejecuta  .\scripts\ngrok.ps1`n" -ForegroundColor Gray
npm run dev
