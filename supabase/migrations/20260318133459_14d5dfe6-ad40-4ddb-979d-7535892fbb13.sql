
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
