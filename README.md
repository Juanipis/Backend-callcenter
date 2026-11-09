# AI Agent Anti-Bureaucracy Backend

Backend para un agente de IA que gestiona llamadas burocráticas (bancos, EPS, soporte) en nombre del usuario. Detecta colas de espera, navega menús IVR y valida datos del usuario automáticamente.

## Stack

- **Base de datos:** PostgreSQL
- **API:** PostgREST
- **Worker/Orquestador:** Node.js + TypeScript (Twilio + estados)
- **Agente de tarea:** Mastra Agent + Gemini Flash (Google AI Studio)
- **Telefonía:** Twilio Voice
- **Voz:** Amazon Polly vía Twilio (ej. `Polly.Mia`, `es-MX`)

## Requisitos

- Docker y Docker Compose
- Cuenta Twilio (número de voz, Account SID, Auth Token)
- URL pública para webhooks (ej. ngrok en desarrollo)

## Configuración

1. Copia el ejemplo de variables de entorno:

   ```bash
   cp .env.example .env
   ```

2. Edita `.env`:
- `POSTGRES_PASSWORD`: **obligatorio**; usa una contraseña fuerte. No expongas el puerto 5432 sin protección.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VOICE_NUMBER`
- `WEBHOOK_BASE_URL`: URL que Twilio pueda alcanzar (ej. `https://abc123.ngrok.io`)
- `GOOGLE_AI_API_KEY` (o `GOOGLE_GENERATIVE_AI_API_KEY`) y `GOOGLE_AI_MODEL` (ej. `gemini-3-flash`)

3. En producción, cambia la contraseña del rol `authenticator` en PostgreSQL (en `init.sql` o con `ALTER ROLE`).

## Uso con Docker

**Windows (PowerShell):**
```powershell
.\scripts\start.ps1
```

**Linux / Mac:**
```bash
chmod +x scripts/start.sh
./scripts/start.sh
```

Eso levanta PostgreSQL, PostgREST y la app en el puerto 3000.

### Exponer webhook con ngrok (Windows)

Ngrok va **fuera de Docker**: lo ejecutas en tu máquina y hace túnel al puerto 3000.

1. **Una sola vez**, configura tu token (obtienes el token en [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken)):
   ```powershell
   ngrok config add-authtoken TU_TOKEN
   ```

2. Con la app ya corriendo (Docker o `npm run dev`), en **otra terminal** arranca el túnel:
   ```powershell
   .\scripts\ngrok.ps1
   ```

3. Copia la URL HTTPS que muestra ngrok (ej. `https://xxxx.ngrok-free.app`) y ponla en `.env` como **`WEBHOOK_BASE_URL`**. Si la app está en Docker, reinicia el contenedor para que tome la nueva URL:
   ```powershell
   docker compose up -d --force-recreate app
   ```

Para detener los servicios:
```powershell
.\scripts\stop.ps1
```

- **API REST (PostgREST):** http://localhost:3001  
- **App (webhooks + worker):** http://localhost:3000  

El worker hace polling a `api.llamadas` cada pocos segundos; cuando hay una fila con `estado = 'pending'`, crea la llamada en Twilio y actualiza el estado.

## Uso local (sin Docker)

1. Crea la base y ejecuta `init.sql`.
2. Instala dependencias: `npm install`
3. Compila: `npm run build`
4. Ejecuta: `DATABASE_URL=... WEBHOOK_BASE_URL=... TWILIO_*=... node dist/server.js`

O en desarrollo: `npm run dev`

## Estructura de datos

- **api.usuarios:** `id`, `nombre`, `telefono`, `identificacion_json` (cédula, PIN, fecha nacimiento, etc.).
- **api.llamadas:** `id`, `usuario_id`, `numero_destino`, `estado` (`pending` | `calling` | `in_queue` | `talking_to_human` | `completed` | `failed` | `no_answer`), `objetivo`, `twilio_sid`.
- **api.logs_transcripcion:** `llamada_id`, `texto`, `timestamp`, `tipo`.

Para disparar una llamada, inserta una fila en `api.llamadas` con `estado = 'pending'`. El worker la tomará y creará la llamada en Twilio.

## Webhooks Twilio

- `GET /twilio/answer?llamada_id=...` — TwiML de respuesta (presentación con Polly).
- `GET/POST /twilio/gather?llamada_id=...` — Mantener en línea, estado `in_queue`.
- `POST /twilio/gather-result` — DTMF o inyección de datos desde `identificacion_json`.
- `POST /twilio/status` — StatusCallback (completed, busy, failed, no-answer).
- `POST /twilio/human-detected` — Marcar estado `talking_to_human` (MachineDetection o análisis externo).

## Costos y privacidad

- **Twilio:** cobra por minuto de llamada y por voces premium (Polly). Para pruebas, voces estándar son más baratas.
- **Privacidad:** `identificacion_json` contiene datos sensibles. PostgreSQL en Docker solo expone 5432 en `127.0.0.1`; en producción usa contraseña fuerte y no abras 5432 al mundo sin necesidad.
