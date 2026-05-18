import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface HorarioConfig {
  dia: string;
  activo: boolean;
  inicio: string;
  fin: string;
}

function isWithinSchedule(horariosConfig: HorarioConfig[], now: Date): boolean {
  const diasMap: Record<number, string> = {
    0: "Domingo",
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado",
  };
  const diaNombre = diasMap[now.getDay()];
  const diaConf = horariosConfig.find((d) => d.dia === diaNombre);
  if (!diaConf || !diaConf.activo) return false;
  const [hIni, mIni] = diaConf.inicio.split(":").map(Number);
  const [hFin, mFin] = diaConf.fin.split(":").map(Number);
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  return totalMinutes >= hIni * 60 + mIni && totalMinutes <= hFin * 60 + mFin;
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+/g) || [];
}

const PHONE_REGEX = /(\+?\d[\d\s\-]{7,})/;
const INVALID_NAME_WORDS = new Set([
  "quiero",
  "comprar",
  "auto",
  "autos",
  "vehiculo",
  "vehiculos",
  "necesito",
  "consulta",
  "consultar",
  "informacion",
  "precio",
  "credito",
  "financiamiento",
  "ejecutivo",
  "vendedor",
  "contacto",
  "telefono",
  "numero",
  "whatsapp",
  "instagram",
  "facebook",
  "messenger",
  "derivarte",
  "atencion",
  "atenderte",
  "y",
]);

function normalizeToken(token: string): string {
  return token.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function extractRawPhone(text: string): string {
  return text.match(PHONE_REGEX)?.[1]?.trim() || "";
}

function normalizePhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return "";
  if (trimmed.startsWith("+") || digits.startsWith("56")) return `+${digits}`;
  if (digits.length === 9) return `+56${digits}`;
  return `+${digits}`;
}

function sanitizeNameCandidate(text: string): string {
  const cleaned = text
    .replace(
      /\b(hola|buenas|buenos|dias|días|tardes|noches|soy|me|llamo|mi|nombre|es|telefono|teléfono|fono|celular|numero|número|contacto|por|favor|gracias|y)\b/giu,
      " ",
    )
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return "";
  if (words.some((word) => INVALID_NAME_WORDS.has(normalizeToken(word)))) {
    return "";
  }

  return normalizePersonName(words.join(" "));
}

function extractNameFromMessage(text: string): string {
  const rawPhone = extractRawPhone(text);
  const candidate = rawPhone ? text.replace(rawPhone, " ") : text;
  return sanitizeNameCandidate(candidate);
}

function normalizePersonName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();

  const firstToken = normalizeToken(parts[0]);
  let nextIndex = 1;

  while (
    nextIndex < parts.length && normalizeToken(parts[nextIndex]) === firstToken
  ) {
    nextIndex += 1;
  }

  return [parts[0], ...parts.slice(nextIndex)].join(" ");
}

function getFirstName(name: string): string {
  return normalizePersonName(name).split(/\s+/)[0] || "Cliente";
}

function isFullName(name: string): boolean {
  const normalized = normalizePersonName(name).trim();
  if (!normalized || normalizeToken(normalized) === "cliente") return false;
  return normalized.split(/\s+/).length >= 2;
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EganaBot/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 2000);
  } catch {
    return "";
  }
}

interface RotacionVendedor {
  vendedor_id: string;
  nombre: string;
  activo: boolean;
  consecutivos: number;
}

