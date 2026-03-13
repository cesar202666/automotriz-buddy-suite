import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // ── Parse ManyChat payload ───────────────────────────────────────────────
    const subscriberId: string = String(body.contact_id || body.id || body.subscriber_id || '')
    const firstName: string = body.first_name || body.name || 'Cliente'
    const lastName: string = body.last_name || ''
    const phone: string = body.phone || ''
    const email: string = body.email || ''
    const channelRaw: string = (body.channel || body.platform || 'whatsapp').toLowerCase()
    const channel: string = ['whatsapp', 'instagram', 'facebook'].includes(channelRaw) ? channelRaw : 'whatsapp'
    const messageText: string = body.last_input_text || body.text || body.message || ''
    const manychatMessageId: string = String(body.message_id || '')

    if (!subscriberId || !messageText) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: contact_id y last_input_text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── 1. Upsert contact ────────────────────────────────────────────────────
    const { data: contactData, error: contactError } = await supabase
      .from('contacts')
      .upsert(
        {
          manychat_subscriber_id: subscriberId,
          name: `${firstName}${lastName ? ' ' + lastName : ''}`.trim(),
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

    const contactId: string = contactData.id

    // ── 2. Upsert conversation (one per contact+channel) ─────────────────────
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('contact_id', contactId)
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let conversationId: string

    if (convError) {
      console.error('Conversation select error:', convError)
      throw new Error('Error consultando conversación')
    }

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

      if (newConvError || !newConv) {
        console.error('Conversation insert error:', newConvError)
        throw new Error('No se pudo crear la conversación')
      }
      conversationId = newConv.id
    }

    // ── 3. Insert inbound message ─────────────────────────────────────────────
    const { error: msgInError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      contact_id: contactId,
      direction: 'inbound',
      content: messageText,
      channel,
      manychat_message_id: manychatMessageId,
      sent_at: new Date().toISOString(),
    })

    if (msgInError) console.error('Inbound message insert error:', msgInError)

    // ── 4. Generate AI response ──────────────────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY no configurado')

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `Eres el asistente virtual de Egaña Automotriz.
Tu objetivo es atender clientes interesados en vehículos de manera cálida y profesional.
- Saluda cordialmente por nombre si lo tienes
- Pregunta qué tipo de vehículo busca (marca, modelo, año aproximado, presupuesto)
- Intenta capturar: nombre completo, teléfono, interés específico, urgencia de compra
- Sé breve y natural, máximo 3 líneas por respuesta
- Usa español chileno informal pero respetuoso
- Cuando tengas nombre, teléfono e interés completos, confirma que un vendedor lo contactará pronto
- NO inventes precios ni disponibilidad de vehículos específicos`
          },
          {
            role: 'user',
            content: `${firstName} dice: ${messageText}`
          }
        ]
      })
    })

    let respuesta = 'Gracias por contactarnos. Un vendedor te atenderá pronto.'

    if (aiResponse.ok) {
      const aiData = await aiResponse.json()
      respuesta = aiData.choices?.[0]?.message?.content || respuesta
    } else {
      const errText = await aiResponse.text()
      console.error(`AI Gateway error [${aiResponse.status}]: ${errText}`)
    }

    // ── 5. Insert outbound message ────────────────────────────────────────────
    const { error: msgOutError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      contact_id: contactId,
      direction: 'outbound',
      content: respuesta,
      channel,
      sent_at: new Date().toISOString(),
    })

    if (msgOutError) console.error('Outbound message insert error:', msgOutError)

    // ── 6. Also save to legacy conversaciones table ───────────────────────────
    await supabase.from('conversaciones').insert({
      contact_id: subscriberId,
      nombre: firstName,
      apellido: lastName || null,
      telefono: phone || null,
      canal: channel,
      mensaje_cliente: messageText,
      respuesta_agente: respuesta,
      leido: false,
      notificado_vendedor: false,
    })

    // ── 7. Return ManyChat-compatible response ────────────────────────────────
    return new Response(
      JSON.stringify({
        messages: [{ type: 'text', text: respuesta }],
        set_field_values: [{ field_name: 'ultimo_mensaje_agente', value: respuesta }]
      }),
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
