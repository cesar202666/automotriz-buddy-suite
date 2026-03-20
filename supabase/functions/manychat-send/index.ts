import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { campana_id } = await req.json()

  const { data: campana } = await supabase
    .from('campanas')
    .select('*')
    .eq('id', campana_id)
    .single()

  if (!campana) {
    return new Response(JSON.stringify({ error: 'Campaña no encontrada' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const manychatKey = Deno.env.get('MANYCHAT_API_KEY') || ''
  if (!manychatKey) {
    return new Response(JSON.stringify({ error: 'MANYCHAT_API_KEY no configurada' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const { data: contactos } = await supabase
    .from('contacts')
    .select('id, name, manychat_subscriber_id')
    .in('id', campana.destinatarios_ids)

  let enviados = 0
  for (const contacto of (contactos || [])) {
    if (!contacto.manychat_subscriber_id) continue

    const mensaje = campana.mensaje.replace(/\{\{nombre\}\}/g, contacto.name || 'Cliente')

    try {
      await fetch('https://api.manychat.com/fb/sending/sendContent', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${manychatKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriber_id: contacto.manychat_subscriber_id,
          data: { version: 'v2', content: { messages: [{ type: 'text', text: mensaje }] } },
        }),
      })
      enviados++
    } catch (e) {
      console.error('Error enviando a', contacto.id, e)
    }
  }

  await supabase
    .from('campanas')
    .update({ estado: 'enviada', enviada_at: new Date().toISOString() })
    .eq('id', campana_id)

  return new Response(JSON.stringify({ enviados, total: contactos?.length || 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
