/**
 * gemma-proxy — Proxy hacia Gemma.cl (CRM automotriz GeneXus + ASP.NET WebForms)
 *
 * Estrategia "nunca expira", misma logica que aplicamos en autored-proxy:
 *
 *   1. Las cookies viven en la tabla public.gemma_session (singleton id=1).
 *   2. Cada request del usuario:
 *      - Lee cookies de la BD
 *      - Envia a Gemma
 *      - Si Gemma responde con Set-Cookie, MERGEAMOS y guardamos de vuelta
 *        (Gemma renueva la session a cada hit valido)
 *   3. Un cron de Supabase (pg_cron) llama action=keepalive cada 5 min
 *      para hacer un GET ligero a home.aspx. Esto extiende el timeout
 *      por inactividad → la session NUNCA expira mientras el usuario y/o
 *      el server hagan ping antes de 30 min.
 *   4. Cuando finalmente expira (server-side: solo si el cron muere o
 *      Gemma invalida la sesion manualmente), marcamos expired=TRUE y
 *      la UI muestra el form para pegar cookies frescas — esto deberia
 *      pasar muy rara vez (medido en semanas o meses).
 *
 * Acciones (POST con { action, params }):
 *   - "dashboard"        → estados + casos abiertos + cursar + validar
 *   - "estadisticas"     → eficiencia por vendedor
 *   - "ingresados_rango" → conteo por dia para charts
 *   - "keepalive"        → ping ligero a home.aspx (lo llama el cron)
 *   - "health"           → estado actual (NO toca Gemma, solo lee BD)
 *   - "set_cookies"      → guarda cookies frescas (UI form)
 *   - "raw"              → debug: POST arbitrario a un path
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMMA_BASE = "https://www.gemma.cl/gemma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SESSION_EXPIRED_MARKERS = /seclogin\.aspx|vUSUARIO|vCLAVE|notauthorized/i;

interface GemmaRequest {
  action:
    | "dashboard"
    | "estadisticas"
    | "ingresados_rango"
    | "keepalive"
    | "health"
    | "set_cookies"
    | "raw";
  params?: Record<string, string>;
  path?: string;
  cookies?: string;
  updated_by?: string;
}

interface SessionRow {
  id: number;
  cookies: string;
  updated_at: string;
  updated_by: string | null;
  last_ping_at: string | null;
  last_ping_ok: boolean | null;
  last_ping_status: number | null;
  expired: boolean;
  notes: string | null;
}

// ── Supabase client (service role para bypass RLS) ─────────────
function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

// ── Cookie helpers ────────────────────────────────────────────

/** Acumula Set-Cookie headers en string normalizado. */
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

/** Une un cookie string anterior con Set-Cookie nuevos. */
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
      // Solo conservamos las cookies de sesión Gemma
      if (/^(GX_SESSION_ID|ASP\.NET_SessionId|GX_CLIENT_ID|GX_AUTH_TOKEN)$/i.test(name)) {
        map.set(name, value);
      }
    }
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Normaliza un string de cookies pegado por el usuario. */
function normalizePastedCookies(raw: string): string {
  return raw
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("="))
    .join("; ");
}

// ── BD: leer y escribir gemma_session ─────────────────────────

async function loadSession(): Promise<SessionRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("gemma_session")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[gemma-proxy] error leyendo gemma_session:", error.message);
    return null;
  }
  return data as SessionRow | null;
}

async function persistCookies(
  cookies: string,
  meta: Partial<SessionRow> = {},
): Promise<void> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {
    cookies,
    updated_at: new Date().toISOString(),
    ...meta,
  };
  const { error } = await sb
    .from("gemma_session")
    .update(patch)
    .eq("id", 1);
  if (error) {
    console.error("[gemma-proxy] error guardando cookies:", error.message);
  }
}

async function markExpired(reason: string): Promise<void> {
  const sb = getSupabase();
  await sb
    .from("gemma_session")
    .update({
      expired: true,
      last_ping_at: new Date().toISOString(),
      last_ping_ok: false,
      notes: reason.slice(0, 500),
    })
    .eq("id", 1);
}

