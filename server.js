import express from "express"

const app = express()
app.use(express.json())

const VERIFY_TOKEN = "egana_meta_token"

// GET — VERIFICACIÓN DE META
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

// POST — MENSAJES DE META
app.post("/webhook", (req, res) => {
  console.log("==================================")
  console.log("📩 EVENTO RECIBIDO DE META")
  console.log(JSON.stringify(req.body, null, 2))
  console.log("==================================")
  res.sendStatus(200)
})

app.listen(3000, () => {
  console.log("🚀 Servidor activo en puerto 3000")
})
