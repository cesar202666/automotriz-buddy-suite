/**
 * AI Image Service — Egaña Automotriz
 * ─────────────────────────────────────────────────────────────────
 * Centralizes all AI image processing logic. Supports Gemini (image
 * edit) and OpenAI DALL-E 2 (image edit) as backends, selected
 * automatically from the stored API config.
 *
 * Usage:
 *   import { applyVehicleBackground } from "@/lib/aiImageService";
 *   const result = await applyVehicleBackground(dataUrl, prompt);
 *   if (result.ok) { /* use result.dataUrl *\/ }
 * ─────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────

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

// ─── Config loader ────────────────────────────────────────────────

function loadActiveConfig(): StoredApiConfig | null {
  try {
    const raw = localStorage.getItem("ea_api_configs");
    if (!raw) return null;
    const configs: StoredApiConfig[] = JSON.parse(raw);

    // Prefer Gemini, fall back to OpenAI
    const gemini = configs.find(c => c.provider === "gemini" && c.apiKey?.trim());
    if (gemini) return gemini;

    const openai = configs.find(c => c.provider === "openai" && c.apiKey?.trim());
    if (openai) return openai;
  } catch {
    // ignore malformed JSON
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Strip the data URI prefix and return clean base64 + mimeType */
function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } {
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  return { base64: base64.replace(/\s/g, ""), mimeType };
}

/** Convert base64 PNG/JPEG into a PNG Blob (DALL-E requires PNG) */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob failed"));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

// ─── Provider implementations ─────────────────────────────────────

async function processWithGemini(
  dataUrl: string,
  prompt: string,
  apiKey: string,
): Promise<AiImageResult> {
  const { base64, mimeType } = parseDataUrl(dataUrl);

  // gemini-2.0-flash-preview-image-generation is the correct model for image editing
  // responseModalities MUST be uppercase: "IMAGE" / "TEXT"
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`;

  const payload = {
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
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[aiImageService] Gemini error body:", body);
    return { ok: false, error: `Gemini API error ${res.status}: ${body.slice(0, 300)}` };
  }

  const data = await res.json();
  console.log("[aiImageService] Gemini response candidates:", JSON.stringify(data?.candidates?.[0]?.content?.parts?.map((p: Record<string, unknown>) => Object.keys(p))));

  const parts: Array<{ inlineData?: { data: string; mimeType: string } }> =
    data?.candidates?.[0]?.content?.parts ?? [];

  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart?.inlineData) {
    return { ok: false, error: "Gemini no devolvió imagen. Verifica que tu API Key tenga acceso a gemini-2.0-flash-preview-image-generation." };
  }

  return {
    ok: true,
    dataUrl: `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`,
  };
}

async function processWithOpenAI(
  dataUrl: string,
  prompt: string,
  apiKey: string,
): Promise<AiImageResult> {
  let blob: Blob;
  try {
    blob = await dataUrlToBlob(dataUrl);
  } catch (e) {
    return { ok: false, error: "No se pudo convertir la imagen a PNG." };
  }

  const formData = new FormData();
  formData.append("image", blob, "vehicle.png");
  formData.append("prompt", prompt);
  formData.append("model", "dall-e-2");
  formData.append("response_format", "b64_json");
  formData.append("size", "1024x1024");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `OpenAI API error ${res.status}: ${body.slice(0, 200)}` };
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    return { ok: false, error: "OpenAI no devolvió una imagen válida." };
  }

  return { ok: true, dataUrl: `data:image/png;base64,${b64}` };
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Replace the background of a vehicle photo using the configured AI provider.
 *
 * @param dataUrl  - Original image as data URI (from FileReader / canvas)
 * @param prompt   - Text description of the desired background
 * @returns        AiImageResult with ok flag, resultant dataUrl or error
 */
export async function applyVehicleBackground(
  dataUrl: string,
  prompt: string,
): Promise<AiImageResult> {
  const config = loadActiveConfig();

  if (!config) {
    return {
      ok: false,
      error: "No hay API Key configurada. Ve a Configuración → ingresa una clave de Gemini u OpenAI.",
    };
  }

  if (!dataUrl) {
    return { ok: false, error: "No hay imagen para procesar." };
  }

  try {
    if (config.provider === "gemini") {
      return await processWithGemini(dataUrl, prompt, config.apiKey);
    }
    if (config.provider === "openai") {
      return await processWithOpenAI(dataUrl, prompt, config.apiKey);
    }
    return { ok: false, error: `Proveedor no soportado: ${config.provider}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: `Error de red o configuración: ${msg}` };
  }
}

/** Returns true if at least one provider has a stored API key. */
export function hasAiConfig(): boolean {
  return loadActiveConfig() !== null;
}
