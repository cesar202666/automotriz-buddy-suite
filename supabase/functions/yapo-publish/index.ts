/**
 * yapo-publish — Publica avisos en Yapo.cl usando la API oficial de partners.
 *
 * Flujo de la API Yapo (segun github.com/yapo/example_partners):
 *   1. POST a https://m.yapo.cl/api/newad.json con app_id → devuelve authorize.challenge
 *   2. hash = SHA1(challenge + apiKey)   (el challenge dura ~6 min)
 *   3. action=upload_image con la imagen en base64 → devuelve newad.image_id
 *   4. action=insert_ad con todos los campos + image_id0..N → newad.status == "TRANS_OK"
 *
 * Secrets requeridos en Supabase:
 *   - YAPO_USERID         (se usa como app_id)
 *   - YAPO_IMPORT_APIKEY  (se usa para el hash SHA1)
 *   - YAPO_SLUG, YAPO_SLUG_APIKEY, YAPO_EMAIL
 *
 * Acciones (POST con { action, ... }):
 *   - "test"      → pide un challenge a Yapo (verifica endpoint + app_id)
 *   - "cars_data" → consulta el catalogo de marcas/modelos de Yapo (debug)
 *   - "publish"   → publica el aviso completo (sube fotos + inserta aviso)
 *   - "raw"       → envia parametros arbitrarios autenticados (exploracion/debug)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const YAPO_API = "https://m.yapo.cl";
const NEWAD_URL = `${YAPO_API}/api/newad.json`;
const CARS_DATA_URL = `${YAPO_API}/api/cars_data.json`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VehiculoYapo {
  patente: string;
  marca: string;
  modelo: string;
  anio: string;
  kilometraje: number;
  precio: number;
  color: string;
  combustible: string;
  transmision?: string;
  traccion?: string;
  tipo?: string;
  externalId?: string;
}

interface PublishRequest {
  action: "test" | "cars_data" | "publish" | "raw";
  vehiculo?: VehiculoYapo;
  /** Fotos como data URLs base64 (data:image/jpeg;base64,...) */
  fotos?: string[];
  cuerpo?: string;
  titulo?: string;
  /** Region Yapo (Los Lagos = 10 por defecto) */
  regionId?: string;
  /** Comuna Yapo (Puerto Montt) */
  communeId?: string;
  /** Telefono de contacto del aviso */
  phone?: string;
  /** Para action=raw / cars_data: parametros arbitrarios */
  params?: Record<string, string>;
}

function getCreds() {
  return {
    appId: Deno.env.get("YAPO_USERID") ?? "",
    apiKey: Deno.env.get("YAPO_IMPORT_APIKEY") ?? "",
    slug: Deno.env.get("YAPO_SLUG") ?? "",
    slugApiKey: Deno.env.get("YAPO_SLUG_APIKEY") ?? "",
    email: Deno.env.get("YAPO_EMAIL") ?? "",
  };
}

/** SHA1 en hex minusculas (igual que sha1() de PHP). */
async function sha1Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** POST multipart/form-data (equivalente a http_post_fields de PHP). */
async function postForm(url: string, fields: Record<string, string>): Promise<{ status: number; json: unknown; raw: string }> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const resp = await fetch(url, { method: "POST", body: form });
  const raw = await resp.text();
  let json: unknown = null;
  try { json = JSON.parse(raw); } catch { /* respuesta no-JSON */ }
  return { status: resp.status, json, raw };
}

/** Paso 1: obtener el challenge enviando solo el app_id. */
async function getChallenge(url = NEWAD_URL, appIdOverride?: string): Promise<{ challenge: string | null; raw: string; status: number }> {
  const appId = appIdOverride || getCreds().appId;
  const { status, json, raw } = await postForm(url, { app_id: appId });
  const challenge =
    (json as { authorize?: { challenge?: string | number } })?.authorize?.challenge?.toString() ?? null;
  return { challenge, raw, status };
}

/** Paso 1+2: obtener challenge y calcular el hash de autenticacion. */
async function authPair(url = NEWAD_URL): Promise<{ appId: string; hash: string } | { error: string; raw: string }> {
  const { appId, apiKey } = getCreds();
  if (!appId || !apiKey) return { error: "Faltan YAPO_USERID o YAPO_IMPORT_APIKEY", raw: "" };
  const { challenge, raw } = await getChallenge(url);
  if (!challenge) return { error: "Yapo no devolvio challenge", raw: raw.slice(0, 800) };
  const hash = await sha1Hex(challenge + apiKey);
  return { appId, hash };
}

/** Extrae el base64 puro de un data URL. */
function base64FromDataUrl(dataUrl: string): string | null {
  const m = dataUrl.match(/^data:[^;]+;base64,(.*)$/);
  return m ? m[1] : null;
}

/** Paso 3: subir una imagen base64. Devuelve image_id o null. */
async function uploadImage(b64: string): Promise<{ imageId: string | null; raw: string }> {
  const auth = await authPair();
  if ("error" in auth) return { imageId: null, raw: auth.error + " " + auth.raw };
  const { status: _s, json, raw } = await postForm(NEWAD_URL, {
    app_id: auth.appId,
    hash: auth.hash,
    action: "upload_image",
    image: b64,
  });
  const imageId =
    (json as { newad?: { image_id?: string | number } })?.newad?.image_id?.toString() ?? null;
  return { imageId, raw: raw.slice(0, 800) };
}

