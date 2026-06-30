import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// BOT DE VENTAS — SOLO para el chat de la web (egana.cl). NO toca ManyChat.
//
// - Cada visitante manda un `session_id` único (generado en su navegador), así
//   dos personas distintas NUNCA se mezclan: cada session_id = un contacto y una
//   conversación propios (canal "web").
// - El bot conversa como vendedor, recomienda autos REALES del inventario,
//   califica al cliente y cuando deja nombre+teléfono lo ESCALA a un vendedor
//   humano (lo asigna, lo marca en el CRM y el bot deja de responder).
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHANNEL = 'web'
const WEB_BASE = 'https://egana.cl/vehiculo/'

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v)
}

/** Normaliza teléfono chileno: dígitos (+ inicial). Vacío si inválido. */
function normalizePhone(raw: string): string {
  if (!raw) return ''
  const cleaned = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
  const digits = cleaned.replace(/^\+/, '')
  if (digits.length < 8) return ''
  return cleaned
}

/** Extrae un teléfono de un texto libre (ej: "mi fono es +569 1234 5678"). */
function findPhone(text: string): string {
  const m = text.match(/(\+?56)?[\s.-]?9[\s.-]?\d{4}[\s.-]?\d{4}/)
  if (m) return normalizePhone(m[0])
  const m2 = text.match(/\d[\d\s.-]{7,}\d/)
  return m2 ? normalizePhone(m2[0]) : ''
}

interface RotacionVendedor { vendedor_id: string; nombre: string; activo: boolean; consecutivos: number }

// deno-lint-ignore no-explicit-any
async function getVendedorAsignado(supabase: any, modo: string, canal: string, porCanal: Record<string, string>, def: string): Promise<string> {
  const { data: act } = await supabase.from('vendedores').select('nombre').eq('activo', true).eq('rol', 'vendedor')
  const nombres = new Set((act || []).map((v: { nombre: string }) => (v.nombre || '').trim()))
  const ok = (n: string) => !!n && nombres.has(n.trim())
  if (modo === 'MANUAL') return ''
  if (modo === 'POR_CANAL') { const c = porCanal[canal] || def || ''; if (ok(c)) return c }
  const { data: rotRow } = await supabase.from('configuracion_sistema').select('valor').eq('clave', 'ROTACION_VENDEDORES').maybeSingle()
  let rot: RotacionVendedor[] = []
  try { rot = JSON.parse(rotRow?.valor || '[]') } catch { /* ignore */ }
  const activeRot = rot.filter((v) => v.activo && nombres.has((v.nombre || '').trim()))
  if (activeRot.length > 0) {
    const { data: chosen, error } = await supabase.rpc('asignar_siguiente_vendedor', { _rotacion: activeRot })
    if (!error && typeof chosen === 'string' && ok(chosen)) return chosen
  }
  const { data: vs } = await supabase.from('vendedores').select('nombre').eq('activo', true).eq('rol', 'vendedor')
  if (!vs || vs.length === 0) return ok(def) ? def : ''
  if (modo === 'RANDOM') return vs[Math.floor(Math.random() * vs.length)].nombre
  const { data: leads } = await supabase.from('leads').select('vendedor_asignado').not('etapa', 'in', '("ganado","perdido")').not('vendedor_asignado', 'is', null)
  const count: Record<string, number> = {}
  vs.forEach((v: { nombre: string }) => { count[v.nombre] = 0 })
  ;(leads || []).forEach((l: { vendedor_asignado: string }) => { if (count[l.vendedor_asignado] !== undefined) count[l.vendedor_asignado]++ })
  return vs.sort((a: { nombre: string }, b: { nombre: string }) => (count[a.nombre] || 0) - (count[b.nombre] || 0))[0].nombre
}

