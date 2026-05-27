/**
 * AI Image Service — Egaña Automotriz
 * Edita el fondo de fotos de vehículos usando Gemini con sistema robusto:
 * - Reintentos automáticos con backoff exponencial (hasta 3 intentos)
 * - Timeout configurable (45s default)
 * - Validación de la imagen resultante
 * - Manejo específico de errores (rate limit, cuota, modelo, red)
 * - Logs detallados para diagnóstico
 */

export interface AiImageResult {
  ok: boolean;
  dataUrl?: string;
  error?: string;
  attempts?: number;
}

interface StoredApiConfig {
  provider: string;
  apiKey: string;
  model: string;
  connected: boolean | null;
}

// Constantes de robustez
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 45_000;
const BASE_BACKOFF_MS = 1500;
const MIN_VALID_BASE64_LEN = 1000; // imagen menor a 1KB → sospechosa

// Modelos de imagen Gemini en orden de preferencia (con fallback)
const GEMINI_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-exp",
];

// ─── Config desde localStorage ────────────────────────────────────

export function loadActiveConfig(): StoredApiConfig | null {
  try {
    const raw = localStorage.getItem("ea_api_configs");
    if (!raw) return null;
    const configs: StoredApiConfig[] = JSON.parse(raw);
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

// ─── Helpers ─────────────────────────────────────────────────────

function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return { base64: dataUrl, mimeType: "image/jpeg" };
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1).replace(/\s/g, "");
  const match = header.match(/:(.*?);/);
  const mimeType = match ? match[1] : "image/jpeg";
  return { base64, mimeType };
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function classifyError(status: number, body: string): { retryable: boolean; userMsg: string } {
  if (status === 429) {
    return { retryable: true, userMsg: "Demasiadas solicitudes. Reintentando..." };
  }
  if (status === 402 || body.toLowerCase().includes("quota") || body.toLowerCase().includes("billing")) {
    return { retryable: false, userMsg: "Cuota de IA agotada. Verifica tu plan en Google AI Studio." };
  }
  if (status === 401 || status === 403) {
    return { retryable: false, userMsg: "API Key inválida o sin permisos. Revisa Configuración." };
  }
  if (status === 404) {
    return { retryable: true, userMsg: "Modelo no disponible, probando otro..." };
  }
  if (status === 503 || status === 504 || status === 502) {
    return { retryable: true, userMsg: "Gemini momentáneamente no disponible. Reintentando..." };
  }
  if (status >= 500) {
    return { retryable: true, userMsg: "Error del servidor de IA. Reintentando..." };
  }
  return { retryable: false, userMsg: `Error ${status}` };
}

// ─── Llamada a Gemini con timeout y manejo robusto de errores ────

async function callGeminiOnce(
  model: string,
  apiKey: string,
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<{ ok: true; base64Img: string; mimeType: string } | { ok: false; status: number; body: string }> {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

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
      temperature: 0.3,
    },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const rawText = await res.text();
    console.log(`[aiImageService] Gemini ${model} status: ${res.status} | preview: ${rawText.slice(0, 200)}`);

    if (!res.ok) {
      return { ok: false, status: res.status, body: rawText };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      return { ok: false, status: 0, body: "JSON inválido en respuesta" };
    }

    type Part = {
      inlineData?: { data: string; mimeType: string };
      inline_data?: { data: string; mime_type: string };
      text?: string;
    };
    const parts: Part[] =
      (data as { candidates?: Array<{ content?: { parts?: Part[] } }> })
        ?.candidates?.[0]?.content?.parts ?? [];

    // Buscar la parte de imagen (puede estar como inlineData o inline_data)
    const imgPart = parts.find(p => p.inlineData?.data || p.inline_data?.data);
    if (!imgPart) {
      const textPart = parts.find(p => p.text);
      const reason = textPart?.text?.slice(0, 200) ?? "modelo no devolvió imagen";
      return { ok: false, status: 0, body: `Sin imagen: ${reason}` };
    }

    const base64Img = imgPart.inlineData?.data ?? imgPart.inline_data?.data ?? "";
    const mimeOut = imgPart.inlineData?.mimeType ?? imgPart.inline_data?.mime_type ?? "image/png";

    if (base64Img.length < MIN_VALID_BASE64_LEN) {
      return { ok: false, status: 0, body: `Imagen demasiado pequeña (${base64Img.length} bytes), posible error` };
    }

    return { ok: true, base64Img, mimeType: mimeOut };
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return { ok: false, status: 0, body: `Timeout después de ${TIMEOUT_MS}ms` };
    }
    return { ok: false, status: 0, body: `Error de red: ${msg}` };
  }
}