/** Mapea combustible del ERP al codigo Yapo (1=Bencina, 2=Diesel, 3=Gas, 4=Electrico/Hibrido). */
function fuelCode(combustible: string): string {
  const c = (combustible || "").toLowerCase();
  if (c.includes("diesel") || c.includes("diésel") || c.includes("petrol")) return "2";
  if (c.includes("gas")) return "3";
  if (c.includes("elect") || c.includes("hibrid") || c.includes("híbrid")) return "4";
  return "1"; // bencina
}

/** Mapea transmision al codigo Yapo (1=Manual, 2=Automatico). */
function gearboxCode(transmision: string): string {
  return (transmision || "").toLowerCase().includes("auto") ? "2" : "1";
}

// ── Acciones ──────────────────────────────────────────────────

async function actionTest(req?: PublishRequest) {
  const creds = getCreds();
  const probe = await getChallenge(NEWAD_URL, req?.params?.app_id);
  return {
    ok: !!probe.challenge,
    endpoint: NEWAD_URL,
    challenge_recibido: probe.challenge ? "si (" + probe.challenge.slice(0, 6) + "...)" : "no",
    http_status: probe.status,
    respuesta_yapo: probe.raw.slice(0, 600),
    has_userid: !!creds.appId,
    has_import_apikey: !!creds.apiKey,
    email: creds.email,
    slug: creds.slug,
  };
}

async function actionCarsData(req: PublishRequest) {
  const auth = await authPair(CARS_DATA_URL);
  if ("error" in auth) return { ok: false, error: auth.error, raw: auth.raw };
  const { status, json, raw } = await postForm(CARS_DATA_URL, {
    app_id: auth.appId,
    hash: auth.hash,
    ...(req.params ?? {}),
  });
  return { ok: status === 200, status, data: json ?? raw.slice(0, 4000) };
}

async function actionRaw(req: PublishRequest) {
  const auth = await authPair();
  if ("error" in auth) return { ok: false, error: auth.error, raw: auth.raw };
  const { status, json, raw } = await postForm(NEWAD_URL, {
    app_id: auth.appId,
    hash: auth.hash,
    ...(req.params ?? {}),
  });
  return { ok: status === 200, status, data: json ?? raw.slice(0, 4000) };
}

async function actionPublish(req: PublishRequest) {
  const v = req.vehiculo;
  if (!v) return { ok: false, error: "Falta vehiculo en el payload" };
  if (!req.fotos?.length) return { ok: false, error: "Se requiere al menos 1 foto" };

  const creds = getCreds();

  // 1. Subir las fotos (Yapo acepta base64 directo via upload_image)
  const imageIds: string[] = [];
  const fotosErrores: string[] = [];
  let i = 0;
  for (const foto of req.fotos.slice(0, 8)) { // Yapo permite max ~8 fotos por aviso
    i++;
    const b64 = base64FromDataUrl(foto);
    if (!b64) { fotosErrores.push(`Foto ${i}: no es data URL base64`); continue; }
    const up = await uploadImage(b64);
    if (up.imageId) imageIds.push(up.imageId);
    else fotosErrores.push(`Foto ${i}: ${up.raw.slice(0, 200)}`);
  }
  if (imageIds.length === 0) {
    return { ok: false, error: "No se pudo subir ninguna foto a Yapo", detalle: fotosErrores };
  }

  // 2. Insertar el aviso
  const auth = await authPair();
  if ("error" in auth) return { ok: false, error: auth.error, raw: auth.raw };

  const titulo = req.titulo || `${v.marca} ${v.modelo} ${v.anio}`.trim();
  const fields: Record<string, string> = {
    app_id: auth.appId,
    hash: auth.hash,
    action: "insert_ad",
    category: "2020",            // Autos, camionetas y 4x4
    type: "s",                   // venta
    subject: titulo.slice(0, 60),
    body: (req.cuerpo || "").slice(0, 4000),
    price: String(v.precio || 0),
    name: "Egaña Automotriz",
    email: creds.email,
    phone: req.phone || "",
    region: req.regionId || "10",      // X Region de Los Lagos
    communes: req.communeId || "",     // Puerto Montt (Yapo lo infiere por region si va vacio)
    import: "1",
    external_ad_id: (v.externalId || v.patente || "").replace(/[^a-zA-Z0-9_-]/g, ""),
    // Datos del auto (campos del ejemplo oficial de Yapo)
    brand: v.marca,
    model: v.modelo,
    version: "",
    regdate: v.anio,
    mileage: String(v.kilometraje || 0),
    gearbox: gearboxCode(v.transmision || ""),
    fuel: fuelCode(v.combustible),
    cartype: "1",
    plates: v.patente || "",
  };
  imageIds.forEach((id, idx) => { fields[`image_id${idx}`] = id; });

  const { status, json, raw } = await postForm(NEWAD_URL, fields);
  const newad = (json as { newad?: { status?: string; ad_id?: string | number } })?.newad;
  const transOk = newad?.status === "TRANS_OK";

  return {
    ok: transOk,
    yapo_status: newad?.status ?? "desconocido",
    ad_id: newad?.ad_id ?? null,
    http_status: status,
    fotos_subidas: imageIds.length,
    fotos_errores: fotosErrores,
    respuesta_yapo: (json ? JSON.stringify(json) : raw).slice(0, 3000),
  };
}

// ── Handler ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json()) as PublishRequest;
    let result: unknown;
    switch (body.action) {
      case "test":
        result = await actionTest(body);
        break;
      case "cars_data":
        result = await actionCarsData(body);
        break;
      case "raw":
        result = await actionRaw(body);
        break;
      case "publish":
        result = await actionPublish(body);
        break;
      default:
        return new Response(
          JSON.stringify({ ok: false, error: `action desconocida: ${(body as { action?: string }).action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
