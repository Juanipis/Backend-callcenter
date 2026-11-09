export type EstadoLlamada =
  | 'pending'
  | 'calling'
  | 'in_queue'
  | 'talking_to_human'
  | 'completed'
  | 'failed'
  | 'no_answer';

export interface IdentificacionJson {
  cedula?: string;
  documento?: string;
  pin?: string;
  fecha_nacimiento?: string;
  [key: string]: string | undefined;
}

export interface Usuario {
  id: string;
  nombre: string;
  telefono: string;
  identificacion_json: IdentificacionJson;
  created_at: string;
  updated_at: string;
}

export interface Llamada {
  id: string;
  usuario_id: string;
  numero_destino: string;
  estado: EstadoLlamada;
  objetivo: string;
  twilio_sid: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface LogTranscripcion {
  id: string;
  llamada_id: string;
  texto: string;
  timestamp: string;
  tipo?: string;
}
