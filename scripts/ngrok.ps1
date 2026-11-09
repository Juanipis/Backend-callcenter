# Arranca el tunel ngrok para exponer el webhook (puerto 3000) a Internet.
# Ejecutar en una terminal aparte mientras la app esta corriendo (Docker o local).
#
# Primera vez: configura tu token con:
#   ngrok config add-authtoken TU_TOKEN
# (obtienes el token en https://dashboard.ngrok.com/get-started/your-authtoken)
#
# Luego copia la URL que muestra ngrok (ej. https://xxxx.ngrok-free.app)
# y ponla en .env como WEBHOOK_BASE_URL=

$ErrorActionPreference = "Stop"
$port = 3000

Write-Host "=== Ngrok - tunel para webhook (puerto $port) ===" -ForegroundColor Cyan
Write-Host "Asegurate de que la app este corriendo en localhost:$port (Docker o npm run dev).`n" -ForegroundColor Gray

# Comprobar si ngrok esta instalado
$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrok) {
    Write-Host "ngrok no esta en el PATH. Instalalo con: winget install ngrok.ngrok" -ForegroundColor Red
    Write-Host "O descargalo de https://ngrok.com/download" -ForegroundColor Gray
    exit 1
}

Write-Host "Iniciando tunel: http://localhost:$port -> URL publica" -ForegroundColor Yellow
Write-Host "Copia la URL HTTPS que aparezca y ponla en .env como WEBHOOK_BASE_URL=`n" -ForegroundColor Gray
ngrok http $port
