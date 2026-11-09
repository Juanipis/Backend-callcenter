import 'dotenv/config';

/**
 * Configuración centralizada. Usar variables de entorno.
 */
export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL ?? '',
  postgrestUrl: process.env.POSTGREST_URL ?? 'http://localhost:3001',
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '',
    schema: process.env.SUPABASE_SCHEMA ?? 'public',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    voiceNumber: process.env.TWILIO_VOICE_NUMBER!,
    enableMachineDetection: (process.env.TWILIO_ENABLE_MACHINE_DETECTION ?? '').toLowerCase() === 'true',
  },
  defaultCountryCallingCode: process.env.DEFAULT_COUNTRY_CALLING_CODE ?? '',
  webhookBaseUrl: (process.env.WEBHOOK_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  /** Voz Polly: Mia (es-MX) es clara y profesional; para pruebas más baratas usar "alice" o "Polly.Miguel" */
  voice: process.env.POLLY_VOICE ?? 'alice',
  voiceLanguage: process.env.POLLY_LANG ?? 'es-MX',
  /** Google AI Studio (Gemini) - API key para LLM */
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY ?? '',
  googleAiModel: process.env.GOOGLE_AI_MODEL ?? 'gemini-3-flash',
} as const;
