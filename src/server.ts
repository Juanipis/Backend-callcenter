import express, { Request, Response } from 'express';
import { twimlAnswer, twimlGather, twimlSayDato } from './twiml';
import { resolverDatoUsuario } from './voice';
import {
  getLlamadaById,
  getLlamadaConIdentificacion,
  getLlamadaIdByTwilioSid,
  getLlamadaObjetivoById,
  getGuionGeneradoPorIA,
  getNombreUsuarioByLlamada,
  insertLogTranscripcion,
  updateLlamadaEstado,
} from './db';
import { config } from './config';

function normalizeYesNo(text: string): 'yes' | 'no' | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t.includes('sí') || t.includes('si ') || t === 'si' || t.includes('claro') || t.includes('afirm')) return 'yes';
  if (t.includes('no') || t.includes('neg')) return 'no';
  return null;
}

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'callcenter-anti-bureaucracy' });
});

async function handleAnswer(req: Request, res: Response): Promise<void> {
  const llamadaId = (req.query.llamada_id ?? req.body?.llamada_id) as string;
  if (!llamadaId) {
    res.status(400).type('text/xml').send('<?xml version="1.0"?><Response><Say>Error: falta llamada_id</Say></Response>');
    return;
  }

  const llamada = await getLlamadaById(llamadaId);
  if (!llamada) {
    res.status(404).type('text/xml').send('<?xml version="1.0"?><Response><Say>Llamada no encontrada.</Say></Response>');
    return;
  }

  const nombre = await getNombreUsuarioByLlamada(llamadaId);
  const objetivo = (await getLlamadaObjetivoById(llamadaId)) ?? 'consultar';

  await updateLlamadaEstado(llamadaId, 'calling');
  await logTranscripcion(llamadaId, 'Llamada contestada; reproduciendo presentación.', 'evento');

  const dialogoIA = await getGuionGeneradoPorIA(llamadaId);

  const xml = twimlAnswer(nombre, objetivo, llamadaId, dialogoIA ?? undefined);
  res.type('text/xml').send(xml);
}

app.get('/twilio/answer', (req: Request, res: Response) => {
  handleAnswer(req, res).catch((err) => console.error('answer handler error:', err));
});
app.post('/twilio/answer', (req: Request, res: Response) => {
  handleAnswer(req, res).catch((err) => console.error('answer handler error:', err));
});

app.get('/twilio/gather', async (req: Request, res: Response) => {
  const llamadaId = req.query.llamada_id as string;
  if (!llamadaId) {
    res.status(400).type('text/xml').send('<?xml version="1.0"?><Response><Say>Error: falta llamada_id</Say></Response>');
    return;
  }

  await updateLlamadaEstado(llamadaId, 'in_queue');
  const xml = twimlGather(llamadaId);
  res.type('text/xml').send(xml);
});

app.post('/twilio/gather', (req: Request, res: Response) => {
  const llamadaId = req.body?.llamada_id ?? req.query?.llamada_id;
  if (llamadaId) {
    res.redirect(302, `/twilio/gather?llamada_id=${encodeURIComponent(llamadaId)}`);
  } else {
    res.status(400).type('text/xml').send('<?xml version="1.0"?><Response><Say>Error.</Say></Response>');
  }
});

