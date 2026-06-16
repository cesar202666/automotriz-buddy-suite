/**
 * manychat-import — Backfill masivo de contactos/conversaciones desde
 * un CSV exportado del inbox de ManyChat.
 *
 * Razón: la API REST de ManyChat NO expone "listar todos los subscribers".
 * Solo se puede buscar de a uno por ID/phone/name. Para rescatar los 841+
 * mensajes acumulados en "No asignado", el camino oficial es exportar
 * el CSV desde el dashboard de ManyChat.
 *
 * Flujo:
 *   1. Usuario en /configuracion → "Importar ManyChat" → sube CSV
 *   2. Esta función parsea el CSV con detección de columnas inteligente
 *      (acepta nombres en español o inglés)
 *   3. Por cada fila: upsert contact + conversation + lead + mensaje
 *      idempotente (no duplica si subscriber_id ya existe)
 *   4. Devuelve resumen: total, importados, actualizados, errores
 *
 * Acciones:
 *   - "test_api"     → verifica que MANYCHAT_API_KEY funcione (debug)
 *   - "import_csv"   → recibe { csv: "..." } y procesa
 *   - "enrich"       → para un subscriber_id, intenta obtener info via
 *                      ManyChat API (phone, email) si falta en el CSV
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MANYCHAT_API = "https://api.manychat.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ImportRequest {
  action: "test_api" | "import_csv" | "enrich";
  csv?: string;
  subscriber_id?: string;
  /** Si true, NO inserta — solo cuenta y devuelve preview. */
  dry_run?: boolean;
  /** Si true, intenta enriquecer cada fila llamando a ManyChat API */
  enrich_via_api?: boolean;
  updated_by?: string;
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

// ── ManyChat API helpers ──────────────────────────────────────

