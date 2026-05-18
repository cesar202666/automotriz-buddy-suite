import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function extractString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function cleanTemplateValue(value: unknown): string {
  const str = extractString(value)
  if (!str) return ''
  return str.startsWith('{{') && str.endsWith('}}') ? '' : str
}

function extractMessageText(payload: Record<string, unknown>): string {
  const queue: unknown[] = [
    payload.last_input_text,
    payload.last_text_input,
    payload.text,
    payload.message,
    payload.content,
    payload.body,
    payload.input,
    payload.last_message,
    payload.data,
  ]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      const parsed = extractString(current)
      if (parsed) return parsed
      continue
    }

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    if (typeof current === 'object') {
      const obj = current as Record<string, unknown>
      queue.push(
        obj.text,
        obj.body,
        obj.message,
        obj.content,
        obj.caption,
        obj.value,
        obj.input,
        obj.last_input_text,
      )
    }
  }

  return ''
}

function extractSubscriberId(payload: Record<string, unknown>, phone: string, email: string): string {
  const candidate = [
    payload.contact_id,
    payload.subscriber_id,
    payload.contactId,
    payload.subscriberId,
    (payload.contact as Record<string, unknown> | undefined)?.id,
    (payload.subscriber as Record<string, unknown> | undefined)?.id,
    (payload.sender as Record<string, unknown> | undefined)?.id,
    (payload.from as Record<string, unknown> | undefined)?.id,
    payload.id,
  ]
    .map(extractString)
    .find(Boolean)

  if (candidate) return candidate
  if (phone) return `phone:${phone}`
  if (email) return `email:${email}`
  return ''
}