app.post('/twilio/gather-result', async (req: Request, res: Response) => {
  const llamadaId = (req.body?.llamada_id ?? req.query?.llamada_id) as string;
  const digits = req.body?.Digits;
  const speech = (req.body?.SpeechResult ?? '') as string;

  if (!llamadaId) {
    res.status(400).type('text/xml').send('<?xml version="1.0"?><Response><Say>Error.</Say></Response>');
    return;
  }

  if (speech) {
    await logTranscripcion(llamadaId, `Speech recibido: ${speech}`, 'evento');
    const yn = normalizeYesNo(speech);
    if (yn === 'yes') {
      await updateLlamadaEstado(llamadaId, 'completed');
      await logTranscripcion(llamadaId, 'Confirmación recibida: SI. Tarea completada.', 'evento');
      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Perfecto. Confirmación recibida. Muchas gracias.</Say><Hangup/></Response>');
      return;
    }
    if (yn === 'no') {
      await updateLlamadaEstado(llamadaId, 'completed');
      await logTranscripcion(llamadaId, 'Confirmación recibida: NO. Tarea completada.', 'evento');
      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Entendido. Gracias por su respuesta.</Say><Hangup/></Response>');
      return;
    }
  }

  const llamada = await getLlamadaConIdentificacion(llamadaId);

  if (llamada && digits !== undefined) {
    await logTranscripcion(llamadaId, `DTMF recibido: ${digits}`, 'evento');
    const pregunta = (req.body?.SpeechResult ?? req.body?.pregunta ?? '') as string;
    if (pregunta && llamada.identificacion_json) {
      const dato = resolverDatoUsuario(llamada.identificacion_json, pregunta);
      if (dato) {
        const xml = twimlSayDato(dato, llamadaId);
        res.type('text/xml').send(xml);
        return;
      }
    }
  }

  const xml = twimlGather(llamadaId);
  res.type('text/xml').send(xml);
});

async function handleStatus(req: Request, res: Response): Promise<void> {
  const CallSid = req.body?.CallSid;
  const CallStatus = req.body?.CallStatus;
  const From = req.body?.From;
  const sessionIdFromQuery = (req.query?.call_session_id ?? req.body?.call_session_id) as string | undefined;

  res.type('text/xml').send('<?xml version="1.0"?><Response></Response>');

  if (!CallStatus) return;

  const estadoMap: Record<string, import('./types').EstadoLlamada> = {
    completed: 'completed',
    queued: 'calling',
    initiated: 'calling',
    ringing: 'calling',
    answered: 'calling',
    'in-progress': 'calling',
    busy: 'failed',
    failed: 'failed',
    'no-answer': 'no_answer',
    canceled: 'failed',
  };
  const nuevoEstado = estadoMap[CallStatus] ?? 'calling';

  const llamadaId = sessionIdFromQuery ?? (CallSid ? await getLlamadaIdByTwilioSid(CallSid) : null);
  if (!llamadaId) return;

  await updateLlamadaEstado(llamadaId, nuevoEstado);
  await logTranscripcion(
    llamadaId,
    `StatusCallback: ${CallStatus} (From: ${From ?? 'N/A'}). Estado actualizado a ${nuevoEstado}.`,
    'evento'
  );
}

app.post('/twilio/status', (req: Request, res: Response) => {
  handleStatus(req, res).catch((err) => console.error('status handler error:', err));
});
app.get('/twilio/status', (req: Request, res: Response) => {
  handleStatus(req, res).catch((err) => console.error('status handler error:', err));
});

app.post('/twilio/human-detected', async (req: Request, res: Response) => {
  const llamadaId = req.body?.llamada_id ?? req.query?.llamada_id;
  const CallSid = req.body?.CallSid;
  const sessionIdFromQuery = (req.query?.call_session_id ?? req.body?.call_session_id) as string | undefined;

  res.status(200).json({ ok: true });

  const id = (llamadaId as string | undefined) ?? sessionIdFromQuery ?? (CallSid ? await getLlamadaIdByTwilioSid(CallSid) : null);
  if (!id) return;

  await updateLlamadaEstado(id, 'talking_to_human');
  await logTranscripcion(id, 'Humano detectado; estado actualizado a talking_to_human.', 'evento');
});

async function logTranscripcion(llamadaId: string, texto: string, tipo: string): Promise<void> {
  await insertLogTranscripcion(llamadaId, texto, tipo);
}

import { startCallWorker } from './worker';

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}. Webhooks: ${config.webhookBaseUrl}`);
});

startCallWorker();
