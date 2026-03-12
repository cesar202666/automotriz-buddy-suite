/**
 * AI Image Service — Egaña Automotriz
 * Usa Lovable AI Gateway (Gemini) para cambio de fondo de vehículos.
 */

export interface AiImageResult {
  ok: boolean;
  dataUrl?: string;
  error?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ─── API pública ──────────────────────────────────────────────────

export async function applyVehicleBackground(
  dataUrl: string,
  prompt: string
): Promise<AiImageResult> {
  if (!dataUrl) return { ok: false, error: "No hay imagen para procesar." };
  if (!SUPABASE_URL) {
    return { ok: false, error: "Lovable Cloud no está configurado." };
  }

  console.log("[aiImageService] Enviando imagen a edge function edit-vehicle-image...");

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/edit-vehicle-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl, prompt }),
    });

    console.log("[aiImageService] Edge function status:", response.status);

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error ?? `Error ${response.status}`;
      console.error("[aiImageService] Error:", errMsg);
      return { ok: false, error: errMsg };
    }

    if (data.editedImageUrl) {
      console.log("[aiImageService] Imagen editada recibida, longitud:", data.editedImageUrl.length);
      return { ok: true, dataUrl: data.editedImageUrl };
    }

    return { ok: false, error: "La IA no devolvió imagen." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aiImageService] Error inesperado:", msg);
    return { ok: false, error: `Error de conexión: ${msg}` };
  }
}

// Mantiene compatibilidad con el resto del código
export function hasAiConfig(): boolean {
  return !!SUPABASE_URL;
}
