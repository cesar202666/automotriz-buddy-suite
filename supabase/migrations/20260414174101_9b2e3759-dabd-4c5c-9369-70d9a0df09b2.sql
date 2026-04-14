
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS calificacion text DEFAULT 'frio',
  ADD COLUMN IF NOT EXISTS observaciones_vendedor text DEFAULT '',
  ADD COLUMN IF NOT EXISTS estado_cierre text DEFAULT '',
  ADD COLUMN IF NOT EXISTS detalle_cierre text DEFAULT '';
