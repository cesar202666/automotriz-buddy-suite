/**
 * gemma-proxy — Proxy hacia Gemma.cl (CRM automotriz GeneXus + ASP.NET WebForms)
 *
 * Auth: Gemma es una SPA GeneXus que construye GXState con JS del cliente —
 * el login programático no funciona sin un browser headless. Por eso usamos
 * **inyección manual de cookies**:
 *
 *   1. El usuario loguea en gemma.cl desde Chrome.
 *   2. Abre DevTools → Application → Cookies → www.gemma.cl
 *   3. Copia los valores de GX_SESSION_ID, ASP.NET_SessionId, GX_CLIENT_ID
 *   4. Los guarda en el secret GEMMA_COOKIES con formato:
 *        "GX_SESSION_ID=xxx; ASP.NET_SessionId=yyy; GX_CLIENT_ID=zzz"
 *
 * Cuando la sesión expira, la página Global avisa "sesión expirada" con el
 * link a /configuracion para actualizar el secret.
 *
 * Secrets necesarios:
 *   - GEMMA_COOKIES: cookie string (ver arriba)
 *   - GEMMA_DISTRIBUIDOR_FILTER: id distribuidor de filtro (default 647)
 *
 * Acciones (POST con { action, params }):
 *   - "dashboard"        → estados + casos abiertos + cursar + validar
 *   - "estadisticas"     → eficiencia por vendedor
 *   - "ingresados_rango" → conteo por día para charts semanal/mensual
 *   - "health"           → verifica si las cookies actuales son válidas
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMMA_BASE = "https://www.gemma.cl/gemma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GemmaRequest {
  action: "dashboard" | "estadisticas" | "ingresados_rango" | "health" | "raw";
  params?: Record<string, string>;
  /** Para action=raw: path relativo al endpoint Gemma (ej "/home.aspx") */
  path?: string;
}

/** Devuelve las cookies guardadas en el secret GEMMA_COOKIES, o "" si no está configurado. */
function getStoredCookies(): string {
  const raw = (Deno.env.get("GEMMA_COOKIES") ?? "").trim();
  if (!raw) return "";
  // Si el usuario pega varios formatos diferentes, normalizamos a "name=value; name=value"
  return raw
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("="))
    .join("; ");
}

const SESSION_EXPIRED_MARKERS = /seclogin\.aspx|vUSUARIO|vCLAVE|notauthorized/i;

// ── Helpers ────────────────────────────────────────────────────────

/** Acumula Set-Cookie headers en un cookie string usable. */
function collectSetCookies(resp: Response): string[] {
  const out: string[] = [];
  for (const [k, v] of resp.headers.entries()) {
    if (k.toLowerCase() === "set-cookie") out.push(v);
  }
  if (out.length === 0) {
    const concat = resp.headers.get("set-cookie");
    if (concat) {
      const parts = concat.split(/,(?=\s*[A-Za-z0-9_\-.]+=)/);
      out.push(...parts);
    }
  }
  return out;
}

/** Une un cookie string anterior con cookies nuevas (las nuevas pisan). */
function mergeCookies(prev: string, fresh: string[]): string {
  const map = new Map<string, string>();
  for (const part of prev.split(";")) {
    const t = part.trim();
    const i = t.indexOf("=");
    if (i > 0) map.set(t.slice(0, i), t.slice(i + 1));
  }
  for (const sc of fresh) {
    const first = sc.split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) {
      const name = first.slice(0, i).trim();
      const value = first.slice(i + 1).trim();
      if (/^(GX_SESSION_ID|ASP\.NET_SessionId|GX_CLIENT_ID|GX_AUTH_TOKEN)$/i.test(name)) {
        map.set(name, value);
      }
    }
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * POST a un endpoint de Gemma usando las cookies stored.
 * Si detecta sesión expirada, devuelve un error específico para que el
 * frontend pueda mostrar el mensaje "actualiza las cookies".
 */
async function gemmaPost(
  path: string,
  formData: Record<string, string>,
): Promise<{ ok: boolean; body: string; status: number; sessionExpired?: boolean }> {
  const cookies = getStoredCookies();
  if (!cookies) {
    return {
      ok: false,
      body: "GEMMA_COOKIES no configurado. Debes pegar las cookies de gemma.cl en Configuración.",
      status: 401,
      sessionExpired: true,
    };
  }

  const distribuidorFilter = Deno.env.get("GEMMA_DISTRIBUIDOR_FILTER") ?? "647";
  const merged: Record<string, string> = {
    vFILTERDISTRIBUIDORID: distribuidorFilter,
    ...formData,
  };

  const body = new URLSearchParams(merged).toString();

  const r = await fetch(`${GEMMA_BASE}${path}`, {
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

  let textBody = "";
  try {
    textBody = await r.text();
  } catch { /* body vacío o error de stream — ok */ }

  const location = r.headers.get("location") || "";
  const expiredByRedirect =
    (r.status === 302 || r.status === 301) &&
    SESSION_EXPIRED_MARKERS.test(location);
  const expiredByBody = r.status === 200 && SESSION_EXPIRED_MARKERS.test(textBody.slice(0, 4000));

  if (expiredByRedirect || expiredByBody) {
    return {
      ok: false,
      body: "Sesión Gemma expirada. Actualiza las cookies en Configuración → Gemma.",
      status: 401,
      sessionExpired: true,
    };
  }

  return {
    ok: r.status >= 200 && r.status < 400,
    body: textBody,
    status: r.status,
  };
}

/** Verifica si las cookies actuales son válidas haciendo una request liviana. */
async function actionHealth() {
  const cookies = getStoredCookies();
  if (!cookies) {
    return { ok: false, sessionExpired: true, reason: "GEMMA_COOKIES vacío" };
  }
  const r = await fetch(`${GEMMA_BASE}/home.aspx`, {
    method: "GET",
    headers: {
      Accept: "text/html,*/*",
      Cookie: cookies,
      "User-Agent": "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
    },
    redirect: "manual",
  });
  const location = r.headers.get("location") || "";
  const text = (await r.text().catch(() => "")).slice(0, 2000);
  const expired = SESSION_EXPIRED_MARKERS.test(location) ||
                  SESSION_EXPIRED_MARKERS.test(text) ||
                  r.status >= 400;
  return {
    ok: !expired,
    sessionExpired: expired,
    status: r.status,
    location,
    cookies_set: cookies.length > 0,
  };
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
  const { ok, body, status, sessionExpired } = await gemmaPost("/home.aspx", formData);
  if (!ok) return { ok: false, status, sessionExpired: !!sessionExpired, error: body.slice(0, 300) };

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
  const { ok, body, status, sessionExpired } = await gemmaPost("/consultaretenidos.aspx", formData);
  if (!ok) return { ok: false, status, sessionExpired: !!sessionExpired, error: body.slice(0, 300) };

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
  const { ok, body, status, sessionExpired } = await gemmaPost("/home.aspx", formData);
  if (!ok) return { ok: false, status, sessionExpired: !!sessionExpired, error: body.slice(0, 300) };

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
      case "health":
        result = await actionHealth();
        break;
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
