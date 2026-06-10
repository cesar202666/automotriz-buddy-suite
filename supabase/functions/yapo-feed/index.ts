/**
 * yapo-feed — Feed XML del stock para la "Importación de XML/XLS" de Yapo.
 *
 * Yapo Pro permite configurar una URL de feed en:
 *   Mis anuncios → Importación de XML/XLS
 * Yapo visita esa URL periodicamente e importa/actualiza los avisos.
 *
 * Rutas (GET):
 *   ?key=<YAPO_IMPORT_APIKEY>             → XML con todos los vehiculos DISPONIBLES
 *   ?foto=<vehiculoId>&n=<indice>         → bytes de la foto N del vehiculo (publica,
 *                                            para que Yapo pueda descargar las imagenes)
 *
 * Las fotos viven como base64 en la columna `fotos` de la tabla vehiculos;
 * este endpoint las decodifica y sirve al vuelo — no requiere Storage.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function xmlEscape(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const cdata = (s: unknown) =>
  `<![CDATA[${String(s ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** Cuerpo estandar del aviso — mismo formato siempre, datos segun el vehiculo. */
function buildBody(v: Record<string, unknown>): string {
  const km = Number(v.kilometraje ?? 0).toLocaleString("es-CL");
  const precio = Number(v.precio_venta ?? 0).toLocaleString("es-CL");
  const equip = Array.isArray(v.equipamiento_extra) && v.equipamiento_extra.length
    ? `✅ Equipamiento extra: ${(v.equipamiento_extra as string[]).join(", ")}\n`
    : "";
  return `🚗 ${String(v.marca ?? "").toUpperCase()} ${String(v.modelo ?? "").toUpperCase()} ${v.anio ?? ""}

✅ Kilometraje: ${km} km
✅ Color: ${v.color || "—"}
✅ Combustible: ${v.combustible || "—"}
✅ Transmisión: ${v.transmision || "—"}
✅ Tracción: ${v.traccion || "—"}
${equip}
💰 Valor: $ ${precio}

📍 Disponible en EGAÑA AUTOMOTRIZ — Av Ferrocarriles km 4, Puerto Montt.
📞 Atendemos todos los días. Recibimos tu auto en parte de pago.
🔧 Vehículo revisado y al día con su documentación.

¡Consúltanos sin compromiso!`;
}

/** Sirve la foto N (indice 0-based) de un vehiculo decodificando su base64. */
async function serveFoto(vehiculoId: string, n: number): Promise<Response> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("vehiculos")
    .select("fotos")
    .eq("id", vehiculoId)
    .single();
  if (error || !data) return new Response("not found", { status: 404 });

  const fotos = (data.fotos as string[] | null)?.filter(Boolean) ?? [];
  const foto = fotos[n];
  if (!foto) return new Response("not found", { status: 404 });

  // URL externa: redirigir
  if (/^https?:\/\//i.test(foto)) {
    return new Response(null, { status: 302, headers: { Location: foto } });
  }
  const m = foto.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return new Response("bad format", { status: 415 });
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400",
      ...corsHeaders,
    },
  });
}

/** Genera el feed XML con todos los vehiculos disponibles. */
async function serveFeed(baseUrl: string): Promise<Response> {
  const supabase = getSupabase();
  // Solo vehiculos que el usuario marco manualmente con "Publicar en Yapo"
  // (ademas de estar DISPONIBLES). Sin publicacion automatica de todo el stock.
  const { data, error } = await supabase
    .from("vehiculos")
    .select("id, patente, marca, modelo, anio, tipo, estado, precio_venta, kilometraje, color, combustible, transmision, traccion, equipamiento_extra, fotos, updated_at")
    .eq("estado", "DISPONIBLE")
    .eq("publicado_yapo", true)
    .order("updated_at", { ascending: false });

  if (error) {
    return new Response(`<?xml version="1.0"?><error>${xmlEscape(error.message)}</error>`, {
      status: 500,
      headers: { "Content-Type": "application/xml; charset=utf-8", ...corsHeaders },
    });
  }

  const adsXml = (data ?? [])
    .filter((v) => v.marca && v.modelo && Number(v.precio_venta) > 0)
    .map((v) => {
      const fotos = (v.fotos as string[] | null)?.filter(Boolean) ?? [];
      const imagenes = fotos
        .slice(0, 8)
        .map((_f, i) => `      <image>${xmlEscape(`${baseUrl}?foto=${v.id}&n=${i}`)}</image>`)
        .join("\n");
      const titulo = `${v.marca} ${v.modelo} ${v.anio}`.trim();
      const gearbox = String(v.transmision ?? "").toLowerCase().includes("auto") ? "Automático" : "Manual";
      return `  <ad>
    <external_id>${xmlEscape(String(v.patente || v.id))}</external_id>
    <title>${cdata(titulo)}</title>
    <description>${cdata(buildBody(v))}</description>
    <category>2020</category>
    <type>sell</type>
    <price>${Number(v.precio_venta ?? 0)}</price>
    <currency>CLP</currency>
    <region>Los Lagos</region>
    <commune>Puerto Montt</commune>
    <brand>${cdata(v.marca)}</brand>
    <model>${cdata(v.modelo)}</model>
    <year>${xmlEscape(v.anio)}</year>
    <mileage>${Number(v.kilometraje ?? 0)}</mileage>
    <fuel>${cdata(v.combustible || "")}</fuel>
    <gearbox>${cdata(gearbox)}</gearbox>
    <color>${cdata(v.color || "")}</color>
    <plate>${xmlEscape(v.patente || "")}</plate>
    <images>
${imagenes}
    </images>
  </ad>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ads count="${(data ?? []).length}" generated="${new Date().toISOString()}">
${adsXml}
</ads>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);

  // Servir foto individual (publica — Yapo necesita descargarlas sin auth)
  const fotoId = url.searchParams.get("foto");
  if (fotoId) {
    const n = parseInt(url.searchParams.get("n") ?? "0", 10) || 0;
    return await serveFoto(fotoId, n);
  }

  // Feed XML: requiere la key para que el stock no sea publico a cualquiera
  const key = url.searchParams.get("key") ?? "";
  const expected = Deno.env.get("YAPO_IMPORT_APIKEY") ?? "";
  if (!expected || key !== expected) {
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }

  // URL publica real de esta funcion (url.origin dentro del runtime no incluye /functions/v1)
  const baseUrl = `${Deno.env.get("SUPABASE_URL") ?? url.origin}/functions/v1/yapo-feed`;
  return await serveFeed(baseUrl);
});
