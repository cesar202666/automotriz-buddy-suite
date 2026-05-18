# Egaña Automotriz ERP

Sistema ERP interno para Egaña Automotriz. Stack:

- Vite + React + TypeScript
- shadcn/ui + Tailwind CSS
- Supabase (base de datos, auth, edge functions)
- Despliegue en Vercel

## Requisitos

- Node.js 20+
- Cuenta de Supabase con proyecto creado
- Cuenta de Vercel para despliegue

## Variables de entorno

Copia `.env.example` a `.env`:

```sh
cp .env.example .env
```

Variables del frontend:

- `VITE_SUPABASE_URL` — URL del proyecto Supabase
- `VITE_SUPABASE_PUBLISHABLE_KEY` — anon/publishable key

Variables de las edge functions (en Supabase Dashboard → Edge Functions → Secrets):

- `AI_GATEWAY_URL` — endpoint compatible OpenAI
- `AI_API_KEY` — API key del proveedor de IA
- `AI_CHAT_MODEL` / `AI_IMAGE_MODEL` — modelos
- `MANYCHAT_API_KEY` — opcional

## Desarrollo

```sh
npm install
npm run dev
```

App en `http://localhost:8080`.

## Build

```sh
npm run build
npm run preview
```

## Supabase

1. Crea proyecto en [supabase.com](https://supabase.com).
2. Aplica el esquema:
   - **Rápido:** pega `supabase/setup/00_full_schema.sql` en el SQL Editor del dashboard y dale Run.
   - **CLI:** `npx supabase link --project-ref <REF>` + `npx supabase db push`.
3. Despliega las edge functions: `npx supabase functions deploy`.
4. Configura los secrets en el dashboard.

## Despliegue en Vercel

1. Importa el repo en [vercel.com](https://vercel.com).
2. Vercel detecta Vite (build: `npm run build`, output: `dist`).
3. Si usaste la integración Supabase↔Vercel, las env vars `NEXT_PUBLIC_SUPABASE_*` ya se inyectaron — `vite.config.ts` las acepta automáticamente.
4. Deploy.

## Tests

```sh
npm test                 # unit
npx playwright test      # e2e
```
