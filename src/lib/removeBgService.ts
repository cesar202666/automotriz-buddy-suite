// Recorte profesional del vehículo con remove.bg (especializado, type=car).
//
// remove.bg quita el fondo en su servidor — recorte impecable — y devuelve el
// auto con sus píxeles reales (mismo color, ángulo y tamaño; NO lo redibuja).
// Acá lo pegamos sobre fondo BLANCO PURO con una sombra de contacto suave.
//
// La API key se guarda en localStorage ("ea_removebg_key"). Gratis las primeras
// 50 imágenes/mes (a resolución preview); luego se paga por crédito.

const KEY_STORAGE = "ea_removebg_key";

export function getRemoveBgKey(): string {
  try { return (localStorage.getItem(KEY_STORAGE) || "").trim(); } catch { return ""; }
}
export function setRemoveBgKey(key: string): void {
  try { localStorage.setItem(KEY_STORAGE, key.trim()); } catch { /* ignore */ }
}
export function hasRemoveBgKey(): boolean {
  return getRemoveBgKey().length > 0;
}

export type RemoveBgResult = { ok: boolean; dataUrl?: string; error?: string };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen recortada."));
    img.src = src;
  });
}

/** Pega un PNG transparente (blob) sobre fondo blanco puro con sombra suave. */
async function compositeOnWhite(transparentBlob: Blob): Promise<string> {
  const url = URL.createObjectURL(transparentBlob);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el lienzo.");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);

    // Sombra de contacto suave para que el auto no quede "flotando".
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = Math.round(h * 0.045);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(h * 0.02);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
    // Redibujo nítido encima (la pasada anterior solo aporta la sombra).
    ctx.drawImage(img, 0, 0, w, h);

    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Recorta el vehículo de `src` (dataURL o URL http) con remove.bg y lo devuelve
 * sobre fondo blanco. Mensajes de error claros en español.
 */
export async function removeBgOnWhite(src: string): Promise<RemoveBgResult> {
  const apiKey = getRemoveBgKey();
  if (!apiKey) {
    return { ok: false, error: "Falta la API key de remove.bg. Pégala en el panel 'Fondo blanco automático'." };
  }

  const form = new FormData();
  // Si es una URL pública (http), remove.bg la descarga desde su servidor (evita
  // problemas de CORS). Si es un dataURL, mandamos el base64 directo.
  if (/^https?:\/\//i.test(src)) {
    form.append("image_url", src);
  } else if (src.startsWith("data:")) {
    const b64 = src.split(",")[1] ?? "";
    form.append("image_file_b64", b64);
  } else {
    return { ok: false, error: "Formato de imagen no reconocido." };
  }
  // "preview" usa SIEMPRE los 50 llamados gratis/mes (no consume créditos pagados).
  // Es resolución web (~0,25 MP), suficiente para el catálogo.
  form.append("size", "preview");
  form.append("type", "car"); // optimizado para vehículos
  form.append("format", "png"); // transparente, para componer fondo blanco nosotros

  let resp: Response;
  try {
    resp = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: form,
    });
  } catch {
    return { ok: false, error: "No se pudo conectar con remove.bg. Revisa tu conexión a internet." };
  }

  if (!resp.ok) {
    let detail = "";
    try {
      const j = await resp.json();
      detail = j?.errors?.[0]?.title || "";
    } catch { /* respuesta no-JSON */ }
    if (resp.status === 403)
      return { ok: false, error: "API key de remove.bg inválida. Revisa que la pegaste completa." };
    if (resp.status === 402)
      return { ok: false, error: "Se agotaron los créditos de remove.bg de este mes. Recarga créditos en remove.bg o espera al próximo mes." };
    if (resp.status === 429)
      return { ok: false, error: "Demasiadas fotos seguidas. Espera unos segundos y vuelve a intentar." };
    return { ok: false, error: `remove.bg rechazó la imagen${detail ? `: ${detail}` : ` (error ${resp.status})`}.` };
  }

  try {
    const blob = await resp.blob();
    const dataUrl = await compositeOnWhite(blob);
    return { ok: true, dataUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `No se pudo componer el fondo blanco: ${msg}` };
  }
}
