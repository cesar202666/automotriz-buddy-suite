/**
 * AI Image Service — Egaña Automotriz
 * Gestiona el cambio de fondo de fotos de vehículos via Gemini / OpenAI.
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

// ─── Config ───────────────────────────────────────────────────────

export function loadActiveConfig(): StoredApiConfig | null {
  try {
    const raw = localStorage.getItem("ea_api_configs");
    if (!raw) return null;
    const configs: StoredApiConfig[] = JSON.parse(raw);
    const gemini = configs.find(c => c.provider === "gemini" && c.apiKey && c.apiKey.trim().length > 0);
    if (gemini) return gemini;
    const openai = configs.find(c => c.provider === "openai" && c.apiKey && c.apiKey.trim().length > 0);
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

// ─── Helper: dataUrl → PNG Blob (para OpenAI) ────────────────────

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
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

// ─── Gemini ───────────────────────────────────────────────────────

async function processWithGemini(dataUrl: string, prompt: string, apiKey: string): Promise<AiImageResult> {
  const { base64, mimeType } = parseDataUrl(dataUrl);
  console.log("[aiImageService] Iniciando Gemini, mimeType:", mimeType, "base64 length:", base64.length);

  // gemini-2.0-flash-exp es el único modelo de Gemini que soporta
  // imagen de entrada + imagen de salida (edición) en la API pública.
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  console.log("[aiImageService] Enviando request a Gemini...");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const rawText = await res.text();
  console.log("[aiImageService] Gemini status:", res.status);
  console.log("[aiImageService] Gemini raw (primeros 500 chars):", rawText.slice(0, 500));

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
  const parts: Part[] = (data as { candidates?: Array<{ content?: { parts?: Part[] } }> })
    ?.candidates?.[0]?.content?.parts ?? [];

  console.log("[aiImageService] Parts keys:", parts.map(p => Object.keys(p)));

  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart?.inlineData) {
    const textPart = parts.find(p => p.text);
    return {
      ok: false,
      error: `Gemini no devolvió una imagen. Respuesta: "${textPart?.text?.slice(0, 200) ?? "vacía"}"`,
    };
  }

  return {
    ok: true,
    dataUrl: `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`,
  };
}

// ─── OpenAI ───────────────────────────────────────────────────────

async function processWithOpenAI(dataUrl: string, prompt: string, apiKey: string): Promise<AiImageResult> {
  console.log("[aiImageService] Iniciando OpenAI DALL-E...");
  let blob: Blob;
  try {
    blob = await dataUrlToBlob(dataUrl);
  } catch (e) {
    return { ok: false, error: "No se pudo convertir la imagen a PNG para OpenAI." };
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

  console.log("[aiImageService] OpenAI status:", res.status);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `OpenAI error ${res.status}: ${body.slice(0, 300)}` };
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "OpenAI no devolvió imagen." };

  return { ok: true, dataUrl: `data:image/png;base64,${b64}` };
}

// ─── API pública ──────────────────────────────────────────────────

export async function applyVehicleBackground(dataUrl: string, prompt: string): Promise<AiImageResult> {
  const config = loadActiveConfig();
  console.log("[aiImageService] Config activa:", config ? `${config.provider} / key: ${config.apiKey.slice(0, 8)}...` : "NINGUNA");

  if (!config) {
    return {
      ok: false,
      error: "No hay API Key guardada. Ve a Configuración → ingresa tu clave de Gemini o OpenAI → presiona 'Guardar Configuración'.",
    };
  }
  if (!dataUrl) return { ok: false, error: "No hay imagen para procesar." };

  try {
    if (config.provider === "gemini") return await processWithGemini(dataUrl, prompt, config.apiKey);
    if (config.provider === "openai") return await processWithOpenAI(dataUrl, prompt, config.apiKey);
    return { ok: false, error: `Proveedor desconocido: ${config.provider}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aiImageService] Error inesperado:", msg);
    return { ok: false, error: `Error: ${msg}` };
  }
}