// ── Core: POST a Gemma con cookies + auto-persist ─────────────

async function gemmaPost(
  path: string,
  formData: Record<string, string>,
): Promise<{ ok: boolean; body: string; status: number; sessionExpired?: boolean }> {
  const sess = await loadSession();
  if (!sess || !sess.cookies || sess.expired) {
    return {
      ok: false,
      status: 401,
      body: sess?.expired
        ? "Sesión Gemma expirada. Pega cookies frescas en /global."
        : "Sin cookies Gemma configuradas. Pega cookies en /global.",
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
      Cookie: sess.cookies,
      Gsajaxrequest: "1",
      Origin: "https://www.gemma.cl",
      Referer: `${GEMMA_BASE}/`,
      "User-Agent": "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
    },
    body,
    redirect: "manual",
  });

  // (1) Capturar Set-Cookie y mergear → persistir si cambio algo
  const fresh = collectSetCookies(r);
  if (fresh.length > 0) {
    const merged2 = mergeCookies(sess.cookies, fresh);
    if (merged2 && merged2 !== sess.cookies) {
      await persistCookies(merged2, {
        last_ping_at: new Date().toISOString(),
        last_ping_ok: true,
        last_ping_status: r.status,
      });
      console.log(`[gemma-proxy] cookies renovadas via ${path}`);
    } else {
      // Aunque no cambio, marcar el ping como exitoso
      await persistCookies(sess.cookies, {
        last_ping_at: new Date().toISOString(),
        last_ping_ok: true,
        last_ping_status: r.status,
      });
    }
  }

  // (2) Leer body
  let textBody = "";
  try { textBody = await r.text(); } catch { /* */ }

  // (3) Detectar expiración
  const location = r.headers.get("location") || "";
  const expiredByRedirect =
    (r.status === 302 || r.status === 301) &&
    SESSION_EXPIRED_MARKERS.test(location);
  const expiredByBody = r.status === 200 &&
    SESSION_EXPIRED_MARKERS.test(textBody.slice(0, 4000));

  if (expiredByRedirect || expiredByBody) {
    await markExpired(
      expiredByRedirect ? `redirect a ${location.slice(0, 100)}` : "body contiene login",
    );
    return {
      ok: false,
      status: 401,
      body: "Sesión Gemma expirada. Pega cookies frescas en /global.",
      sessionExpired: true,
    };
  }

  return {
    ok: r.status >= 200 && r.status < 400,
    body: textBody,
    status: r.status,
  };
}

// ── Parsers GeneXus → JSON limpio ─────────────────────────────

function extractGenexusJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch { /* */ }
  }
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
        try { return JSON.parse(candidate); } catch { /* keep scanning */ }
      }
    }
  }
  return null;
}

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

// ── Acciones ───────────────────────────────────────────────────

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
  const estados = (json.MPW0046vSDTESTADOS as Array<Record<string, unknown>> | undefined) ?? [];
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
  let rows: unknown[][] = [];
  for (const k of Object.keys(json)) {
    if (/Grid.*ContainerDataV$/i.test(k) && Array.isArray((json as Record<string, unknown>)[k])) {
      rows = (json as Record<string, unknown>)[k] as unknown[][];
      break;
    }
  }
  return { ok: true, estadisticas: rows.map(mapEstadistica) };
}

