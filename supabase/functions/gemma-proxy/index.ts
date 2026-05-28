/**
 * gemma-proxy — Proxy hacia Gemma.cl (CRM automotriz GeneXus + ASP.NET WebForms)
 *
 * Características:
 * 1. Login con cookies (GX_SESSION_ID, ASP.NET_SessionId, GX_CLIENT_ID)
 *    guardadas en cache en memoria del worker.
 * 2. Auto-refresh: si Gemma redirige a seclogin.aspx, hace login de nuevo
 *    automáticamente y reintenta la request.
 * 3. Parser GeneXus → JSON limpio: convierte arrays-de-arrays con campos
 *    posicionales en objetos con nombres legibles.
 *
 * Secrets necesarios en Supabase:
 *   - GEMMA_USUARIO: RUT con guión (ej: 16911092-1)
 *   - GEMMA_CLAVE: contraseña
 *   - GEMMA_DISTRIBUIDOR_ID: id de URL alternativo (default 1257261690)
 *   - GEMMA_DISTRIBUIDOR_FILTER: id filtro distribuidor (default 647)
 *
 * Endpoints expuestos (POST con { action, params }):
 *   - "dashboard"        → estados + casos abiertos + cursar + validar
 *   - "estadisticas"     → tabla de eficiencia por vendedor
 *   - "ingresados_rango" → ingresados entre dos fechas (para charts semanal/mensual)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMMA_BASE = "https://www.gemma.cl/gemma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Sesión en memoria del worker (vive mientras dure el contenedor) ──
let cachedCookies: string = "";
let cachedAt: number = 0;
const COOKIE_TTL_MS = 25 * 60 * 1000; // 25 min (sesión típica ASP.NET = 30 min)

interface GemmaRequest {
  action: "dashboard" | "estadisticas" | "ingresados_rango" | "raw";
  params?: Record<string, string>;
  /** Para action=raw: path relativo al endpoint Gemma (ej "/home.aspx") */
  path?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Extrae cookies relevantes (GX_SESSION_ID, ASP.NET_SessionId, GX_CLIENT_ID) de Set-Cookie. */
