import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchPhoneFromManychat(subscriberId: string, apiKey: string): Promise<string> {
  // Try WhatsApp endpoint first, then FB/IG
  const endpoints = [
    `https://api.manychat.com/wa/subscriber/getInfo?subscriber_id=${subscriberId}`,
    `https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${subscriberId}`,
  ]
  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
      if (!r.ok) continue
      const j = await r.json()
      const data = j?.data ?? j
      const phone = (data?.phone ?? data?.whatsapp_phone ?? '').toString().trim()
      if (phone) return phone
    } catch (_) { /* keep trying */ }
  }
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const apiKey = Deno.env.get('MANYCHAT_API_KEY')!

  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') ?? 30)

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, manychat_subscriber_id, phone')
    .eq('channel', 'whatsapp')
    .or('phone.is.null,phone.eq.')
    .limit(limit)

  let updated = 0
  const errors: string[] = []

  for (const c of contacts ?? []) {
    if (!c.manychat_subscriber_id) continue
    const phone = await fetchPhoneFromManychat(c.manychat_subscriber_id, apiKey)
    if (!phone) continue

    await supabase.from('contacts').update({ phone }).eq('id', c.id)
    await supabase.from('leads').update({ telefono: phone }).eq('contact_id', c.id).or('telefono.is.null,telefono.eq.')
    updated++
  }

  return new Response(
    JSON.stringify({ ok: true, updated, total: contacts?.length ?? 0, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
