// Recorte real del vehículo sobre fondo BLANCO PURO.
//
// A diferencia de la IA generativa (que "redibuja" el auto y le cambia el color
// y el tamaño), esto RECORTA el auto exacto de la foto — los mismos píxeles del
// vehículo, mismo color, mismo ángulo, mismo tamaño — y lo pega sobre un fondo
// blanco con una sombra de contacto suave debajo. Garantiza que el auto NO cambie.
//
// Corre 100% en el navegador (WASM). Descarga un modelo (~5MB) la primera vez y
// luego queda en caché. No usa ninguna API key ni tiene costo por foto.
import { removeBackground } from "@imgly/background-removal";

export type CutoutResult = { ok: boolean; dataUrl?: string; error?: string };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = src;
  });
}

/**
 * Recibe un dataURL/URL de la foto del auto y devuelve un JPEG (dataURL) con el
 * auto recortado sobre fondo blanco puro y una sombra suave debajo.
 */
export async function cutoutOnWhite(srcDataUrl: string): Promise<CutoutResult> {
  try {
    // 1) Quitar el fondo → PNG con transparencia (el auto queda con sus píxeles reales).
    const blob = await removeBackground(srcDataUrl, {
      // Devuelve PNG con alpha. La calidad por defecto del modelo es buena para autos.
      output: { format: "image/png" },
    });
    const cutoutUrl = URL.createObjectURL(blob);
    const cutout = await loadImage(cutoutUrl);

    const w = cutout.naturalWidth;
    const h = cutout.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(cutoutUrl);
      return { ok: false, error: "No se pudo crear el lienzo." };
    }

    // 2) Fondo blanco puro (#FFFFFF) en todo el lienzo.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);

    // 3) Sombra de contacto suave debajo del auto para que no quede "flotando".
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = Math.round(h * 0.045);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(h * 0.02);
    ctx.drawImage(cutout, 0, 0, w, h);
    ctx.restore();

    // 4) Redibujar el auto encima SIN sombra para que el vehículo quede nítido
    //    (la pasada anterior solo aporta la sombra alrededor del recorte).
    ctx.drawImage(cutout, 0, 0, w, h);

    URL.revokeObjectURL(cutoutUrl);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return { ok: true, dataUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `No se pudo recortar el fondo: ${msg}` };
  }
}
