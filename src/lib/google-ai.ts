/**
 * Cliente para Google AI Studio (Gemini).
 * Usa GOOGLE_AI_API_KEY del .env.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_client) {
    if (!config.googleAiApiKey) {
      throw new Error('GOOGLE_AI_API_KEY no está definido en el entorno.');
    }
    _client = new GoogleGenerativeAI(config.googleAiApiKey);
  }
  return _client;
}

/**
 * Genera texto con Gemini (Google AI Studio).
 * @param prompt - Instrucción o mensaje para el modelo.
 * @param systemInstruction - Opcional: contexto de sistema (ej. "Eres un asistente que...").
 * @returns Texto generado o null si la API key no está configurada.
 */
export async function generateWithGoogleAI(
  prompt: string,
  systemInstruction?: string
): Promise<string | null> {
  if (!config.googleAiApiKey) return null;

  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: config.googleAiModel,
    systemInstruction: systemInstruction ?? undefined,
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  return text?.trim() ?? null;
}

/**
 * Indica si el proveedor LLM está configurado.
 */
export function isGoogleAIConfigured(): boolean {
  return Boolean(config.googleAiApiKey);
}