// ── Inventario: arma una lista de autos reales para que el bot recomiende ─────
const MARCAS = ['toyota','chevrolet','nissan','hyundai','kia','suzuki','mazda','jeep','haval','chery','peugeot','renault','ford','volkswagen','vw','mitsubishi','honda','mercedes','bmw','audi','citroen','fiat','subaru','dfsk','maxus','jac','great wall','ssangyong','changan','baic']
const TIPOS = ['suv','sedan','sedán','camioneta','hatchback','coupe','coupé','furgon','furgón','station','van','4x4']

// deno-lint-ignore no-explicit-any
async function buildInventario(supabase: any, convText: string): Promise<string> {
  const low = convText.toLowerCase()
  const cols = 'id, marca, modelo, anio, precio_venta, tipo, kilometraje, combustible, transmision, publicado_web'

  // Palabras clave que mencionó el cliente (marca/tipo).
  const kws = [...MARCAS, ...TIPOS].filter((k) => low.includes(k))
  // Presupuesto: "15 millones", "$15M", "hasta 10"
  let maxPrecio = 0
  const mm = low.match(/(\d{1,3})\s*(millones|millon|m\b|mm)/)
  if (mm) maxPrecio = parseInt(mm[1], 10) * 1_000_000

  // deno-lint-ignore no-explicit-any
  let rows: any[] = []
  if (kws.length > 0) {
    const orFilter = kws.map((k) => `marca.ilike.%${k}%,modelo.ilike.%${k}%,tipo.ilike.%${k}%`).join(',')
    let q = supabase.from('vehiculos').select(cols).eq('estado', 'DISPONIBLE').or(orFilter).limit(20)
    if (maxPrecio > 0) q = q.lte('precio_venta', maxPrecio)
    const { data } = await q
    rows = data || []
  }
  if (rows.length === 0) {
    // Sin coincidencias → autos publicados en la web (los que tienen ficha/links).
    let q = supabase.from('vehiculos').select(cols).eq('estado', 'DISPONIBLE').order('updated_at', { ascending: false }).limit(14)
    if (maxPrecio > 0) q = q.lte('precio_venta', maxPrecio)
    const { data } = await q
    rows = data || []
  }
  if (rows.length === 0) return 'No hay autos disponibles cargados en este momento.'

  return rows.slice(0, 20).map((r) => {
    const precio = r.precio_venta ? `$${Number(r.precio_venta).toLocaleString('es-CL')}` : 'consultar'
    const km = r.kilometraje ? `${Number(r.kilometraje).toLocaleString('es-CL')} km` : ''
    const link = r.publicado_web ? ` | Ficha: ${WEB_BASE}${r.id}` : ''
    return `- ${r.marca} ${r.modelo} ${r.anio || ''} (${r.tipo || ''}) · ${precio} · ${km} · ${r.combustible || ''} ${r.transmision || ''}${link}`.replace(/\s+/g, ' ').trim()
  }).join('\n')
}

