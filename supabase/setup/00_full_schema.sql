
-- ============================================================
-- Migration: 20260312201045_68265af3-cb7a-4e7d-957f-01b8e8083080.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vehiculos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folio TEXT NOT NULL DEFAULT '',
  patente TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'AUTOMOVIL',
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  anio TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE',
  precio_venta NUMERIC NOT NULL DEFAULT 0,
  precio_costo NUMERIC NOT NULL DEFAULT 0,
  sucursal TEXT NOT NULL DEFAULT '',
  usuario_asignado TEXT NOT NULL DEFAULT '',
  combustible TEXT NOT NULL DEFAULT 'Bencina',
  n_motor TEXT NOT NULL DEFAULT '',
  vin TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  kilometraje NUMERIC NOT NULL DEFAULT 0,
  ubicacion TEXT NOT NULL DEFAULT '',
  comentarios TEXT NOT NULL DEFAULT '',
  transmision TEXT NOT NULL DEFAULT '',
  traccion TEXT NOT NULL DEFAULT '',
  aire_acondicionado BOOLEAN NOT NULL DEFAULT false,
  equipamiento_extra TEXT[] NOT NULL DEFAULT '{}',
  fotos TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;

-- Public read access for available vehicles (for the public API)
CREATE POLICY "Public can read available vehicles"
  ON public.vehiculos FOR SELECT
  USING (true);

-- Allow all operations without auth (internal app, no auth system yet)
CREATE POLICY "Allow all insert"
  ON public.vehiculos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all update"
  ON public.vehiculos FOR UPDATE
  USING (true);

CREATE POLICY "Allow all delete"
  ON public.vehiculos FOR DELETE
  USING (true);


-- ============================================================
-- Migration: 20260313160636_bea79aee-4c17-470d-b863-1a1c759613e6.sql
-- ============================================================

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


-- ============================================================
-- Migration: 20260313181758_7577cda5-8bb8-4675-918e-9be3b4e41f9c.sql
-- ============================================================

-- Create contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manychat_subscriber_id TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  channel TEXT DEFAULT 'whatsapp',
  avatar_url TEXT DEFAULT '',
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read contacts" ON public.contacts FOR SELECT USING (true);
CREATE POLICY "Public insert contacts" ON public.contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update contacts" ON public.contacts FOR UPDATE USING (true);
CREATE POLICY "Public delete contacts" ON public.contacts FOR DELETE USING (true);

-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel TEXT DEFAULT 'whatsapp',
  status TEXT DEFAULT 'active',
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  unread_count INT NOT NULL DEFAULT 0,
  assigned_to TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read conversations" ON public.conversations FOR SELECT USING (true);
CREATE POLICY "Public insert conversations" ON public.conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update conversations" ON public.conversations FOR UPDATE USING (true);
CREATE POLICY "Public delete conversations" ON public.conversations FOR DELETE USING (true);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound',
  content TEXT NOT NULL DEFAULT '',
  channel TEXT DEFAULT 'whatsapp',
  manychat_message_id TEXT DEFAULT '',
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Public insert messages" ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update messages" ON public.messages FOR UPDATE USING (true);
CREATE POLICY "Public delete messages" ON public.messages FOR DELETE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;


-- ============================================================
-- Migration: 20260314193453_31df67e2-158e-4bb7-b992-2f06e7cb87c8.sql
-- ============================================================

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


-- ============================================================
-- Migration: 20260314221433_2a6ef809-413f-41b1-ab40-968f83a0c5cb.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.configuracion_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracion_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public all configuracion_sistema"
  ON public.configuracion_sistema FOR ALL
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_configuracion_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_configuracion_sistema_updated_at
  BEFORE UPDATE ON public.configuracion_sistema
  FOR EACH ROW EXECUTE FUNCTION public.update_configuracion_updated_at();

