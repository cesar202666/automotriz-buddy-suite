import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface HorarioConfig {
  dia: string
  activo: boolean
  inicio: string
  fin: string
}

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
  limit = 12
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

    // contact_id ahora es el UUID real del contacto (enviado por los webhooks)
    const contactId: string = body.contact_id || ''
    const externalId: string = body.external_id || body.contact_id || ''
    const mensajeCliente: string = body.last_input_text || body.text || ''
    const nombre: string = body.first_name || body.nombre || 'Cliente'
    const apellido: string = body.last_name || ''
    const telefono: string = body.phone || ''
    const canal: string = body.channel || 'manychat'
    const conversationId: string = body.conversation_id || ''
    const phoneNumberId: string = body.phone_number_id || ''
    const senderId: string = body.sender_id || ''
    const accessToken: string = body.access_token || ''
    const source: string = body.source || 'manychat' // 'manychat' | 'meta'

    if (!mensajeCliente || !contactId) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: last_input_text y contact_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('escalated')
        .eq('id', conversationId)
        .single()

      if (conv?.escalated) {
        return new Response(
          JSON.stringify({ messages: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── Leer configuración ─────────────────────────────────────────────────────
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

    // Horario por defecto si no hay configuración: Lun-Vie 09:30-19:00, Sáb 10:00-14:00
    if (horariosConfig.length === 0) {
      horariosConfig = [
        { dia: 'Lunes',      activo: true,  inicio: '09:30', fin: '19:00' },
        { dia: 'Martes',     activo: true,  inicio: '09:30', fin: '19:00' },
        { dia: 'Miércoles',  activo: true,  inicio: '09:30', fin: '19:00' },
        { dia: 'Jueves',     activo: true,  inicio: '09:30', fin: '19:00' },
        { dia: 'Viernes',    activo: true,  inicio: '09:30', fin: '19:00' },
        { dia: 'Sábado',     activo: true,  inicio: '10:00', fin: '14:00' },
        { dia: 'Domingo',    activo: false, inicio: '00:00', fin: '00:00' },
      ]
    }

    // ── Horario Chile ─────────────────────────────────────────────────────────
    const nowChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
    const dentroHorario = horariosActivos
      ? isWithinSchedule(horariosConfig, nowChile)
      : true

    const horaStr = nowChile.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    const fechaStr = nowChile.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

    // ── Obtener historial de conversación (memoria) ───────────────────────────
    const history = await getConversationHistory(supabase, conversationId, 12)
    const messageCount = history.length

    // ── Detectar palabras clave de escalamiento ───────────────────────────────
    let shouldEscalate = false
    let escalateReason = ''

    if (palabrasClave.length > 0 && containsKeyword(mensajeCliente, palabrasClave)) {
      shouldEscalate = true
      escalateReason = 'keyword'
    }

    // ── Verificar límite de mensajes ──────────────────────────────────────────
    if (!shouldEscalate && messageCount >= maxMessages) {
      shouldEscalate = true
      escalateReason = 'max_messages'
    }

    // ── Obtener contenido de URLs si el cliente envió un link ─────────────────
    let urlContext = ''
    const urls = extractUrls(mensajeCliente)
    if (urls.length > 0) {
      const contents = await Promise.all(urls.slice(0, 2).map(fetchUrlContent))
      const validContents = contents.filter(Boolean)
      if (validContents.length > 0) {
        urlContext = `\n\nCONTENIDO DE URL ENVIADA POR EL CLIENTE:\n${validContents.join('\n---\n')}`
      }
    }

    // ── Score del lead ────────────────────────────────────────────────────────
    let score = 20
    const msgLower = mensajeCliente.toLowerCase()
    if (msgLower.includes('presupuesto') || msgLower.includes('precio') || /\$\d|millones|mil\s/i.test(mensajeCliente)) score += 30
    if (msgLower.includes('pronto') || msgLower.includes('urgente') || msgLower.includes('esta semana')) score += 25
    if (msgLower.includes('marca') || msgLower.includes('modelo') || msgLower.includes('año')) score += 15
    if (telefono) score += 10
    score = Math.min(100, score)

    // ── Escalamiento por score ────────────────────────────────────────────────
    if (!shouldEscalate && score >= scoreMinimo) {
      shouldEscalate = true
      escalateReason = 'score'
    }

    // ── Escalamiento por horario y datos capturados ───────────────────────────
    // DENTRO DEL HORARIO: escalar después de 2+ intercambios (el agente ya saludó y tiene datos básicos)
    if (!shouldEscalate && dentroHorario && messageCount >= 2) {
      shouldEscalate = true
      escalateReason = 'dentro_horario_datos_capturados'
    }

    // FUERA DEL HORARIO: escalar cuando tenga nombre + teléfono y 4+ intercambios
    if (!shouldEscalate && !dentroHorario) {
      const hasPhone = !!(telefono || mensajeCliente.match(/\+?56\s?\d{8,9}|\d{8,9}/))
      const hasName = nombre !== 'Cliente'
      if (hasPhone && hasName && messageCount >= 4) {
        shouldEscalate = true
        escalateReason = 'fuera_horario_datos_capturados'
      }
    }

    // ── Construir system prompt según horario ─────────────────────────────────
    let systemPrompt: string

    if (dentroHorario) {
      systemPrompt = `Eres el asistente virtual de Egaña Automotriz, una automotora en Puerto Montt, Chile. Tu nombre es "Asistente Egaña". Atiendes por WhatsApp, Instagram y Facebook.

HOY ES: ${fechaStr} a las ${horaStr} (horario Chile).
ESTADO: DENTRO DE HORARIO DE ATENCIÓN (09:30 - 19:00 hrs).

TU MISIÓN:
1. Saluda al cliente amablemente por su nombre si lo conoces.
2. Agradece su interés en Egaña Automotriz.
3. Indícale que HAY VENDEDORES DISPONIBLES y que uno lo contactará DE INMEDIATO.
4. Pídele SOLO lo necesario: nombre completo (si no lo tienes), teléfono de contacto, vehículo de interés.
5. Una vez que tengas esos datos básicos, confirma que pasaste su contacto al equipo de ventas.

REGLAS:
- Máximo 3 líneas por respuesta.
- Español chileno informal pero respetuoso (po, bacán, etc. si aplica).
- NO des precios ni especificaciones técnicas, eso lo hace el vendedor.
- Si el cliente ya dio sus datos, CONFIRMA el traspaso y no hagas más preguntas.
- Ejemplo: "¡Hola [nombre]! Qué buena que nos escribes 😊 Tenemos vendedores disponibles ahora mismo. ¿Me confirmas tu nombre completo y el vehículo que te interesa para conectarte de inmediato?"
`
    } else {
      systemPrompt = `Eres el asistente virtual de Egaña Automotriz, una automotora en Puerto Montt, Chile. Tu nombre es "Asistente Egaña".

HOY ES: ${fechaStr} a las ${horaStr} (horario Chile).
ESTADO: FUERA DE HORARIO. Atendemos Lunes a Viernes 09:30-19:00 hrs, Sábado 10:00-14:00 hrs.

TU MISIÓN:
1. Saluda e informa amablemente que estamos fuera de horario.
2. Asegura que UN VENDEDOR LO CONTACTARÁ EN CUANTO ESTÉ DISPONIBLE.
3. Recopila ESTOS DATOS de forma conversacional (uno por uno, no como formulario):
   - Nombre completo
   - Teléfono de contacto
   - Vehículo de interés (marca, modelo, año aproximado)
   - Medio de pago preferido (contado, crédito, permuta)
   - Presupuesto aproximado (opcional)
4. Cuando tengas nombre, teléfono y vehículo, confirma que dejaste el mensaje.

REGLAS:
- Máximo 3 líneas por respuesta.
- Español chileno informal pero respetuoso.
- Sé empático, valida la consulta del cliente.
- Pide datos de a uno para que sea natural.
- Ejemplo: "¡Hola! Gracias por escribirnos 😊 En este momento estamos fuera de horario, pero con gusto dejo tu mensaje para que un vendedor te contacte apenas abramos. ¿Me dices tu nombre completo para comenzar?"
`
    }

    systemPrompt += urlContext

    // ── Llamar al AI Gateway ──────────────────────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY no configurado')

    const aiMessages = [
      { role: 'system', content: systemPrompt },
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

    // ── Si debe escalar, obtener vendedor y armar mensaje de traspaso ─────────
    let vendedorAsignado = ''
    if (shouldEscalate) {
      vendedorAsignado = await getVendedorAsignado(supabase, modoAsignacion, canal, asignacionPorCanal, vendedorDefault)

      // Mensaje de traspaso al cliente
      if (dentroHorario || escalateReason === 'keyword') {
        respuesta = `¡Perfecto ${nombre}! Ya pasé tus datos a uno de nuestros ejecutivos${vendedorAsignado ? ` (${vendedorAsignado})` : ''}. Te contactará de inmediato 🙌 ¡Cualquier consulta no dudes en escribirnos!`
      } else {
        respuesta = `¡Listo ${nombre}! Ya dejé todos tus datos registrados para que${vendedorAsignado ? ` ${vendedorAsignado}` : ' un vendedor'} te contacte apenas estemos disponibles (Lun-Vie 09:30-19:00 hrs). ¡Gracias por tu interés en Egaña Automotriz! 🚗`
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
        notas: `Lead generado por agente IA. Razón escalamiento: ${escalateReason}. Horario: ${dentroHorario ? 'dentro' : 'fuera'}.`,
        ...(conversationId ? { conversation_id: conversationId } : {}),
        ...(contactId ? { contact_id: contactId } : {}),
      }

      let leadId: string | null = null

      // Buscar lead existente por conversation_id
      if (conversationId) {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('conversation_id', conversationId)
          .maybeSingle()

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
        const { data: newLead } = await supabase.from('leads').insert(leadData).select('id').single()
        leadId = newLead?.id || null
      }

      // ── Registrar actividad de traspaso para métricas ────────────────────────
      if (leadId) {
        const fechaHoraLegible = nowChile.toLocaleString('es-CL', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
        await supabase.from('lead_actividades').insert({
          lead_id: leadId,
          tipo: 'traspaso_vendedor',
          descripcion: `🔔 Cliente traspasado a vendedor${vendedorAsignado ? ` "${vendedorAsignado}"` : ''}. Razón: ${escalateReason}. Horario: ${dentroHorario ? 'dentro de horario' : 'fuera de horario'}. Fecha: ${fechaHoraLegible}. Score: ${score}/100. Canal: ${canal}.`,
          usuario: 'Agente IA',
          created_at: new Date().toISOString(),
        })
      }

      // ── Marcar conversación como escalada ─────────────────────────────────────
      if (conversationId) {
        await supabase
          .from('conversations')
          .update({
            escalated: true,
            escalated_at: new Date().toISOString(),
            assigned_to: vendedorAsignado,
          })
          .eq('id', conversationId)
      }

      if (notificarVendedor && vendedorAsignado) {
        console.log(`[NOTIFICACION VENDEDOR] Nuevo cliente "${nombre}" asignado a ${vendedorAsignado}. Canal: ${canal}. Score: ${score}. Tel: ${telefono || 'N/A'}`)
      }
    }

    // ── Guardar respuesta del agente en messages (outbound) ───────────────────
    // NOTA: El mensaje inbound ya fue guardado por el webhook llamante.
    // Aquí solo guardamos el outbound (respuesta del agente).
    if (conversationId) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        contact_id: contactId || null,
        direction: 'outbound',
        content: respuesta,
        channel: canal,
        sent_at: new Date().toISOString(),
      })

      // Actualizar last_message de la conversación
      await supabase
        .from('conversations')
        .update({
          last_message: respuesta,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    }


    // ── Enviar respuesta por Meta API si viene de WhatsApp/Meta ───────────────
    if (source === 'meta' && canal === 'whatsapp' && phoneNumberId && senderId && accessToken) {
      fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: senderId,
          type: 'text',
          text: { body: respuesta },
        }),
      }).catch(e => console.error('Error enviando mensaje WhatsApp:', e))
    }

    // ── Retornar respuesta compatible con ManyChat ────────────────────────────
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
