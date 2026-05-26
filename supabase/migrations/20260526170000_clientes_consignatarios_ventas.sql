-- ============================================================
-- Tablas: clientes, consignatarios, ventas
-- ============================================================

-- ── CLIENTES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombres TEXT NOT NULL DEFAULT '',
  apellidos TEXT NOT NULL DEFAULT '',
  direccion TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  rut TEXT,
  comentario TEXT,
  estado_civil TEXT,
  ciudad TEXT,
  region TEXT,
  casa_habita TEXT,
  estudios TEXT,
  seguimiento SMALLINT,
  seguimiento_comentario_1 TEXT,
  seguimiento_comentario_2 TEXT,
  seguimiento_comentario_3 TEXT,
  origen_lead TEXT,
  usuario_asignado TEXT,
  creado_por TEXT,
  whatsapp_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all clientes" ON public.clientes FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_clientes_rut ON public.clientes(rut);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON public.clientes(telefono);

-- ── CONSIGNATARIOS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consignatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL DEFAULT '',
  apellidos TEXT DEFAULT '',
  rut TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  descripcion TEXT,
  vehiculo TEXT DEFAULT '',
  patente TEXT DEFAULT '',
  marca TEXT,
  modelo TEXT,
  anio TEXT,
  color TEXT,
  precio NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'ACTIVO',
  contrato TEXT,
  contrato_name TEXT,
  fecha_ingreso TIMESTAMPTZ DEFAULT now(),
  usuario_asignado TEXT,
  creado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consignatarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all consignatarios" ON public.consignatarios FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_consignatarios_patente ON public.consignatarios(patente);
CREATE INDEX IF NOT EXISTS idx_consignatarios_rut ON public.consignatarios(rut);

-- ── VENTAS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutiva TEXT DEFAULT '',
  fecha_venta TIMESTAMPTZ DEFAULT now(),
  sucursal TEXT DEFAULT '',
  cliente_id TEXT,
  cliente_nombre TEXT DEFAULT '',
  cliente_apellido TEXT,
  cliente_rut TEXT,
  cliente_telefono TEXT,
  cliente_email TEXT,
  patente TEXT DEFAULT '',
  folio TEXT,
  marca TEXT DEFAULT '',
  modelo TEXT DEFAULT '',
  tipo TEXT,
  anio_vehiculo TEXT DEFAULT '',
  color_vehiculo TEXT,
  kilometraje_vehiculo NUMERIC DEFAULT 0,
  precio_retoma NUMERIC DEFAULT 0,
  precio_publicado NUMERIC DEFAULT 0,
  precio_venta NUMERIC DEFAULT 0,
  precio_vta_final NUMERIC DEFAULT 0,
  margen_bruto NUMERIC DEFAULT 0,
  n_credito TEXT,
  comision_credito NUMERIC DEFAULT 0,
  gastos_admin NUMERIC DEFAULT 0,
  credito_firmado TEXT,
  credito_firmado_doc TEXT,
  credito_firmado_doc_name TEXT,
  monto_pie_caja NUMERIC DEFAULT 0,
  prepago TEXT,
  prepago_doc TEXT,
  prepago_doc_name TEXT,
  documentacion_venta TEXT,
  documentacion_venta_name TEXT,
  informe_tecnico TEXT,
  informe_tecnico_name TEXT,
  formas_pago TEXT,
  vehiculo_parte_pago BOOLEAN DEFAULT false,
  comentario TEXT,
  observaciones_vehiculo TEXT,
  tipo_venta TEXT DEFAULT 'EFECTIVO',
  estado TEXT DEFAULT 'BORRADOR',
  verificacion BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all ventas" ON public.ventas FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ventas_patente ON public.ventas(patente);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON public.ventas(fecha_venta DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente_rut ON public.ventas(cliente_rut);

-- ── Triggers para updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_clientes ON public.clientes;
CREATE TRIGGER trg_update_clientes BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS trg_update_consignatarios ON public.consignatarios;
CREATE TRIGGER trg_update_consignatarios BEFORE UPDATE ON public.consignatarios
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS trg_update_ventas ON public.ventas;
CREATE TRIGGER trg_update_ventas BEFORE UPDATE ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ── Grants para anon/authenticated (importante: usamos anon para frontend) ──
GRANT ALL ON public.clientes TO anon, authenticated, service_role;
GRANT ALL ON public.consignatarios TO anon, authenticated, service_role;
GRANT ALL ON public.ventas TO anon, authenticated, service_role;