INSERT INTO public.configuracion_sistema (clave, valor) VALUES
('AGENT_NAME', 'Asistente Egaña'),
('AGENT_MODEL', 'google/gemini-2.5-flash'),
('AGENT_MAX_MESSAGES', '10'),
('AGENT_TEMPERATURE', '0.7'),
('AGENT_SYSTEM_PROMPT', 'Eres el asistente virtual de Egaña Automotriz, una automotora ubicada en Chile. Tu nombre es "Asistente Egaña". Atiendes por WhatsApp, Instagram y Facebook. Califica leads y captura sus datos para que un vendedor los contacte. Sé breve, máximo 3 líneas por respuesta. Usa español chileno informal pero respetuoso.'),
('ASIGNACION_MODO', 'ORDENADO'),
('VENDEDOR_DEFAULT', ''),
('ASIGNACION_POR_CANAL', '{"whatsapp":"","instagram":"","facebook":"","presencial":""}'),
('SCORE_MINIMO_ESCALAR', '60'),
('PALABRAS_CLAVE_ESCALAR', '["quiero hablar con un vendedor","necesito hablar con alguien","me pueden llamar","quiero que me contacten","quiero hablar con una persona","hablar con ejecutivo","necesito un ejecutivo"]'),
('NOTIFICAR_VENDEDOR', 'true'),
('MENSAJE_NOTIFICACION_VENDEDOR', 'Hola {{vendedor}}, tienes un nuevo lead: Cliente: {{nombre_cliente}}, Canal: {{canal}}, Interés: {{interes}}, Teléfono: {{telefono}}, Score: {{score}}/100'),
('HORARIOS_ACTIVOS', 'false'),
('HORARIOS_CONFIG', '[{"dia":"Lunes","activo":true,"inicio":"09:00","fin":"19:00"},{"dia":"Martes","activo":true,"inicio":"09:00","fin":"19:00"},{"dia":"Miércoles","activo":true,"inicio":"09:00","fin":"19:00"},{"dia":"Jueves","activo":true,"inicio":"09:00","fin":"19:00"},{"dia":"Viernes","activo":true,"inicio":"09:00","fin":"19:00"},{"dia":"Sábado","activo":true,"inicio":"10:00","fin":"14:00"},{"dia":"Domingo","activo":false,"inicio":"09:00","fin":"18:00"},{"dia":"Festivos","activo":false,"inicio":"09:00","fin":"18:00"}]'),
('MENSAJE_FUERA_HORARIO', 'Hola, en este momento estamos fuera de horario de atención. Nuestro horario es de Lunes a Viernes de 9:00 a 19:00 hrs. Te contactaremos a la brevedad. ¡Gracias!')
ON CONFLICT (clave) DO NOTHING;


-- ============================================================
-- Migration: 20260318133459_14d5dfe6-ad40-4ddb-979d-7535892fbb13.sql
-- ============================================================

-- Add escalation status to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS escalated boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS escalated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS primer_apertura_vendedor timestamp with time zone;

-- Add escalation flag to conversaciones (legacy table)
ALTER TABLE public.conversaciones
ADD COLUMN IF NOT EXISTS escalada boolean NOT NULL DEFAULT false;

-- Add first_opened_at to leads to track vendor response time
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS primer_apertura_at timestamp with time zone;


-- ============================================================
-- Migration: 20260319172353_e53aa5c7-c1c4-43c9-b157-89723be65c42.sql
-- ============================================================
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS escalated_to TEXT DEFAULT NULL;

-- ============================================================
-- Migration: 20260414174101_9b2e3759-dabd-4c5c-9369-70d9a0df09b2.sql
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS calificacion text DEFAULT 'frio',
  ADD COLUMN IF NOT EXISTS observaciones_vendedor text DEFAULT '',
  ADD COLUMN IF NOT EXISTS estado_cierre text DEFAULT '',
  ADD COLUMN IF NOT EXISTS detalle_cierre text DEFAULT '';


-- ============================================================
-- Migration: 20260415175639_da68b7b7-6a0d-436f-8f84-e983dc4605b0.sql
-- ============================================================
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS clave text DEFAULT '';

-- ============================================================
-- Migration: 20260415175715_d30f56b0-470a-4297-8d3d-c3273c040734.sql
-- ============================================================
UPDATE vendedores SET clave = '123cuatro' WHERE email = 'cesar@egana.cl';
UPDATE vendedores SET clave = 'pamela123' WHERE email = 'pamela@egana.cl';
UPDATE vendedores SET clave = 'nicol123' WHERE email = 'nicol@egana.cl';

-- ============================================================
-- Migration: 20260415185126_6421f3de-2ca2-4fbd-b1a2-1ae59eae9ee2.sql
-- ============================================================
UPDATE configuracion_sistema SET valor = 'true', updated_at = now() WHERE clave = 'AGENTE_ACTIVO';

-- ============================================================
-- Migration: 20260415202917_f9d61d1d-b0ac-445b-913e-890ed644cc85.sql
-- ============================================================

-- Add rol column to vendedores
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'vendedor';

-- Set known roles
UPDATE public.vendedores SET rol = 'master' WHERE email = 'cesar@egana.cl';
UPDATE public.vendedores SET rol = 'administracion' WHERE email = 'pamela@egana.cl';


-- ============================================================
-- Migration: 20260416161556_93c73bf8-954f-48a3-8ac1-b06250b48950.sql
-- ============================================================
UPDATE vendedores SET activo = false WHERE id IN ('a9e61c78-9b0e-4e7a-8b12-f2f38818fdd4', '2c9bcafb-5c37-46a6-b5f7-0d59ed8f910a');

-- ============================================================
-- Migration: 20260515000000_dfa9cf86-302d-4f56-9fc6-acdd25128144.sql
-- ============================================================
UPDATE public.configuracion_sistema SET valor = $$Eres el asistente virtual de Egaña Automotriz, una automotora ubicada en Chile.
Tu nombre es "Asistente Egaña". Atiendes por WhatsApp, Instagram y Facebook.

OBJETIVO PRINCIPAL:
Calificar leads y capturar sus datos para que un vendedor los contacte.

COMPORTAMIENTO:
- Saluda cordialmente usando el nombre del cliente si lo tienes
- Sé breve, máximo 3 líneas por respuesta
- Usa español chileno informal pero respetuoso
- Nunca inventes precios ni disponibilidad de vehículos específicos
- Nunca digas que eres una IA a menos que te lo pregunten directamente