function extractManychatMessageId(payload: Record<string, unknown>): string {
  return [
    payload.message_id,
    payload.event_id,
    (payload.message as Record<string, unknown> | undefined)?.id,
    (payload.last_message as Record<string, unknown> | undefined)?.id,
  ]
    .map(extractString)
    .find(Boolean) || ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json() as Record<string, unknown>

    // ── Parse ManyChat payload ───────────────────────────────────────────────
    const firstName: string = extractString(body.first_name) || extractString(body.name) || extractString((body.contact as Record<string, unknown> | undefined)?.first_name) || 'Cliente'
    const lastName: string = extractString(body.last_name) || extractString((body.contact as Record<string, unknown> | undefined)?.last_name)
    let phone: string = cleanTemplateValue(body.phone) || cleanTemplateValue((body.contact as Record<string, unknown> | undefined)?.phone)
    const email: string = cleanTemplateValue(body.email) || cleanTemplateValue((body.contact as Record<string, unknown> | undefined)?.email)
    const subscriberId: string = extractSubscriberId(body, phone, email)
    const channelRaw: string = (extractString(body.channel) || extractString(body.platform) || 'whatsapp').toLowerCase()
    const channel: string = ['whatsapp', 'instagram', 'facebook'].includes(channelRaw) ? channelRaw : 'whatsapp'

    // Si es WhatsApp y no llegó el teléfono en el payload, lo pedimos a ManyChat
    if (channel === 'whatsapp' && !phone && subscriberId && !subscriberId.startsWith('phone:') && !subscriberId.startsWith('email:')) {
      const apiKey = Deno.env.get('MANYCHAT_API_KEY')
      if (apiKey) {
        for (const url of [
          `https://api.manychat.com/wa/subscriber/getInfo?subscriber_id=${subscriberId}`,
          `https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${subscriberId}`,
        ]) {
          try {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
            if (!r.ok) continue
            const j = await r.json()
            const d = j?.data ?? j
            const p = (d?.phone ?? d?.whatsapp_phone ?? '').toString().trim()
            if (p) { phone = p; break }
          } catch (_) { /* try next */ }
        }
      }
    }
    const messageText: string = extractMessageText(body)
    const manychatMessageId: string = extractManychatMessageId(body)

    if (!subscriberId || !messageText) {
      console.error('manychat-webhook payload incompleto', {
        subscriberId,
        hasMessageText: Boolean(messageText),
        bodyKeys: Object.keys(body || {}),
      })
      return new Response(
        JSON.stringify({ messages: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── 1. Upsert contact ────────────────────────────────────────────────────
    // Build full name avoiding duplications (e.g. "Nancy Nancy" when ManyChat
    // sends the same value in first_name and last_name, or last_name already
    // contains the first name)
    const buildFullName = (first: string, last: string): string => {
      const f = (first || '').trim()
      const l = (last || '').trim()
      if (!l) return f
      if (!f) return l
      if (l.toLowerCase() === f.toLowerCase()) return f
      if (l.toLowerCase().startsWith(f.toLowerCase() + ' ')) return l
      // Dedupe repeated tokens
      const tokens = `${f} ${l}`.split(/\s+/)
      const seen = new Set<string>()
      const deduped: string[] = []
      for (const t of tokens) {
        const k = t.toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        deduped.push(t)
      }
      return deduped.join(' ')
    }
    const fullName = buildFullName(firstName, lastName) || 'Cliente'

    const { data: contactData, error: contactError } = await supabase
      .from('contacts')
      .upsert(
        {
          manychat_subscriber_id: subscriberId,
          name: fullName,
          phone,
          email,
          channel,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'manychat_subscriber_id', ignoreDuplicates: false }
      )
      .select('id')
      .single()

    if (contactError || !contactData) {
      console.error('Contact upsert error:', contactError)
      throw new Error('No se pudo guardar el contacto')
    }

    const contactId: string = contactData.id  // UUID real del contacto

    // ── 2. Get or create conversation ────────────────────────────────────────
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, unread_count, escalated, primer_apertura_vendedor')
      .eq('contact_id', contactId)
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let conversationId: string

    if (convData) {
      conversationId = convData.id
      await supabase
        .from('conversations')
        .update({
          last_message: messageText,
          last_message_at: new Date().toISOString(),
          unread_count: (convData.unread_count || 0) + 1,
          status: 'active',
        })
        .eq('id', conversationId)
    } else {
      const { data: newConv, error: newConvError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          channel,
          status: 'active',
          last_message: messageText,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select('id')
        .single()

      if (newConvError || !newConv) throw new Error('No se pudo crear la conversación')
      conversationId = newConv.id
    }

    // ── 3. Insert inbound message ─────────────────────────────────────────────
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      contact_id: contactId,
      direction: 'inbound',
      content: messageText,
      channel,
      manychat_message_id: manychatMessageId,
      sent_at: new Date().toISOString(),
    })

    // ── 3b. Auto-create lead if not exists / backfill phone if missing ────────
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, telefono')
      .eq('contact_id', contactId)
      .maybeSingle()

    if (!existingLead) {
      await supabase.from('leads').insert({
        contact_id: contactId,
        conversation_id: conversationId,
        nombre: `${firstName}${lastName ? ' ' + lastName : ''}`.trim(),
        telefono: phone,
        email: email,
        canal: channel,
        etapa: 'nuevo',
        score: 0,
        urgencia: 'media',
        interes: '',
        presupuesto: '',
        vendedor_asignado: '',
        notas: messageText.substring(0, 200),
      })
    } else if (channel === 'whatsapp' && phone && !existingLead.telefono) {
      // WhatsApp: ManyChat exposes the phone — persist it on the lead the first time we see it
      await supabase
        .from('leads')
        .update({ telefono: phone })
        .eq('id', existingLead.id)
    }

    // ── 4. Si la conversación ya fue escalada Y el vendedor ya abrió el chat,
    //       NO llamar al agente IA (el vendedor toma el control).
    //       Si está escalada pero el vendedor NO ha abierto aún, el agente IA
    //       sigue respondiendo (modo "follow-up con AI") para no dejar al cliente
    //       sin respuesta mientras espera.
    if (convData?.escalated && convData?.primer_apertura_vendedor) {
      return new Response(
        JSON.stringify({ messages: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 5. Recuperar historial conversacional ───────────────────────────────
    const { data: historialMensajes } = await supabase
      .from('messages')
      .select('direction, content, sent_at')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })
      .limit(10)

    // ── 6. Llamar al agente-egana con los IDs correctos ──────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    const agentResponse = await fetch(`${supabaseUrl}/functions/v1/agente-egana`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        contact_id: contactId,
        external_id: subscriberId,
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        last_input_text: messageText,
        channel,
        conversation_id: conversationId,
        manychat_message_id: manychatMessageId,
        source: 'manychat',
        inbound_already_saved: true,
        conversation_history: historialMensajes || [],
      }),
    })

    if (!agentResponse.ok) {
      const errText = await agentResponse.text()
      console.error(`agente-egana error [${agentResponse.status}]: ${errText}`)
      throw new Error('Error en agente-egana')
    }

    const agentData = await agentResponse.json()

    return new Response(
      JSON.stringify(agentData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error en manychat-webhook:', error)
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
