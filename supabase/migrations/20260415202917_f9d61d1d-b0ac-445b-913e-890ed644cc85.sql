
-- Add rol column to vendedores
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'vendedor';

-- Set known roles
UPDATE public.vendedores SET rol = 'master' WHERE email = 'cesar@egana.cl';
UPDATE public.vendedores SET rol = 'administracion' WHERE email = 'pamela@egana.cl';
