import { say, generarDialogoPresentacion, sayAttrs } from './voice';
import { config } from './config';

/**
 * TwiML para la URL de respuesta de la llamada (Answer).
 * Say con Polly para presentación; redirect a gather con llamada_id.
 */
export function twimlAnswer(
  nombre: string,
  objetivo: string,
  llamadaId: string,
  dialogoPersonalizado?: string
): string {
  const dialogo = dialogoPersonalizado?.trim() || generarDialogoPresentacion(nombre, objetivo);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say ${sayAttrs()}>${escapeXml(dialogo)}</Say>
  <Pause length="1"/>
  <Gather action="${config.webhookBaseUrl}/twilio/gather-result?llamada_id=${encodeURIComponent(llamadaId)}" method="POST" input="speech" language="es-CO" speechTimeout="auto" hints="si,sí,no">
    <Say ${sayAttrs()}>Por favor responda sí o no.</Say>
  </Gather>
  <Redirect>${config.webhookBaseUrl}/twilio/gather?llamada_id=${encodeURIComponent(llamadaId)}</Redirect>
</Response>`;
}

/**
 * TwiML para Gather: escuchar teclas DTMF o continuar esperando.
 * Tras timeout o silencio prolongado, asumimos "in_queue" y seguimos esperando.
 */
export function twimlGather(llamadaId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${config.webhookBaseUrl}/twilio/gather-result?llamada_id=${llamadaId}" method="POST" input="speech" language="es-CO" speechTimeout="auto" hints="si,sí,no">
    <Pause length="30"/>
  </Gather>
  <Redirect>${config.webhookBaseUrl}/twilio/gather?llamada_id=${llamadaId}</Redirect>
</Response>`;
}

/**
 * TwiML cuando el IVR pide datos (ej. "digite su documento").
 * Inyectamos el dato del usuario desde identificacion_json.
 */
export function twimlSayDato(dato: string, llamadaId?: string): string {
  const gatherUrl = llamadaId
    ? `${config.webhookBaseUrl}/twilio/gather?llamada_id=${encodeURIComponent(llamadaId)}`
    : `${config.webhookBaseUrl}/twilio/gather`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(dato)}
  <Pause length="1"/>
  <Redirect>${gatherUrl}</Redirect>
</Response>`;
}

/**
 * TwiML genérico Say + redirect (para mensajes de espera).
 */
export function twimlSayAndRedirect(mensaje: string, redirectPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(mensaje)}
  <Redirect>${config.webhookBaseUrl}${redirectPath}</Redirect>
</Response>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