PREGUNTAS QUE DEBES HACER EN ORDEN:
1. ¿Qué tipo de vehículo estás buscando? (marca, modelo, año aproximado)
2. ¿Cuál es tu presupuesto aproximado?
3. ¿Lo necesitas pronto o estás cotizando?
4. ¿Me puedes dar tu nombre completo y teléfono para que un vendedor te contacte?

SCORING — evalúa internamente al cliente:
- Tiene presupuesto definido → lead caliente (score alto)
- Necesita el vehículo pronto → urgencia alta
- Solo está cotizando sin presupuesto → lead frío (score bajo)
- Pregunta por modelos específicos → lead calificado

CUÁNDO ESCALAR AL VENDEDOR:
Cuando tengas nombre, teléfono e interés claro, o cuando el cliente diga alguna de estas frases:
"quiero hablar con un vendedor", "necesito hablar con alguien", "me pueden llamar",
"quiero que me contacten", "quiero hablar con una persona"

Cuando escales responde:
"¡Perfecto [nombre]! Le voy a pasar tus datos a uno de nuestros ejecutivos para que te contacte a la brevedad. ¡Gracias por contactarnos!"

TEMAS QUE NO DEBES RESPONDER:
- Precios exactos de vehículos específicos
- Disponibilidad de stock en tiempo real
- Condiciones de crédito específicas
- Temas no relacionados con la compra de vehículos$$
WHERE clave='AGENT_SYSTEM_PROMPT';

-- ============================================================
-- Migration: 20260515150313_aee2d339-00de-4ba7-8c33-d93ab5d29f38.sql
-- ============================================================
UPDATE public.configuracion_sistema
SET valor = 'Eres el asistente virtual de Egaña Automotriz.

Tu única tarea es responder UNA sola vez al cliente con esta frase exacta y luego escalar al vendedor:

"¡Hola! Gracias por contactarte con Egaña Automotriz. En unos minutos uno de nuestros ejecutivos te contactará para ayudarte. 🚗"

Después de enviar esa frase, marca la conversación como escalada al vendedor y NO vuelvas a responder.'
WHERE clave = 'AGENT_SYSTEM_PROMPT';

-- ============================================================
-- Migration: 20260518175550_870256ab-e9c6-43a8-a167-51fa55fa92b0.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.asignar_siguiente_vendedor(_rotacion jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idx int := 0;
  v_count int := 0;
  v_last text := '';
  v_state jsonb;
  v_len int;
  v_chosen text;
  v_consecutivos int;
  v_next_idx int;
  v_next_count int;
  v_found int;
BEGIN
  v_len := jsonb_array_length(_rotacion);
  IF v_len = 0 THEN
    RETURN '';
  END IF;

  -- Lock the rotation index row so concurrent calls serialize
  SELECT valor::jsonb INTO v_state
  FROM public.configuracion_sistema
  WHERE clave = 'ROTACION_INDICE'
  FOR UPDATE;

  IF v_state IS NOT NULL THEN
    v_idx := COALESCE((v_state->>'idx')::int, 0);
    v_count := COALESCE((v_state->>'count')::int, 0);
    v_last := COALESCE(v_state->>'lastAssigned', '');
  END IF;

  -- Bounds check after roster changes
  IF v_idx >= v_len OR v_idx < 0 THEN
    v_idx := 0;
    v_count := 0;
  END IF;

  -- Realign by lastAssigned name (preserve order across roster edits)
  IF v_last <> '' THEN
    SELECT pos - 1 INTO v_found
    FROM jsonb_array_elements(_rotacion) WITH ORDINALITY AS t(elem, pos)
    WHERE btrim(elem->>'nombre') = btrim(v_last)
    LIMIT 1;

    IF v_found IS NOT NULL THEN
      -- lastAssigned was the previous one returned; advance from there
      v_consecutivos := GREATEST(1, COALESCE((_rotacion->v_found->>'consecutivos')::int, 1));
      IF v_count >= v_consecutivos THEN
        v_idx := (v_found + 1) % v_len;
        v_count := 0;
      ELSE
        v_idx := v_found;
      END IF;
    END IF;
  END IF;

  v_chosen := _rotacion->v_idx->>'nombre';
  v_next_count := v_count + 1;
  v_next_idx := v_idx;

  -- Persist: idx points to the one we just assigned; lastAssigned is who we just assigned
  IF v_state IS NULL THEN
    INSERT INTO public.configuracion_sistema(clave, valor)
    VALUES ('ROTACION_INDICE', jsonb_build_object('idx', v_next_idx, 'count', v_next_count, 'lastAssigned', v_chosen)::text);
  ELSE
    UPDATE public.configuracion_sistema
    SET valor = jsonb_build_object('idx', v_next_idx, 'count', v_next_count, 'lastAssigned', v_chosen)::text,
        updated_at = now()
    WHERE clave = 'ROTACION_INDICE';
  END IF;

  RETURN COALESCE(v_chosen, '');
END;
$$;

