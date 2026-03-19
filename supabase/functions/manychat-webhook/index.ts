import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json()

    // ── Parse ManyChat payload ───────────────────────────────────────────────
    const subscriberId: string = String(body.contact_id || body.id || body.subscriber_id || '')
    const firstName: string = body.first_name || body.name || 'Cliente'
    const lastName: string = body.last_name || ''
    const phone: string = (body.phone || '').startsWith('{{') ? '' : (body.phone || '')
    const email: string = (body.email || '').startsWith('{{') ? '' : (body.email || '')
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

    const contactId: string = contactData.id  // UUID real del contacto

    // ── 2. Get or create conversation ────────────────────────────────────────
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, unread_count, escalated')
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

    // ── 3b. Auto-create lead if not exists ────────────────────────────────────
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, score')
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
    }

    // ── 4. Si la conversación ya fue escalada, NO llamar al agente IA
    if (convData?.escalated) {
      return new Response(
        JSON.stringify({ messages: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 5. Llamar al agente-egana con los IDs correctos ──────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    const agentResponse = await fetch(`${supabaseUrl}/functions/v1/agente-egana`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        contact_id: contactId,          // UUID real del contacto en Supabase
        external_id: subscriberId,      // ID externo de ManyChat
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        last_input_text: messageText,
        channel,
        conversation_id: conversationId,  // UUID real de la conversación
        manychat_message_id: manychatMessageId,
        source: 'manychat',
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
