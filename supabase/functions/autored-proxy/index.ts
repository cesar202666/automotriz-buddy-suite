/**
 * autored-proxy — Proxy hacia AutoRed Analytics API
 *
 * Características:
 * 1. Token JWT en Supabase secrets (AUTORED_TOKEN)
 * 2. CORS: la API de AutoRed no permite browsers directos
 * 3. AUTO-REFRESH: si el token esta por expirar (< 30 min) o ya expiró,
 *    hace login automático con AUTORED_EMAIL y AUTORED_PASSWORD,
 *    obtiene un token nuevo y actualiza el secret via Management API.
 *    El cliente nunca se entera de la expiración.
 *
 * Secrets necesarios en Supabase:
 *   - AUTORED_EMAIL: email del usuario AutoRed
 *   - AUTORED_PASSWORD: contraseña del usuario AutoRed
 *   - AUTORED_TOKEN: JWT actual (se actualiza solo)
 *   - AUTORED_SUPABASE_PAT: Personal Access Token de Supabase Management API
 *                          (usado para actualizar secrets desde la edge function)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const AUTORED_BASE = "https://analytics.autored.cl/api";
const PROJECT_REF = "nxeepkpfvhwobhgpltml";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ProxyRequest {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Decodifica un JWT (payload) sin verificar firma. Devuelve { exp } si existe. */
function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Verifica si el token expira en < 30 minutos (o ya expiró). */
function tokenNeedsRefresh(token: string): boolean {
  const exp = decodeJwtExp(token);
  if (!exp) return false; // si no se puede decodificar, no refrescamos
  const nowSec = Math.floor(Date.now() / 1000);
  return exp - nowSec < 30 * 60; // 30 min margen
}

/** Hace login en AutoRed y devuelve el nuevo token (o null si falla). */
async function doAutoRedLogin(email: string, password: string): Promise<string | null> {
  try {
    const resp = await fetch(`${AUTORED_BASE}/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://analytics.autored.cl",
        Referer: "https://analytics.autored.cl/",
        "User-Agent": "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
      },
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) {
      console.error(`[autored-proxy] Login fallido HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data?.token && typeof data.token === "string") {
      console.log(`[autored-proxy] Login OK, nuevo token obtenido para ${data?.user?.email}`);
      return data.token;
    }
    console.error("[autored-proxy] Login OK pero sin token en respuesta");
    return null;
  } catch (e) {
    console.error("[autored-proxy] Excepción haciendo login:", e);
    return null;
  }
}

/** Actualiza el secret AUTORED_TOKEN en Supabase via Management API. */
async function updateTokenSecret(newToken: string, supabasePat: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabasePat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ name: "AUTORED_TOKEN", value: newToken }]),
      },
    );
    if (!resp.ok) {
      const t = await resp.text();
      console.error(`[autored-proxy] No se pudo actualizar secret HTTP ${resp.status}: ${t.slice(0, 200)}`);
      return false;
    }
    console.log("[autored-proxy] Secret AUTORED_TOKEN actualizado en Supabase");
    return true;
  } catch (e) {
    console.error("[autored-proxy] Excepción actualizando secret:", e);
    return false;
  }
}

/** Obtiene el token efectivo: el actual o uno nuevo si esta por expirar. */
async function getEffectiveToken(): Promise<string | null> {
  let token = Deno.env.get("AUTORED_TOKEN") ?? "";
  const email = Deno.env.get("AUTORED_EMAIL") ?? "";
  const password = Deno.env.get("AUTORED_PASSWORD") ?? "";
  const supabasePat = Deno.env.get("AUTORED_SUPABASE_PAT") ?? "";

  // Si no hay token Y no tenemos credenciales para hacer login, fallamos
  if (!token && (!email || !password)) {
    return null;
  }

  // Si tenemos credenciales y el token va a expirar (o ya expiró) → refresh
  if (email && password && (!token || tokenNeedsRefresh(token))) {
    console.log("[autored-proxy] Token expira pronto o no existe, haciendo login automático...");
    const newToken = await doAutoRedLogin(email, password);
    if (newToken) {
      token = newToken;
      // Intentar persistir el nuevo token en secrets (no crítico si falla)
      if (supabasePat) {
        await updateTokenSecret(newToken, supabasePat);
      } else {
        console.warn("[autored-proxy] AUTORED_SUPABASE_PAT no configurado, el nuevo token NO se persistirá.");
      }
    } else {
      console.error("[autored-proxy] No se pudo obtener nuevo token via login");
    }
  }

  return token || null;
}

// ── Handler principal ──────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = await getEffectiveToken();
    if (!token) {
      return new Response(
        JSON.stringify({
          error:
            "Sin token AUTORED_TOKEN y sin credenciales AUTORED_EMAIL/AUTORED_PASSWORD para login automático.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parsear request del frontend
    let proxyReq: ProxyRequest;
    if (req.method === "POST") {
      proxyReq = await req.json();
    } else {
      const url = new URL(req.url);
      const path = url.searchParams.get("path") || "/brands";
      proxyReq = { path, method: "GET" };
    }

    const { path, method = "GET", body } = proxyReq;

    if (!path || !path.startsWith("/")) {
      return new Response(
        JSON.stringify({ error: "path inválido (debe empezar con /)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const targetUrl = `${AUTORED_BASE}${path}`;
    console.log(`[autored-proxy] ${method} ${targetUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    let resp: Response;
    try {
      resp = await fetch(targetUrl, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          Origin: "https://analytics.autored.cl",
          Referer: "https://analytics.autored.cl/",
          "User-Agent": "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
        },
        body: method === "POST" && body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Si AutoRed devuelve 401, el token expiró ANTES del margen de 30 min.
    // Intentamos un refresh inmediato y re-tentar la request una vez.
    if (resp.status === 401) {
      const email = Deno.env.get("AUTORED_EMAIL") ?? "";
      const password = Deno.env.get("AUTORED_PASSWORD") ?? "";
      const supabasePat = Deno.env.get("AUTORED_SUPABASE_PAT") ?? "";

      if (email && password) {
        console.log("[autored-proxy] 401 detectado, intentando re-login inmediato...");
        const freshToken = await doAutoRedLogin(email, password);
        if (freshToken) {
          if (supabasePat) await updateTokenSecret(freshToken, supabasePat);
          // Reintentar la request original
          const retryCtrl = new AbortController();
          const retryTo = setTimeout(() => retryCtrl.abort(), 25_000);
          try {
            resp = await fetch(targetUrl, {
              method,
              headers: {
                Authorization: `Bearer ${freshToken}`,
                "Content-Type": "application/json",
                Accept: "application/json, text/plain, */*",
                Origin: "https://analytics.autored.cl",
                Referer: "https://analytics.autored.cl/",
              },
              body: method === "POST" && body ? JSON.stringify(body) : undefined,
              signal: retryCtrl.signal,
            });
          } finally {
            clearTimeout(retryTo);
          }
        }
      }
    }

    const text = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: {
        ...corsHeaders,
        "Content-Type": resp.headers.get("content-type") ?? "application/json",
        "X-Proxy-Status": String(resp.status),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[autored-proxy] Error:", msg);
    return new Response(
      JSON.stringify({ error: `Proxy error: ${msg}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
