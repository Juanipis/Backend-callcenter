/**
 * Worker: detecta nuevas filas en call_sessions (status = 'created')
 * y dispara twilio.calls.create.
 */
import {
  insertLogTranscripcion,
  listLlamadasPendientes,
  updateLlamadaCallingSid,
  updateLlamadaEstado,
  getNombreUsuarioByLlamada,
} from './db';
import { config } from './config';
import { toE164 } from './lib/phone';
import twilio from 'twilio';
import { buildMastraCallOpening } from './lib/mastra-call-agent';
import { twimlAnswer } from './twiml';

const POLL_INTERVAL_MS = 3000;

function getTwilioClient(): ReturnType<typeof twilio> {
  const { accountSid, authToken } = config.twilio;
  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN son obligatorios.');
  }
  return twilio(accountSid, authToken);
}

async function procesarPendientes(): Promise<void> {
  const rows = await listLlamadasPendientes(5);
  if (rows.length === 0) return;

  const client = getTwilioClient();
  const baseUrl = config.webhookBaseUrl;

  for (const llamada of rows) {
    try {
      // Pre-generar el guion IA ANTES de marcar para no bloquear el webhook /twilio/answer.
      let nombre = 'usuario';
      let guion: string | null = null;
      try {
        nombre = await getNombreUsuarioByLlamada(llamada.id);
        guion = await buildMastraCallOpening({ nombre, objetivo: llamada.objetivo });
        if (guion) {
          await insertLogTranscripcion(llamada.id, `Guion IA generado: ${guion}`, 'evento');
        }
      } catch (e) {
        console.warn('No se pudo pre-generar guion IA, continuando con fallback.', e);
      }

      const statusCallback = `${baseUrl}/twilio/status?call_session_id=${encodeURIComponent(llamada.id)}`;
      const twiml = twimlAnswer(nombre, llamada.objetivo, llamada.id, guion ?? undefined);

      const call = await client.calls.create({
        to: toE164(llamada.numero_destino),
        from: config.twilio.voiceNumber,
        twiml,
        statusCallback,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        timeout: 60,
        ...(config.twilio.enableMachineDetection
          ? { machineDetection: 'DetectMessageEnd' as const, machineDetectionTimeout: 30 }
          : {}),
      });

      await updateLlamadaCallingSid(llamada.id, call.sid);
      await log(llamada.id, `Twilio call created: ${call.sid}. Estado: calling.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateLlamadaEstado(llamada.id, 'failed');
      await log(llamada.id, `Error Twilio: ${msg}. Estado: failed.`);
    }
  }
}

async function log(llamadaId: string, texto: string): Promise<void> {
  await insertLogTranscripcion(llamadaId, texto, 'evento');
}

export function startCallWorker(): void {
  console.log('Worker started. Polling call_sessions (status = created) every', POLL_INTERVAL_MS, 'ms.');
  const run = async (): Promise<void> => {
    for (;;) {
      try {
        await procesarPendientes();
      } catch (e) {
        console.error('Worker error:', e);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  };
  run();
}
