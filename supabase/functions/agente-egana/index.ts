import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isWithinSchedule(
  horariosConfig: Array<{ dia: string; activo: boolean; inicio: string; fin: string }>,
  now: Date
): boolean {
  const diasMap: Record<number, string> = { 0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' }
  const diaNombre = diasMap[now.getDay()]
  const diaConf = horariosConfig.find(d => d.dia === diaNombre)
  if (!diaConf || !diaConf.activo) return false
  const [hIni, mIni] = diaConf.inicio.split(':').map(Number)
  const [hFin, mFin] = diaConf.fin.split(':').map(Number)
  const totalMinutes = now.getHours() * 60 + now.getMinutes()
  const iniMinutes = hIni * 60 + mIni
  const finMinutes = hFin * 60 + mFin
  return totalMinutes >= iniMinutes && totalMinutes <= finMinutes
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw.toLowerCase()))
}

async function getVendedorAsignado(
  supabase: any,
  modo: string,
  canal: string,
  asignacionPorCanal: Record<string, string>,
  vendedorDefault: string
): Promise<string> {
  if (modo === 'MANUAL') return ''
  if (modo === 'POR_CANAL') return asignacionPorCanal[canal] || vendedorDefault || ''

  const { data: vendedores } = await supabase
    .from('vendedores')
    .select('nombre')
    .eq('activo', true)

  if (!vendedores || vendedores.length === 0) return vendedorDefault || ''

  if (modo === 'RANDOM') {
    const idx = Math.floor(Math.random() * vendedores.length)
    return vendedores[idx].nombre
  }

  // ORDENADO — vendedor con menos leads activos
  const { data: leadsCount } = await supabase
    .from('leads')
    .select('vendedor_asignado')
    .not('etapa', 'in', '("ganado","perdido")')
    .not('vendedor_asignado', 'is', null)

  const countMap: Record<string, number> = {}
  vendedores.forEach(v => { countMap[v.nombre] = 0 })
  ;(leadsCount || []).forEach((l: { vendedor_asignado: string }) => {
    if (l.vendedor_asignado && countMap[l.vendedor_asignado] !== undefined) {
      countMap[l.vendedor_asignado]++
    }
  })

  const sorted = vendedores.sort((a, b) => (countMap[a.nombre] || 0) - (countMap[b.nombre] || 0))
  return sorted[0].nombre
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // ManyChat / meta-webhook fields
    const mensajeCliente: string = body.last_input_text || body.text || ''
    const contactId: string = String(body.contact_id || body.id || '')
    const nombre: string = body.first_name || body.nombre || 'Cliente'
    const apellido: string = body.last_name || ''
    const telefono: string = body.phone || ''
    const canal: string = body.channel || 'manychat'
    const conversationId: string = body.conversation_id || ''

    if (!mensajeCliente || !contactId) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: last_input_text y contact_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Supabase client ──────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Read configuration from configuracion_sistema ────────────────────────
    const { data: configRows } = await supabase
      .from('configuracion_sistema')
      .select('clave, valor')

    const cfg: Record<string, string> = {}
    ;(configRows || []).forEach((r: { clave: string; valor: string }) => { cfg[r.clave] = r.valor })

    const systemPrompt = cfg.AGENT_SYSTEM_PROMPT || 'Eres el asistente virtual de Egaña Automotriz. Atiende al cliente de forma cordial y captura sus datos.'
    const modelRaw = cfg.AGENT_MODEL || 'google/gemini-2.5-flash'
    const maxMessages = Number(cfg.AGENT_MAX_MESSAGES || '10')
    const temperature = Number(cfg.AGENT_TEMPERATURE || '0.7')
    const scoreMinimo = Number(cfg.SCORE_MINIMO_ESCALAR || '60')
    const modoAsignacion = cfg.ASIGNACION_MODO || 'ORDENADO'
    const vendedorDefault = cfg.VENDEDOR_DEFAULT || ''
    const notificarVendedor = (cfg.NOTIFICAR_VENDEDOR || 'true') === 'true'
    const horariosActivos = (cfg.HORARIOS_ACTIVOS || 'false') === 'true'
    const msgFueraHorario = cfg.MENSAJE_FUERA_HORARIO || 'Hola, estamos fuera de horario. Te contactaremos a la brevedad.'

    let palabrasClave: string[] = []
    try { palabrasClave = JSON.parse(cfg.PALABRAS_CLAVE_ESCALAR || '[]') } catch {}

    let asignacionPorCanal: Record<string, string> = {}
    try { asignacionPorCanal = JSON.parse(cfg.ASIGNACION_POR_CANAL || '{}') } catch {}

    let horariosConfig: Array<{ dia: string; activo: boolean; inicio: string; fin: string }> = []
    try { horariosConfig = JSON.parse(cfg.HORARIOS_CONFIG || '[]') } catch {}

    // ── Check schedule ───────────────────────────────────────────────────────
    if (horariosActivos && horariosConfig.length > 0) {
      const nowChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
      if (!isWithinSchedule(horariosConfig, nowChile)) {
        // Save to DB and return out-of-hours message
        await supabase.from('conversaciones').insert({
          contact_id: contactId, nombre, apellido, telefono, canal,
          mensaje_cliente: mensajeCliente,
          respuesta_agente: msgFueraHorario,
          leido: false, notificado_vendedor: false,
        })
        return new Response(
          JSON.stringify({ messages: [{ type: 'text', text: msgFueraHorario }] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── Check message count for conversation (auto-escalate) ─────────────────
    let shouldEscalate = false
    let escalateReason = ''

    if (conversationId) {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
      if ((count || 0) >= maxMessages) {
        shouldEscalate = true
        escalateReason = 'max_messages'
      }
    }

    // ── Check keyword escalation ─────────────────────────────────────────────
    if (!shouldEscalate && palabrasClave.length > 0 && containsKeyword(mensajeCliente, palabrasClave)) {
      shouldEscalate = true
      escalateReason = 'keyword'
    }

    // ── Call AI Gateway ──────────────────────────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY no configurado')

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelRaw,
        max_tokens: 500,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${nombre} dice: ${mensajeCliente}` }
        ]
      })
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      throw new Error(`AI Gateway error [${aiResponse.status}]: ${errText}`)
    }

    const aiData = await aiResponse.json()
    let respuesta: string = aiData.choices?.[0]?.message?.content || 'Hola, gracias por contactarnos. Un vendedor te atenderá pronto.'

    // ── Calculate score from AI response heuristics ───────────────────────────
    let score = 20
    const msgLower = mensajeCliente.toLowerCase()
    if (msgLower.includes('presupuesto') || msgLower.includes('precio') || /\$\d|millones|mil\s/i.test(mensajeCliente)) score += 30
    if (msgLower.includes('pronto') || msgLower.includes('urgente') || msgLower.includes('esta semana')) score += 25
    if (msgLower.includes('marca') || msgLower.includes('modelo') || msgLower.includes('año')) score += 15
    if (telefono) score += 10
    score = Math.min(100, score)

    // ── Score-based escalation ────────────────────────────────────────────────
    if (!shouldEscalate && score >= scoreMinimo) {
      shouldEscalate = true
      escalateReason = 'score'
    }

    // ── Assign vendor if escalating ───────────────────────────────────────────
    let vendedorAsignado = ''
    if (shouldEscalate) {
      vendedorAsignado = await getVendedorAsignado(supabase, modoAsignacion, canal, asignacionPorCanal, vendedorDefault)
      const escalarMsg = `¡Perfecto ${nombre}! Le voy a pasar tus datos a uno de nuestros ejecutivos${vendedorAsignado ? ` (${vendedorAsignado})` : ''} para que te contacte a la brevedad. ¡Gracias por contactarnos!`
      if (escalateReason === 'keyword' || escalateReason === 'max_messages') {
        respuesta = escalarMsg
      }

      // Upsert lead in leads table
      if (conversationId) {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('conversation_id', conversationId)
          .single()

        if (!existingLead) {
          await supabase.from('leads').insert({
            nombre,
            telefono,
            canal: canal === 'manychat' ? 'whatsapp' : canal,
            conversation_id: conversationId,
            etapa: 'contactado',
            score,
            urgencia: score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baja',
            vendedor_asignado: vendedorAsignado,
            notas: `Lead generado automáticamente por el agente IA. Razón de escalación: ${escalateReason}.`,
          })
        } else {
          await supabase
            .from('leads')
            .update({ score, vendedor_asignado: vendedorAsignado, etapa: 'contactado' })
            .eq('id', existingLead.id)
        }
      }

      // Notify vendor (log for now — in production would call notification API)
      if (notificarVendedor && vendedorAsignado) {
        const msgNotif = (cfg.MENSAJE_NOTIFICACION_VENDEDOR || '')
          .replace('{{vendedor}}', vendedorAsignado)
          .replace('{{nombre_cliente}}', nombre)
          .replace('{{canal}}', canal)
          .replace('{{interes}}', mensajeCliente.substring(0, 50))
          .replace('{{telefono}}', telefono || 'No proporcionado')
          .replace('{{score}}', String(score))
        console.log('Notificación vendedor:', msgNotif)
      }
    }

    // ── Save conversation to DB ───────────────────────────────────────────────
    const { error: dbError } = await supabase.from('conversaciones').insert({
      contact_id: contactId,
      nombre,
      apellido,
      telefono,
      canal,
      mensaje_cliente: mensajeCliente,
      respuesta_agente: respuesta,
      leido: false,
      notificado_vendedor: shouldEscalate,
      vendedor_asignado: vendedorAsignado || null,
      urgencia: score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baja',
    })

    if (dbError) console.error('DB insert error:', dbError)

    // ── Return ManyChat-compatible response ───────────────────────────────────
    return new Response(
      JSON.stringify({
        messages: [{ type: 'text', text: respuesta }],
        set_field_values: [
          { field_name: 'ultimo_mensaje_agente', value: respuesta },
          { field_name: 'lead_score', value: String(score) },
          ...(vendedorAsignado ? [{ field_name: 'vendedor_asignado', value: vendedorAsignado }] : []),
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error en agente-egana:', error)
    const msg = error instanceof Error ? error.message : 'Error interno'
    return new Response(
      JSON.stringify({
        messages: [{ type: 'text', text: 'Gracias por contactarnos. Un vendedor te atenderá pronto.' }],
        error: msg
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
