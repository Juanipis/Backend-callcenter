#!/usr/bin/env bash
# Arranque local: instala dependencias y levanta la app (webhooks + worker)
# Ejecutar desde la raíz: ./scripts/start.sh
# En otra terminal ejecuta ngrok http 3000 para exponer el webhook.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "=== Backend Callcenter - Arranque local ==="
echo "Directorio: $(pwd)"
echo ""

if [ ! -f .env ]; then
  echo "No hay archivo .env. Copia .env.example a .env y configúralo."
  exit 1
fi

echo "Instalando dependencias..."
npm install
echo ""
echo "Iniciando app (webhooks + worker) en http://localhost:3000"
echo "Para exponer Twilio: en otra terminal ejecuta  ngrok http 3000"
echo ""
npm run dev
