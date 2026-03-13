
CREATE TABLE public.conversaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  apellido text DEFAULT '',
  telefono text DEFAULT '',
  canal text DEFAULT 'manychat',
  mensaje_cliente text NOT NULL,
  respuesta_agente text NOT NULL,
  leido boolean NOT NULL DEFAULT false,
  notificado_vendedor boolean NOT NULL DEFAULT false,
  vendedor_asignado text DEFAULT '',
  interes text DEFAULT '',
  urgencia text DEFAULT '',
  datos_capturados jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversaciones_contact_id ON public.conversaciones(contact_id);
CREATE INDEX idx_conversaciones_created_at ON public.conversaciones(created_at DESC);

ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read conversaciones"
  ON public.conversaciones FOR SELECT TO public USING (true);

CREATE POLICY "Public insert conversaciones"
  ON public.conversaciones FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Public update conversaciones"
  ON public.conversaciones FOR UPDATE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversaciones;
