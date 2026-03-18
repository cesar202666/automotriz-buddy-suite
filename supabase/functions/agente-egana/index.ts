import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface HorarioConfig {
  dia: string
  activo: boolean
  inicio: string
  fin: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWithinSchedule(horariosConfig: HorarioConfig[], now: Date): boolean {
  const diasMap: Record<number, string> = {
    0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
    4: 'Jueves', 5: 'Viernes', 6: 'Sábado',
  }
  const diaNombre = diasMap[now.getDay()]
  const diaConf = horariosConfig.find(d => d.dia === diaNombre)
  if (!diaConf || !diaConf.activo) return false
  const [hIni, mIni] = diaConf.inicio.split(':').map(Number)
  const [hFin, mFin] = diaConf.fin.split(':').map(Number)
  const totalMinutes = now.getHours() * 60 + now.getMinutes()
  return totalMinutes >= hIni * 60 + mIni && totalMinutes <= hFin * 60 + mFin
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw.toLowerCase()))
}

function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+/g) || []
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EganaBot/1.0)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 2000)
  } catch { return '' }
}

async function getVendedorAsignado(
  supabase: ReturnType<typeof createClient>,
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
    return vendedores[Math.floor(Math.random() * vendedores.length)].nombre
  }

  // ORDENADO — menor carga de leads activos
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

  return vendedores.sort((a, b) => (countMap[a.nombre] || 0) - (countMap[b.nombre] || 0))[0].nombre
}