async function actionIngresadosRango(params: Record<string, string>) {
  const desde = params.desde;
  const hasta = params.hasta;
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

  const byDay = new Map<string, number>();
  for (const c of casos) {
    const f = String(c.fecha || "").split(" ")[0];
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

  return { ok: true, desde, hasta, total: casos.length, serie };
}

/**
 * keepalive — Hace un GET ligero a home.aspx para extender la session.
 * Captura el Set-Cookie y persiste la actualizacion en BD.
 * Llamado por cron pg_cron cada 5 minutos.
 */
async function actionKeepalive() {
  const sess = await loadSession();
  if (!sess || !sess.cookies) {
    return { ok: false, reason: "no_cookies", sessionExpired: true };
  }
  if (sess.expired) {
    return { ok: false, reason: "marked_expired", sessionExpired: true };
  }

  const r = await fetch(`${GEMMA_BASE}/home.aspx`, {
    method: "GET",
    headers: {
      Accept: "text/html,*/*",
      Cookie: sess.cookies,
      Referer: `${GEMMA_BASE}/`,
      "User-Agent": "Mozilla/5.0 (Egana-Automotriz-ERP/1.0)",
    },
    redirect: "manual",
  });

  const fresh = collectSetCookies(r);
  const location = r.headers.get("location") || "";
  const text = (await r.text().catch(() => "")).slice(0, 2000);

  const expired =
    SESSION_EXPIRED_MARKERS.test(location) ||
    SESSION_EXPIRED_MARKERS.test(text) ||
    r.status >= 400;

  if (expired) {
    await markExpired(
      `keepalive falló: status=${r.status} loc=${location.slice(0, 80)}`,
    );
    return { ok: false, status: r.status, sessionExpired: true, location };
  }

  // OK: persist cookies + last_ping_at
  const merged = fresh.length > 0 ? mergeCookies(sess.cookies, fresh) : sess.cookies;
  await persistCookies(merged, {
    last_ping_at: new Date().toISOString(),
    last_ping_ok: true,
    last_ping_status: r.status,
    expired: false,
  });
  return {
    ok: true,
    status: r.status,
    cookies_renewed: fresh.length > 0,
  };
}

/** health — Estado actual SIN tocar Gemma (rápido, no consume sesión). */
async function actionHealth() {
  const sess = await loadSession();
  if (!sess || !sess.cookies) {
    return { ok: false, sessionExpired: true, reason: "no_cookies", cookies_set: false };
  }
  return {
    ok: !sess.expired,
    sessionExpired: sess.expired,
    cookies_set: true,
    updated_at: sess.updated_at,
    updated_by: sess.updated_by,
    last_ping_at: sess.last_ping_at,
    last_ping_ok: sess.last_ping_ok,
    last_ping_status: sess.last_ping_status,
    notes: sess.notes,
  };
}

/** set_cookies — UI form: guarda cookies nuevas y resetea expired. */
async function actionSetCookies(req: GemmaRequest) {
  const raw = (req.cookies ?? "").trim();
  if (!raw) return { ok: false, error: "Cookies vacías" };
  const normalized = normalizePastedCookies(raw);
  if (!normalized.includes("GX_SESSION_ID") && !normalized.includes("ASP.NET_SessionId")) {
    return {
      ok: false,
      error: "Faltan GX_SESSION_ID y/o ASP.NET_SessionId. Revisa que copiaste las cookies correctas.",
    };
  }
  await persistCookies(normalized, {
    updated_by: req.updated_by ?? "manual",
    expired: false,
    last_ping_at: null,
    last_ping_ok: null,
    last_ping_status: null,
    notes: null,
  });
  // Validar inmediato con un keepalive
  const validation = await actionKeepalive();
  return { ok: validation.ok, validation };
}

// ── Handler principal ─────────────────────────────────────────

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
        action: (url.searchParams.get("action") as GemmaRequest["action"]) ?? "health",
        params: Object.fromEntries(url.searchParams.entries()),
      };
    }

    const { action, params = {} } = reqBody;
    let result: unknown;
    switch (action) {
      case "health":         result = await actionHealth(); break;
      case "keepalive":      result = await actionKeepalive(); break;
      case "set_cookies":    result = await actionSetCookies(reqBody); break;
      case "dashboard":      result = await actionDashboard(params); break;
      case "estadisticas":   result = await actionEstadisticas(params); break;
      case "ingresados_rango": result = await actionIngresadosRango(params); break;
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
