-- ============================================================
-- AI Agent Anti-Bureaucracy Backend - Schema PostgreSQL
-- PostgREST + Twilio | Datos sensibles: no exponer 5432 sin auth
-- ============================================================

-- Extensión para UUIDs (opcional pero recomendado)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema principal para la API
CREATE SCHEMA IF NOT EXISTS api;

-- Enum para estados de llamada
CREATE TYPE api.estado_llamada AS ENUM (
  'pending',           -- Pendiente de iniciar
  'calling',           -- Marcando / en curso
  'in_queue',          -- En cola de espera (música/silencio)
  'talking_to_human',  -- Hablando con agente humano
  'completed',         -- Finalizada
  'failed',            -- Fallida (ocupado, buzón, error)
  'no_answer'         -- No contestó
);

-- Tabla: usuarios
CREATE TABLE api.usuarios (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        TEXT NOT NULL,
  telefono      TEXT NOT NULL,
  identificacion_json JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN api.usuarios.identificacion_json IS 'Datos sensibles: cédula, PIN, fecha_nacimiento, etc. Usado por el bot para IVR.';

-- Tabla: llamadas
CREATE TABLE api.llamadas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID NOT NULL REFERENCES api.usuarios(id) ON DELETE CASCADE,
  numero_destino TEXT NOT NULL,
  estado          api.estado_llamada NOT NULL DEFAULT 'pending',
  objetivo        TEXT NOT NULL,
  twilio_sid      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_llamadas_usuario ON api.llamadas(usuario_id);
CREATE INDEX idx_llamadas_estado ON api.llamadas(estado);
CREATE INDEX idx_llamadas_created ON api.llamadas(created_at);
CREATE INDEX idx_llamadas_twilio_sid ON api.llamadas(twilio_sid) WHERE twilio_sid IS NOT NULL;

-- Tabla: logs de transcripción / eventos de voz
CREATE TABLE api.logs_transcripcion (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  llamada_id UUID NOT NULL REFERENCES api.llamadas(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo       TEXT DEFAULT 'transcripcion'  -- transcripcion | evento | ivr_response
);

CREATE INDEX idx_logs_llamada ON api.logs_transcripcion(llamada_id);
CREATE INDEX idx_logs_timestamp ON api.logs_transcripcion(timestamp);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION api.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER usuarios_updated_at
  BEFORE UPDATE ON api.usuarios
  FOR EACH ROW EXECUTE PROCEDURE api.set_updated_at();

CREATE TRIGGER llamadas_updated_at
  BEFORE UPDATE ON api.llamadas
  FOR EACH ROW EXECUTE PROCEDURE api.set_updated_at();

-- ============================================================
-- Seguridad: Roles para PostgREST
-- ============================================================

-- Rol anónimo para requests sin JWT (puedes restringir con RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
END
$$;

-- Rol para requests autenticados (JWT)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'change_me_in_production';
  END IF;
END
$$;

-- Rol que tendrá los permisos reales (authenticator hace SET ROLE a este)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'api_user') THEN
    CREATE ROLE api_user NOLOGIN;
  END IF;
END
$$;

GRANT api_user TO authenticator;
GRANT web_anon TO authenticator;
-- Para que la app Node (conexión con POSTGRES_USER) pueda escribir en api.*
GRANT api_user TO postgres;

-- Permisos de uso del schema
GRANT USAGE ON SCHEMA api TO web_anon, api_user;

-- web_anon: solo lectura básica (ajusta según necesidad)
GRANT SELECT ON api.usuarios TO web_anon;
GRANT SELECT ON api.llamadas TO web_anon;
GRANT SELECT ON api.logs_transcripcion TO web_anon;

-- api_user: lectura y escritura para la app Node.js / workers
GRANT SELECT, INSERT, UPDATE, DELETE ON api.usuarios TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.llamadas TO api_user;
GRANT SELECT, INSERT ON api.logs_transcripcion TO api_user;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA api TO api_user;

-- RLS (Row Level Security) opcional: descomenta si quieres filtrar por usuario
-- ALTER TABLE api.usuarios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE api.llamadas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY usuarios_own ON api.usuarios FOR ALL USING (auth.uid() = id);

-- Habilitar la API en PostgREST (schema api expuesto)
-- En postgrest.conf: db-schemas = "api"