async function getVendedorAsignado(
  supabase: ReturnType<typeof createClient>,
  modo: string,
  canal: string,
  asignacionPorCanal: Record<string, string>,
  vendedorDefault: string,
): Promise<string> {
  // ── Always load the canonical list of ACTIVE sellers (rol = 'vendedor') ──
  // This is the single source of truth: nobody outside this list can ever
  // be assigned, regardless of mode, rotation config or stale defaults.
  const { data: vendedoresActivos } = await supabase
    .from("vendedores")
    .select("nombre")
    .eq("activo", true)
    .eq("rol", "vendedor");

  const nombresActivos = new Set(
    (vendedoresActivos || []).map((v: { nombre: string }) => (v.nombre || "").trim()),
  );
  const isElegible = (n: string) => !!n && nombresActivos.has(n.trim());

  if (modo === "MANUAL") return "";
  if (modo === "POR_CANAL") {
    const candidato = asignacionPorCanal[canal] || vendedorDefault || "";
    if (isElegible(candidato)) return candidato;
    // fall through to rotation/ordered if the configured one is not a real active vendedor
  }

  // ── Check for rotation config ────────────────────────────────────────────
  const { data: rotacionRow } = await supabase
    .from("configuracion_sistema")
    .select("valor")
    .eq("clave", "ROTACION_VENDEDORES")
    .maybeSingle();

  let rotacionList: RotacionVendedor[] = [];
  try {
    rotacionList = JSON.parse(rotacionRow?.valor || "[]");
  } catch {}

  // Only keep rotation entries that are marked active AND still exist as active sellers
  const activeRotacion = rotacionList.filter(
    (v) => v.activo && nombresActivos.has((v.nombre || "").trim()),
  );

  if (activeRotacion.length > 0) {
    // Atomic rotation via Postgres function (SELECT ... FOR UPDATE inside)
    // This prevents race conditions when multiple webhooks arrive simultaneously
    // and would otherwise read the same index and assign the same vendor twice.
    const { data: chosen, error: rpcErr } = await supabase.rpc(
      "asignar_siguiente_vendedor",
      { _rotacion: activeRotacion },
    );
    if (!rpcErr && typeof chosen === "string" && chosen.trim() && isElegible(chosen)) {
      return chosen;
    }
    // If RPC fails for any reason, fall through to the load-balanced fallback
  }

  // ── Fallback: original logic ─────────────────────────────────────────────
  const { data: vendedores } = await supabase
    .from("vendedores")
    .select("nombre")
    .eq("activo", true)
    .eq("rol", "vendedor");

  if (!vendedores || vendedores.length === 0) {
    return isElegible(vendedorDefault) ? vendedorDefault : "";
  }

  if (modo === "RANDOM") {
    return vendedores[Math.floor(Math.random() * vendedores.length)].nombre;
  }

  // ORDENADO — menor carga de leads activos
  const { data: leadsCount } = await supabase
    .from("leads")
    .select("vendedor_asignado")
    .not("etapa", "in", '("ganado","perdido")')
    .not("vendedor_asignado", "is", null);

  const countMap: Record<string, number> = {};
  vendedores.forEach((v) => {
    countMap[v.nombre] = 0;
  });
  (leadsCount || []).forEach((l: { vendedor_asignado: string }) => {
    if (l.vendedor_asignado && countMap[l.vendedor_asignado] !== undefined) {
      countMap[l.vendedor_asignado]++;
    }
  });

  return vendedores.sort((a, b) =>
    (countMap[a.nombre] || 0) - (countMap[b.nombre] || 0)
  )[0].nombre;
}

/** Get last N messages for conversation memory */
async function getConversationHistory(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  limit = 12,
): Promise<Array<{ role: "user" | "assistant"; content: string; sentAt: string }>> {
  if (!conversationId) return [];

  const { data: msgs } = await supabase
    .from("messages")
    .select("direction, content, sent_at, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!msgs || msgs.length === 0) return [];

  return msgs.map((m: { direction: string; content: string }) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content,
    sentAt: (m as { sent_at?: string | null; created_at?: string }).sent_at ||
      (m as { sent_at?: string | null; created_at?: string }).created_at || "",
  }));
}