function buildSystemPrompt(inventario: string, tieneTelefono: boolean): string {
  return (
`Eres "Eli", asesor/a de ventas de Egaña Automotriz, automotora en Puerto Montt (sucursal La Vara, Av. Ferrocarriles km 4), Chile. Atiendes el chat de la web egana.cl.

ESTILO: español chileno, cercano y profesional. Respuestas CORTAS (2 a 4 líneas). Máximo 1 emoji. Lenguaje NEUTRO en género (nada de "estimado/a", "bienvenido/a").

TU OBJETIVO: ayudar a la persona a encontrar su auto y CALIFICARLA para pasarla a un ejecutivo humano que cierre la venta.

CÓMO ATIENDES:
1. Saluda y pregunta qué busca: tipo de auto, uso, presupuesto aproximado, si necesita financiamiento y si entrega un auto en parte de pago.
2. Recomienda SOLO autos de la lista de INVENTARIO de abajo. Puedes decir el precio publicado y compartir el link de ficha si lo tiene. NUNCA inventes autos, modelos, años, precios ni condiciones que no estén en la lista.
3. Si no hay un auto que calce, dilo con honestidad y ofrece avisarle cuando ingrese algo así.
4. Cuando note interés real, PIDE el NOMBRE y el TELÉFONO para que un ejecutivo lo contacte y le envíe fotos y cotización.
5. Egaña ofrece financiamiento con aprobación rápida y recibe autos en parte de pago. Para el detalle del crédito, cuota final o descuentos, deriva al ejecutivo (no inventes números).
${tieneTelefono
  ? '6. YA TIENES el teléfono del cliente: agradece, confirma que un ejecutivo de Egaña lo contactará a la brevedad por ese número, y cierra cordialmente.'
  : '6. Aún NO tienes el teléfono: sigue ayudando y, cuando haya interés, pídelo junto al nombre.'}

REGLAS: no prometas cosas absolutas; no pidas RUT, tarjetas ni claves; si el mensaje es confuso, pide que lo aclare amablemente.

INVENTARIO DISPONIBLE (usa SOLO estos autos):
${inventario}`
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const body = await req.json() as Record<string, unknown>
    const sessionId = str(body.session_id) || str(body.sessionId)
    const message = str(body.message) || str(body.mensaje)
    const nombreIn = str(body.nombre)

    if (!sessionId) return new Response(JSON.stringify({ ok: false, error: 'Falta session_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (!message) return new Response(JSON.stringify({ ok: false, error: 'Falta el mensaje' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const subscriberId = `web:${sessionId}` // ← identifica de forma única a ESTE visitante

    // ── 1. Contacto (único por sesión) ──────────────────────────────────────
    const { data: contact } = await supabase
      .from('contacts')
      .upsert({ manychat_subscriber_id: subscriberId, name: nombreIn || undefined, channel: CHANNEL, last_seen: new Date().toISOString() }, { onConflict: 'manychat_subscriber_id', ignoreDuplicates: false })
      .select('id, name, phone')
      .single()
    if (!contact) throw new Error('No se pudo crear el contacto')
    const contactId: string = contact.id

    // ── 2. Conversación de ESTA sesión ──────────────────────────────────────
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, escalated, unread_count')
      .eq('contact_id', contactId).eq('channel', CHANNEL)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    let conversationId: string
    if (conv) {
      conversationId = conv.id
      await supabase.from('conversations').update({ last_message: message, last_message_at: new Date().toISOString(), unread_count: (conv.unread_count || 0) + 1, status: 'active' }).eq('id', conversationId)
    } else {
      const { data: nc } = await supabase.from('conversations').insert({ contact_id: contactId, channel: CHANNEL, status: 'active', last_message: message, last_message_at: new Date().toISOString(), unread_count: 1 }).select('id').single()
      conversationId = nc!.id
    }

    // ── 3. Guardar mensaje entrante ─────────────────────────────────────────
    await supabase.from('messages').insert({ conversation_id: conversationId, contact_id: contactId, direction: 'inbound', content: message, channel: CHANNEL, sent_at: new Date().toISOString() })

    // ── 4. Si ya está escalado → el humano tomó el control, el bot calla ────
    if (conv?.escalated) {
      const reply = 'Ya te dejé con un ejecutivo de Egaña 🙌 Te va a contactar muy pronto. ¿Algo más mientras tanto?'
      await supabase.from('messages').insert({ conversation_id: conversationId, contact_id: contactId, direction: 'outbound', content: reply, channel: CHANNEL, sent_at: new Date().toISOString() })
      return new Response(JSON.stringify({ ok: true, reply, escalated: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── 5. Historial + inventario ───────────────────────────────────────────
    const { data: hist } = await supabase.from('messages').select('direction, content').eq('conversation_id', conversationId).order('sent_at', { ascending: true }).limit(12)
    const convText = (hist || []).filter((h: { direction: string }) => h.direction === 'inbound').map((h: { content: string }) => h.content).join(' ')
    const inventario = await buildInventario(supabase, convText + ' ' + message)

    // ¿El cliente dejó su teléfono? (en este mensaje o ya guardado)
    const phone = contact.phone || findPhone(message) || findPhone(convText)

    // ── 6. Generar respuesta con la IA (mismo proveedor que el agente) ──────
    const apiKey = Deno.env.get('AI_API_KEY')
    let reply = 'Gracias por escribir a Egaña Automotriz 🙌 Un ejecutivo te contactará a la brevedad.'
    if (apiKey) {
      const gatewayUrl = Deno.env.get('AI_GATEWAY_URL') ?? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      const chatModel = Deno.env.get('AI_CHAT_MODEL') ?? 'gemini-2.0-flash'
      const messages = [
        { role: 'system', content: buildSystemPrompt(inventario, !!phone) },
        ...(hist || []).slice(-10).map((h: { direction: string; content: string }) => ({ role: h.direction === 'outbound' ? 'assistant' : 'user', content: h.content })),
      ]
      try {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), 20000)
        const r = await fetch(gatewayUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: chatModel, messages, temperature: 0.5, max_tokens: 350 }),
          signal: controller.signal,
        })
        clearTimeout(t)
        if (r.ok) {
          const d = await r.json()
          const txt = str(d?.choices?.[0]?.message?.content)
          if (txt) reply = txt
        } else {
          console.error('web-chat LLM error', r.status, (await r.text()).slice(0, 200))
        }
      } catch (e) { console.error('web-chat LLM excepción', e) }
    }

    // ── 7. Guardar respuesta del bot ────────────────────────────────────────
    await supabase.from('messages').insert({ conversation_id: conversationId, contact_id: contactId, direction: 'outbound', content: reply, channel: CHANNEL, sent_at: new Date().toISOString() })

    // ── 8. ¿Escalar a vendedor humano? Cuando ya tenemos su teléfono. ───────
    let escalated = false
    if (phone) {
      // Asignar vendedor con la lógica del sistema.
      const { data: cfgRows } = await supabase.from('configuracion_sistema').select('clave, valor').in('clave', ['ASIGNACION_MODO', 'VENDEDOR_DEFAULT', 'ASIGNACION_POR_CANAL'])
      const cfg: Record<string, string> = {}
      ;(cfgRows || []).forEach((r: { clave: string; valor: string }) => { cfg[r.clave] = r.valor })
      let porCanal: Record<string, string> = {}
      try { porCanal = JSON.parse(cfg.ASIGNACION_POR_CANAL || '{}') } catch { /* ignore */ }
      const vendedor = await getVendedorAsignado(supabase, (cfg.ASIGNACION_MODO || 'ORDENADO').toUpperCase(), CHANNEL, porCanal, cfg.VENDEDOR_DEFAULT || '')

      const nombreFinal = nombreIn || contact.name || 'Cliente Web'
      if (phone && phone !== contact.phone) await supabase.from('contacts').update({ phone, name: nombreFinal }).eq('id', contactId)

      const { data: lead } = await supabase.from('leads').select('id').eq('contact_id', contactId).maybeSingle()
      const notas = (convText + ' ' + message).slice(0, 500)
      if (!lead) {
        await supabase.from('leads').insert({ contact_id: contactId, conversation_id: conversationId, nombre: nombreFinal, telefono: phone, canal: CHANNEL, etapa: 'nuevo', score: 60, urgencia: 'media', interes: notas.slice(0, 120), vendedor_asignado: vendedor || '', notas })
      } else {
        await supabase.from('leads').update({ telefono: phone, nombre: nombreFinal, vendedor_asignado: vendedor || undefined, updated_at: new Date().toISOString() }).eq('id', lead.id)
      }
      await supabase.from('conversations').update({ escalated: true, escalated_at: new Date().toISOString(), escalated_to: vendedor || '', assigned_to: vendedor || '' }).eq('id', conversationId)
      escalated = true
    }

    return new Response(JSON.stringify({ ok: true, reply, escalated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: unknown) {
    console.error('Error en web-chat:', error)
    const msg = error instanceof Error ? error.message : 'Error interno'
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
