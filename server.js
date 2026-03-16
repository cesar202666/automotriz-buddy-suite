import express from "express"

const app = express()
app.use(express.json())

const VERIFY_TOKEN = "egana_meta_token"

// ============================
// GET — VERIFICACIÓN DE META
// ============================
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"]
  const token     = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta")
    return res.status(200).send(challenge)
  }

  console.log("❌ Token incorrecto o modo inválido")
  res.sendStatus(403)
})

// ============================
// POST — MENSAJES DE META
// ============================
app.post("/webhook", (req, res) => {
  const body = req.body

  if (!body.entry) {
    return res.sendStatus(200)
  }

  for (const entry of body.entry) {

    // ─── WHATSAPP ───────────────────────────
    const changes = entry.changes || []
    for (const change of changes) {
      if (change.field === "messages" && change.value?.messaging_product === "whatsapp") {
        const msg = change.value.messages?.[0]
        if (msg) {
          const from = msg.from
          const text = msg.text?.body || msg.type
          console.log(`📱 WhatsApp | De: ${from} | Texto: ${text}`)
        }
      }

      // ─── COMENTARIOS INSTAGRAM ──────────────
      if (change.field === "comments") {
        const from = change.value?.from?.username || change.value?.from?.id
        const text = change.value?.text
        console.log(`💬 Comentario Instagram | De: ${from} | Texto: ${text}`)
      }
    }

    // ─── INSTAGRAM DM / FACEBOOK MESSENGER ─
    const messaging = entry.messaging || []
    for (const event of messaging) {
      const senderId = event.sender?.id
      const text     = event.message?.text

      if (senderId && text) {
        console.log(`📩 DM | De: ${senderId} | Texto: ${text}`)
      }
    }
  }

  res.sendStatus(200)
})

// ============================
// INICIO
// ============================
app.listen(3000, () => {
  console.log("🚀 Servidor activo en puerto 3000")
})
