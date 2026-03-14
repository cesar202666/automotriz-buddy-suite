
-- Tabla vendedores
CREATE TABLE IF NOT EXISTS public.vendedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  sucursal TEXT DEFAULT '',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all vendedores" ON public.vendedores FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO public.vendedores (nombre, sucursal) VALUES
('Administrador', 'Principal'),
('Vendedor 1', 'Principal'),
('Vendedor 2', 'Principal');

-- Tabla leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  canal TEXT DEFAULT 'whatsapp',
  interes TEXT DEFAULT '',
  presupuesto TEXT DEFAULT '',
  urgencia TEXT DEFAULT 'media',
  score INTEGER DEFAULT 0,
  etapa TEXT DEFAULT 'nuevo',
  vendedor_asignado TEXT DEFAULT '',
  motivo_perdida TEXT DEFAULT '',
  notas TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all leads" ON public.leads FOR ALL TO public USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- Tabla actividades del lead
CREATE TABLE IF NOT EXISTS public.lead_actividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'nota',
  descripcion TEXT NOT NULL DEFAULT '',
  usuario TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_actividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all actividades" ON public.lead_actividades FOR ALL TO public USING (true) WITH CHECK (true);

-- Tabla campañas
CREATE TABLE IF NOT EXISTS public.campanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL DEFAULT '',
  mensaje TEXT NOT NULL DEFAULT '',
  canal TEXT DEFAULT 'whatsapp',
  destinatarios_ids TEXT[] DEFAULT '{}',
  destinatarios_count INTEGER DEFAULT 0,
  estado TEXT DEFAULT 'borrador',
  enviada_at TIMESTAMPTZ,
  programada_para TIMESTAMPTZ,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all campanas" ON public.campanas FOR ALL TO public USING (true) WITH CHECK (true);

-- Función updated_at para leads
CREATE OR REPLACE FUNCTION public.update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_leads_updated_at();

-- Función para incrementar unread_count
CREATE OR REPLACE FUNCTION public.increment_unread(conv_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.conversations SET unread_count = unread_count + 1 WHERE id = conv_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;
