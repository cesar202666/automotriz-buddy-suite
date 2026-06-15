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

/**
 * Cuerpo estandar del aviso — texto plano (sin emojis). Los emojis son
 * caracteres UTF-8 de 4 bytes que muchos importadores de avisos rechazan o
 * muestran como basura; texto plano es 100% confiable y se ve profesional.
 */
function buildBody(v: Record<string, unknown>): string {
  const km = Number(v.kilometraje ?? 0).toLocaleString("es-CL");
  const precio = Number(v.precio_venta ?? 0).toLocaleString("es-CL");
  const lineas: string[] = [];
  lineas.push(`${String(v.marca ?? "").toUpperCase()} ${String(v.modelo ?? "").toUpperCase()} ${v.anio ?? ""}`.trim());
  lineas.push("");
  lineas.push(`- Kilometraje: ${km} km`);
  if (v.color) lineas.push(`- Color: ${v.color}`);
  if (v.combustible) lineas.push(`- Combustible: ${v.combustible}`);
  if (v.transmision) lineas.push(`- Transmision: ${v.transmision}`);
  if (v.traccion) lineas.push(`- Traccion: ${v.traccion}`);
  if (Array.isArray(v.equipamiento_extra) && v.equipamiento_extra.length) {
    lineas.push(`- Equipamiento extra: ${(v.equipamiento_extra as string[]).join(", ")}`);
  }
  lineas.push("");
  lineas.push(`Valor: $ ${precio}`);
  lineas.push("");
  lineas.push("Disponible en EGANA AUTOMOTRIZ - Av Ferrocarriles km 4, Puerto Montt.");
  lineas.push("Atendemos todos los dias. Recibimos tu auto en parte de pago.");
  lineas.push("Vehiculo revisado y al dia con su documentacion.");
  lineas.push("");
  lineas.push("Consultanos sin compromiso!");
  return lineas.join("\n");
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
async function serveFeed(baseUrl: string, forceDownload = false): Promise<Response> {
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

  // Constantes Yapo Chile (del manual oficial de Importacion XML)
  const COUNTRY_ID = "5247";   // Chile
  const REGION_ID = "5324";     // Los Lagos > Puerto Montt (ID oficial Yapo; comuna exacta)
  const CATEGORY_ID = "109";    // Vehiculos > Autos Usados (ID oficial Yapo)
  const AD_TYPE = "auto";       // tipo de aviso: "auto" (Carros) segun manual Yapo
  const EMAIL = Deno.env.get("YAPO_EMAIL") ?? "";

  // Lista oficial de marcas que acepta el campo "make" (del manual Yapo).
  // El feed las normaliza a la grafia exacta (ej: "MAXUS" -> "Maxus").
  const MAKES = [
    "Acadian","Acura","Alfa Romeo","AM General","Amc","American Motors","Argo","ARO","Asia Motors","ASIASTAR","Aston Martin","Audi","Austin","Autorrad","BAIC","Baoya","Bentley","Bestune","BMW","Brilliance","Buick","BYD","GAC Motors","Cadillac","Caterham","Changan","Changhe","Chery","Chevrolet","Chrysler","Citroen","CMC","Commer","Cupra","Dacia","Daewoo","Daihatsu","Datsun","Dayun","DFSK","DMC","Dodge","Dongfeng","DS","Eagle","Exeed","Faw","Ferrari","Fiat","Fisker","Ford","Forthing","Foton","F.S.O.","Fulu","Geely","Genesis","Geo","GMC","Gonow","Great Wall","Hafei","Haima","Haval","Hillman","Honda","Hummer","Hyundai","Infiniti","International","Isuzu","Jac","Jaecoo","Jaguar","Jeep","Jetour","Jiayuan","JMC","Jonway","Kaiyi","Karma","Karry","Kenbo","Kia","KYC","Lada","Lamborghini","Lancia","Land Rover","Landwind","Landking","Leapmotor","Lexus","Lifan","Lincoln","Lynk & Co","Livan","Lotus","Mahindra","Maserati","Maxus","Maybach","Mazda","McLaren","Mercedes Benz","Mercury","Merkur","MG","MINI","Mitsubishi","Morgan","Morris","Nissan","NSU","Oldsmobile","Omoda","Opel","Peugeot","Pininfarina","Plymouth","Polaris","Pontiac","Porsche","Proton","PUMA","Ram","Renault","Riddara","Rolls Royce","Rover","Saab","Saehan","Samsung","Saturn","Scion","Seat","SG","Shineray","Simca","Skoda","SMA","Smart","Soueast","SouthEast","SsangYong","Subaru","Surron","Suzuki","Tata","Tesla","Toyota","Triumph","UAZ","VGV","Volkswagen","Volvo","Willys","Wuling","Yugo","ZAP","Zastava","ZNA","Zotye","ZX Auto",
  ];
  const MAKE_BY_KEY: Record<string, string> = {};
  for (const m of MAKES) MAKE_BY_KEY[m.toUpperCase().replace(/\s+/g, "")] = m;
  // Alias frecuentes en la base que no coinciden literal con la lista Yapo
  const MAKE_ALIASES: Record<string, string> = {
    MERCEDESBENZ: "Mercedes Benz", "MERCEDES-BENZ": "Mercedes Benz", MB: "Mercedes Benz",
    VW: "Volkswagen", CHEVY: "Chevrolet", VOLKSWAGEN: "Volkswagen",
    GREATWALL: "Great Wall", LANDROVER: "Land Rover", ALFAROMEO: "Alfa Romeo",
    SSANGYONG: "SsangYong", MINICOOPER: "MINI",
  };
  const normMake = (raw: string): string => {
    const key = (raw || "").toUpperCase().replace(/[\s.-]+/g, "");
    return MAKE_ALIASES[key] ?? MAKE_BY_KEY[key] ?? (raw || "");
  };

  // Combustible: valores exactos Bencina | Diesel | Hibrido | Electrico | Gas | Otros
  const normFuel = (raw: string): string => {
    const s = (raw || "").toLowerCase();
    if (s.includes("diesel") || s.includes("diésel") || s.includes("petrol")) return "Diesel";
    if (s.includes("hibrid") || s.includes("híbrid")) return "Híbrido";
    if (s.includes("elect") || s.includes("eléct")) return "Eléctrico";
    if (s.includes("gas")) return "Gas";
    if (s.includes("benc") || s.includes("gasolin")) return "Bencina";
    return "Bencina";
  };

  // Transmision: valores exactos Automatica | Manual | 5+ | Otros
  const normTrans = (raw: string): string => {
    const s = (raw || "").toLowerCase();
    if (s.includes("auto")) return "Automática";
    if (s.includes("manual") || s.includes("mecán") || s.includes("mecan")) return "Manual";
    return "Manual";
  };

  const itemsXml = (data ?? [])
    .filter((v) => v.marca && v.modelo && Number(v.precio_venta) > 0)
    .map((v) => {
      const fotos = (v.fotos as string[] | null)?.filter(Boolean) ?? [];
      const pictures = fotos
        .slice(0, 8)
        .map((_f, i) => `          <picture>${cdata(`${baseUrl}?foto=${v.id}&n=${i}`)}</picture>`)
        .join("\n");
      const titulo = `${v.marca} ${v.modelo} ${v.anio}`.trim().slice(0, 50);
      const sourceid = String(v.patente || v.id);
      // Campos obligatorios del aviso de auto (vistos en el formulario demo):
      // Marca, Modelo, Moneda, Precio, Año, Kilometros, Combustible, Transmision
      return `    <item>
      <required>
        <ad>
          <sourceid>${cdata(sourceid)}</sourceid>
          <countryid>${cdata(COUNTRY_ID)}</countryid>
          <categoryid>${cdata(CATEGORY_ID)}</categoryid>
          <regionid>${cdata(REGION_ID)}</regionid>
          <type>${cdata(AD_TYPE)}</type>
          <title>${cdata(titulo)}</title>
          <make>${cdata(normMake(String(v.marca ?? "")))}</make>
          <model>${cdata(v.modelo)}</model>
          <currency>${cdata("CLP")}</currency>
          <price>${cdata(String(Number(v.precio_venta ?? 0)))}</price>
          <year>${cdata(String(v.anio ?? ""))}</year>
          <mileage>${cdata(String(Number(v.kilometraje ?? 0)))}</mileage>
          <fuel>${cdata(normFuel(String(v.combustible ?? "")))}</fuel>
          <trans>${cdata(normTrans(String(v.transmision ?? "")))}</trans>
        </ad>
        <contact>
          <email>${cdata(EMAIL)}</email>
          <phone>${cdata("")}</phone>
          <contact>${cdata("EGANA AUTOMOTRIZ")}</contact>
          <city>${cdata("Puerto Montt")}</city>
        </contact>
      </required>
      <optional>
        <ad>
          <descr>${cdata(buildBody(v))}</descr>
          ${v.color ? `<extcolor>${cdata(String(v.color))}</extcolor>` : ""}
${pictures}
        </ad>
      </optional>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<import>
  <settings>
    <type>${cdata(AD_TYPE)}</type>
    <language>${cdata("es")}</language>
  </settings>
  <items>
${itemsXml}
  </items>
</import>`;

  // ?download=1 → fuerza descarga del archivo feed.xml (para importacion manual).
  // octet-stream + attachment hace que TODO navegador lo baje en vez de mostrarlo.
  const headers: Record<string, string> = forceDownload
    ? {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="feed.xml"',
        ...corsHeaders,
      }
    : { "Content-Type": "application/xml; charset=utf-8", ...corsHeaders };

  return new Response(xml, { headers });
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
  const forceDownload = url.searchParams.get("download") === "1";
  return await serveFeed(baseUrl, forceDownload);
});
