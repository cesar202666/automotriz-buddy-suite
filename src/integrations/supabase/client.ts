import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// HARDCODED — apunta DIRECTAMENTE al proyecto Supabase nuevo.
// Esto garantiza que el bundle use SIEMPRE este Supabase, sin depender de
// env vars de Vercel que pueden estar mal configuradas.
const HARDCODED_SUPABASE_URL = "https://nxeepkpfvhwobhgpltml.supabase.co";
const HARDCODED_PUBLISHABLE_KEY = "sb_publishable_UQDGDRZZOvn97-0HhVzALQ_rii4fs3F";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || HARDCODED_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || HARDCODED_PUBLISHABLE_KEY;

// eslint-disable-next-line no-console
console.log("[supabase] Conectando a:", SUPABASE_URL);

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