async function manychatGet(path: string): Promise<Record<string, unknown> | null> {
  const key = Deno.env.get("MANYCHAT_API_KEY") ?? "";
  if (!key) return null;
  try {
    const r = await fetch(`${MANYCHAT_API}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function actionTestApi() {
  const key = Deno.env.get("MANYCHAT_API_KEY") ?? "";
  if (!key) return { ok: false, error: "MANYCHAT_API_KEY no configurado" };

  // Probar el endpoint de page info (el más liviano de ManyChat)
  const r = await fetch(`${MANYCHAT_API}/fb/page/getInfo`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return {
    ok: r.ok,
    status: r.status,
    key_length: key.length,
    response: data,
  };
}

// ── CSV parser robusto ────────────────────────────────────────

/**
 * Parser CSV que maneja comillas dobles escapadas y campos con saltos
 * de línea (común en exports de ManyChat donde el "last message" puede
 * tener saltos).
 */
function parseCsv(raw: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  // Detectar BOM
  if (raw.charCodeAt(0) === 0xFEFF) i = 1;
  while (i < raw.length) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.length > 0 && r.some((c) => c.trim() !== ""));
}

/**
 * Detecta columnas del CSV con aliases (inglés + español) y devuelve
 * un mapeo column_name → index.
 */
interface ColumnMap {
  subscriber_id: number;
  first_name: number;
  last_name: number;
  full_name: number;
  phone: number;
  email: number;
  channel: number;
  last_message: number;
  last_interaction: number;
  subscribed_at: number;
}

function detectColumns(header: string[]): ColumnMap {
  const norm = (s: string) =>
    s.toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const idx = (aliases: string[]): number => {
    const normalized = header.map(norm);
    for (const a of aliases) {
      const na = norm(a);
      const i = normalized.findIndex((h) => h === na || h.includes(na));
      if (i >= 0) return i;
    }
    return -1;
  };

  return {
    subscriber_id: idx(["id", "subscriber id", "subscriberid", "user id", "userid", "ID del Suscriptor", "ID Suscriptor"]),
    first_name: idx(["first name", "firstname", "nombre", "primer nombre"]),
    last_name: idx(["last name", "lastname", "apellido"]),
    full_name: idx(["name", "full name", "fullname", "nombre completo", "contact name"]),
    phone: idx(["phone", "telefono", "phone number", "mobile", "celular", "numero"]),
    email: idx(["email", "correo", "correo electronico", "mail"]),
    channel: idx(["channel", "canal", "platform", "plataforma", "source"]),
    last_message: idx(["last message", "last interaction text", "ultimo mensaje", "mensaje", "lastinteractiontext", "mensajeentrada"]),
    last_interaction: idx(["last interaction", "ultima interaccion", "last seen", "ultima vez"]),
    subscribed_at: idx(["subscribed at", "subscribed", "subscribed date", "fecha suscripcion", "joined", "created at"]),
  };
}

function pick(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  return (row[idx] || "").trim();
}

function normalizePhone(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  const digits = cleaned.replace(/^\+/, "");
  if (digits.length < 7) return "";
  return cleaned;
}

function normalizeChannel(raw: string): "whatsapp" | "instagram" | "facebook" | "messenger" {
  const c = (raw || "").toLowerCase().trim();
  if (c.includes("whatsapp") || c.includes("wa") || c === "ws") return "whatsapp";
  if (c.includes("instagram") || c === "ig") return "instagram";
  if (c.includes("facebook") || c.includes("messenger") || c === "fb") return "facebook";
  return "whatsapp"; // default
}

// ── Import principal ─────────────────────────────────────────

interface ImportStats {
  total_rows: number;
  imported: number;
  updated: number;
  skipped_empty: number;
  errors: number;
  details: string[];
  preview?: Record<string, unknown>[];
}

async function actionImportCsv(req: ImportRequest): Promise<ImportStats & { ok: boolean }> {
  const csv = req.csv ?? "";
  if (!csv.trim()) {
    return {
      ok: false,
      total_rows: 0, imported: 0, updated: 0, skipped_empty: 0, errors: 0,
      details: ["CSV vacío"],
    };
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return {
      ok: false,
      total_rows: 0, imported: 0, updated: 0, skipped_empty: 0, errors: 0,
      details: ["El CSV no tiene filas de datos (solo header o vacío)"],
    };
  }

  const header = rows[0];
  const cols = detectColumns(header);
  const dataRows = rows.slice(1);

  const stats: ImportStats = {
    total_rows: dataRows.length,
    imported: 0,
    updated: 0,
    skipped_empty: 0,
    errors: 0,
    details: [],
  };

  // Si no hay subscriber_id ni teléfono, no podemos identificar
  if (cols.subscriber_id < 0 && cols.phone < 0 && cols.email < 0) {
    return {
      ok: false,
      ...stats,
      details: [
        "El CSV no contiene columna identificable (ID, teléfono o email).",
        `Columnas detectadas: ${header.join(", ")}`,
      ],
    };
  }

  // Modo dry_run: solo preview de las primeras 10 filas
  if (req.dry_run) {
    const preview = dataRows.slice(0, 10).map((row) => ({
      subscriber_id: pick(row, cols.subscriber_id),
      first_name: pick(row, cols.first_name),
      last_name: pick(row, cols.last_name),
      full_name: pick(row, cols.full_name),
      phone: normalizePhone(pick(row, cols.phone)),
      email: pick(row, cols.email),
      channel: normalizeChannel(pick(row, cols.channel)),
      last_message: pick(row, cols.last_message).slice(0, 100),
    }));
    return { ok: true, ...stats, preview };
  }

  const sb = getSupabase();
  const updatedBy = req.updated_by ?? "import_csv";

  for (const row of dataRows) {
    try {
      let subscriberId = pick(row, cols.subscriber_id);
      const firstName = pick(row, cols.first_name) || pick(row, cols.full_name).split(" ")[0] || "Cliente";
      const lastName = pick(row, cols.last_name) ||
        pick(row, cols.full_name).split(" ").slice(1).join(" ");
      const phone = normalizePhone(pick(row, cols.phone));
      const email = pick(row, cols.email);
      const channel = normalizeChannel(pick(row, cols.channel));
      const lastMessage = pick(row, cols.last_message);
      const lastInteraction = pick(row, cols.last_interaction);
      const subscribedAt = pick(row, cols.subscribed_at);

      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Cliente";

      // Si no hay subscriber_id, construir uno con phone o email
      if (!subscriberId) {
        if (phone) subscriberId = `phone:${phone}`;
        else if (email) subscriberId = `email:${email}`;
        else { stats.skipped_empty += 1; continue; }
      }

      // ── 1. Upsert contact ────────────────────────────
      const lastSeen = parseAnyDate(lastInteraction) ?? parseAnyDate(subscribedAt) ?? new Date();
      const { data: contactData, error: contactErr } = await sb
        .from("contacts")
        .upsert(
          {
            manychat_subscriber_id: subscriberId,
            name: fullName,
            phone,
            email,
            channel,
            last_seen: lastSeen.toISOString(),
          },
          { onConflict: "manychat_subscriber_id", ignoreDuplicates: false },
        )
        .select("id, phone, created_at")
        .single();

      if (contactErr || !contactData) {
        stats.errors += 1;
        if (stats.details.length < 30) {
          stats.details.push(`Contact error (${subscriberId}): ${contactErr?.message || "sin data"}`);
        }
        continue;
      }
      const contactId: string = contactData.id;
      const isExisting = !!contactData.created_at &&
        new Date(contactData.created_at).getTime() < lastSeen.getTime() - 60000;

      // ── 2. Get or create conversation ────────────────
      let conversationId: string;
      const { data: convExisting } = await sb
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .eq("channel", channel)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (convExisting) {
        conversationId = convExisting.id;
        await sb
          .from("conversations")
          .update({
            last_message: lastMessage,
            last_message_at: lastSeen.toISOString(),
            status: "active",
          })
          .eq("id", conversationId);
      } else {
        const { data: newConv, error: convErr } = await sb
          .from("conversations")
          .insert({
            contact_id: contactId,
            channel,
            status: "active",
            last_message: lastMessage,
            last_message_at: lastSeen.toISOString(),
            unread_count: 1,
          })
          .select("id")
          .single();
        if (convErr || !newConv) {
          stats.errors += 1;
          if (stats.details.length < 30) {
            stats.details.push(`Conversation error (${subscriberId}): ${convErr?.message}`);
          }
          continue;
        }
        conversationId = newConv.id;
      }

      // ── 3. Insert last message if we have one ────────
      if (lastMessage) {
        // Solo insertar si no existe un mensaje muy reciente con el mismo contenido
        // (evita duplicados en re-imports)
        const { data: msgExists } = await sb
          .from("messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("direction", "inbound")
          .eq("content", lastMessage.slice(0, 5000))
          .limit(1)
          .maybeSingle();
        if (!msgExists) {
          await sb.from("messages").insert({
            conversation_id: conversationId,
            contact_id: contactId,
            direction: "inbound",
            content: lastMessage.slice(0, 5000),
            channel,
            sent_at: lastSeen.toISOString(),
          });
        }
      }

      // ── 4. Auto-create lead (idempotente por contact_id) ──
      const { data: existingLead } = await sb
        .from("leads")
        .select("id, telefono")
        .eq("contact_id", contactId)
        .maybeSingle();

      if (!existingLead) {
        await sb.from("leads").insert({
          contact_id: contactId,
          conversation_id: conversationId,
          nombre: fullName,
          telefono: phone,
          email,
          canal: channel,
          etapa: "nuevo",
          score: 0,
          urgencia: "media",
          interes: "",
          presupuesto: "",
          vendedor_asignado: "",
          notas: lastMessage ? `[Importado de ManyChat] ${lastMessage.slice(0, 200)}` : "[Importado de ManyChat]",
        });
      } else if (phone && !existingLead.telefono) {
        // Backfill teléfono si lo teníamos en el CSV pero no en el lead
        await sb.from("leads").update({ telefono: phone }).eq("id", existingLead.id);
      }

      if (isExisting) stats.updated += 1;
      else stats.imported += 1;
    } catch (e) {
      stats.errors += 1;
      if (stats.details.length < 30) {
        stats.details.push(`Excepción: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  stats.details.unshift(`Importacion completada por ${updatedBy}`);
  return { ok: true, ...stats };
}

/** Parse de fechas en varios formatos (ISO, DD/MM/YYYY, YYYY-MM-DD, Unix). */
function parseAnyDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // Unix timestamp en segundos
  if (/^\d{9,10}$/.test(s)) return new Date(Number(s) * 1000);
  // Unix en ms
  if (/^\d{13}$/.test(s)) return new Date(Number(s));
  // DD/MM/YYYY HH:MM o DD/MM/YYYY
  const cl = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (cl) {
    const [, dd, mm, yyyy, h = "12", mi = "0"] = cl;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(h), Number(mi));
  }
  // ISO o cualquier formato que Date entienda
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

// ── Handler ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? (await req.json()) as ImportRequest : { action: "test_api" } as ImportRequest;
    let result: unknown;
    switch (body.action) {
      case "test_api":  result = await actionTestApi(); break;
      case "import_csv": result = await actionImportCsv(body); break;
      case "enrich": {
        if (!body.subscriber_id) {
          result = { ok: false, error: "subscriber_id requerido" };
          break;
        }
        result = await manychatGet(`/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(body.subscriber_id)}`);
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `action desconocida: ${body.action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