/** Get last N messages for conversation memory */
async function getConversationHistory(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  limit = 10
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (!conversationId) return []

  const { data: msgs } = await supabase
    .from('messages')
    .select('direction, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!msgs || msgs.length === 0) return []

  return msgs.map((m: { direction: string; content: string }) => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant',
    content: m.content,
  }))
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json()

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

    // ── Supabase client ────────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── If already escalated → save message but do NOT reply with AI ──────────
    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('escalated')
        .eq('id', conversationId)
        .single()

      if (conv?.escalated) {
        await Promise.all([
          supabase.from('messages').insert({
            conversation_id: conversationId,
            contact_id: contactId || null,
            direction: 'inbound',
            content: mensajeCliente,
            channel: canal,
          }),
          supabase.from('conversaciones').insert({
            contact_id: contactId, nombre, apellido, telefono, canal,
            mensaje_cliente: mensajeCliente,
            respuesta_agente: '',
            leido: false, notificado_vendedor: true, escalada: true,
          }),
        ])
        return new Response(
          JSON.stringify({ messages: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── Read configuration ─────────────────────────────────────────────────────
    const { data: configRows } = await supabase
      .from('configuracion_sistema')
      .select('clave, valor')

    const cfg: Record<string, string> = {}
    ;(configRows || []).forEach((r: { clave: string; valor: string }) => { cfg[r.clave] = r.valor })

    const modelRaw = cfg.AGENT_MODEL || 'google/gemini-2.5-flash'
    const maxMessages = Number(cfg.AGENT_MAX_MESSAGES || '20')
    const temperature = Number(cfg.AGENT_TEMPERATURE || '0.7')
    const scoreMinimo = Number(cfg.SCORE_MINIMO_ESCALAR || '60')
    const modoAsignacion = cfg.ASIGNACION_MODO || 'ORDENADO'
    const vendedorDefault = cfg.VENDEDOR_DEFAULT || ''
    const notificarVendedor = (cfg.NOTIFICAR_VENDEDOR || 'true') === 'true'
    const horariosActivos = (cfg.HORARIOS_ACTIVOS || 'true') === 'true'

    let palabrasClave: string[] = []
    try { palabrasClave = JSON.parse(cfg.PALABRAS_CLAVE_ESCALAR || '[]') } catch {}

    let asignacionPorCanal: Record<string, string> = {}
    try { asignacionPorCanal = JSON.parse(cfg.ASIGNACION_POR_CANAL || '{}') } catch {}

    let horariosConfig: HorarioConfig[] = []
    try { horariosConfig = JSON.parse(cfg.HORARIOS_CONFIG || '[]') } catch {}

    // ── Determine if within business hours ────────────────────────────────────
    const nowChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
    const dentroHorario = horariosActivos && horariosConfig.length > 0
      ? isWithinSchedule(horariosConfig, nowChile)
      : true  // si horarios desactivados, siempre "dentro"

    // ── Build system prompt based on schedule ─────────────────────────────────
    const horaStr = nowChile.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    const fechaStr = nowChile.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

    let systemPrompt: string

    if (dentroHorario) {
      // ── DENTRO DE HORARIO: Saluda y traspasa de inmediato ──────────────────
      systemPrompt = `Eres el asistente virtual de Egaña Automotriz, una automotora en Puerto Montt, Chile. Tu nombre es "Asistente Egaña". Atiendes por WhatsApp, Instagram y Facebook.

HOY ES: ${fechaStr} a las ${horaStr} (horario Chile).
ESTADO: DENTRO DE HORARIO DE ATENCIÓN.

TU MISIÓN en este turno:
1. Saluda al cliente amablemente por su nombre si lo conoces.
2. Agradece su interés en Egaña Automotriz.
3. Indícale que en este momento HAY VENDEDORES DISPONIBLES y que uno lo contactará DE INMEDIATO.
4. Pídele SOLO lo necesario para pasar al vendedor: nombre completo (si no lo tienes), teléfono de contacto (si no lo tienes), y el vehículo o tipo de auto que le interesa.
5. Una vez que tengas esos datos básicos (o si ya los tienes), dile que ya pasaste su contacto al equipo de ventas.

REGLAS:
- Máximo 3 líneas por respuesta.
- Usa español chileno informal pero respetuoso (po, bacán, etc. si aplica).
- No des precios ni especificaciones técnicas detalladas, eso es tarea del vendedor.
- Si el cliente ya dio sus datos, CONFIRMA el traspaso al vendedor y no hagas más preguntas.
- Ejemplo de respuesta ideal: "¡Hola [nombre]! Qué buena que nos escribes 😊 Tenemos vendedores disponibles ahora mismo. ¿Me confirmas tu nombre completo y el vehículo que te interesa para pasarte con uno de nuestros ejecutivos de inmediato?"
`
    } else {
      // ── FUERA DE HORARIO: Captura datos completos ──────────────────────────
      const msgFueraHorario = cfg.MENSAJE_FUERA_HORARIO || 'Estamos fuera de horario.'
      systemPrompt = `Eres el asistente virtual de Egaña Automotriz, una automotora en Puerto Montt, Chile. Tu nombre es "Asistente Egaña".

HOY ES: ${fechaStr} a las ${horaStr} (horario Chile).
ESTADO: FUERA DE HORARIO DE ATENCIÓN. Nuestro horario es de Lunes a Viernes 09:30 a 19:00 hrs, Sábado 10:00 a 14:00 hrs.

TU MISIÓN fuera de horario:
1. Saluda al cliente e infórmale amablemente que estamos fuera de horario.
2. Asegúrale que UN VENDEDOR LO CONTACTARÁ EN CUANTO ESTÉ DISPONIBLE.
3. Para que el vendedor pueda ayudarlo mejor, recopila TODOS estos datos (uno por uno, no todos a la vez):
   - Nombre completo
   - Número de teléfono de contacto
   - Vehículo de interés (marca, modelo, año aproximado si lo sabe)
   - Medio de pago preferido (contado, crédito, permuta con vehículo propio)
   - Presupuesto aproximado (opcional, si quiere indicarlo)
4. Una vez que tengas nombre, teléfono y vehículo de interés como mínimo, CONFIRMA que dejaste el mensaje y que el vendedor lo contactará.

REGLAS:
- Máximo 3 líneas por respuesta.
- Usa español chileno informal pero respetuoso.
- Sé empático: entiende que el cliente quizás tiene urgencia y valida su consulta.
- Pide los datos de a uno para que la conversación sea natural, no como un formulario.
- Ejemplo: "¡Hola! Gracias por escribirnos 😊 En este momento estamos fuera de horario (atendemos Lunes a Viernes de 09:30 a 19:00 hrs), pero con gusto dejo tu mensaje para que un vendedor te contacte apenas abramos. ¿Me dices tu nombre completo para comenzar?"
`
    }

    // ── Check keyword escalation ───────────────────────────────────────────────
    let shouldEscalate = false
    let escalateReason = ''

    if (palabrasClave.length > 0 && containsKeyword(mensajeCliente, palabrasClave)) {
      shouldEscalate = true
      escalateReason = 'keyword'
    }

    // ── Check message count ────────────────────────────────────────────────────
    if (!shouldEscalate && conversationId) {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
      if ((count || 0) >= maxMessages) {
        shouldEscalate = true
        escalateReason = 'max_messages'
      }
    }

    // ── Fetch URL content if client sent a link ────────────────────────────────
    let urlContext = ''
    const urls = extractUrls(mensajeCliente)
    if (urls.length > 0) {
      const contents = await Promise.all(urls.slice(0, 2).map(fetchUrlContent))
      const validContents = contents.filter(Boolean)
      if (validContents.length > 0) {
        urlContext = `\n\nCONTENIDO DE URL ENVIADA POR EL CLIENTE:\n${validContents.join('\n---\n')}`
      }
    }

    // ── Get conversation history (memory) ─────────────────────────────────────
    const history = await getConversationHistory(supabase, conversationId, 10)

    // ── Call AI Gateway ────────────────────────────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY no configurado')

    const fullSystemPrompt = systemPrompt + (urlContext || '')

    const aiMessages = [
      { role: 'system', content: fullSystemPrompt },
      ...history,
      { role: 'user', content: `${nombre} dice: ${mensajeCliente}` },
    ]

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
        messages: aiMessages,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      throw new Error(`AI Gateway error [${aiResponse.status}]: ${errText}`)
    }

    const aiData = await aiResponse.json()
    let respuesta: string = aiData.choices?.[0]?.message?.content || 'Hola, gracias por contactarnos. Un vendedor te atenderá pronto.'

    // ── Score calculation ──────────────────────────────────────────────────────
    let score = 20
    const msgLower = mensajeCliente.toLowerCase()
    if (msgLower.includes('presupuesto') || msgLower.includes('precio') || /\$\d|millones|mil\s/i.test(mensajeCliente)) score += 30
    if (msgLower.includes('pronto') || msgLower.includes('urgente') || msgLower.includes('esta semana')) score += 25
    if (msgLower.includes('marca') || msgLower.includes('modelo') || msgLower.includes('año')) score += 15
    if (telefono) score += 10
    score = Math.min(100, score)

    // ── Score-based escalation ─────────────────────────────────────────────────
    if (!shouldEscalate && score >= scoreMinimo) {
      shouldEscalate = true
      escalateReason = 'score'
    }

    // ── Always escalate after first interaction within-hours ──────────────────
    // If we're within hours and the agent already answered once, escalate
    if (!shouldEscalate && dentroHorario) {
      // Check if this conversation has had at least 1 previous exchange
      if (history.length >= 2) {
        shouldEscalate = true
        escalateReason = 'dentro_horario_datos_capturados'
      }
    }

    // ── Outside hours: escalate when we have name + phone (minimum data) ──────
    if (!shouldEscalate && !dentroHorario) {
      const hasPhone = !!(telefono || msgLower.match(/\+?56\s?\d{8,9}|\d{8,9}/))
      const hasName = nombre !== 'Cliente' && nombre.split(' ').length >= 1
      // Escalate after 3+ exchanges to give time to collect data
      if (hasPhone && hasName && history.length >= 4) {
        shouldEscalate = true
        escalateReason = 'fuera_horario_datos_capturados'
      }
    }

    // ── Assign vendor & escalate ───────────────────────────────────────────────
    let vendedorAsignado = ''
    if (shouldEscalate) {
      vendedorAsignado = await getVendedorAsignado(supabase, modoAsignacion, canal, asignacionPorCanal, vendedorDefault)

      // Override AI response with escalation message
      if (dentroHorario || escalateReason === 'keyword') {
        respuesta = `¡Perfecto ${nombre}! Ya pasé tus datos a uno de nuestros ejecutivos${vendedorAsignado ? ` (${vendedorAsignado})` : ''}. Te contactará de inmediato 🙌 ¡Cualquier consulta adicional no dudes en escribirnos!`
      } else if (!dentroHorario) {
        respuesta = `¡Listo ${nombre}! Ya dejé todos tus datos registrados para que${vendedorAsignado ? ` ${vendedorAsignado}` : ' un vendedor'} te contacte apenas estemos disponibles. ¡Gracias por tu interés en Egaña Automotriz! 🚗`
      }

      // ── Upsert lead ──────────────────────────────────────────────────────────
      const leadData = {
        nombre,
        telefono,
        canal: canal === 'manychat' ? 'whatsapp' : canal,
        etapa: 'contactado',
        score,
        urgencia: score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baja',
        vendedor_asignado: vendedorAsignado,
        notas: `Lead generado automáticamente por el agente IA. Razón: ${escalateReason}. Horario: ${dentroHorario ? 'dentro' : 'fuera'}.`,
        ...(conversationId ? { conversation_id: conversationId } : {}),
      }

      let leadId: string | null = null

      if (conversationId) {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('conversation_id', conversationId)
          .single()

        if (!existingLead) {
          const { data: newLead } = await supabase.from('leads').insert(leadData).select('id').single()
          leadId = newLead?.id || null
        } else {
          leadId = existingLead.id
          await supabase
            .from('leads')
            .update({ score, vendedor_asignado: vendedorAsignado, etapa: 'contactado' })
            .eq('id', existingLead.id)
        }
      } else {
        const { data: existingByContact } = await supabase
          .from('leads')
          .select('id')
          .eq('nombre', nombre)
          .eq('telefono', telefono)
          .not('etapa', 'in', '("ganado","perdido")')
          .limit(1)
          .maybeSingle()

        if (!existingByContact) {
          const { data: newLead } = await supabase.from('leads').insert(leadData).select('id').single()
          leadId = newLead?.id || null
        } else {
          leadId = existingByContact.id
          await supabase
            .from('leads')
            .update({ score, vendedor_asignado: vendedorAsignado })
            .eq('id', existingByContact.id)
        }
      }

      // ── Log transfer activity in lead_actividades ────────────────────────────
      if (leadId) {
        const nowISO = new Date().toISOString()
        const fechaHoraLegible = nowChile.toLocaleString('es-CL', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
        await supabase.from('lead_actividades').insert({
          lead_id: leadId,
          tipo: 'traspaso_vendedor',
          descripcion: `🔔 Cliente traspasado a vendedor${vendedorAsignado ? ` "${vendedorAsignado}"` : ''}. Razón: ${escalateReason}. Horario: ${dentroHorario ? 'dentro de horario' : 'fuera de horario'}. Fecha y hora: ${fechaHoraLegible}. Score: ${score}/100. Canal: ${canal}.`,
          usuario: 'Agente IA',
          created_at: nowISO,
        })
      }

      // ── Mark conversation as escalated ───────────────────────────────────────
      if (conversationId) {
        await supabase
          .from('conversations')
          .update({ escalated: true, escalated_at: new Date().toISOString() })
          .eq('id', conversationId)
      }

      // ── Notify vendor (log) ───────────────────────────────────────────────────
      if (notificarVendedor && vendedorAsignado) {
        const msgNotif = (cfg.MENSAJE_NOTIFICACION_VENDEDOR || '')
          .replace('{{vendedor}}', vendedorAsignado)
          .replace('{{nombre_cliente}}', nombre)
          .replace('{{canal}}', canal)
          .replace('{{interes}}', mensajeCliente.substring(0, 80))
          .replace('{{telefono}}', telefono || 'No proporcionado')
          .replace('{{score}}', String(score))
        console.log(`[NOTIFICACION VENDEDOR] ${msgNotif}`)
      }
    }

    // ── Save inbound message to messages table (memory) ──────────────────────
    if (conversationId) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        contact_id: contactId || null,
        direction: 'inbound',
        content: mensajeCliente,
        channel: canal,
        sent_at: new Date().toISOString(),
      })

      // Save agent response
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        contact_id: contactId || null,
        direction: 'outbound',
        content: respuesta,
        channel: canal,
        sent_at: new Date().toISOString(),
      })
    }

    // ── Save to conversaciones legacy table ───────────────────────────────────
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
      escalada: shouldEscalate,
    })
    if (dbError) console.error('DB conversaciones insert error:', dbError)

    // ── Update conversation last_message ──────────────────────────────────────
    if (conversationId) {
      await supabase
        .from('conversations')
        .update({
          last_message: respuesta,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    }

    // ── Return ManyChat-compatible response ───────────────────────────────────
    return new Response(
      JSON.stringify({
        messages: [{ type: 'text', text: respuesta }],
        set_field_values: [
          { field_name: 'ultimo_mensaje_agente', value: respuesta },
          { field_name: 'lead_score', value: String(score) },
          ...(vendedorAsignado ? [{ field_name: 'vendedor_asignado', value: vendedorAsignado }] : []),
          ...(shouldEscalate ? [{ field_name: 'escalado', value: 'true' }] : []),
          ...(dentroHorario ? [] : [{ field_name: 'fuera_horario', value: 'true' }]),
        ],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error en agente-egana:', error)
    const msg = error instanceof Error ? error.message : 'Error interno'
    return new Response(
      JSON.stringify({
        messages: [{ type: 'text', text: 'Gracias por contactarnos. Un vendedor te atenderá pronto.' }],
        error: msg,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
