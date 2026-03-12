import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const url = new URL(req.url);
    const estado = url.searchParams.get("estado") ?? "DISPONIBLE";
    const marca = url.searchParams.get("marca");
    const limit = parseInt(url.searchParams.get("limit") ?? "100");

    let query = supabase
      .from("vehiculos")
      .select(`
        id,
        folio,
        patente,
        tipo,
        marca,
        modelo,
        anio,
        estado,
        precio_venta,
        precio_costo,
        sucursal,
        combustible,
        n_motor,
        vin,
        color,
        kilometraje,
        ubicacion,
        comentarios,
        transmision,
        traccion,
        aire_acondicionado,
        equipamiento_extra,
        fotos,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (estado && estado !== "TODOS") {
      query = query.eq("estado", estado);
    }
    if (marca) {
      query = query.ilike("marca", `%${marca}%`);
    }

    const { data, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize field names to match the expected API format
    const autos = (data ?? []).map((v) => ({
      id: v.id,
      folio: v.folio,
      patente: v.patente,
      tipo: v.tipo,
      marca: v.marca,
      modelo: v.modelo,
      anio: v.anio,
      estado: v.estado,
      precio: v.precio_venta,
      precio_costo: v.precio_costo,
      sucursal: v.sucursal,
      combustible: v.combustible,
      n_motor: v.n_motor,
      vin: v.vin,
      color: v.color,
      kilometraje: v.kilometraje,
      ubicacion: v.ubicacion,
      descripcion: v.comentarios,
      transmision: v.transmision,
      traccion: v.traccion,
      aire_acondicionado: v.aire_acondicionado,
      equipamiento_extra: v.equipamiento_extra,
      fotos: v.fotos,
      created_at: v.created_at,
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        total: autos.length,
        filtros: { estado, marca: marca ?? null, limit },
        data: autos,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
