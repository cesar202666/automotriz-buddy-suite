import { supabase } from "@/integrations/supabase/client";

const BUCKET = "vehiculos-fotos";

/**
 * Comprime un dataURL a JPEG (max 1280px de ancho) usando canvas, para que
 * las fotos pesen poco y la galeria/web carguen rapido.
 */
function comprimir(dataUrl: string, maxW = 1280, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / (img.width || maxW));
      const w = Math.max(1, Math.round((img.width || maxW) * scale));
      const h = Math.max(1, Math.round((img.height || maxW) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("sin canvas context"));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob devolvio null"))),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => reject(new Error("no se pudo decodificar la imagen"));
    img.src = dataUrl;
  });
}

/**
 * Recibe el array de fotos de los slots (URLs, base64 o "" para vacios) y
 * devuelve un array de URLs publicas de Storage. Las que ya son URLs se dejan
 * igual; las base64 se comprimen y suben. Mantiene el orden y los "" vacios.
 *
 * Devuelve { fotos, errores } — si alguna foto falla al subir, conserva el
 * base64 original (mejor eso que perder la foto) y suma el error a la lista.
 */
export async function subirFotosAStorage(
  fotos: string[],
  patente: string,
): Promise<{ fotos: string[]; errores: string[] }> {
  const safeId = (patente || "veh").replace(/[^a-zA-Z0-9_-]/g, "") || "veh";
  const out: string[] = [];
  const errores: string[] = [];
  let idx = 0;
  for (const f of fotos) {
    idx++;
    if (!f) { out.push(""); continue; }
    if (/^https?:\/\//i.test(f)) { out.push(f); continue; } // ya es URL
    if (!f.startsWith("data:")) { out.push(f); continue; }   // formato raro
    try {
      const blob = await comprimir(f);
      const path = `${safeId}/${Date.now()}_${String(idx).padStart(2, "0")}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      out.push(data?.publicUrl || f);
    } catch (e) {
      errores.push(`Foto ${idx}: ${e instanceof Error ? e.message : String(e)}`);
      out.push(f); // conservar la original para no perderla
    }
  }
  return { fotos: out, errores };
}

/**
 * Sube un archivo arbitrario (documento del auto: PDF, imagen, etc) a Storage
 * bajo la carpeta docs/<patente>/ y devuelve su URL publica. Las imagenes se
 * comprimen; el resto (PDF, etc) se sube tal cual conservando su tipo.
 */
export async function subirDocAStorage(
  file: File,
  patente: string,
): Promise<string> {
  const safeId = (patente || "veh").replace(/[^a-zA-Z0-9_-]/g, "") || "veh";
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "doc";
  const esImagen = file.type.startsWith("image/");
  let blob: Blob = file;
  let ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  if (esImagen) {
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(new Error("no se pudo leer la imagen"));
      r.readAsDataURL(file);
    });
    blob = await comprimir(dataUrl);
    ext = "jpg";
  }
  const path = `docs/${safeId}/${Date.now()}_${baseName}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || file.type || "application/octet-stream", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}
