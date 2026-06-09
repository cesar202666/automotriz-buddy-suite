import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/**
 * Envia un mensaje outbound al cliente via ManyChat API.
 *
 * Flujo robusto (anti perdida de mensajes del vendedor):
 *   1. Insertar mensaje en DB con send_status='pending'.
 *   2. Llamar a ManyChat sendContent.
 *   3. Actualizar send_status='sent' (OK) o 'failed*' (KO) con error_msg.
 *   4. SIEMPRE devolver el mensaje al frontend para que NO se pierda
 *      visualmente. El frontend muestra badge segun status.
 *
 * Esto resuelve el bug reportado por Cristobal: cuando ManyChat rechazaba
 * el envio (ventana 24h cerrada, etc.) la version anterior NO guardaba el
 * mensaje en DB. El vendedor lo veia 1 seg via optimistic update y al
 * refrescar desaparecia, generando confusion total.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { conversation_id, contact_id, message, channel } = await req.json()

    if (!conversation_id || !contact_id || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Faltan parámetros requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Get contact's manychat_subscriber_id ───────────────────
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('manychat_subscriber_id, name')
      .eq('id', contact_id)
      .single()

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ success: false, error: 'Contacto no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const now = new Date().toISOString()
    const ch = channel || 'whatsapp'

    // ── PASO 1: Insertar el mensaje YA en DB con send_status='pending' ─
    // Asi el vendedor nunca pierde su mensaje, aunque ManyChat falle.
    const { data: msgInserted, error: insertErr } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        contact_id,
        direction: 'outbound',
        content: message,
        channel: ch,
        sent_at: now,
        send_status: 'pending',
      })
      .select('id')
      .single()

    if (insertErr || !msgInserted) {
      return new Response(
        JSON.stringify({ success: false, error: `Error guardando: ${insertErr?.message ?? '?'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const messageId: string = msgInserted.id

    // Actualizar conversation.last_message para que aparezca en la lista
    await supabase
      .from('conversations')
      .update({ last_message: message, last_message_at: now })
      .eq('id', conversation_id)

    // ── Validar prerequisitos para enviar a ManyChat ────────────
    if (!contact.manychat_subscriber_id) {
      await supabase
        .from('messages')
        .update({ send_status: 'failed', send_error: 'Contacto sin manychat_subscriber_id' })
        .eq('id', messageId)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'El contacto no tiene subscriber_id de ManyChat. El mensaje quedó guardado pero NO se envió.',
          message_id: messageId,
          send_status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const manychatKey = Deno.env.get('MANYCHAT_API_KEY')
    if (!manychatKey) {
      await supabase
        .from('messages')
        .update({ send_status: 'failed', send_error: 'MANYCHAT_API_KEY no configurada' })
        .eq('id', messageId)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'MANYCHAT_API_KEY no configurada',
          message_id: messageId,
          send_status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── PASO 2: Enviar via ManyChat ─────────────────────────────
    const normalizedChannel = String(ch).toLowerCase()
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

    let mcResponse: Response
    try {
      mcResponse = await fetch('https://api.manychat.com/fb/sending/sendContent', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${manychatKey}`,
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
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      await supabase
        .from('messages')
        .update({ send_status: 'failed', send_error: `Fetch error: ${msg}` })
        .eq('id', messageId)
      return new Response(
        JSON.stringify({
          success: false,
          error: `Error de red al ManyChat: ${msg}`,
          message_id: messageId,
          send_status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let mcResult: any = null
    const mcText = await mcResponse.text()
    try {
      mcResult = JSON.parse(mcText)
    } catch {
      mcResult = { raw: mcText }
    }
    console.log('ManyChat response:', JSON.stringify(mcResult).slice(0, 500))

    // ── PASO 3: Actualizar el status del mensaje segun resultado ─
    if (!mcResponse.ok || mcResult?.status === 'error') {
      const manychatMessage = mcResult?.message || mcResponse.statusText || 'Error desconocido'
      const isWindowRestriction =
        mcResult?.code === 3011 ||
        String(manychatMessage).toLowerCase().includes('over 24 hours') ||
        String(manychatMessage).toLowerCase().includes('outside the')

      const status = isWindowRestriction ? 'failed_window_closed' : 'failed'
      const errorMsg = isWindowRestriction
        ? 'ManyChat bloqueó el envío: el cliente está fuera de la ventana de 24h. Debe escribir primero para reabrir el chat.'
        : `ManyChat: ${manychatMessage}`

      await supabase
        .from('messages')
        .update({ send_status: status, send_error: errorMsg.slice(0, 500) })
        .eq('id', messageId)

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
          message_id: messageId,
          send_status: status,
          details: mcResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // OK: marcar como enviado
    const mcMessageId =
      mcResult?.data?.message_id ?? mcResult?.message_id ?? null
    await supabase
      .from('messages')
      .update({
        send_status: 'sent',
        manychat_message_id: mcMessageId ? String(mcMessageId) : null,
      })
      .eq('id', messageId)

    return new Response(
      JSON.stringify({
        success: true,
        message_id: messageId,
        send_status: 'sent',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Error en manychat-send-message:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Error interno',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
