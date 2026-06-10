/**
 * yapo-publish — Publica un aviso en Yapo.cl Pro usando la API de import.
 *
 * Arquitectura:
 *   1. Recibe del frontend: datos del vehiculo + URLs (o dataURLs) de las fotos + texto del aviso.
 *   2. Construye el payload segun el formato de Yapo (XML o JSON, depende del endpoint).
 *   3. Envia a Yapo Pro Import API con auth (userid + apikey).
 *   4. Devuelve resultado al frontend.
 *
 * Secrets requeridos en Supabase:
 *   - YAPO_USERID: id de usuario Yapo Pro
 *   - YAPO_IMPORT_APIKEY: api key para el endpoint de import
 *   - YAPO_SLUG: slug del perfil profesional
 *   - YAPO_SLUG_APIKEY: api key alternativa
 *   - YAPO_EMAIL: email asociado a la cuenta
 *
 * Acciones (POST con { action, ... }):
 *   - "test"         → verifica que las credenciales son validas (probe)
 *   - "preview"      → genera el XML/JSON que se enviaria, sin publicar (debug)
 *   - "publish"      → publica el aviso real
 *   - "delete"       → borra un aviso existente por external_id
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Bucket público donde subimos las fotos para que Yapo pueda descargarlas. */
const YAPO_BUCKET = "yapo-fotos";

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
  comentarios?: string;
  equipamientoExtra?: string[];
  aireAcondicionado?: boolean;
  ubicacion?: string;
  externalId?: string; // ID propio para identificar el aviso (ej: folio + patente)
}

interface PublishRequest {
  action: "test" | "preview" | "publish" | "delete";
  vehiculo?: VehiculoYapo;
  /** URLs publicas de las fotos (Yapo necesita URLs, no base64) */
  fotos?: string[];
  /** Cuerpo del texto del aviso (descripcion final) */
  cuerpo?: string;
  /** Titulo del aviso (default: marca + modelo + anio) */
  titulo?: string;
  /** Categoria de Yapo: "autos" suele ser 2020 */
  categoryId?: number;
  /** Region (Los Lagos = 11) */
  regionId?: number;
  /** Comuna (Puerto Montt = 12601 segun catalogo Yapo) */
  comunaId?: number;
  /** Para action=delete */
  externalIdToDelete?: string;
}

function getCreds() {
  return {
    userid: Deno.env.get("YAPO_USERID") ?? "",
    importApiKey: Deno.env.get("YAPO_IMPORT_APIKEY") ?? "",
    slug: Deno.env.get("YAPO_SLUG") ?? "",
    slugApiKey: Deno.env.get("YAPO_SLUG_APIKEY") ?? "",
    email: Deno.env.get("YAPO_EMAIL") ?? "",
  };
}

/** Cliente Supabase con service role (acceso a Storage). */
function getSupabase() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, serviceKey);
}

/** Decodifica un data URL (data:image/jpeg;base64,XXXX) a bytes + mime. */
function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string; ext: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  const mime = m[1] || "image/jpeg";
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { bytes, mime, ext };
}

