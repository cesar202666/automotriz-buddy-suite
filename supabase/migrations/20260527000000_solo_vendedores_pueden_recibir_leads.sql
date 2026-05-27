-- ============================================================
-- Trigger de integridad: solo usuarios con rol='vendedor' pueden
-- aparecer en leads.vendedor_asignado y conversations.assigned_to.
-- Esto asegura que ni administracion ni master reciban leads,
-- aunque la UI o el agente IA tengan un bug.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_validar_vendedor_asignado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
  v_rol text;
  v_activo boolean;
BEGIN
  -- Detectar qué columna se está modificando segun la tabla
  IF TG_TABLE_NAME = 'leads' THEN
    v_nombre := NEW.vendedor_asignado;
  ELSIF TG_TABLE_NAME = 'conversations' THEN
    v_nombre := COALESCE(NEW.assigned_to, NEW.escalated_to);
  ELSE
    RETURN NEW;
  END IF;

  -- "" y NULL siempre permitidos (sin asignar)
  IF v_nombre IS NULL OR btrim(v_nombre) = '' THEN
    RETURN NEW;
  END IF;

  -- Buscar el vendedor por nombre exacto
  SELECT rol, activo INTO v_rol, v_activo
  FROM public.vendedores
  WHERE btrim(nombre) = btrim(v_nombre)
  LIMIT 1;

  -- Si no existe: dejar pasar (puede ser dato histórico, no rompemos compatibilidad)
  -- pero si existe Y tiene rol distinto de 'vendedor', rechazar.
  IF v_rol IS NOT NULL AND v_rol <> 'vendedor' THEN
    RAISE EXCEPTION 'No se puede asignar lead/conversación a "%": tiene rol "%". Solo los usuarios con rol "vendedor" pueden recibir leads.',
      v_nombre, v_rol;
  END IF;

  RETURN NEW;
END;
$$;

-- Aplicar a leads
DROP TRIGGER IF EXISTS trg_validar_vendedor_asignado_leads ON public.leads;
CREATE TRIGGER trg_validar_vendedor_asignado_leads
BEFORE INSERT OR UPDATE OF vendedor_asignado ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.fn_validar_vendedor_asignado();

-- Aplicar a conversations (assigned_to / escalated_to)
DROP TRIGGER IF EXISTS trg_validar_vendedor_asignado_conv ON public.conversations;
CREATE TRIGGER trg_validar_vendedor_asignado_conv
BEFORE INSERT OR UPDATE OF assigned_to, escalated_to ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.fn_validar_vendedor_asignado();
