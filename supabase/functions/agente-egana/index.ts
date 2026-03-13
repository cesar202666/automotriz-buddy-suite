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

    // ManyChat webhook fields
    const mensajeCliente: string = body.last_input_text || body.text || ''
    const contactId: string = String(body.contact_id || body.id || '')
    const nombre: string = body.first_name || body.nombre || 'Cliente'
    const apellido: string = body.last_name || ''
    const telefono: string = body.phone || ''

    if (!mensajeCliente || !contactId) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: last_input_text y contact_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Llamar al AI Gateway de Lovable (compatible con OpenAI) ─────────────
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no configurado')
    }

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
            content: `${nombre} dice: ${mensajeCliente}`
          }
        ]
      })
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      throw new Error(`AI Gateway error [${aiResponse.status}]: ${errText}`)
    }

    const aiData = await aiResponse.json()
    const respuesta: string = aiData.choices?.[0]?.message?.content || 'Hola, gracias por contactarnos. Un vendedor te atenderá pronto.'

    // ── Guardar en Supabase ──────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: dbError } = await supabase.from('conversaciones').insert({
      contact_id: contactId,
      nombre,
      apellido,
      telefono,
      canal: 'manychat',
      mensaje_cliente: mensajeCliente,
      respuesta_agente: respuesta,
      leido: false,
      notificado_vendedor: false,
    })

    if (dbError) {
      console.error('DB insert error:', dbError)
      // No falla la respuesta al cliente por error de DB
    }

    // ── Respuesta en formato ManyChat ────────────────────────────────────────
    return new Response(
      JSON.stringify({
        messages: [{ type: 'text', text: respuesta }],
        set_field_values: [{ field_name: 'ultimo_mensaje_agente', value: respuesta }]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error en agente-egana:', error)
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