/** Asegura que el bucket público exista. */
async function ensureBucket(supabase: ReturnType<typeof getSupabase>) {
  const { data } = await supabase.storage.getBucket(YAPO_BUCKET);
  if (!data) {
    await supabase.storage.createBucket(YAPO_BUCKET, {
      public: true,
      fileSizeLimit: "15MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
  }
}

/**
 * Convierte las fotos (data URLs base64) en URLs públicas subiéndolas a Storage.
 * Las que ya son http(s) se dejan pasar tal cual.
 * Devuelve { urls, errores }.
 */
async function fotosAUrlsPublicas(
  fotos: string[],
  externalId: string,
): Promise<{ urls: string[]; errores: string[] }> {
  const urls: string[] = [];
  const errores: string[] = [];
  const supabase = getSupabase();
  await ensureBucket(supabase);

  let idx = 0;
  for (const foto of fotos) {
    idx++;
    if (/^https?:\/\//i.test(foto)) {
      urls.push(foto);
      continue;
    }
    const decoded = decodeDataUrl(foto);
    if (!decoded) {
      errores.push(`Foto ${idx}: formato no reconocido (se omite)`);
      continue;
    }
    const safeId = externalId.replace(/[^a-zA-Z0-9_-]/g, "");
    const path = `${safeId}/foto_${String(idx).padStart(2, "0")}.${decoded.ext}`;
    const { error: upErr } = await supabase.storage
      .from(YAPO_BUCKET)
      .upload(path, decoded.bytes, { contentType: decoded.mime, upsert: true });
    if (upErr) {
      errores.push(`Foto ${idx}: ${upErr.message}`);
      continue;
    }
    const { data: pub } = supabase.storage.from(YAPO_BUCKET).getPublicUrl(path);
    if (pub?.publicUrl) urls.push(pub.publicUrl);
    else errores.push(`Foto ${idx}: no se pudo obtener URL pública`);
  }
  return { urls, errores };
}

/** Genera el XML que Yapo Pro Import API espera. */
function buildYapoXml(req: PublishRequest): string {
  const v = req.vehiculo!;
  const externalId = v.externalId || `${v.patente}_${Date.now()}`;
  const titulo = req.titulo || `${v.marca} ${v.modelo} ${v.anio}`.trim();
  const cuerpo = req.cuerpo || "";
  const categoryId = req.categoryId ?? 2020; // Autos
  const regionId = req.regionId ?? 11;       // Los Lagos
  const comunaId = req.comunaId ?? 12601;    // Puerto Montt

  const escapeXml = (s: string) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const cdata = (s: string) => `<![CDATA[${String(s ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

  const fotos = req.fotos ?? [];
  const fotosXml = fotos
    .map((url, i) => `    <image position="${i + 1}"><url>${escapeXml(url)}</url></image>`)
    .join("\n");

  // Parametros específicos de la categoría AUTOS en Yapo
  // brand, model, version, year, km, fuel, transmission, condition, mileage, currency
  const params: Array<[string, string | number]> = [
    ["brand", v.marca],
    ["model", v.modelo],
    ["year", v.anio],
    ["mileage", v.kilometraje],
    ["color", v.color || ""],
    ["fuel", v.combustible || ""],
    ["transmission", v.transmision || ""],
    ["condition", "used"], // siempre usado
    ["currency", "CLP"],
  ];
  const paramsXml = params
    .map(([k, val]) => `    <param name="${escapeXml(k)}">${cdata(String(val))}</param>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ads>
  <ad>
    <external_id>${escapeXml(externalId)}</external_id>
    <category>${categoryId}</category>
    <subject>${cdata(titulo)}</subject>
    <body>${cdata(cuerpo)}</body>
    <price>${v.precio}</price>
    <currency>CLP</currency>
    <region>${regionId}</region>
    <comuna>${comunaId}</comuna>
    <email>${escapeXml(Deno.env.get("YAPO_EMAIL") ?? "")}</email>
    <phone></phone>
${paramsXml}
    <images>
${fotosXml}
    </images>
  </ad>
</ads>`;
}

/** Llama al endpoint de import de Yapo Pro. */
async function callYapoImport(xml: string): Promise<{ ok: boolean; status: number; body: string }> {
  const { userid, importApiKey } = getCreds();
  if (!userid || !importApiKey) {
    return { ok: false, status: 500, body: "Faltan credenciales YAPO_USERID o YAPO_IMPORT_APIKEY" };
  }

  // El endpoint público de import de Yapo Pro Chile.
  // Si Yapo cambia la URL, basta actualizar acá.
  const importUrl = `https://import.yapo.cl/import?user_id=${userid}&api_key=${importApiKey}`;

  try {
    const resp = await fetch(importUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        Accept: "application/xml, text/xml, application/json, text/plain, */*",
        "User-Agent": "Egana-Automotriz-ERP/1.0",
      },
      body: xml,
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, body: text };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}

/** Acciones ───────────────────────────────────────────────────── */

function actionTest() {
  const creds = getCreds();
  return {
    ok: !!(creds.userid && creds.importApiKey),
    has_userid: !!creds.userid,
    has_import_apikey: !!creds.importApiKey,
    has_slug: !!creds.slug,
    has_slug_apikey: !!creds.slugApiKey,
    has_email: !!creds.email,
    userid_preview: creds.userid ? creds.userid.slice(0, 4) + "***" : "",
    email_preview: creds.email,
    slug: creds.slug,
  };
}

function actionPreview(req: PublishRequest) {
  if (!req.vehiculo) return { ok: false, error: "Falta vehiculo en el payload" };
  const xml = buildYapoXml(req);
  return { ok: true, xml };
}

async function actionPublish(req: PublishRequest) {
  if (!req.vehiculo) return { ok: false, error: "Falta vehiculo en el payload" };
  if (!req.fotos || req.fotos.length === 0) {
    return { ok: false, error: "Yapo requiere al menos 1 foto" };
  }

  // 1. Subir las fotos base64 a Storage → URLs públicas que Yapo puede descargar.
  const externalId = req.vehiculo.externalId || `${req.vehiculo.patente}_${Date.now()}`;
  const { urls, errores } = await fotosAUrlsPublicas(req.fotos, externalId);
  if (urls.length === 0) {
    return { ok: false, error: "No se pudo subir ninguna foto a Storage", detalle: errores };
  }

  // 2. Construir el XML usando las URLs públicas (no base64).
  const xml = buildYapoXml({ ...req, fotos: urls });
  const result = await callYapoImport(xml);
  return {
    ok: result.ok,
    status: result.status,
    response: result.body.slice(0, 4000),
    fotos_subidas: urls.length,
    fotos_errores: errores,
    xml_sent: xml,
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
        result = actionTest();
        break;
      case "preview":
        result = actionPreview(body);
        break;
      case "publish":
        result = await actionPublish(body);
        break;
      case "delete":
        result = { ok: false, error: "Eliminar aviso aun no implementado (necesita endpoint Yapo de delete)" };
        break;
      default:
        return new Response(
          JSON.stringify({ ok: false, error: `action desconocida: ${body.action}` }),
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
