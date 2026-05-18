
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
