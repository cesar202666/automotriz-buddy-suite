/**
 * autored-proxy — Proxy hacia AutoRed Analytics API
 *
 * Soluciona dos problemas:
 * 1. CORS: la API de AutoRed no permite llamadas desde nuestro dominio.
 * 2. Token: el JWT se guarda en Supabase secrets (AUTORED_TOKEN),
 *    nunca en el frontend ni en localStorage. Si expira, basta
 *    actualizar el secret y todos los usuarios siguen funcionando.
 *
 * Uso desde el frontend:
 *   POST/GET https://<project>.supabase.co/functions/v1/autored-proxy
 *   Body o querystring incluye:
 *     - path: la ruta interna de AutoRed (ej: "/brands" o "/prices/search")
 *     - method (opcional, default GET): "GET" | "POST"
 *     - body (opcional para POST): objeto JSON con el payload
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const AUTORED_BASE = "https://analytics.autored.cl/api";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("AUTORED_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({
          error:
            "AUTORED_TOKEN no configurado en secrets de Supabase. Actualízalo con: supabase secrets set AUTORED_TOKEN=...",
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

    // Reenviar a AutoRed con el token del secret
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
          "User-Agent":
            "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
        },
        body: method === "POST" && body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await resp.text();

    // Devolver el status original + body + CORS
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
