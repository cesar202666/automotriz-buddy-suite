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
  // Elegibles: vendedores + admin/master (admin/master solo si están en rotación/canal).
  const { data: act } = await supabase.from('vendedores').select('nombre').eq('activo', true).in('rol', ['vendedor', 'administracion', 'master'])
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
`Eres Eli, vendedor/a de Egaña Automotriz, automotora en Puerto Montt (sucursal La Vara, Av. Ferrocarriles km 4), Chile. Atiendes el chat de la web egana.cl como un vendedor real: cercano, resolutivo y con ganas de ayudar a cerrar la compra.

TONO: español chileno natural y amable (puedes tutear). Mensajes CORTOS, como un chat real (1 a 3 líneas). Máximo 1 emoji. Nada acartonado. Si la persona te dice su nombre, úsalo. Mantén lenguaje neutro en género en los saludos (nada de "estimado/a" ni "bienvenido/a").

CÓMO VENDES (como un buen vendedor):
- Haz UNA pregunta a la vez, no interrogues. Primero entiende qué busca: uso, tipo de auto, presupuesto, si necesita financiamiento o entrega un auto en parte de pago.
- Cuando tengas una idea, RECOMIENDA 1 o 2 autos CONCRETOS del inventario de abajo, con una frase de por qué le convienen (ej. bajo kilometraje, económico, full equipo). Menciona precio y comparte el link de ficha si lo tiene.
- Si te preguntan directamente "¿qué tienes?", "¿qué opciones hay?" o por un tipo/marca (ej. "camionetas"), muestra 2 o 3 autos CONCRETOS del inventario al tiro (marca, modelo, año y precio), y recién después pregunta para afinar. No respondas solo con una pregunta cuando te piden ver opciones.
- Destaca los plus de Egaña cuando venga al caso: financiamiento con aprobación rápida, recibimos tu auto en parte de pago, autos revisados. Sin inventar cifras.
- Sé proactivo: si hay interés, invita a agendar una visita a la sucursal o a que un ejecutivo le mande fotos y la cotización.

REGLA DE ORO — INVENTARIO: recomienda SOLO autos de la lista de abajo. NUNCA inventes autos, modelos, años, precios, cuotas ni condiciones. Si no hay algo que calce, dilo con honestidad y ofrece avisarle cuando ingrese, o pídele sus datos para buscarle opciones.

CUÁNDO PEDIR LOS DATOS (clave — NO los pidas antes de tiempo):
- Tu prioridad es ASESORAR: muestra autos, da detalles, resuelve dudas. NO pidas nombre ni teléfono solo porque miró un auto o preguntó el precio. Muchos solo están mirando.
- Pide el NOMBRE y TELÉFONO SOLO cuando la persona muestre intención REAL de avanzar: pregunta por FORMAS DE PAGO o FINANCIAMIENTO, quiere VISITAR la sucursal / ir a verlo / agendar, quiere RESERVAR o COMPRAR, pide o quiere enviar DOCUMENTACIÓN, o pide hablar con un ejecutivo/que lo llamen.
- Cuando llegue ese momento, dile que lo conectas con un ejecutivo que lo seguirá atendiendo y pídele nombre y teléfono para coordinar.
${tieneTelefono
  ? 'IMPORTANTE: la persona ya mostró intención real y tienes su teléfono. Agradece (con su nombre si lo sabes), confirma que un ejecutivo de Egaña lo contactará muy pronto a ese número para coordinar el pago/visita/documentación, y cierra cálido. No sigas pidiendo datos.'
  : 'Todavía es una consulta general: sigue asesorando y mostrando autos, SIN pedir datos. Solo pide nombre y teléfono cuando aparezca una señal real (pago, financiamiento, visita, reserva, compra o documentación).'}

NO HAGAS: no prometas cosas absolutas ("te lo garantizo"), no des cuotas/tasas exactas (eso lo cierra el ejecutivo), no pidas RUT, tarjetas ni claves.

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

    // Señal de intención REAL de compra (no simples curiosos): pregunta por pago/
    // financiamiento, quiere visitar, reservar, comprar, o pide documentación.
    const intencionCompra = /(forma[s]? de pago|medio[s]? de pago|financ|cr[eé]dito|cuota|\bpie\b|abono|transferencia|visit|agendar|agenda|ir a ver|verlo|ver el auto|probarlo|test drive|reserv|comprar|comprarlo|lo quiero|me lo llevo|documenta|papeles|antecedentes|cotiz|hablar con (un |una )?(vendedor|ejecutivo|asesor|persona)|me llam|ll[aá]mame|ll[aá]menme|whatsapp)/i.test(convText + ' ' + message)
    // Solo se deriva al vendedor si HAY teléfono Y HAY intención real de compra.
    const escalar = !!phone && intencionCompra

    // Guardamos el teléfono en el contacto aunque todavía no escalemos.
    if (phone && phone !== contact.phone) {
      await supabase.from('contacts').update({ phone }).eq('id', contactId)
    }

    // ── 6. Generar respuesta con la IA (mismo proveedor que el agente) ──────
    const apiKey = Deno.env.get('AI_API_KEY')
    let reply = 'Gracias por escribir a Egaña Automotriz 🙌 Un ejecutivo te contactará a la brevedad.'
    if (apiKey) {
      const gatewayUrl = Deno.env.get('AI_GATEWAY_URL') ?? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      const chatModel = Deno.env.get('AI_CHAT_MODEL') ?? 'gemini-2.0-flash'
      // Modelos de respaldo: cada modelo de Gemini tiene su propia cuota, así que
      // si el principal da 429 probamos otro antes de rendirnos.
      const modelos = [...new Set([chatModel, 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'])]
      const messages = [
        { role: 'system', content: buildSystemPrompt(inventario, escalar) },
        ...(hist || []).slice(-10).map((h: { direction: string; content: string }) => ({ role: h.direction === 'outbound' ? 'assistant' : 'user', content: h.content })),
      ]
      let respondido = false
      for (const modelo of modelos) {
        for (let attempt = 0; attempt < 2 && !respondido; attempt++) {
          try {
            const controller = new AbortController()
            const t = setTimeout(() => controller.abort(), 20000)
            const r = await fetch(gatewayUrl, {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: modelo, messages, temperature: 0.5, max_tokens: 350 }),
              signal: controller.signal,
            })
            clearTimeout(t)
            if (r.ok) {
              const d = await r.json()
              const txt = str(d?.choices?.[0]?.message?.content)
              if (txt) { reply = txt; respondido = true; break }
            } else {
              const errTxt = (await r.text()).slice(0, 200)
              console.error(`web-chat LLM error (${modelo}, intento ${attempt + 1})`, r.status, errTxt)
              // 4xx que no sea 429 → error del modelo, pasar al siguiente modelo.
              if (r.status !== 429 && r.status < 500) break
            }
          } catch (e) { console.error(`web-chat LLM excepción (${modelo})`, e) }
          if (!respondido) await new Promise((res) => setTimeout(res, 500 * (attempt + 1)))
        }
        if (respondido) break
      }
    }

    // ── 7. Guardar respuesta del bot ────────────────────────────────────────
    await supabase.from('messages').insert({ conversation_id: conversationId, contact_id: contactId, direction: 'outbound', content: reply, channel: CHANNEL, sent_at: new Date().toISOString() })

    // ── 8. ¿Escalar? Solo con teléfono + intención real de compra ───────────
    let escalated = false
    if (escalar) {
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