// ─── Procesador con reintentos automáticos + fallback de modelos ─

async function processWithGemini(
  dataUrl: string,
  prompt: string,
  apiKey: string,
  userModel?: string,
): Promise<AiImageResult> {
  const { base64, mimeType } = parseDataUrl(dataUrl);
  if (!base64 || base64.length < 100) {
    return { ok: false, error: "Imagen de entrada inválida o demasiado pequeña." };
  }
  console.log(`[aiImageService] Iniciando edición — mimeType: ${mimeType}, input base64: ${base64.length} chars`);

  // Modelos a probar: el del usuario primero, luego fallbacks
  const modelsToTry = userModel
    ? [userModel, ...GEMINI_IMAGE_MODELS.filter(m => m !== userModel)]
    : GEMINI_IMAGE_MODELS;

  let lastError = "";
  let totalAttempts = 0;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      totalAttempts++;
      console.log(`[aiImageService] Intento ${attempt}/${MAX_ATTEMPTS} con modelo ${model}`);

      const result = await callGeminiOnce(model, apiKey, base64, mimeType, prompt);

      if (result.ok) {
        console.log(`[aiImageService] ✓ Éxito con ${model} en intento ${attempt}, output: ${result.base64Img.length} chars`);
        return {
          ok: true,
          dataUrl: `data:${result.mimeType};base64,${result.base64Img}`,
          attempts: totalAttempts,
        };
      }

      const { retryable, userMsg } = classifyError(result.status, result.body);
      lastError = userMsg + (result.body ? ` (${result.body.slice(0, 150)})` : "");

      if (!retryable) {
        console.warn(`[aiImageService] Error no recuperable con ${model}: ${lastError}`);
        // Si la API key falla, no tiene sentido probar otros modelos
        if (result.status === 401 || result.status === 403) {
          return { ok: false, error: lastError, attempts: totalAttempts };
        }
        // Si es 404 (modelo no existe), saltamos directamente al siguiente modelo
        if (result.status === 404) break;
        // Cuota agotada: probemos otro modelo (algunos tienen cuotas separadas)
        if (result.status === 402 || result.body.toLowerCase().includes("quota")) break;
        // Cualquier otro error no recuperable: abortar
        return { ok: false, error: lastError, attempts: totalAttempts };
      }

      // Retryable: backoff exponencial antes de reintentar
      if (attempt < MAX_ATTEMPTS) {
        const wait = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.log(`[aiImageService] Esperando ${wait}ms antes de reintentar...`);
        await sleep(wait);
      }
    }
  }

  return {
    ok: false,
    error: lastError || "No se pudo generar la imagen después de varios intentos.",
    attempts: totalAttempts,
  };
}

// ─── API pública ──────────────────────────────────────────────────

export async function applyVehicleBackground(
  dataUrl: string,
  prompt: string,
): Promise<AiImageResult> {
  const config = loadActiveConfig();

  if (!config) {
    return {
      ok: false,
      error: "No hay API Key configurada. Ve a Configuración → ingresa tu clave de Gemini.",
    };
  }
  if (!dataUrl) {
    return { ok: false, error: "No se proporcionó imagen para procesar." };
  }

  console.log(`[aiImageService] Usando: ${config.provider} | key: ${config.apiKey.slice(0, 12)}...`);

  try {
    if (config.provider === "gemini") {
      return await processWithGemini(dataUrl, prompt, config.apiKey, config.model);
    }
    return {
      ok: false,
      error: "Solo Gemini soporta edición de imágenes actualmente. Configura tu API Key de Google Gemini.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aiImageService] Error inesperado:", msg);
    return { ok: false, error: `Error inesperado: ${msg}` };
  }
}
