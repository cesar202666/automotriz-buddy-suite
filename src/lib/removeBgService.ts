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

// Lienzo de salida estándar (4:3) — TODAS las fotos quedan del mismo tamaño.
const OUT_W = 1000;
const OUT_H = 750;
// Qué porción del lienzo ocupa el auto (mismo "zoom" para todos los autos).
const CAR_MAX_W = 0.9; // 90% del ancho
const CAR_MAX_H = 0.8; // 80% del alto
const CAR_BOTTOM = 0.9; // base del auto al 90% de la altura (deja sitio a la sombra)

/** Bounding box de los píxeles NO transparentes (el auto) dentro del PNG. */
function findCarBounds(img: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext("2d");
  if (!cx) return null;
  cx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try {
    data = cx.getImageData(0, 0, c.width, c.height).data;
  } catch {
    return null;
  }
  const ALPHA = 16; // umbral: ignora bordes casi transparentes
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Recorta el auto a su bounding box, lo escala a un tamaño ESTÁNDAR y lo centra
 * sobre un lienzo blanco 4:3 con sombra de catálogo. Así todos los autos quedan
 * del mismo tamaño y bien encuadrados, sin importar cómo venía la foto original.
 */
async function compositeOnWhite(transparentBlob: Blob): Promise<string> {
  const url = URL.createObjectURL(transparentBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el lienzo.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Fondo blanco puro.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, OUT_W, OUT_H);

    // Recuadro del auto (si falla la detección, usamos la imagen completa).
    const b = findCarBounds(img) ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };

    // Escala para que el auto ocupe el mismo espacio en todos los casos.
    const scale = Math.min((OUT_W * CAR_MAX_W) / b.w, (OUT_H * CAR_MAX_H) / b.h);
    const drawW = b.w * scale;
    const drawH = b.h * scale;
    const dx = (OUT_W - drawW) / 2;            // centrado horizontal
    const dy = OUT_H * CAR_BOTTOM - drawH;     // base del auto a una altura fija

    // Sombra de catálogo: elipse difusa bajo el auto.
    const shadowCx = OUT_W / 2;
    const shadowCy = dy + drawH - drawH * 0.02;
    ctx.save();
    ctx.filter = "blur(12px)";
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.beginPath();
    ctx.ellipse(shadowCx, shadowCy, drawW * 0.42, drawH * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // El auto, recortado a su bounding box y escalado/centrado.
    ctx.drawImage(img, b.x, b.y, b.w, b.h, dx, dy, drawW, drawH);

    return canvas.toDataURL("image/jpeg", 0.95);
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
