
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
