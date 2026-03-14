
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
