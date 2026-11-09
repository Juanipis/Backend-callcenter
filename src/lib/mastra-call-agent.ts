import { Agent } from '@mastra/core/agent';
import { config } from '../config';

const SYSTEM_INSTRUCTIONS = [
  {
    role: 'system' as const,
    content:
      'Eres un agente de llamadas telefónicas en español. Tu objetivo es resolver tareas burocráticas por teléfono.',
  },
  {
    role: 'system' as const,
    content:
      'Responde solo con texto plano para TTS. Sin markdown, sin comillas, sin listas, máximo 320 caracteres.',
  },
];

const cachedAgents = new Map<string, Agent>();

function resolveMastraModel(model: string): string {
  if (!model) return 'google/gemini-2.5-flash';
  if (model.includes('/')) return model;
  if (model === 'gemini-3-flash') return 'google/gemini-3-flash-preview';
  return `google/${model}`;
}

function getAgent(model: string): Agent {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && config.googleAiApiKey) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = config.googleAiApiKey;
  }

  if (!cachedAgents.has(model)) {
    const agentId = `call-task-agent-${model.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const agent = new Agent({
      id: agentId,
      name: 'Call Task Agent',
      instructions: SYSTEM_INSTRUCTIONS,
      model,
    });
    cachedAgents.set(model, agent);
  }

  return cachedAgents.get(model)!;
}

export async function buildMastraCallOpening(params: {
  nombre: string;
  objetivo: string;
}): Promise<string | null> {
  if (!config.googleAiApiKey) return null;

  const configured = resolveMastraModel(config.googleAiModel);
  const fallbackModels = [
    configured,
    'google/gemini-3-flash-preview',
    'google/gemini-2.5-flash',
    'google/gemini-2.0-flash',
  ].filter((model, index, arr) => arr.indexOf(model) === index);

  const prompt = [
    `Nombre del cliente: ${params.nombre}.`,
    `Tarea a completar: ${params.objetivo}.`,
    'Genera un guion inicial para llamada saliente a un IVR/asesor humano.',
    'Debe: presentarse, explicar la gestión con precisión y pedir transferencia o resolución.',
  ].join(' ');

  for (const model of fallbackModels) {
    try {
      const agent = getAgent(model);
      const output = await agent.generate(prompt, {
        modelSettings: {
          temperature: 0.2,
          maxOutputTokens: 180,
        },
      });

      const text = sanitizeSpeechText(output.text ?? '');
      if (text) return text;
    } catch (error) {
      console.warn(`Mastra model failed (${model}), trying fallback.`);
      if (model === fallbackModels[fallbackModels.length - 1]) {
        throw error;
      }
    }
  }

  return null;
}

function sanitizeSpeechText(raw: string): string | null {
  const normalized = raw
    .replace(/\r/g, '\n')
    .replace(/[“”"]/g, '')
    .replace(/\t/g, ' ')
    .trim();

  if (!normalized) return null;

  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]+\s*/g, '').trim())
    .filter(Boolean)
    .filter((line) => line.length > 20)
    .filter((line) => !/^(\(|wait|final|character|format|let|one more|removed|total|no markdown)/i.test(line))
    .filter((line) => !line.includes('Character count'))
    .filter((line) => !line.includes('No markdown'))
    .filter((line) => !line.includes('Final check'));

  const candidate = lines[lines.length - 1] ?? '';
  if (!candidate) return null;

  const compact = candidate.replace(/\s+/g, ' ').trim();
  if (!compact) return null;

  if (compact.length <= 320) return compact;

  const truncated = compact.slice(0, 320);
  const lastSentence = truncated.lastIndexOf('.');
  return (lastSentence > 80 ? truncated.slice(0, lastSentence + 1) : truncated).trim();
}
