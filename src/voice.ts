import { config } from './config';
import type { IdentificacionJson } from './types';

const VOICE = config.voice;
const LANG = config.voiceLanguage;

/**
 * Genera el diálogo dinámico de presentación del bot.
 * "Hola, soy el asistente de [Nombre]. Estoy llamando para [Objetivo]. Por favor, transfiérame con un asesor."
 */
export function generarDialogoPresentacion(nombre: string, objetivo: string): string {
  return `Hola, soy el asistente de ${nombre}. Estoy llamando para ${objetivo}. Por favor, transfiérame con un asesor.`;
}

/**
 * Atributos de voz para todos los verbos <Say> (Polly, tono profesional).
 */
export function sayAttrs(): string {
  return `voice="${VOICE}" language="${LANG}"`;
}

/**
 * Resuelve un valor del identificacion_json del usuario para responder a IVR.
 * Ej: "número de documento" -> cedula o documento
 */
export function resolverDatoUsuario(
  identificacion: IdentificacionJson,
  preguntaNormalizada: string
): string | null {
  const q = preguntaNormalizada.toLowerCase();
  if (q.includes('documento') || q.includes('cédula') || q.includes('cedula') || q.includes('identificación')) {
    return identificacion.cedula ?? identificacion.documento ?? null;
  }
  if (q.includes('pin') || q.includes('clave')) {
    return identificacion.pin ?? null;
  }
  if (q.includes('fecha') && (q.includes('nacimiento') || q.includes('nacimiento'))) {
    return identificacion.fecha_nacimiento ?? null;
  }
  // Búsqueda por clave en el JSON
  for (const [key, value] of Object.entries(identificacion)) {
    if (value && q.includes(key.toLowerCase())) return value;
  }
  return null;
}

/**
 * Genera un bloque <Say> con voz Polly.
 */
export function say(text: string): string {
  const escaped = escapeXml(text);
  return `<Say ${sayAttrs()}>${escaped}</Say>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
