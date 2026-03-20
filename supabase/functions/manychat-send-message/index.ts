import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { conversation_id, contact_id, message, channel } = await req.json()

    if (!conversation_id || !contact_id || !message) {
      return new Response(JSON.stringify({ success: false, error: 'Faltan parámetros requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get contact's manychat_subscriber_id
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('manychat_subscriber_id, name')
      .eq('id', contact_id)
      .single()

    if (contactError || !contact) {
      return new Response(JSON.stringify({ success: false, error: 'Contacto no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!contact.manychat_subscriber_id) {
      return new Response(JSON.stringify({ success: false, error: 'El contacto no tiene subscriber_id de ManyChat' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const manychatKey = Deno.env.get('MANYCHAT_API_KEY')
    if (!manychatKey) {
      return new Response(JSON.stringify({ success: false, error: 'MANYCHAT_API_KEY no configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Send via ManyChat API
    const normalizedChannel = String(channel || '').toLowerCase()
    const contentType =
      normalizedChannel === 'whatsapp'
        ? 'whatsapp'
        : normalizedChannel === 'instagram'
          ? 'instagram'
          : normalizedChannel === 'messenger' || normalizedChannel === 'facebook'
            ? 'facebook'
            : undefined

    const contentPayload: Record<string, unknown> = {
      messages: [{ type: 'text', text: message }],
    }
    if (contentType) contentPayload.type = contentType

    const mcResponse = await fetch('https://api.manychat.com/fb/sending/sendContent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${manychatKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscriber_id: contact.manychat_subscriber_id,
        data: {
          version: 'v2',
          content: contentPayload,
        },
      }),
    })

    let mcResult: any = null
    const mcText = await mcResponse.text()
    try { mcResult = JSON.parse(mcText) } catch { mcResult = { raw: mcText } }
    console.log('ManyChat response:', JSON.stringify(mcResult))

    if (!mcResponse.ok || mcResult?.status === 'error') {
      const manychatMessage = mcResult?.message || mcResponse.statusText || 'Error desconocido'
      const isWindowRestriction =
        mcResult?.code === 3011 || String(manychatMessage).toLowerCase().includes('over 24 hours')

      return new Response(JSON.stringify({
        success: false,
        error: isWindowRestriction
          ? 'ManyChat bloqueó el envío: el cliente está fuera de la ventana de mensajería permitida y debe volver a escribir para reabrir el chat.'
          : `ManyChat error: ${manychatMessage}`,
        details: mcResult,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Save outbound message
    const now = new Date().toISOString()
    await supabase.from('messages').insert({
      conversation_id,
      contact_id,
      direction: 'outbound',
      content: message,
      channel: channel || 'whatsapp',
      sent_at: now,
    })

    // Update conversation last_message
    await supabase.from('conversations').update({
      last_message: message,
      last_message_at: now,
    }).eq('id', conversation_id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error in manychat-send-message:', err)
    return new Response(JSON.stringify({ success: false, error: err.message || 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
