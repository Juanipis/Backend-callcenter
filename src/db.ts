import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import type { EstadoLlamada, IdentificacionJson } from './types';

interface CallSessionRow {
  id: string;
  phone_number: string;
  task: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
}

type EventType = 'ivr_message' | 'ia_action' | 'system' | 'warning' | 'error';

const supabase: SupabaseClient = createClient(config.supabase.url, config.supabase.key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

function statusFromLegacy(estado: EstadoLlamada): string {
  const map: Record<EstadoLlamada, string> = {
    pending: 'created',
    calling: 'dialing',
    in_queue: 'waiting',
    talking_to_human: 'transferred',
    completed: 'completed',
    failed: 'failed',
    no_answer: 'failed',
  };
  return map[estado];
}

function statusToLegacy(status: string): EstadoLlamada {
  const map: Record<string, EstadoLlamada> = {
    created: 'pending',
    dialing: 'calling',
    ivr_detected: 'calling',
    validating: 'calling',
    waiting: 'in_queue',
    transferred: 'talking_to_human',
    completed: 'completed',
    failed: 'failed',
  };
  return map[status] ?? 'failed';
}

function ensureSupabaseConfigured(): void {
  if (!config.supabase.url || !config.supabase.key) {
    throw new Error('SUPABASE_URL y SUPABASE_KEY son obligatorios para este backend.');
  }
}

export async function getLlamadaById(id: string): Promise<{ id: string; estado: EstadoLlamada } | null> {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .schema(config.supabase.schema)
    .from('call_sessions')
    .select('id,status')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { id: data.id, estado: statusToLegacy(data.status) };
}

export async function getLlamadaObjetivoById(id: string): Promise<string | null> {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .schema(config.supabase.schema)
    .from('call_sessions')
    .select('task')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data?.task ?? null;
}

export async function getNombreUsuarioByLlamada(id: string): Promise<string> {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .schema(config.supabase.schema)
    .from('call_identification_data')
    .select('*')
    .eq('call_session_id', id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = data?.[0] as Record<string, unknown> | undefined;
  if (!row) return 'usuario';

  const candidateKeys = ['full_name', 'name', 'nombre', 'customer_name', 'client_name'];
  for (const key of candidateKeys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'usuario';
}

export async function getGuionGeneradoPorIA(llamadaId: string): Promise<string | null> {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .schema(config.supabase.schema)
    .from('call_events')
    .select('message,created_at')
    .eq('call_session_id', llamadaId)
    .eq('event_type', 'system')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) throw error;

  for (const row of (data ?? []) as Array<{ message: string }>) {
    const msg = row?.message ?? '';
    const prefix = 'Guion IA generado:';
    if (msg.startsWith(prefix)) {
      const text = msg.slice(prefix.length).trim();
      return text || null;
    }
  }
  return null;
}

export async function updateLlamadaEstado(id: string, estado: EstadoLlamada): Promise<void> {
  ensureSupabaseConfigured();
  const status = statusFromLegacy(estado);
  const payload: Record<string, unknown> = { status };

  if (status === 'dialing') payload.started_at = new Date().toISOString();
  if (status === 'completed' || status === 'failed') payload.ended_at = new Date().toISOString();

  const { error } = await supabase
    .schema(config.supabase.schema)
    .from('call_sessions')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

export async function updateLlamadaCallingSid(id: string, _sid: string): Promise<void> {
  await updateLlamadaEstado(id, 'calling');
}

export async function insertLogTranscripcion(llamadaId: string, texto: string, tipo = 'evento'): Promise<void> {
  ensureSupabaseConfigured();

  const eventType: EventType =
    tipo === 'ivr_response'
      ? 'ivr_message'
      : tipo === 'error'
        ? 'error'
        : tipo === 'warning'
          ? 'warning'
          : 'system';

  const { error } = await supabase
    .schema(config.supabase.schema)
    .from('call_events')
    .insert({
      call_session_id: llamadaId,
      event_type: eventType,
      message: texto,
      metadata: { source: 'backend-callcenter', legacy_tipo: tipo },
    });

  if (error) {
    if (error.code === '42501') {
      console.warn('RLS bloqueó insert en call_events. Continuando sin log.');
      return;
    }
    throw error;
  }
}

export async function getLlamadaConIdentificacion(
  llamadaId: string
): Promise<{ id: string; identificacion_json: IdentificacionJson } | null> {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .schema(config.supabase.schema)
    .from('call_identification_data')
    .select('*')
    .eq('call_session_id', llamadaId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = data?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const identificacion: IdentificacionJson = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' && value.trim()) {
      identificacion[key] = value;
    }
  }

  return {
    id: llamadaId,
    identificacion_json: identificacion,
  };
}

export async function getLlamadaIdByTwilioSid(_twilioSid: string): Promise<string | null> {
  return null;
}

export async function listLlamadasPendientes(
  limit = 5
): Promise<Array<{ id: string; numero_destino: string; objetivo: string }>> {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .schema(config.supabase.schema)
    .from('call_sessions')
    .select('id,phone_number,task,status')
    .eq('status', 'created')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data as CallSessionRow[]).map((row) => ({
    id: row.id,
    numero_destino: row.phone_number,
    objetivo: row.task,
  }));
}
