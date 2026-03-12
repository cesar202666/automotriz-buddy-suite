/**
 * AI Image Service — Egaña Automotriz
 * Edita el fondo de fotos de vehículos usando la API de Gemini directamente.
 * Funciona publicado sin depender de Lovable Cloud.
 */

export interface AiImageResult {
  ok: boolean;
  dataUrl?: string;
  error?: string;
}

interface StoredApiConfig {
  provider: string;
  apiKey: string;
  model: string;
  connected: boolean | null;
}

// ─── Config desde localStorage ────────────────────────────────────

export function loadActiveConfig(): StoredApiConfig | null {
  try {
    const raw = localStorage.getItem("ea_api_configs");
    if (!raw) return null;
    const configs: StoredApiConfig[] = JSON.parse(raw);
    // Priorizar Gemini
    const gemini = configs.find(c => c.provider === "gemini" && c.apiKey?.trim());
    if (gemini) return gemini;
    const openai = configs.find(c => c.provider === "openai" && c.apiKey?.trim());
    if (openai) return openai;
  } catch (e) {
    console.error("[aiImageService] Error leyendo config:", e);
  }
  return null;
}

export function hasAiConfig(): boolean {
  return loadActiveConfig() !== null;
}

// ─── Helper: dataUrl → base64 + mimeType ─────────────────────────

function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return { base64: dataUrl, mimeType: "image/jpeg" };
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1).replace(/\s/g, "");
  const match = header.match(/:(.*?);/);
  const mimeType = match ? match[1] : "image/jpeg";
  return { base64, mimeType };
}

// ─── Gemini (gemini-2.0-flash-exp soporta imagen → imagen) ───────

async function processWithGemini(
  dataUrl: string,
  prompt: string,
  apiKey: string
): Promise<AiImageResult> {
  const { base64, mimeType } = parseDataUrl(dataUrl);
  console.log("[aiImageService] Gemini: mimeType:", mimeType, "base64 length:", base64.length);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const rawText = await res.text();
  console.log("[aiImageService] Gemini status:", res.status, "| respuesta (500 chars):", rawText.slice(0, 500));

  if (!res.ok) {
    return { ok: false, error: `Gemini error ${res.status}: ${rawText.slice(0, 300)}` };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "Gemini devolvió respuesta inválida (no es JSON)." };
  }

  type Part = { inlineData?: { data: string; mimeType: string }; text?: string };
  const parts: Part[] =
    (data as { candidates?: Array<{ content?: { parts?: Part[] } }> })
      ?.candidates?.[0]?.content?.parts ?? [];

  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart?.inlineData) {
    const textPart = parts.find(p => p.text);
    return {
      ok: false,
      error: `Gemini no devolvió imagen. Respuesta: "${textPart?.text?.slice(0, 200) ?? "vacía"}"`,
    };
  }

  return {
    ok: true,
    dataUrl: `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`,
  };
}

// ─── API pública ──────────────────────────────────────────────────

export async function applyVehicleBackground(
  dataUrl: string,
  prompt: string
): Promise<AiImageResult> {
  const config = loadActiveConfig();

  if (!config) {
    return {
      ok: false,
      error: "No hay API Key guardada. Ve a Configuración → ingresa tu clave de Gemini → presiona 'Guardar Configuración'.",
    };
  }
  if (!dataUrl) return { ok: false, error: "No hay imagen para procesar." };

  console.log("[aiImageService] Usando:", config.provider, "key:", config.apiKey.slice(0, 12) + "...");

  try {
    if (config.provider === "gemini") {
      return await processWithGemini(dataUrl, prompt, config.apiKey);
    }
    return { ok: false, error: "Solo Gemini soporta edición de imágenes. Configura tu API Key de Google Gemini." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aiImageService] Error inesperado:", msg);
    return { ok: false, error: `Error: ${msg}` };
  }
}