function extractCookies(setCookieHeaders: string[]): string {
  const cookies: Record<string, string> = {};
  for (const sc of setCookieHeaders) {
    // Tomar solo "nombre=valor" antes del primer ;
    const firstPart = sc.split(";")[0];
    const eq = firstPart.indexOf("=");
    if (eq < 0) continue;
    const name = firstPart.slice(0, eq).trim();
    const value = firstPart.slice(eq + 1).trim();
    if (/^(GX_SESSION_ID|ASP\.NET_SessionId|GX_CLIENT_ID)$/i.test(name)) {
      cookies[name] = value;
    }
  }
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/** Hace login en Gemma y devuelve el cookie string, o null si falla. */
async function doGemmaLogin(): Promise<string | null> {
  const usuario = Deno.env.get("GEMMA_USUARIO") ?? "";
  const clave = Deno.env.get("GEMMA_CLAVE") ?? "";
  const distribuidorAlt = Deno.env.get("GEMMA_DISTRIBUIDOR_ID") ?? "1257261690";

  if (!usuario || !clave) {
    console.error("[gemma-proxy] Faltan secrets GEMMA_USUARIO/GEMMA_CLAVE");
    return null;
  }

  try {
    const body = new URLSearchParams({
      vUSUARIO: usuario,
      vCLAVE: clave,
      _EventName: "EACEPTAR",
    }).toString();

    const resp = await fetch(`${GEMMA_BASE}/seclogin.aspx?${distribuidorAlt}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
        Origin: "https://www.gemma.cl",
        Referer: `${GEMMA_BASE}/seclogin.aspx`,
      },
      body,
      redirect: "manual",
    });

    // Recoger TODAS las cookies de Set-Cookie (puede haber varias)
    const setCookieHeaders: string[] = [];
    // Deno fetch expone Set-Cookie como entries múltiples
    for (const [k, v] of resp.headers.entries()) {
      if (k.toLowerCase() === "set-cookie") setCookieHeaders.push(v);
    }
    // Algunos runtimes concatenan con coma; tratamos también ese caso
    const concat = resp.headers.get("set-cookie");
    if (concat && setCookieHeaders.length === 0) {
      // Separar respetando "expires=Day, DD-MMM-YYYY" que contiene coma
      const parts = concat.split(/,(?=\s*[A-Za-z0-9_\-\.]+=)/);
      setCookieHeaders.push(...parts);
    }

    const cookieStr = extractCookies(setCookieHeaders);
    if (!cookieStr) {
      console.error(`[gemma-proxy] Login OK pero no se obtuvieron cookies. Status=${resp.status}`);
      return null;
    }
    console.log(`[gemma-proxy] Login OK. cookies=${cookieStr.length}b`);
    return cookieStr;
  } catch (e) {
    console.error("[gemma-proxy] Excepción en login:", e);
    return null;
  }
}

/** Devuelve cookies válidas: usa cache, hace login si caducó. */
async function getValidCookies(force = false): Promise<string | null> {
  const now = Date.now();
  if (!force && cachedCookies && now - cachedAt < COOKIE_TTL_MS) {
    return cachedCookies;
  }
  const fresh = await doGemmaLogin();
  if (fresh) {
    cachedCookies = fresh;
    cachedAt = now;
    return fresh;
  }
  return null;
}

/**
 * Hace POST a un endpoint de Gemma con cookies. Si detecta redirect a seclogin.aspx
 * (sesión expiró), hace re-login y reintenta una vez.
 */
async function gemmaPost(
  path: string,
  formData: Record<string, string>,
  retryOn401 = true,
): Promise<{ ok: boolean; body: string; status: number }> {
  let cookies = await getValidCookies();
  if (!cookies) return { ok: false, body: "Sin sesión Gemma", status: 401 };

  const distribuidorFilter = Deno.env.get("GEMMA_DISTRIBUIDOR_FILTER") ?? "647";
  const merged: Record<string, string> = {
    vFILTERDISTRIBUIDORID: distribuidorFilter,
    ...formData,
  };

  const body = new URLSearchParams(merged).toString();

  let resp = await fetch(`${GEMMA_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Cookie: cookies,
      Gsajaxrequest: "1",
      Origin: "https://www.gemma.cl",
      Referer: `${GEMMA_BASE}/`,
      "User-Agent": "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
    },
    body,
    redirect: "manual",
  });

  // Si redirige a seclogin.aspx, la sesión expiró
  const expiredByRedirect =
    (resp.status === 302 || resp.status === 301) &&
    (resp.headers.get("location") || "").toLowerCase().includes("seclogin.aspx");
  const expiredByBody = resp.status === 200 && (await peekIfLoginPage(resp));

  if ((expiredByRedirect || expiredByBody) && retryOn401) {
    console.log("[gemma-proxy] Sesión expirada, re-login y reintento...");
    cookies = await getValidCookies(true);
    if (!cookies) return { ok: false, body: "No se pudo re-loguear en Gemma", status: 401 };
    resp = await fetch(`${GEMMA_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/javascript, */*; q=0.01",
        Cookie: cookies,
        Gsajaxrequest: "1",
        Origin: "https://www.gemma.cl",
        Referer: `${GEMMA_BASE}/`,
        "User-Agent": "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
      },
      body,
      redirect: "manual",
    });
  }

  const text = await resp.text();
  return { ok: resp.ok || resp.status === 200, body: text, status: resp.status };
}

/** Peek: lee el principio del body para detectar si Gemma sirvió la página de login. */
async function peekIfLoginPage(resp: Response): Promise<boolean> {
  try {
    const clone = resp.clone();
    const text = await clone.text();
    return /seclogin\.aspx|vUSUARIO|vCLAVE/i.test(text.slice(0, 4000));
  } catch {
    return false;
  }
}

// ── Parsers GeneXus → JSON limpio ─────────────────────────────────

/**
 * Intenta extraer un objeto JSON desde el body GeneXus que suele venir como:
 *   gx.fx.b.exec(...)  o  gx.ajax.processResponse({...})
 * y a veces concatenado con otro contenido. Buscamos el primer { ... } válido.
 */
function extractGenexusJson(raw: string): Record<string, unknown> | null {
  // Intento 1: el body ya es JSON puro
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch { /* try next */ }
  }
  // Intento 2: buscar el primer "{" balanceado
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch { /* keep scanning */ }
      }
    }
  }
  return null;
}

/** Mapea un row de GridContainerDataV (casos abiertos) a objeto. */
function mapCasoAbierto(row: unknown[]): Record<string, unknown> {
  return {
    codigo: row[1] ?? "",
    fecha: row[2] ?? "",
    dias: Number(row[3] ?? 0),
    estado: row[4] ?? "",
    estado_consolidado: row[5] ?? "",
    cliente_nombre: row[6] ?? "",
    cliente_apellido: row[7] ?? "",
    cliente_full: row[8] ?? "",
    precio: Number(row[9] ?? 0),
    pct_pie: Number(row[10] ?? 0),
    saldo_precio: Number(row[11] ?? 0),
    marca: row[12] ?? "",
    modelo: row[13] ?? "",
    anio: row[14] ?? "",
    simulacion_id: row[15] ?? "",
    cliente_rut: row[16] ?? "",
    cliente_tipo: row[17] ?? "",
    vendedor: row[18] ?? "",
    cuota: row[19] ?? "",
  };
}

/** Mapea un row de Cursadas/Validados a objeto. */
function mapGestion(row: unknown[]): Record<string, unknown> {
  return {
    simulacion_id: row[0] ?? "",
    estado: row[1] ?? "",
    codigo: row[2] ?? "",
    fecha: row[3] ?? "",
    tipo: row[4] ?? "",
    distribuidor_id: row[5] ?? "",
    distribuidor_nombre: row[6] ?? "",
    ejecutivo: row[7] ?? "",
    vendedor: row[8] ?? "",
    cliente_nombre: row[9] ?? "",
    cliente_apellido: row[10] ?? "",
    cliente_materno: row[11] ?? "",
    cliente_display: row[12] ?? "",
    saldo_precio: Number(row[13] ?? 0),
  };
}

/** Mapea un row de estadísticas por vendedor (consultaretenidos). */
function mapEstadistica(row: unknown[]): Record<string, unknown> {
  return {
    vendedor: row[0] ?? "",
    solicitudes: Number(row[1] ?? 0),
    aprobadas: Number(row[2] ?? 0),
    pct_aprobacion: Number(row[3] ?? 0),
    cursadas: Number(row[4] ?? 0),
    pct_cierre: Number(row[5] ?? 0),
    pct_eficiencia: Number(row[6] ?? 0),
  };
}

// ── Acciones principales ──────────────────────────────────────────

async function actionDashboard(params: Record<string, string>) {
  const formData: Record<string, string> = {
    vFILTERSECUSERRUT: params.vendedor_rut ?? "",
    vFILTERSUCURSALID: params.sucursal_id ?? "0",
    vFILTERSECUSERSECUSEREJECUTIVORUT: "",
    SIMULACIONESTADO_0001: "4",
    SIMULACIONESTADOCONSOLIDADO_0001: "2",
  };
  const { ok, body, status } = await gemmaPost("/home.aspx", formData);
  if (!ok) return { ok: false, status, error: body.slice(0, 300) };

  const json = extractGenexusJson(body) ?? {};

  // Estadísticas laterales
  const estados = (json.MPW0046vSDTESTADOS as Array<Record<string, unknown>> | undefined) ?? [];

  // Grids
  const casosRaw = (json.GridContainerDataV as unknown[][] | undefined) ?? [];
  const cursarRaw = (json.GridcursarContainerDataV as unknown[][] | undefined) ?? [];
  const validRaw = (json.GridvalContainerDataV as unknown[][] | undefined) ?? [];

  return {
    ok: true,
    estados: estados.map((e) => ({
      estado: e.Estado ?? "",
      cantidad: Number(e.Cantidad ?? 0),
      simulacion_estado: Number(e.SimulacionEstado ?? 0),
    })),
    casos_abiertos: casosRaw.map(mapCasoAbierto),
    cursar: cursarRaw.map(mapGestion),
    validar: validRaw.map(mapGestion),
    totales: {
      aprobadas:
        estados.find((e) => /aprobad/i.test(String(e.Estado)))?.Cantidad ?? 0,
      rechazadas:
        estados.find((e) => /rechazad/i.test(String(e.Estado)))?.Cantidad ?? 0,
      casos_abiertos: casosRaw.length,
      cursar: cursarRaw.length,
      validar: validRaw.length,
    },
  };
}

async function actionEstadisticas(params: Record<string, string>) {
  const formData: Record<string, string> = {
    vFILTERSECUSERRUT: params.vendedor_rut ?? "",
    _EventName: "EREFRESCAR",
  };
  const { ok, body, status } = await gemmaPost("/consultaretenidos.aspx", formData);
  if (!ok) return { ok: false, status, error: body.slice(0, 300) };

  const json = extractGenexusJson(body) ?? {};
  // Buscar la grid principal — el nombre puede variar; aceptamos cualquier
  // propiedad cuyo nombre matchee Grid.*ContainerDataV
  let rows: unknown[][] = [];
  for (const k of Object.keys(json)) {
    if (/Grid.*ContainerDataV$/i.test(k) && Array.isArray((json as Record<string, unknown>)[k])) {
      rows = (json as Record<string, unknown>)[k] as unknown[][];
      break;
    }
  }
  return {
    ok: true,
    estadisticas: rows.map(mapEstadistica),
  };
}

/**
 * Ingresados entre dos fechas. Llama a home.aspx con vFILTERFECHADESDE/HASTA
 * y devuelve el conteo de casos por día para construir charts semanal/mensual.
 */
async function actionIngresadosRango(params: Record<string, string>) {
  const desde = params.desde; // ej "21/05/2026"
  const hasta = params.hasta; // ej "28/05/2026"
  if (!desde || !hasta) {
    return { ok: false, status: 400, error: "Faltan params desde/hasta (DD/MM/YYYY)" };
  }
  const formData: Record<string, string> = {
    vFILTERSECUSERRUT: params.vendedor_rut ?? "",
    vFILTERSUCURSALID: params.sucursal_id ?? "0",
    vFILTERFECHADESDE: desde,
    vFILTERFECHAHASTA: hasta,
  };
  const { ok, body, status } = await gemmaPost("/home.aspx", formData);
  if (!ok) return { ok: false, status, error: body.slice(0, 300) };

  const json = extractGenexusJson(body) ?? {};
  const casosRaw = (json.GridContainerDataV as unknown[][] | undefined) ?? [];
  const casos = casosRaw.map(mapCasoAbierto);

  // Agrupar por fecha (DD/MM/YYYY)
  const byDay = new Map<string, number>();
  for (const c of casos) {
    const f = String(c.fecha || "").split(" ")[0]; // "27/05/2026 20:01" → "27/05/2026"
    if (!f) continue;
    byDay.set(f, (byDay.get(f) || 0) + 1);
  }
  const serie = Array.from(byDay.entries())
    .map(([fecha, count]) => ({ fecha, ingresados: count }))
    .sort((a, b) => {
      const [dA, mA, yA] = a.fecha.split("/").map(Number);
      const [dB, mB, yB] = b.fecha.split("/").map(Number);
      return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
    });

  return {
    ok: true,
    desde,
    hasta,
    total: casos.length,
    serie,
  };
}

// ── Handler principal ─────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let reqBody: GemmaRequest;
    if (req.method === "POST") {
      reqBody = (await req.json()) as GemmaRequest;
    } else {
      const url = new URL(req.url);
      reqBody = {
        action: (url.searchParams.get("action") as GemmaRequest["action"]) ?? "dashboard",
        params: Object.fromEntries(url.searchParams.entries()),
      };
    }

    const { action, params = {} } = reqBody;
    let result: unknown;
    switch (action) {
      case "dashboard":
        result = await actionDashboard(params);
        break;
      case "estadisticas":
        result = await actionEstadisticas(params);
        break;
      case "ingresados_rango":
        result = await actionIngresadosRango(params);
        break;
      case "raw": {
        const { ok, body, status } = await gemmaPost(reqBody.path ?? "/home.aspx", params);
        result = { ok, status, body };
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `action desconocida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemma-proxy] Error:", msg);
    return new Response(JSON.stringify({ error: `Proxy error: ${msg}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
