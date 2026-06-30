import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/**
 * Envia un mensaje outbound al cliente via ManyChat API.
 *
 * Politica:
 *   - Si ManyChat acepta y entrega al cliente → guardar en BD.
 *   - Si ManyChat rechaza (ventana 24h, etc) → NO guardar, devolver error
 *     claro al frontend para que muestre al vendedor el motivo.
 *
 * No tiene sentido guardar mensajes que el cliente nunca recibió.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { conversation_id, contact_id, message, channel, image_url, image_urls } = await req.json()
    // Acepta varias fotos (image_urls) o una sola (image_url, compatibilidad).
    const imgs: string[] = Array.isArray(image_urls) ? image_urls.filter(Boolean) : (image_url ? [image_url] : [])

    // Se puede enviar solo texto, solo foto(s), o ambos.
    if (!conversation_id || !contact_id || (!message && imgs.length === 0)) {
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
        JSON.stringify({ success: false, error: 'Contacto no encontrado en CRM' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!contact.manychat_subscriber_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Este contacto no tiene ID de ManyChat asociado. No se puede enviar.',
          send_status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const manychatKey = Deno.env.get('MANYCHAT_API_KEY')
    if (!manychatKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'MANYCHAT_API_KEY no configurada en el sistema',
          send_status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Enviar via ManyChat ─────────────────────────────────────
    const ch = channel || 'whatsapp'
    const normalizedChannel = String(ch).toLowerCase()
    const contentType =
      normalizedChannel === 'whatsapp'
        ? 'whatsapp'
        : normalizedChannel === 'instagram'
          ? 'instagram'
          : normalizedChannel === 'messenger' || normalizedChannel === 'facebook'
            ? 'facebook'
            : undefined

    // Arma los mensajes: primero la imagen (si hay), luego el texto (si hay).
    const mcMessages: Array<Record<string, unknown>> = []
    for (const u of imgs) mcMessages.push({ type: 'image', url: u })
    if (message) mcMessages.push({ type: 'text', text: message })
    const contentPayload: Record<string, unknown> = { messages: mcMessages }
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
      return new Response(
        JSON.stringify({
          success: false,
          error: `Error de red al conectar con ManyChat: ${msg}`,
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

    // ── Si ManyChat rechaza → NO guardar, devolver error claro ──
    if (!mcResponse.ok || mcResult?.status === 'error') {
      const manychatMessage = mcResult?.message || mcResponse.statusText || 'Error desconocido'
      const isWindowRestriction =
        mcResult?.code === 3011 ||
        String(manychatMessage).toLowerCase().includes('over 24 hours') ||
        String(manychatMessage).toLowerCase().includes('outside the')

      return new Response(
        JSON.stringify({
          success: false,
          error: isWindowRestriction
            ? 'WhatsApp bloqueó el envío: el cliente lleva más de 24 horas sin escribir. Para reactivar la conversación, el cliente debe escribir primero.'
            : `ManyChat rechazó el envío: ${manychatMessage}`,
          send_status: isWindowRestriction ? 'failed_window_closed' : 'failed',
          details: mcResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── ManyChat acepto → guardar en BD ────────────────────────
    const now = new Date().toISOString()
    const mcMessageId =
      mcResult?.data?.message_id ?? mcResult?.message_id ?? null

    // Una fila por cada foto + una fila para el texto (si hay).
    const rows: Array<Record<string, unknown>> = imgs.map((u) => ({
      conversation_id, contact_id, direction: 'outbound', content: '', image_url: u,
      channel: ch, sent_at: now, send_status: 'sent', manychat_message_id: null,
    }))
    if (message) rows.push({
      conversation_id, contact_id, direction: 'outbound', content: message, image_url: null,
      channel: ch, sent_at: now, send_status: 'sent', manychat_message_id: mcMessageId ? String(mcMessageId) : null,
    })
    const { data: msgInserted, error: insertErr } = await supabase
      .from('messages')
      .insert(rows)
      .select('id')

    if (insertErr || !msgInserted) {
      // Caso raro: ManyChat envio OK pero no pudimos guardar.
      // El cliente ya recibio el mensaje pero el CRM no lo tendra.
      console.error('Error guardando outbound a BD:', insertErr)
      return new Response(
        JSON.stringify({
          success: true,
          warning: `Mensaje enviado al cliente pero NO se guardó en el CRM: ${insertErr?.message ?? 'error desconocido'}`,
          send_status: 'sent',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Update conversation last_message
    const resumen = message || (imgs.length > 1 ? `📷 ${imgs.length} fotos` : '📷 Foto')
    await supabase
      .from('conversations')
      .update({ last_message: resumen, last_message_at: now })
      .eq('id', conversation_id)

    return new Response(
      JSON.stringify({
        success: true,
        message_id: Array.isArray(msgInserted) ? msgInserted[0]?.id : msgInserted?.id,
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