async function ensureInboundMessage(
  supabase: ReturnType<typeof createClient>,
  params: {
    conversationId: string;
    contactId: string;
    mensajeCliente: string;
    canal: string;
    manychatMessageId: string;
    sentAt: string;
  },
): Promise<boolean> {
  const {
    conversationId,
    contactId,
    mensajeCliente,
    canal,
    manychatMessageId,
    sentAt,
  } = params;

  if (!conversationId || !mensajeCliente) return false;

  if (manychatMessageId) {
    const { data: existingMsgById } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("manychat_message_id", manychatMessageId)
      .maybeSingle();

    if (existingMsgById) return false;
  } else {
    const sentAtDate = new Date(sentAt);
    const windowStart = new Date(sentAtDate.getTime() - 90 * 1000)
      .toISOString();
    const windowEnd = new Date(sentAtDate.getTime() + 90 * 1000).toISOString();

    const { data: recentDuplicate } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .eq("content", mensajeCliente)
      .gte("sent_at", windowStart)
      .lte("sent_at", windowEnd)
      .limit(1)
      .maybeSingle();

    if (recentDuplicate) return false;
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    contact_id: contactId || null,
    direction: "inbound",
    content: mensajeCliente,
    channel: canal,
    manychat_message_id: manychatMessageId || null,
    sent_at: sentAt,
  });

  return true;
}

// ── Respuesta fija para conversaciones ya escaladas ───────────────────────────
// IMPORTANTE: El bot NO debe generar texto propio. Siempre responde la MISMA frase.
// No se llama a ningún modelo de IA aquí para evitar variaciones o invenciones.
const FRASE_UNICA =
  `¡Hola! Gracias por escribir a Egaña Automotriz. Un ejecutivo te contactará en breve. 🙌`;

async function generateAIFollowUp(
  _history: Array<{ role: "user" | "assistant"; content: string }>,
  _mensajeCliente: string,
  _vendedorAsignado: string,
): Promise<string> {
  // REGLA ESTRICTA: prohibido inventar palabras. Solo se devuelve la frase única
  // definida por el negocio. No se consulta ningún LLM bajo ninguna circunstancia.
  return FRASE_UNICA;
}


