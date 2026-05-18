import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ⚠️ HARDCODED — Ignoramos completamente las env vars de Vercel porque la
// integración Supabase↔Vercel original había seteado SUPABASE_URL apuntando
// al proyecto viejo (xzyveouixrqkhwhllprw). Para garantizar que SIEMPRE
// hablemos con el proyecto correcto, definimos los valores directamente acá.
const SUPABASE_URL = "https://nxeepkpfvhwobhgpltml.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_UQDGDRZZOvn97-0HhVzALQ_rii4fs3F";

// eslint-disable-next-line no-console
console.log("[supabase] Conectando a:", SUPABASE_URL);

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
