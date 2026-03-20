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

async function ensureInboundMessage(
  supabase: ReturnType<typeof createClient>,
  params: {
    conversationId: string
    contactId: string
    mensajeCliente: string
    canal: string
    manychatMessageId: string
    sentAt: string
  }
): Promise<boolean> {
  const { conversationId, contactId, mensajeCliente, canal, manychatMessageId, sentAt } = params

  if (!conversationId || !mensajeCliente) return false

  if (manychatMessageId) {
    const { data: existingMsgById } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('manychat_message_id', manychatMessageId)
      .maybeSingle()

    if (existingMsgById) return false
  } else {
    const sentAtDate = new Date(sentAt)
    const windowStart = new Date(sentAtDate.getTime() - 90 * 1000).toISOString()
    const windowEnd = new Date(sentAtDate.getTime() + 90 * 1000).toISOString()

    const { data: recentDuplicate } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .eq('content', mensajeCliente)
      .gte('sent_at', windowStart)
      .lte('sent_at', windowEnd)
      .limit(1)
      .maybeSingle()

    if (recentDuplicate) return false
  }

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    contact_id: contactId || null,
    direction: 'inbound',
    content: mensajeCliente,
    channel: canal,
    manychat_message_id: manychatMessageId || null,
    sent_at: sentAt,
  })

  return true
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
    let conversationId: string = body.conversation_id || ''
    const manychatMessageId: string = body.manychat_message_id || ''
    const phoneNumberId: string = body.phone_number_id || ''
    const senderId: string = body.sender_id || ''
    const accessToken: string = body.access_token || ''
    const source: string = body.source || 'manychat' // 'manychat' | 'meta'
    const inboundAlreadySaved: boolean = body.inbound_already_saved === true
    const inboundSentAt: string = body.sent_at || new Date().toISOString()

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

    if (!conversationId && contactId) {
      const { data: latestConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('channel', canal)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestConv?.id) {
        conversationId = latestConv.id
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            contact_id: contactId,
            channel: canal,
            status: 'active',
            last_message: mensajeCliente,
            last_message_at: new Date().toISOString(),
            unread_count: 0,
          })
          .select('id')
          .single()

        if (newConv?.id) conversationId = newConv.id
      }
    }

    // ── Check if conversation is already escalated (cooldown 10 days) ─────────
    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('escalated, escalated_at, unread_count')
        .eq('id', conversationId)
        .single()

      if (conv?.escalated) {
        // Check 10-day cooldown: if escalated less than 10 days ago, don't respond
        const escalatedAt = conv.escalated_at ? new Date(conv.escalated_at) : null
        const tenDaysMs = 10 * 24 * 60 * 60 * 1000
        const withinCooldown = escalatedAt && (Date.now() - escalatedAt.getTime()) < tenDaysMs

        // Always save inbound message
        const nowIso = new Date().toISOString()
        const insertedInbound = await ensureInboundMessage(supabase, {
          conversationId,
          contactId,
          mensajeCliente,
          canal,
          manychatMessageId,
          sentAt: inboundSentAt,
        })

        await supabase
          .from('conversations')
          .update({
            last_message: mensajeCliente,
            last_message_at: nowIso,
            unread_count: (conv.unread_count || 0) + (insertedInbound ? 1 : 0),
            status: 'active',
          })
          .eq('id', conversationId)

        if (withinCooldown) {
          // Within 10-day cooldown: don't respond, vendor handles it
          return new Response(
            JSON.stringify({ messages: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else {
          // Cooldown expired: reset escalation, allow new interaction
          await supabase
            .from('conversations')
            .update({ escalated: false, escalated_at: null })
            .eq('id', conversationId)
        }
      }
    }

    // ── Save inbound message if not escalated ──────────────────────────────────
    if (conversationId) {
      const nowIso = new Date().toISOString()
      const insertedInbound = await ensureInboundMessage(supabase, {
        conversationId,
        contactId,
        mensajeCliente,
        canal,
        manychatMessageId,
        sentAt: inboundSentAt,
      })

      if (insertedInbound) {
        await supabase.rpc('increment_unread', { conv_id: conversationId })
      }

      await supabase
        .from('conversations')
        .update({
          last_message: mensajeCliente,
          last_message_at: nowIso,
          status: 'active',
        })
        .eq('id', conversationId)
    }

    // ── Read config ────────────────────────────────────────────────────────────
    const { data: configRows } = await supabase
      .from('configuracion_sistema')
      .select('clave, valor')

    const cfg: Record<string, string> = {}
    ;(configRows || []).forEach((r: { clave: string; valor: string }) => { cfg[r.clave] = r.valor })

    // ── Check if agent is globally disabled ──────────────────────────────────
    const agenteActivo = (cfg.AGENTE_ACTIVO || 'true') === 'true'
    if (!agenteActivo) {
      return new Response(
        JSON.stringify({ messages: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const modoAsignacion = cfg.ASIGNACION_MODO || 'ORDENADO'
    const vendedorDefault = cfg.VENDEDOR_DEFAULT || ''
    const notificarVendedor = (cfg.NOTIFICAR_VENDEDOR || 'true') === 'true'

    let asignacionPorCanal: Record<string, string> = {}
    try { asignacionPorCanal = JSON.parse(cfg.ASIGNACION_POR_CANAL || '{}') } catch {}

    // ── Determine channel type ─────────────────────────────────────────────────
    const isWhatsApp = canal === 'whatsapp' || canal === 'manychat'
    const isInstagramOrMessenger = canal === 'instagram' || canal === 'messenger' || canal === 'facebook'

    // ── Get assigned vendor ────────────────────────────────────────────────────
    const vendedorAsignado = await getVendedorAsignado(supabase, modoAsignacion, canal, asignacionPorCanal, vendedorDefault)

    // ── Build response based on channel ────────────────────────────────────────
    let respuesta: string
    let score = 0

    if (isInstagramOrMessenger) {
      // Instagram / Messenger: redirect to WhatsApp
      const waLink = 'https://wa.me/message/QCXBGVU5I7MHM1'
      respuesta = `¡Hola ${nombre}! 😊 Gracias por escribirnos a Egaña Automotriz. Para atenderte de la mejor forma, te invito a contactarnos por WhatsApp: ${waLink}\n\n${vendedorAsignado ? `Nuestro ejecutivo ${vendedorAsignado}` : 'Un ejecutivo'} te atenderá de inmediato por ahí 🙌`
    } else {
      // WhatsApp: greet and assign vendor immediately
      respuesta = `¡Perfecto ${nombre}! Ya pasé tus datos a uno de nuestros ejecutivos${vendedorAsignado ? ` (${vendedorAsignado})` : ''}. Te contactará de inmediato 🙌 ¡Cualquier consulta no dudes en escribirnos!`

      // ── Score lead (only WhatsApp) ─────────────────────────────────────────
      score = 20
      const msgLower = mensajeCliente.toLowerCase()
      if (msgLower.includes('presupuesto') || msgLower.includes('precio') || /\$\d|millones|mil\s/i.test(mensajeCliente)) score += 30
      if (msgLower.includes('pronto') || msgLower.includes('urgente') || msgLower.includes('esta semana')) score += 25
      if (msgLower.includes('marca') || msgLower.includes('modelo') || msgLower.includes('año')) score += 15
      if (telefono) score += 10
      score = Math.min(100, score)
    }

    // ── Upsert lead ──────────────────────────────────────────────────────────
    const leadData = {
      nombre,
      telefono,
      canal: isWhatsApp ? 'whatsapp' : canal,
      etapa: 'contactado',
      score: isWhatsApp ? score : 0,
      urgencia: score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baja',
      vendedor_asignado: vendedorAsignado,
      notas: `Lead generado por agente IA. Canal: ${canal}.${isInstagramOrMessenger ? ' Redirigido a WhatsApp.' : ''}`,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(contactId ? { contact_id: contactId } : {}),
    }

    let leadId: string | null = null

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
          .update({ score: isWhatsApp ? score : undefined, vendedor_asignado: vendedorAsignado, etapa: 'contactado' })
          .eq('id', existingLead.id)
      }
    } else {
      const { data: newLead } = await supabase.from('leads').insert(leadData).select('id').single()
      leadId = newLead?.id || null
    }

    // ── Log activity ─────────────────────────────────────────────────────────
    const nowChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
    const fechaHoraLegible = nowChile.toLocaleString('es-CL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    if (leadId) {
      await supabase.from('lead_actividades').insert({
        lead_id: leadId,
        tipo: 'traspaso_vendedor',
        descripcion: `🔔 Cliente traspasado a vendedor${vendedorAsignado ? ` "${vendedorAsignado}"` : ''}. Canal: ${canal}. Fecha: ${fechaHoraLegible}.${isInstagramOrMessenger ? ' Redirigido a WhatsApp.' : ''}`,
        usuario: 'Agente IA',
        created_at: new Date().toISOString(),
      })
    }

    // ── Mark conversation as escalated (10-day cooldown starts) ──────────────
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

    // ── Save outbound message ────────────────────────────────────────────────
    if (conversationId) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        contact_id: contactId || null,
        direction: 'outbound',
        content: respuesta,
        channel: canal,
        sent_at: new Date().toISOString(),
      })

      await supabase
        .from('conversations')
        .update({
          last_message: respuesta,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    }

    // ── Send via Meta API if WhatsApp/Meta source ────────────────────────────
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

    // ── Return ManyChat-compatible response ──────────────────────────────────
    return new Response(
      JSON.stringify({
        messages: [{ type: 'text', text: respuesta }],
        set_field_values: [
          { field_name: 'ultimo_mensaje_agente', value: respuesta },
          { field_name: 'lead_score', value: String(score) },
          ...(vendedorAsignado ? [{ field_name: 'vendedor_asignado', value: vendedorAsignado }] : []),
          { field_name: 'escalado', value: 'true' },
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
