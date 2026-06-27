import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Recibe un mensaje del formulario de la web pública (Auto Path) y lo inserta
// DIRECTO en el CRM del ERP — sin pasar por ManyChat. Crea contacto, conversación,
// mensaje entrante y lead, y asigna un vendedor con la MISMA lógica que el resto
// de los canales. El canal queda como "web" (la UI lo muestra como "Web Egaña").

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHANNEL = 'web'

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v)
}

/** Normaliza teléfono: deja dígitos (y + inicial). Vacío si claramente inválido. */
function normalizePhone(raw: string): string {
  if (!raw) return ''
  const cleaned = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
  const digits = cleaned.replace(/^\+/, '')
  if (digits.length < 7) return ''
  return cleaned
}

interface RotacionVendedor {
  vendedor_id: string
  nombre: string
  activo: boolean
  consecutivos: number
}

/** Misma lógica de asignación que agente-egana (ORDENADO / POR_CANAL / RANDOM / rotación). */
// deno-lint-ignore no-explicit-any
async function getVendedorAsignado(
  supabase: any,
  modo: string,
  canal: string,
  asignacionPorCanal: Record<string, string>,
  vendedorDefault: string,
): Promise<string> {
  const { data: vendedoresActivos } = await supabase
    .from('vendedores')
    .select('nombre')
    .eq('activo', true)
    .eq('rol', 'vendedor')

  const nombresActivos = new Set(
    (vendedoresActivos || []).map((v: { nombre: string }) => (v.nombre || '').trim()),
  )
  const isElegible = (n: string) => !!n && nombresActivos.has(n.trim())

  if (modo === 'MANUAL') return ''
  if (modo === 'POR_CANAL') {
    const candidato = asignacionPorCanal[canal] || vendedorDefault || ''
    if (isElegible(candidato)) return candidato
  }

  // Rotación configurada
  const { data: rotacionRow } = await supabase
    .from('configuracion_sistema')
    .select('valor')
    .eq('clave', 'ROTACION_VENDEDORES')
    .maybeSingle()

  let rotacionList: RotacionVendedor[] = []
  try { rotacionList = JSON.parse(rotacionRow?.valor || '[]') } catch { /* ignore */ }

  const activeRotacion = rotacionList.filter(
    (v) => v.activo && nombresActivos.has((v.nombre || '').trim()),
  )

  if (activeRotacion.length > 0) {
    const { data: chosen, error: rpcErr } = await supabase.rpc(
      'asignar_siguiente_vendedor',
      { _rotacion: activeRotacion },
    )
    if (!rpcErr && typeof chosen === 'string' && chosen.trim() && isElegible(chosen)) {
      return chosen
    }
  }

  const { data: vendedores } = await supabase
    .from('vendedores')
    .select('nombre')
    .eq('activo', true)
    .eq('rol', 'vendedor')

  if (!vendedores || vendedores.length === 0) {
    return isElegible(vendedorDefault) ? vendedorDefault : ''
  }

  if (modo === 'RANDOM') {
    return vendedores[Math.floor(Math.random() * vendedores.length)].nombre
  }

  // ORDENADO — vendedor con menos leads activos
  const { data: leadsCount } = await supabase
    .from('leads')
    .select('vendedor_asignado')
    .not('etapa', 'in', '("ganado","perdido")')
    .not('vendedor_asignado', 'is', null)

  const countMap: Record<string, number> = {}
  vendedores.forEach((v: { nombre: string }) => { countMap[v.nombre] = 0 })
  ;(leadsCount || []).forEach((l: { vendedor_asignado: string }) => {
    if (l.vendedor_asignado && countMap[l.vendedor_asignado] !== undefined) {
      countMap[l.vendedor_asignado]++
    }
  })

  return vendedores.sort((a: { nombre: string }, b: { nombre: string }) =>
    (countMap[a.nombre] || 0) - (countMap[b.nombre] || 0)
  )[0].nombre
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as Record<string, unknown>

    const nombre = str(body.nombre) || str(body.name) || 'Cliente Web'
    const phone = normalizePhone(str(body.telefono) || str(body.phone))
    const email = str(body.email)
    const mensaje = str(body.mensaje) || str(body.message)
    // Contexto opcional: auto que estaba viendo (para el campo "interés" del lead).
    const interes = str(body.interes) || str(body.vehiculo)

    if (!mensaje) {
      return new Response(JSON.stringify({ ok: false, error: 'Falta el mensaje.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!phone && !email) {
      return new Response(JSON.stringify({ ok: false, error: 'Deja un teléfono o un email para poder contactarte.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ID estable del contacto web (para no duplicar si escribe de nuevo).
    const subscriberId = `web:${phone || email}`

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Config de asignación ────────────────────────────────────────────────
    const { data: cfgRows } = await supabase
      .from('configuracion_sistema')
      .select('clave, valor')
      .in('clave', ['ASIGNACION_MODO', 'VENDEDOR_DEFAULT', 'ASIGNACION_POR_CANAL'])

    const cfg: Record<string, string> = {}
    ;(cfgRows || []).forEach((r: { clave: string; valor: string }) => { cfg[r.clave] = r.valor })
    const modo = (cfg.ASIGNACION_MODO || 'ORDENADO').toUpperCase()
    const vendedorDefault = cfg.VENDEDOR_DEFAULT || ''
    let asignacionPorCanal: Record<string, string> = {}
    try { asignacionPorCanal = JSON.parse(cfg.ASIGNACION_POR_CANAL || '{}') } catch { /* ignore */ }

    const vendedor = await getVendedorAsignado(supabase, modo, CHANNEL, asignacionPorCanal, vendedorDefault)

    // ── 1. Upsert contact ──────────────────────────────────────────────────
    const { data: contactData, error: contactError } = await supabase
      .from('contacts')
      .upsert(
        {
          manychat_subscriber_id: subscriberId,
          name: nombre,
          phone,
          email,
          channel: CHANNEL,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'manychat_subscriber_id', ignoreDuplicates: false },
      )
      .select('id')
      .single()

    if (contactError || !contactData) throw new Error('No se pudo guardar el contacto')
    const contactId: string = contactData.id

    // ── 2. Get or create conversation ──────────────────────────────────────
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('contact_id', contactId)
      .eq('channel', CHANNEL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let conversationId: string
    const convFields = {
      last_message: mensaje,
      last_message_at: new Date().toISOString(),
      status: 'active',
      assigned_to: vendedor || '',
      // El lead web lo toma un vendedor directamente (no hay agente IA en la web).
      escalated: true,
      escalated_at: new Date().toISOString(),
      escalated_to: vendedor || '',
    }

    if (convData) {
      conversationId = convData.id
      await supabase
        .from('conversations')
        .update({ ...convFields, unread_count: (convData.unread_count || 0) + 1 })
        .eq('id', conversationId)
    } else {
      const { data: newConv, error: newConvError } = await supabase
        .from('conversations')
        .insert({ contact_id: contactId, channel: CHANNEL, unread_count: 1, ...convFields })
        .select('id')
        .single()
      if (newConvError || !newConv) throw new Error('No se pudo crear la conversación')
      conversationId = newConv.id
    }

    // ── 3. Insert inbound message ──────────────────────────────────────────
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      contact_id: contactId,
      direction: 'inbound',
      content: mensaje,
      channel: CHANNEL,
      sent_at: new Date().toISOString(),
    })

    // ── 4. Crear o actualizar lead ─────────────────────────────────────────
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('contact_id', contactId)
      .maybeSingle()

    if (!existingLead) {
      await supabase.from('leads').insert({
        contact_id: contactId,
        conversation_id: conversationId,
        nombre,
        telefono: phone,
        email,
        canal: CHANNEL,
        etapa: 'nuevo',
        score: 0,
        urgencia: 'media',
        interes,
        presupuesto: '',
        vendedor_asignado: vendedor || '',
        notas: mensaje.substring(0, 500),
      })
    } else {
      await supabase
        .from('leads')
        .update({
          telefono: phone || undefined,
          email: email || undefined,
          interes: interes || undefined,
          vendedor_asignado: vendedor || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLead.id)
    }

    return new Response(
      JSON.stringify({ ok: true, vendedor: vendedor || null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    console.error('Error en web-lead:', error)
    const msg = error instanceof Error ? error.message : 'Error interno'
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