async function sendViaManychat(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  canal: string,
  text: string,
): Promise<void> {
  const manychatKey = Deno.env.get("MANYCHAT_API_KEY") || "";
  if (!manychatKey || !contactId) return;

  const { data: contactData } = await supabase
    .from("contacts")
    .select("manychat_subscriber_id")
    .eq("id", contactId)
    .single();

  if (!contactData?.manychat_subscriber_id) {
    console.warn("[AGENTE-IA][followup] Sin manychat_subscriber_id");
    return;
  }

  const contentPayload: Record<string, unknown> = {
    messages: [{ type: "text", text }],
  };
  const normalizedCanal = canal.toLowerCase();
  if (normalizedCanal === "whatsapp") contentPayload.type = "whatsapp";
  else if (normalizedCanal === "instagram") contentPayload.type = "instagram";
  else if (normalizedCanal === "messenger" || normalizedCanal === "facebook") {
    contentPayload.type = "facebook";
  }

  try {
    const mcResp = await fetch(
      "https://api.manychat.com/fb/sending/sendContent",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${manychatKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriber_id: contactData.manychat_subscriber_id,
          data: { version: "v2", content: contentPayload },
        }),
      },
    );
    const mcText = await mcResp.text();
    console.log("[AGENTE-IA][followup] ManyChat send response:", mcText);
  } catch (e) {
    console.error("[AGENTE-IA][followup] Error enviando via ManyChat:", e);
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // contact_id ahora es el UUID real del contacto (enviado por los webhooks)
    const contactId: string = body.contact_id || "";
    const externalId: string = body.external_id || body.contact_id || "";
    const mensajeCliente: string = body.last_input_text || body.text || "";
    const nombre: string = body.first_name || body.nombre || "Cliente";
    const apellido: string = body.last_name || "";
    const telefono: string = body.phone || "";
    const canal: string = body.channel || "manychat";
    let conversationId: string = body.conversation_id || "";
    const manychatMessageId: string = body.manychat_message_id || "";
    const phoneNumberId: string = body.phone_number_id || "";
    const senderId: string = body.sender_id || "";
    const accessToken: string = body.access_token || "";
    const source: string = body.source || "manychat"; // 'manychat' | 'meta'
    const inboundAlreadySaved: boolean = body.inbound_already_saved === true;
    const inboundSentAt: string = body.sent_at || new Date().toISOString();

    if (!mensajeCliente || !contactId) {
      return new Response(
        JSON.stringify({
          error: "Faltan campos requeridos: last_input_text y contact_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!conversationId && contactId) {
      const { data: latestConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .eq("channel", canal)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestConv?.id) {
        conversationId = latestConv.id;
      } else {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            contact_id: contactId,
            channel: canal,
            status: "active",
            last_message: mensajeCliente,
            last_message_at: new Date().toISOString(),
            unread_count: 0,
          })
          .select("id")
          .single();

        if (newConv?.id) conversationId = newConv.id;
      }
    }

    // ── Check if conversation is already escalated ─────────────────────────────
    // If escalated AND seller already opened the chat → bot stays silent (seller takes over).
    // If escalated but seller has NOT opened the chat yet → bot keeps replying with Lovable AI
    // so the client never feels ignored while waiting for the seller.
    if (conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select(
          "escalated, escalated_at, unread_count, primer_apertura_vendedor, assigned_to",
        )
        .eq("id", conversationId)
        .single();

      if (conv?.escalated) {
        const nowIso = new Date().toISOString();
        const insertedInbound = await ensureInboundMessage(supabase, {
          conversationId,
          contactId,
          mensajeCliente,
          canal,
          manychatMessageId,
          sentAt: inboundSentAt,
        });

        await supabase
          .from("conversations")
          .update({
            last_message: mensajeCliente,
            last_message_at: nowIso,
            unread_count: (conv.unread_count || 0) + (insertedInbound ? 1 : 0),
            status: "active",
          })
          .eq("id", conversationId);

        // Conversación escalada → bot DESACTIVADO completamente.
        // No responde más, el vendedor toma el control.
        return new Response(
          JSON.stringify({
            messages: [],
            set_field_values: [{ field_name: "escalado", value: "true" }],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Save inbound message if not escalated ──────────────────────────────────
    if (conversationId) {
      const nowIso = new Date().toISOString();
      const insertedInbound = await ensureInboundMessage(supabase, {
        conversationId,
        contactId,
        mensajeCliente,
        canal,
        manychatMessageId,
        sentAt: inboundSentAt,
      });

      if (insertedInbound) {
        await supabase.rpc("increment_unread", { conv_id: conversationId });
      }

      await supabase
        .from("conversations")
        .update({
          last_message: mensajeCliente,
          last_message_at: nowIso,
          status: "active",
        })
        .eq("id", conversationId);
    }

    const { data: configRows } = await supabase
      .from("configuracion_sistema")
      .select("clave, valor");

    const cfg: Record<string, string> = {};
    (configRows || []).forEach((r: { clave: string; valor: string }) => {
      cfg[r.clave] = r.valor;
    });

    // ── Check if agent is globally disabled ──────────────────────────────────
    const agenteActivo = (cfg.AGENTE_ACTIVO || "true") === "true";
    if (!agenteActivo) {
      return new Response(
        JSON.stringify({ messages: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Horarios: deshabilitado intencionalmente ──────────────────────────────
    // El bot SIEMPRE responde la misma frase fija y escala al vendedor,
    // sin importar el horario. No se debe inventar otro mensaje.

    const modoAsignacion = cfg.ASIGNACION_MODO || "ORDENADO";
    const vendedorDefault = cfg.VENDEDOR_DEFAULT || "";
    const notificarVendedor = (cfg.NOTIFICAR_VENDEDOR || "true") === "true";

    let asignacionPorCanal: Record<string, string> = {};
    try {
      asignacionPorCanal = JSON.parse(cfg.ASIGNACION_POR_CANAL || "{}");
    } catch {}

    // ── Determine channel type ─────────────────────────────────────────────────
    const isWhatsApp = canal === "whatsapp" || canal === "manychat";
    const isInstagramOrMessenger = canal === "instagram" ||
      canal === "messenger" || canal === "facebook";

    // ── Get assigned vendor ────────────────────────────────────────────────────
    const vendedorAsignado = await getVendedorAsignado(
      supabase,
      modoAsignacion,
      canal,
      asignacionPorCanal,
      vendedorDefault,
    );

    // ── Get conversation history to determine state ────────────────────────────
    const history = conversationId
      ? await getConversationHistory(supabase, conversationId, 20)
      : [];
    const inboundReferenceMs = Number.isFinite(new Date(inboundSentAt).getTime())
      ? new Date(inboundSentAt).getTime()
      : Date.now();
    const sessionTimeoutMs = 30 * 60 * 1000;
    const sessionHistory = history.filter((m) => {
      const messageTs = new Date(m.sentAt).getTime();
      if (!Number.isFinite(messageTs)) return true;
      return inboundReferenceMs - messageTs <= sessionTimeoutMs;
    });

    const outboundMessages = sessionHistory.filter((m) => m.role === "assistant");
    const isFirstContact = outboundMessages.length === 0;

    // ── Detect if client already provided name/phone ───────────────────────────
    const allUserMessages = sessionHistory.filter((m) =>
      m.role === "user"
    ).map((m) => m.content).join(" ") + " " + mensajeCliente;
    const extractedName = extractNameFromMessage(mensajeCliente);
    const extractedPhone = normalizePhoneNumber(
      extractRawPhone(mensajeCliente),
    );
    const storedFullName = normalizePersonName(
      [nombre, apellido].filter(Boolean).join(" ").trim(),
    );
    const storedContactName = isFullName(storedFullName) ? storedFullName : "";
    const storedContactPhone = normalizePhoneNumber(telefono);

    let respuesta: string;
    let score = 0;
    let shouldEscalate = false;
    let clienteCreado = false;
    let calificacion = "frio"; // default

    // ── Auto-classify based on message content ─────────────────────────────────
    const hotKeywords = [
      "comprar",
      "quiero",
      "necesito",
      "urgente",
      "hoy",
      "ahora",
      "precio",
      "crédito",
      "credito",
      "reservar",
      "disponible",
    ];
    const warmKeywords = [
      "interesa",
      "consulta",
      "información",
      "informacion",
      "ver",
      "cotizar",
      "modelo",
      "cuánto",
      "cuanto",
      "financiamiento",
    ];

    if (containsKeyword(allUserMessages, hotKeywords)) {
      calificacion = "caliente";
    } else if (containsKeyword(allUserMessages, warmKeywords)) {
      calificacion = "tibio";
    }

    // Helper: try to find previously captured name from history
    const findCapturedName = (): string => {
      const userMsgs = sessionHistory.filter((m) => m.role === "user").map((m) =>
        m.content
      ).reverse();
      for (const msg of userMsgs) {
        const capturedName = extractNameFromMessage(msg);
        if (isFullName(capturedName)) return capturedName;
      }
      return "";
    };

    const findCapturedPhone = (): string => {
      const userMsgs = sessionHistory.filter((m) => m.role === "user").map((m) =>
        m.content
      ).reverse();
      for (const msg of userMsgs) {
        const capturedPhone = normalizePhoneNumber(extractRawPhone(msg));
        if (capturedPhone) return capturedPhone;
      }
      return "";
    };

    // ONLY use data captured within the current conversation — never from stored contact records
    // This ensures the agent always asks for name/phone on new conversations
    const knownClientName = extractedName || findCapturedName();
    const knownClientPhone = extractedPhone || findCapturedPhone();

    let capturedClientName = "";
    let capturedClientPhone = "";

    // ── Respuesta única: una sola frase fija y traspaso inmediato ─────────────
    // El bot responde SIEMPRE lo mismo, escala al vendedor y se desactiva.
    respuesta =
      `¡Hola! Gracias por escribir a Egaña Automotriz. Un ejecutivo te contactará en breve. 🙌`;
    shouldEscalate = true;

    // Intentar capturar nombre/teléfono del mensaje si vienen, solo para el lead
    capturedClientName = isFullName(knownClientName) ? knownClientName : "";
    capturedClientPhone = knownClientPhone || "";
    if (capturedClientName || capturedClientPhone) {
      const contactUpdates: Record<string, string> = {};
      if (capturedClientName) contactUpdates.name = capturedClientName;
      if (capturedClientPhone) contactUpdates.phone = capturedClientPhone;
      if (Object.keys(contactUpdates).length && contactId) {
        await supabase.from("contacts").update(contactUpdates).eq("id", contactId);
      }
      clienteCreado = !!capturedClientName;
    }

    // ── Reclassify existing lead on every message ───────────────────────────────
    if (conversationId && !shouldEscalate) {
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id, calificacion")
        .eq("conversation_id", conversationId)
        .maybeSingle();

      if (existingLead && existingLead.calificacion !== calificacion) {
        const updateData: Record<string, string> = { calificacion };
        if (calificacion !== "frio") {
          updateData.etapa = "calificado";
        }
        await supabase.from("leads").update(updateData).eq(
          "id",
          existingLead.id,
        );
        console.log(
          `[RECLASIFICACION] Lead ${existingLead.id}: ${existingLead.calificacion} → ${calificacion}, etapa → ${
            updateData.etapa || "sin cambio"
          }`,
        );
      }
    }

    // ── Upsert lead (only when escalating) ─────────────────────────────────────
    let leadId: string | null = null;

    if (shouldEscalate) {
      // Use the captured name (from conversation) or fallback
      let leadNombre = normalizePersonName(
        capturedClientName || nombre || mensajeCliente.split(/\s+/)[0] ||
          "Cliente",
      );
      const leadTelefono = capturedClientPhone || telefono || extractedPhone;

      const leadData = {
        nombre: leadNombre,
        telefono: leadTelefono,
        canal: isWhatsApp ? "whatsapp" : canal,
        etapa: calificacion !== "frio" ? "calificado" : "contactado",
        score: isWhatsApp ? score : 0,
        urgencia: score >= 70 ? "alta" : score >= 40 ? "media" : "baja",
        vendedor_asignado: vendedorAsignado,
        calificacion,
        notas: `Lead generado por agente IA. Canal: ${canal}.${
          clienteCreado ? " Cliente creado automáticamente." : ""
        }`,
        ...(conversationId ? { conversation_id: conversationId } : {}),
        ...(contactId ? { contact_id: contactId } : {}),
      };

      if (conversationId) {
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("conversation_id", conversationId)
          .maybeSingle();

        if (!existingLead) {
          const { data: newLead } = await supabase.from("leads").insert(
            leadData,
          ).select("id").single();
          leadId = newLead?.id || null;
        } else {
          leadId = existingLead.id;
          await supabase
            .from("leads")
            .update({
              nombre: leadNombre,
              telefono: leadTelefono,
              score: isWhatsApp ? score : undefined,
              vendedor_asignado: vendedorAsignado,
              etapa: calificacion !== "frio" ? "calificado" : "contactado",
              calificacion,
            })
            .eq("id", existingLead.id);
        }
      } else {
        const { data: newLead } = await supabase.from("leads").insert(leadData)
          .select("id").single();
        leadId = newLead?.id || null;
      }

      // ── Log activity ─────────────────────────────────────────────────────────
      const nowChile = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }),
      );
      const fechaHoraLegible = nowChile.toLocaleString("es-CL", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      if (leadId) {
        await supabase.from("lead_actividades").insert({
          lead_id: leadId,
          tipo: "traspaso_vendedor",
          descripcion: `🔔 Cliente traspasado a vendedor${
            vendedorAsignado ? ` "${vendedorAsignado}"` : ""
          }. Canal: ${canal}. Fecha: ${fechaHoraLegible}.${
            clienteCreado ? " Cliente registrado por agente IA." : ""
          }`,
          usuario: "Agente IA",
          created_at: new Date().toISOString(),
        });
      }

      // ── Mark conversation as escalated ──────────────────────────────────────
      if (conversationId) {
        await supabase
          .from("conversations")
          .update({
            escalated: true,
            escalated_at: new Date().toISOString(),
            assigned_to: vendedorAsignado,
          })
          .eq("id", conversationId);
      }

      if (notificarVendedor && vendedorAsignado) {
        console.log(
          `[NOTIFICACION VENDEDOR] Nuevo cliente asignado a ${vendedorAsignado}. Canal: ${canal}. Score: ${score}.`,
        );
      }
    }

    // ── Save outbound message ────────────────────────────────────────────────
    if (conversationId) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        contact_id: contactId || null,
        direction: "outbound",
        content: respuesta,
        channel: canal,
        sent_at: new Date().toISOString(),
      });

      await supabase
        .from("conversations")
        .update({
          last_message: respuesta,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }

    // ── Send agent reply to the client via ManyChat or Meta API ──────────────
    // ManyChat source: send via ManyChat sendContent API
    if (source === "manychat" && contactId) {
      const manychatKey = Deno.env.get("MANYCHAT_API_KEY") || "";
      if (manychatKey) {
        // Get subscriber_id from contacts table
        const { data: contactData } = await supabase
          .from("contacts")
          .select("manychat_subscriber_id")
          .eq("id", contactId)
          .single();

        if (contactData?.manychat_subscriber_id) {
          const contentPayload: Record<string, unknown> = {
            messages: [{ type: "text", text: respuesta }],
          };
          // Set channel type for ManyChat
          const normalizedCanal = canal.toLowerCase();
          if (normalizedCanal === "whatsapp") contentPayload.type = "whatsapp";
          else if (normalizedCanal === "instagram") contentPayload.type = "instagram";
          else if (normalizedCanal === "messenger" || normalizedCanal === "facebook") contentPayload.type = "facebook";

          try {
            const mcResp = await fetch("https://api.manychat.com/fb/sending/sendContent", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${manychatKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                subscriber_id: contactData.manychat_subscriber_id,
                data: { version: "v2", content: contentPayload },
              }),
            });
            const mcText = await mcResp.text();
            console.log("[AGENTE-IA] ManyChat send response:", mcText);
          } catch (e) {
            console.error("[AGENTE-IA] Error enviando via ManyChat:", e);
          }
        } else {
          console.warn("[AGENTE-IA] Contacto sin manychat_subscriber_id, no se puede enviar respuesta");
        }
      } else {
        console.warn("[AGENTE-IA] MANYCHAT_API_KEY no configurada, respuesta no enviada al cliente");
      }
    }

    // Meta/WhatsApp direct API
    if (
      source === "meta" && canal === "whatsapp" && phoneNumberId && senderId &&
      accessToken
    ) {
      fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: senderId,
          type: "text",
          text: { body: respuesta },
        }),
      }).catch((e) => console.error("Error enviando mensaje WhatsApp:", e));
    }

    // ── Return ManyChat-compatible response ──────────────────────────────────
    return new Response(
      JSON.stringify({
        messages: [{ type: "text", text: respuesta }],
        set_field_values: [
          { field_name: "ultimo_mensaje_agente", value: respuesta },
          { field_name: "lead_score", value: String(score) },
          ...(vendedorAsignado
            ? [{ field_name: "vendedor_asignado", value: vendedorAsignado }]
            : []),
          { field_name: "escalado", value: "true" },
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error en agente-egana:", error);
    const msg = error instanceof Error ? error.message : "Error interno";
    return new Response(
      JSON.stringify({
        messages: [{
          type: "text",
          text: "Gracias por contactarnos. Un vendedor te atenderá pronto.",
        }],
        error: msg,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
