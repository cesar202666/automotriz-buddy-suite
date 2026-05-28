-- ============================================================
-- Tabla gemma_session: guarda las cookies de la sesion Gemma.cl
-- en BD para que el edge function (1) las lea en cada request,
-- (2) las actualice cuando Gemma renueva el Set-Cookie, (3) un
-- cron periodico haga keep-alive para que nunca expire.
--
-- Misma estrategia que usamos para AutoRed con JWT auto-refresh.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gemma_session (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  cookies         TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT,                                            -- nombre/email usuario
  last_ping_at    TIMESTAMPTZ,                                     -- ultimo health/keepalive
  last_ping_ok    BOOLEAN,                                         -- TRUE si Gemma respondio bien
  last_ping_status INT,
  expired         BOOLEAN NOT NULL DEFAULT FALSE,                  -- TRUE = re-paste manual requerido
  notes           TEXT
);

-- Insertar la fila singleton si no existe
INSERT INTO public.gemma_session (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.gemma_session IS
'Singleton con las cookies de sesion Gemma.cl. Edge function gemma-proxy lee/escribe aqui. Cron pg_cron llama keepalive cada 5 min para renovar sesion.';

-- ============================================================
-- Cron: keep-alive cada 5 minutos
-- ============================================================
-- pg_cron debe estar habilitado (ya lo esta en proyectos Supabase nuevos)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Eliminar el job previo si existe
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'gemma_keepalive';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END$$;

-- Schedule: cada 5 minutos, llama la edge function gemma-proxy con action=keepalive
SELECT cron.schedule(
  'gemma_keepalive',
  '*/5 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://nxeepkpfvhwobhgpltml.supabase.co/functions/v1/gemma-proxy',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'keepalive')
  );
  $cmd$
);

-- ============================================================
-- Permisos: anon/auth pueden LEER el estado (para UI status) pero
-- solo service_role puede INSERT/UPDATE (la edge function usa
-- service role internamente)
-- ============================================================
ALTER TABLE public.gemma_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gemma_session_read ON public.gemma_session;
CREATE POLICY gemma_session_read ON public.gemma_session
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT/UPDATE/DELETE solo desde edge function (service_role bypassa RLS)
GRANT SELECT ON public.gemma_session TO anon, authenticated;
GRANT ALL ON public.gemma_session TO service_role;
