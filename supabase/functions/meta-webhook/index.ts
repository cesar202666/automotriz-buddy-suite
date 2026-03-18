import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // =========================
  // GET — VERIFICACIÓN META
  // =========================
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const VERIFY_TOKEN = "egana_meta_token";

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // =========================
  // POST — EVENTOS DE META
  // =========================
  if (req.method === "POST") {
    const body = await req.json();
    const accessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
    const entry = body.entry?.[0];

    if (!entry) return new Response("OK", { status: 200 });

    const changes = entry.changes?.[0];
    const field = changes?.field;
    const value = changes?.value;

    let channel = "whatsapp";
    let senderId = "";
    let senderName = "";
    let messageText = "";
    let phoneNumberId = "";

    // WHATSAPP
    if (field === "messages" && value?.messaging_product === "whatsapp") {
      channel = "whatsapp";
      const msg = value.messages?.[0];
      if (!msg) return new Response("OK", { status: 200 });
      senderId = msg.from;
      senderName = value.contacts?.[0]?.profile?.name || senderId;
      messageText = msg.text?.body || msg.type || "";
      phoneNumberId = value.metadata?.phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
    }
    // INSTAGRAM DM
    else if (field === "messages" && entry.id && !value?.messaging_product) {
      channel = "instagram";
      const msg = value?.messages?.[0];
      if (!msg) return new Response("OK", { status: 200 });
      senderId = msg.from?.id || "";
      senderName = msg.from?.username || senderId;
      messageText = msg.message || "";
    }
    // FACEBOOK MESSENGER
    else if (field === "messages") {
      channel = "facebook";
      const messaging = value?.messaging?.[0];
      if (!messaging) return new Response("OK", { status: 200 });
      senderId = messaging.sender?.id || "";
      messageText = messaging.message?.text || "";
    }
    // INSTAGRAM COMMENT
    else if (field === "comments") {
      channel = "instagram";
      senderId = value?.from?.id || "";
      senderName = value?.from?.username || senderId;
      messageText = value?.text || "";
    }

    if (!senderId || !messageText) return new Response("OK", { status: 200 });

    const externalId = `${channel}_${senderId}`;

    // =========================
    // UPSERT CONTACT → obtener UUID real
    // =========================
    const { data: contactData } = await supabase
      .from("contacts")
      .upsert(
        {
          manychat_subscriber_id: externalId,
          name: senderName,
          channel,
          phone: channel === "whatsapp" ? senderId : "",
          last_seen: new Date().toISOString(),
        },
        { onConflict: "manychat_subscriber_id" },
      )
      .select("id")
      .single();

    if (!contactData) return new Response("OK", { status: 200 });

    const contactId: string = contactData.id;  // UUID real

    // =========================
    // GET OR CREATE CONVERSATION usando UUID del contacto
    // =========================
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id, unread_count, escalated")
      .eq("contact_id", contactId)
      .eq("channel", channel)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;

    if (existingConv) {
      conversationId = existingConv.id;
      await supabase
        .from("conversations")
        .update({
          last_message: messageText.substring(0, 100),
          last_message_at: new Date().toISOString(),
          unread_count: (existingConv.unread_count || 0) + 1,
        })
        .eq("id", conversationId);
    } else {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          contact_id: contactId,
          channel,
          status: "active",
          last_message: messageText.substring(0, 100),
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select("id")
        .single();

      if (!newConv) return new Response("OK", { status: 200 });
      conversationId = newConv.id;
    }

    // =========================
    // INSERT MESSAGE inbound
    // =========================
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      contact_id: contactId,
      direction: "inbound",
      content: messageText,
      channel,
      sent_at: new Date().toISOString(),
    });

    // Si ya fue escalada, solo guarda el mensaje, no responde el agente
    if (existingConv?.escalated) {
      return new Response("OK", { status: 200 });
    }

    // =========================
    // LLAMAR AGENTE IA con IDs correctos (UUID)
    // =========================
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    fetch(`${supabaseUrl}/functions/v1/agente-egana`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        contact_id: contactId,           // UUID real
        external_id: externalId,         // ID externo del canal
        first_name: senderName,
        phone: channel === "whatsapp" ? senderId : "",
        last_input_text: messageText,
        channel,
        conversation_id: conversationId, // UUID real de la conversación
        phone_number_id: phoneNumberId,
        sender_id: senderId,
        access_token: accessToken,
        source: "meta",
      }),
    }).catch(console.error);

    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
