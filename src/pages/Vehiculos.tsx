import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, Search, X, Upload, CheckSquare, Square, Download, Table, Trash2, Edit2, Sparkles, AlertTriangle, Images, Loader2, ArrowLeft, ArrowRight, Archive, ChevronDown, FolderOpen, Share2, Send, Copy, ExternalLink, Eye, EyeOff, Maximize2, ChevronLeft, ChevronRight, FileText, Paperclip, Globe, Star } from "lucide-react";
import JSZip from "jszip";
import { useApp, Vehiculo, VehiculoDoc } from "@/context/AppContext";
import * as XLSX from "xlsx";
import { removeBgOnWhite, getRemoveBgKey, setRemoveBgKey, hasRemoveBgKey } from "@/lib/removeBgService";
import { applyVehicleStudioAI, hasAiConfig } from "@/lib/aiImageService";
import { SearchableSelect } from "@/components/SearchableSelect";
import { NumberInput } from "@/components/NumberInput";
import { subirFotosAStorage, subirDocAStorage } from "@/lib/fotoUpload";

type VehiculoEstado = "DISPONIBLE" | "VENDIDO" | "RESERVADO" | "RETIRADO";

interface FotoSlot { label: string; file: File | null; preview: string | null; }

const FOTO_SLOTS = [
  "FRONTAL 3/4 IZQUIERDA", "FRONTAL", "TRASERA 3/4 DERECHA",
  "TRASERA", "LATERAL IZQUIERDO", "LATERAL DERECHO",
  "ASIENTOS DELANTEROS", "ASIENTOS TRASEROS", "MALETERO / CAJA CARGA",
  "INTERIOR FRONTAL", "TABLERO", "MOTOR",
  "RUEDAS", "DOCUMENTACIÓN", "FOTOS ESPECIALES"
];
const TRANSMISIONES = ["Manual", "Automático"];
const TRACCIONES = ["Tracción Delantera", "Tracción Trasera", "Tracción 4x4", "Tracción Integral"];
const TIPOS_VEHICULO = ["Camioneta", "Sedan", "Hatchback", "SUV / 3C", "Furgon", "Coupe", "Camion", "Station Wagon", "Van"];
const ESTADOS_VEHICULO: VehiculoEstado[] = ["DISPONIBLE", "RESERVADO", "VENDIDO", "RETIRADO"];
const PROCEDENCIAS = ["Propio", "Consignado"];

const MASTER_PASS = "ankker2026$$";

/** Defaults Egaña: La Vara / Av Ferrocarriles km 4, Puerto Montt */
const DEFAULT_SUCURSAL = "La Vara";
const DEFAULT_UBICACION = "Av Ferrocarriles km 4, Puerto Montt";

const emptyVehiculo = (usuarioAsignado = ""): Partial<Vehiculo & { procedencia: string; consignatarioId: string }> => ({
  folio: "", patente: "", tipo: "Sedan", marca: "", modelo: "", anio: "2026",
  estado: "DISPONIBLE", precioVenta: 0, precioPiso: 0, precioCosto: 0,
  sucursal: DEFAULT_SUCURSAL, usuarioAsignado,
  combustible: "Bencina", nMotor: "", vin: "", color: "", kilometraje: 0,
  ubicacion: DEFAULT_UBICACION,
  comentarios: "", transmision: "", traccion: "", aireAcondicionado: false,
  equipamientoExtra: [], fotos: [], documentos: [], publicadoWeb: false,
  procedencia: "Propio", consignatarioId: "",
});

/**
 * Plantilla base para el aviso de Yapo. Las llaves {variable} se reemplazan
 * con los datos del vehiculo. El vendedor puede editar el texto antes de publicar.
 */
const YAPO_BODY_TEMPLATE = `🚗 {marca} {modelo} {anio}

✅ Kilometraje: {kilometraje} km
✅ Color: {color}
✅ Combustible: {combustible}
✅ Transmisión: {transmision}
✅ Tracción: {traccion}
{equipamiento}

💰 Valor: $ {precio}

📍 Disponible en EGAÑA AUTOMOTRIZ — Av Ferrocarriles km 4, Puerto Montt.
📞 Atendemos todos los días. Recibimos tu auto en parte de pago.
🔧 Vehículo revisado y al día con su documentación.

¡Consúltanos sin compromiso!`;

/** Reemplaza las {variables} de la plantilla con los datos reales del vehiculo. */
function renderYapoBody(template: string, v: Partial<Vehiculo>): string {
  const equip = (v.equipamientoExtra || []).filter(Boolean);
  const equipLine = equip.length ? `✅ Equipamiento extra: ${equip.join(", ")}` : "";
  const map: Record<string, string> = {
    marca: (v.marca || "").toString().toUpperCase(),
    modelo: (v.modelo || "").toString().toUpperCase(),
    anio: (v.anio || "").toString(),
    kilometraje: Number(v.kilometraje || 0).toLocaleString("es-CL"),
    color: (v.color || "—").toString(),
    combustible: (v.combustible || "—").toString(),
    transmision: (v.transmision || "—").toString(),
    traccion: (v.traccion || "—").toString(),
    precio: Number(v.precioVenta || 0).toLocaleString("es-CL"),
    equipamiento: equipLine,
  };
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in map ? map[key] : `{${key}}`));
}

/** True si el vehiculo se creo hace menos de 24h (badge "Nueva unidad"). */
function esVehiculoNuevo(v: Vehiculo): boolean {
  if (!v.createdAt) return false;
  const ms = new Date(v.createdAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms < 24 * 60 * 60 * 1000;
}

const fmt = (n: number) => "$" + n.toLocaleString("es-CL");

const statusBadge = (estado: string) => {
  if (estado === "DISPONIBLE") return <span className="badge-success">{estado}</span>;
  if (estado === "VENDIDO") return <span className="badge-destructive">{estado}</span>;
  if (estado === "RESERVADO") return <span className="badge-warning">{estado}</span>;
  return <span className="badge-muted">{estado}</span>;
};

// --- Modal de confirmacion al eliminar vehiculo ---
function DeleteModal({ vehiculoNombre, onConfirm, onCancel }: { vehiculoNombre?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="bg-card rounded-xl shadow-2xl p-7 w-[22rem] animate-fade-in" style={{ border: "1px solid hsl(var(--border))" }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={18} style={{ color: "hsl(var(--destructive))" }} />
          <h3 className="font-bold text-sm" style={{ color: "hsl(var(--destructive))" }}>Eliminar vehículo</h3>
        </div>
        <p className="text-sm mb-1">¿Estás seguro que quieres eliminar este auto?</p>
        {vehiculoNombre && <p className="text-sm font-semibold mb-2">{vehiculoNombre}</p>}
        <p className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Esta acción no se puede deshacer.</p>
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onCancel} className="px-4 py-2 rounded border text-sm hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--destructive))" }} autoFocus>Sí, eliminar</button>
        </div>
      </div>
    </div>
  );
}

export default function Vehiculos() {
  const { vehiculos, vehiculosLoading, addVehiculo, updateVehiculo, deleteVehiculo, getVehiculoFotos, clientes, usuarioActual } = useApp();
  // Las fotos no viajan con la lista (peso): se cargan al abrir el vehiculo.
  const [fotosLoading, setFotosLoading] = useState(false);
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("DISPONIBLE");
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState("general");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Vehiculo & { procedencia: string; consignatarioId: string }>>(emptyVehiculo(usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : ""));
  const [fotoSlots, setFotoSlots] = useState<FotoSlot[]>(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
  const [nuevoEquipamiento, setNuevoEquipamiento] = useState("");
  // Documentos del auto pendientes de subir (se suben a Storage al guardar).
  const [docsPendientes, setDocsPendientes] = useState<{ name: string; file: File; tipo: "imagen" | "documento" }[]>([]);
  const [subiendoDocs, setSubiendoDocs] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const modeloRef = useRef<HTMLInputElement>(null);
  const fotoRefs = useRef<(HTMLInputElement | null)[]>([]);
  const multiUploadRef = useRef<HTMLInputElement>(null);
  const excelImportRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Solo perfiles de administracion (master/administracion) pueden eliminar autos.
  const isAdmin = usuarioActual?.rol === "master" || usuarioActual?.rol === "administracion";
  // Los vendedores pueden ver el precio piso pero NO modificarlo. El resto si.
  const esVendedor = usuarioActual?.rol === "vendedor";
  const [saving, setSaving] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  // Por defecto cuando se abre un vehiculo a editar, esta en modo lectura.
  // El usuario debe pulsar "Editar" para habilitar los inputs (previene clicks accidentales).
  const [isReadOnly, setIsReadOnly] = useState(true);

  // Precio Piso: solo visible dentro del modal, oculto por defecto (el ojo lo revela).
  const [showPisoModal, setShowPisoModal] = useState(false);

  // Publicar en Yapo (texto editable + estado de publicacion)
  const [yapoTemplate, setYapoTemplate] = useState(YAPO_BODY_TEMPLATE);
  const [yapoTitulo, setYapoTitulo] = useState("");
  const [yapoPublishing, setYapoPublishing] = useState(false);
  const [yapoResult, setYapoResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // El editor de fondo queda oculto por defecto (para no molestar a vendedores).
  const [showAIEditor, setShowAIEditor] = useState(false);
  // Visor de imagen grande (lightbox) para exhibir el auto en pantalla.
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [processingAI, setProcessingAI] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // API key de remove.bg (recorte de fondo). Se guarda en localStorage.
  const [removeBgKey, setRemoveBgKeyInput] = useState(() => getRemoveBgKey());
  const [removeBgKeySaved, setRemoveBgKeySaved] = useState(() => hasRemoveBgKey());

  const exportExcel = () => {
    const data = vehiculos.map(v => ({
      ID: v.id, Folio: v.folio, Patente: v.patente, Tipo: v.tipo,
      Marca: v.marca, Modelo: v.modelo, "Año": v.anio, Estado: v.estado,
      "Precio Venta": v.precioVenta, "Precio Piso": v.precioPiso, "Precio Costo": v.precioCosto,
      Sucursal: v.sucursal, Kilometraje: v.kilometraje, Color: v.color,
      Combustible: v.combustible, Transmision: v.transmision, Traccion: v.traccion,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vehiculos");
    XLSX.writeFile(wb, "vehiculos.xlsx");
  };

  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws);
      const nuevos: Vehiculo[] = rows.map((r, i) => ({
        id: String(r["ID"] || crypto.randomUUID()),
        folio: String(r["Folio"] || ""),
        patente: String(r["Patente"] || ""),
        tipo: String(r["Tipo"] || "AUTOMOVIL"),
        marca: String(r["Marca"] || ""),
        modelo: String(r["Modelo"] || ""),
        anio: String(r["Año"] || r["Anio"] || ""),
        estado: (String(r["Estado"] || "DISPONIBLE")) as Vehiculo["estado"],
        precioVenta: Number(r["Precio Venta"] || 0),
        precioPiso: Number(r["Precio Piso"] || 0),
        precioCosto: Number(r["Precio Costo"] || 0),
        sucursal: String(r["Sucursal"] || ""),
        usuarioAsignado: "", combustible: String(r["Combustible"] || "Bencina"),
        nMotor: "", vin: "", color: String(r["Color"] || ""),
        kilometraje: Number(r["Kilometraje"] || 0),
        ubicacion: "", comentarios: "",
        transmision: String(r["Transmision"] || ""),
        traccion: String(r["Traccion"] || ""),
        aireAcondicionado: false, equipamientoExtra: [], fotos: [], documentos: [], publicadoWeb: false,
      }));
      for (const v of nuevos) await addVehiculo(v);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const filtered = vehiculos.filter(v => {
    const matchEstado = filtroEstado === "TODOS" || v.estado === filtroEstado;
    const matchSearch = `${v.marca} ${v.modelo} ${v.patente} ${v.folio}`.toLowerCase().includes(search.toLowerCase());
    return matchEstado && matchSearch;
  });

  // Render por tramos para que la tabla aparezca rapido (no renderiza 1200 filas
  // de golpe). Muestra los primeros PAGE y suma con "Cargar mas".
  const PAGE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  // Al cambiar filtro/busqueda, volver a mostrar solo el primer tramo.
  useEffect(() => { setVisibleCount(PAGE); }, [filtroEstado, search]);

  // Auto-fit del campo Modelo: si el nombre es muy largo, achica la letra hasta
  // que entre completo en la casilla (medido, funciona en cualquier ancho/pantalla).
  // Se corre despues del layout (doble rAF) y al redimensionar la ventana.
  useEffect(() => {
    const el = modeloRef.current;
    if (!el) return;
    const fit = () => {
      if (!el.clientWidth) return; // aun no visible/medible
      let size = 14;
      el.style.fontSize = "14px";
      let guard = 0;
      while (el.scrollWidth > el.clientWidth && size > 8 && guard < 30) {
        size -= 0.5;
        el.style.fontSize = size + "px";
        guard++;
      }
    };
    // ResizeObserver: dispara fit cuando la casilla toma su ancho real (el modal
    // anima su ancho, asi que al abrir el input pasa de 0 a su ancho final).
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [form.modelo, tab, showModal]);
  const visibles = filtered.slice(0, visibleCount);

  const openCreate = () => {
    const ua = usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : "";
    setForm(emptyVehiculo(ua));
    setFotoSlots(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
    setDocsPendientes([]);
    setEditId(null); setTab("general"); setShowModal(true);
    setIsReadOnly(false); // crear siempre editable
    setShowPisoModal(true); // al crear, el campo se escribe directo
  };

  const openEdit = async (v: Vehiculo) => {
    setForm({ ...v, documentos: v.documentos ?? [] });
    setFotoSlots(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
    setDocsPendientes([]);
    setEditId(v.id); setTab("general"); setShowModal(true);
    setIsReadOnly(true); // editar arranca en modo lectura
    setShowPisoModal(false); // precio piso oculto por defecto
    // Cargar las fotos en segundo plano (no viajan con la lista por peso)
    setFotosLoading(true);
    const fotos = await getVehiculoFotos(v.id);
    setFotoSlots(FOTO_SLOTS.map((label, i) => ({ label, file: null, preview: fotos[i] || null })));
    setFotosLoading(false);
  };

  const handleSave = async () => {
    if (!form.patente?.trim() || !form.marca?.trim()) return alert("Patente y Marca son requeridos.");
    if (fotosLoading) return alert("Espera un momento: las fotos del vehículo aún se están cargando.");
    const nextFolio = String(vehiculos.length + 1).padStart(5, "0");
    setSaving(true);
    try {
      // Subir las fotos base64 a Storage (comprimidas) y guardar solo las URLs.
      // Asi el guardado es liviano y confiable (antes 15 fotos base64 pesaban
      // ~100MB y el guardado fallaba en silencio).
      const slotsFotos = fotoSlots.map(s => s.preview || "");
      const tieneBase64 = slotsFotos.some(f => f.startsWith("data:"));
      if (tieneBase64) setSubiendoFotos(true);
      const { fotos, errores } = await subirFotosAStorage(slotsFotos, form.patente || "");
      setSubiendoFotos(false);

      // Subir documentos pendientes a Storage y juntarlos con los ya guardados.
      let documentos: VehiculoDoc[] = [...(form.documentos || [])];
      const erroresDocs: string[] = [];
      if (docsPendientes.length > 0) {
        setSubiendoDocs(true);
        for (const d of docsPendientes) {
          try {
            const url = await subirDocAStorage(d.file, form.patente || "");
            if (url) documentos.push({ name: d.name, url, tipo: d.tipo });
          } catch (err) {
            erroresDocs.push(`${d.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        setSubiendoDocs(false);
      }

      if (editId) {
        await updateVehiculo({ ...form, fotos, documentos, id: editId } as Vehiculo);
      } else {
        const newV: Vehiculo = { id: crypto.randomUUID(), folio: nextFolio, ...(form as Vehiculo), fotos, documentos };
        await addVehiculo(newV);
      }
      setDocsPendientes([]);
      if (errores.length > 0 || erroresDocs.length > 0) {
        alert(
          `Vehículo guardado` +
          (errores.length ? `, pero ${errores.length} foto(s) no se subieron:\n` + errores.slice(0, 5).join("\n") : "") +
          (erroresDocs.length ? `\n${erroresDocs.length} documento(s) no se subieron:\n` + erroresDocs.slice(0, 5).join("\n") : "")
        );
      }
      setShowModal(false);
    } catch (e) {
      alert("Error al guardar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
      setSubiendoFotos(false);
    }
  };

  const confirmDelete = (id: string) => setDeleteId(id);

  const doDelete = async () => {
    if (deleteId) await deleteVehiculo(deleteId);
    setDeleteId(null);
    setShowModal(false);
  };

  // ── Fondo blanco con remove.bg (recorte profesional) ─────────────
  // Recorta el auto exacto (mismos píxeles: color, ángulo y tamaño) en el
  // servidor de remove.bg y lo pega sobre fondo blanco puro con sombra suave.
  // Garantiza que el vehículo NO cambie de color ni de tamaño.
  const runAI = useCallback(async (dataUrl: string, slotIndex: number) => {
    if (!hasRemoveBgKey()) {
      setAiError("❌ Falta la API key de remove.bg. Abrí el panel 'Fondo blanco automático' (acá abajo) y pegá tu clave.");
      setShowAIEditor(true);
      return;
    }
    setAiError(null);
    setProcessingAI(slotIndex);
    try {
      const result = await removeBgOnWhite(dataUrl);
      if (result.ok && result.dataUrl) {
        setFotoSlots(prev => prev.map((s, idx) => idx === slotIndex ? { ...s, preview: result.dataUrl! } : s));
        setAiError(null);
      } else {
        setAiError(`⚠️ ${result.error ?? "No se pudo recortar el fondo."}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(`⚠️ Error inesperado: ${msg}`);
    } finally {
      setProcessingAI(null);
    }
  }, []);

  const applyAIBackground = (slotIndex: number) => {
    const slot = fotoSlots[slotIndex];
    if (slot?.preview) runAI(slot.preview, slotIndex);
  };

  // Estudio IA (Gemini): detecta el color y genera fondo de estudio con reflejo.
  // Más "lindo" pero generativo (puede variar algo el color). Opción para comparar.
  const runStudioAI = useCallback(async (slotIndex: number) => {
    const slot = fotoSlots[slotIndex];
    if (!slot?.preview) return;
    // Advertencia: el Estudio IA es generativo y PUEDE cambiar el color del auto.
    if (!window.confirm(
      "⚠️ ESTUDIO IA (experimental)\n\n" +
      "Reorienta el auto y le pone fondo de estudio, PERO al ser IA generativa puede CAMBIAR EL COLOR del auto.\n\n" +
      "Para fondo blanco seguro (sin cambiar color) usá el botón azul \"Fondo\".\n\n" +
      "¿Querés continuar igual con el Estudio IA?"
    )) return;
    if (!hasAiConfig()) {
      setAiError("❌ Falta tu API Key de Gemini. Ve a Configuración → pega tu clave de Google Gemini → Guardar APIs.");
      return;
    }
    setAiError(null);
    setProcessingAI(slotIndex);
    try {
      const result = await applyVehicleStudioAI(slot.preview);
      if (result.ok && result.dataUrl) {
        setFotoSlots(prev => prev.map((s, idx) => idx === slotIndex ? { ...s, preview: result.dataUrl! } : s));
        setAiError(null);
      } else {
        setAiError(`⚠️ ${result.error ?? "El Estudio IA no pudo procesar la imagen."}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(`⚠️ Error inesperado: ${msg}`);
    } finally {
      setProcessingAI(null);
    }
  }, [fotoSlots]);

  const handleFotoChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setFotoSlots(prev => prev.map((s, idx) => idx === i ? { ...s, file, preview: dataUrl } : s));
      // No auto-aplicamos el recorte: el usuario elige la foto del ángulo bueno
      // y aprieta ✨ cuando quiere ponerle fondo blanco.
    };
    reader.readAsDataURL(file);
  };


  const downloadFoto = (dataUrl: string, label: string) => {
    const a = document.createElement("a"); a.href = dataUrl; a.download = label + ".jpg"; a.click();
  };

  /** Agrega archivos (fotos o documentos del auto) a la cola pendiente. */
  const handleDocsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const nuevos = files.map(file => ({
      name: file.name,
      file,
      tipo: (file.type.startsWith("image/") ? "imagen" : "documento") as "imagen" | "documento",
    }));
    setDocsPendientes(prev => [...prev, ...nuevos]);
    e.target.value = "";
  };

  /** Quita un documento ya guardado (URL de Storage). */
  const removeDocGuardado = (url: string) => {
    setForm(f => ({ ...f, documentos: (f.documentos || []).filter(d => d.url !== url) }));
  };

  /** Quita un documento pendiente (aun no subido). */
  const removeDocPendiente = (idx: number) => {
    setDocsPendientes(prev => prev.filter((_, i) => i !== idx));
  };

  /** Abre/descarga un documento ya guardado. */
  const abrirDoc = (url: string) => { window.open(url, "_blank", "noopener,noreferrer"); };

  /** Intercambia el contenido (file + preview) de dos slots. Los labels NO se mueven. */
  const swapSlots = (i: number, j: number) => {
    if (i === j || i < 0 || j < 0 || i >= fotoSlots.length || j >= fotoSlots.length) return;
    setFotoSlots((prev) => {
      const arr = [...prev];
      const a = arr[i];
      const b = arr[j];
      arr[i] = { ...a, file: b.file, preview: b.preview };
      arr[j] = { ...b, file: a.file, preview: a.preview };
      return arr;
    });
  };

  /** Mueve el contenido del slot i a la posición 0 (portada), corriendo el resto. */
  const moveToFirst = (i: number) => {
    if (i <= 0 || i >= fotoSlots.length) return;
    setFotoSlots((prev) => {
      const arr = prev.map((s) => ({ ...s }));
      const movedFile = arr[i].file;
      const movedPreview = arr[i].preview;
      // Correr 0..i-1 una posición hacia abajo (los labels NO se mueven).
      for (let k = i; k > 0; k--) {
        arr[k] = { ...arr[k], file: arr[k - 1].file, preview: arr[k - 1].preview };
      }
      arr[0] = { ...arr[0], file: movedFile, preview: movedPreview };
      return arr;
    });
  };

  /** Quita el contenido de un slot (deja el label) */
  const removeFoto = (i: number) => {
    setFotoSlots((prev) => prev.map((s, idx) => idx === i ? { ...s, file: null, preview: null } : s));
  };

  /**
   * Subida masiva: el usuario selecciona N fotos a la vez. Las distribuimos
   * en los slots VACÍOS empezando desde el primer slot libre. Si hay mas
   * archivos que slots libres, los sobrantes se ignoran (con aviso).
   */
  const handleMultiFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBatchUploading(true);
    try {
      // Slots vacios disponibles (en orden)
      const emptyIndices = fotoSlots
        .map((s, i) => (s.preview ? -1 : i))
        .filter((i) => i >= 0);
      if (emptyIndices.length === 0) {
        alert("Todos los slots de fotos estan ocupados. Borra alguna para liberar espacio.");
        return;
      }
      const usableFiles = files.slice(0, emptyIndices.length);
      const ignored = files.length - usableFiles.length;

      // Convertir cada file a dataURL en paralelo
      const readers = usableFiles.map(
        (file) =>
          new Promise<{ file: File; dataUrl: string }>((resolve, reject) => {
            const r = new FileReader();
            r.onload = (ev) => resolve({ file, dataUrl: (ev.target?.result as string) || "" });
            r.onerror = () => reject(new Error("Error leyendo " + file.name));
            r.readAsDataURL(file);
          }),
      );
      const results = await Promise.all(readers);

      // Distribuir resultados en los slots vacios
      setFotoSlots((prev) =>
        prev.map((s, i) => {
          const matchPos = emptyIndices.indexOf(i);
          if (matchPos < 0 || matchPos >= results.length) return s;
          return { ...s, file: results[matchPos].file, preview: results[matchPos].dataUrl };
        }),
      );

      if (ignored > 0) {
        setTimeout(
          () => alert(`Se cargaron ${usableFiles.length} fotos. ${ignored} fotos se ignoraron porque no hay mas slots disponibles.`),
          200,
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBatchUploading(false);
      // Reset input para que el mismo archivo se pueda volver a subir si user borra y reintenta
      if (multiUploadRef.current) multiUploadRef.current.value = "";
    }
  };

  const fotosCount = fotoSlots.filter(s => s.preview).length;
  const toggleEquipExtra = (item: string) => {
    const list = form.equipamientoExtra || [];
    setForm({ ...form, equipamientoExtra: list.includes(item) ? list.filter(x => x !== item) : [...list, item] });
  };
  const addEquipamiento = () => {
    if (!nuevoEquipamiento.trim()) return;
    const list = form.equipamientoExtra || [];
    setForm({ ...form, equipamientoExtra: [...list, nuevoEquipamiento.trim()] });
    setNuevoEquipamiento("");
  };

  // Texto renderizado para Yapo (con datos del vehiculo) — derivado del template editable.
  const yapoCuerpoRenderizado = renderYapoBody(yapoTemplate, form);
  const yapoTituloFinal = yapoTitulo.trim() || `${form.marca || ""} ${form.modelo || ""} ${form.anio || ""}`.trim();
  const fotosCargadas = fotoSlots.filter(s => s.preview).map(s => s.preview as string);

  /**
   * Publica (o quita) el vehiculo en Yapo marcando publicado_yapo en la DB.
   * El feed XML (yapo-feed) solo incluye vehiculos con ese flag, asi que
   * Yapo lo importa/quita en su proxima sincronizacion. Sin publicacion
   * automatica: cada auto se publica solo cuando el usuario lo decide aca.
   */
  const togglePublicarYapo = async (publicar: boolean) => {
    if (!editId) {
      alert("Primero guarda el vehículo, después publicalo en Yapo.");
      return;
    }
    if (fotosLoading) {
      alert("Espera un momento: las fotos del vehículo aún se están cargando.");
      return;
    }
    if (publicar) {
      if (!form.marca || !form.modelo || !form.precioVenta) {
        alert("Faltan datos basicos: marca, modelo y precio son obligatorios.");
        return;
      }
      if (fotosCargadas.length === 0) {
        alert("Subi al menos 1 foto antes de publicar.");
        return;
      }
      if (form.estado !== "DISPONIBLE") {
        alert("Solo los vehículos DISPONIBLES se publican en Yapo.");
        return;
      }
    }
    setYapoPublishing(true);
    setYapoResult(null);
    try {
      const fotos = fotoSlots.map(s => s.preview || "");
      await updateVehiculo({ ...form, fotos, id: editId, publicadoYapo: publicar } as Vehiculo);
      setForm({ ...form, publicadoYapo: publicar });
      setYapoResult({
        ok: true,
        msg: publicar
          ? "✅ Publicado: el vehículo ya está en el feed de Yapo. Yapo lo importará en su próxima sincronización (normalmente dentro de unas horas)."
          : "El vehículo fue quitado del feed. Yapo eliminará el aviso en su próxima sincronización.",
      });
    } catch (e) {
      setYapoResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setYapoPublishing(false);
    }
  };

  const TABS = ["general", "datos_adicionales", "galeria", "publicar_yapo"];
  const TAB_LABELS: Record<string, string> = { general: "General", datos_adicionales: "Datos Adicionales", galeria: "Galería", publicar_yapo: "Publicar Yapo" };

  /** Genera el prefijo de nombre de archivo: PATENTE_MARCA */
  const filePrefix = (): string => {
    const patente = (form.patente || "").toString().replace(/[^a-zA-Z0-9]/g, "");
    const marca = (form.marca || "").toString().replace(/[^a-zA-Z0-9]/g, "");
    return [patente, marca].filter(Boolean).join("_") || "vehiculo";
  };

  const safeLabel = (s: string): string => s.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim() || "foto";

  /** Si el navegador soporta showDirectoryPicker → permite elegir carpeta. */
  const SUPPORTS_FS_ACCESS =
    typeof window !== "undefined" && "showDirectoryPicker" in window;

  /** Si el navegador soporta navigator.share con files (mobile principalmente). */
  const SUPPORTS_SHARE_FILES = (() => {
    if (typeof navigator === "undefined") return false;
    if (!navigator.canShare) return false;
    try {
      const testFile = new File([new Blob(["test"])], "test.txt", { type: "text/plain" });
      return navigator.canShare({ files: [testFile] });
    } catch { return false; }
  })();

  /**
   * Compartir todas las fotos usando el menú nativo del sistema.
   * En celular abre el "Share Sheet" (iOS) o "Compartir" (Android) donde
   * el usuario puede elegir: Guardar en Galería, Guardar en Archivos,
   * abrir en Marketplace/Yapo/WhatsApp, etc.
   *
   * Esta es la forma MAS NATURAL para vendedores en celular: 1 click →
   * eligen "Guardar en Fotos" → todas las fotos quedan en su galería
   * lista para subir al marketplace.
   */
  const downloadAllViaShare = async () => {
    const available = fotoSlots.filter((s) => s.preview);
    if (available.length === 0) {
      alert("No hay fotos cargadas.");
      return;
    }
    setShowDownloadMenu(false);
    setZipDownloading(true);
    try {
      const prefix = filePrefix();
      const files: File[] = [];
      let idx = 1;
      for (const slot of available) {
        const dataUrl = slot.preview!;
        const blob = await (await fetch(dataUrl)).blob();
        const filename = `${prefix}_${String(idx).padStart(2, "0")}_${safeLabel(slot.label)}.jpg`;
        files.push(new File([blob], filename, { type: blob.type || "image/jpeg" }));
        idx++;
      }
      if (!navigator.canShare || !navigator.canShare({ files })) {
        alert("Tu dispositivo no permite compartir todas las fotos a la vez. Usa la opción ZIP.");
        return;
      }
      await navigator.share({
        files,
        title: `Fotos ${prefix}`,
        text: `${files.length} fotos del vehículo`,
      });
    } catch (err) {
      // El usuario puede haber cancelado — no es error real
      const errName = (err as Error).name;
      if (errName !== "AbortError" && errName !== "NotAllowedError") {
        alert("Error compartiendo: " + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setZipDownloading(false);
    }
  };

  /**
   * Descarga todas las fotos directamente a una CARPETA elegida por el usuario.
   *
   * Usa la File System Access API (showDirectoryPicker). Solo funciona en
   * Chrome/Edge desktop. El usuario elige la carpeta UNA vez y las N fotos
   * quedan ahi sin ZIP ni descargas multiples.
   *
   * Permite tambien crear un subdirectorio PATENTE_MARCA dentro de la
   * carpeta elegida para no mezclar fotos de varios autos.
   */
  const downloadAllToFolder = async () => {
    const available = fotoSlots.filter((s) => s.preview);
    if (available.length === 0) {
      alert("No hay fotos cargadas.");
      return;
    }
    if (!SUPPORTS_FS_ACCESS) {
      alert("Tu navegador no soporta elegir carpeta. Usa la opción ZIP o cambia a Chrome/Edge en desktop.");
      return;
    }

    setShowDownloadMenu(false);
    let parentHandle: FileSystemDirectoryHandle;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parentHandle = await (window as any).showDirectoryPicker({
        id: "egana-fotos-vehiculos",
        mode: "readwrite",
        startIn: "downloads",
      });
    } catch {
      // El usuario cerró el picker — no es error real, salimos en silencio
      return;
    }

    setZipDownloading(true);
    try {
      const prefix = filePrefix();
      // Crear sub-carpeta con el nombre del vehiculo para no mezclar
      const targetHandle = await parentHandle.getDirectoryHandle(prefix, {
        create: true,
      });

      let idx = 1;
      for (const slot of available) {
        try {
          const dataUrl = slot.preview!;
          const blob = await (await fetch(dataUrl)).blob();
          const filename = `${String(idx).padStart(2, "0")}_${safeLabel(slot.label)}.jpg`;
          const fileHandle = await targetHandle.getFileHandle(filename, { create: true });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const writable = await (fileHandle as any).createWritable();
          await writable.write(blob);
          await writable.close();
          idx++;
        } catch (e) {
          console.error("Error escribiendo foto", idx, e);
        }
      }
      alert(`${idx - 1} fotos guardadas en la carpeta "${prefix}".`);
    } catch (err) {
      alert("Error guardando en carpeta: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setZipDownloading(false);
    }
  };

  /**
   * Descarga todas las fotos en UN solo archivo .zip.
   * Es la opcion mas confiable: el navegador solo necesita permitir UNA
   * descarga (la del zip), no varias automaticas. Sin bloqueos.
   */
  const downloadAllAsZip = async () => {
    const available = fotoSlots.filter((s) => s.preview);
    if (available.length === 0) {
      alert("No hay fotos cargadas.");
      return;
    }
    setZipDownloading(true);
    setShowDownloadMenu(false);
    try {
      const zip = new JSZip();
      const prefix = filePrefix();
      let idx = 1;
      for (const slot of available) {
        const dataUrl = slot.preview!;
        // dataUrl shape: data:image/jpeg;base64,XXXX → extract mime + base64
        const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/.exec(dataUrl);
        if (!m) continue;
        const ext = m[1].split("/")[1].replace("jpeg", "jpg");
        const filename = `${prefix}_${String(idx).padStart(2, "0")}_${safeLabel(slot.label)}.${ext}`;
        zip.file(filename, m[2], { base64: true });
        idx++;
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${prefix}_fotos.zip`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      alert("Error generando ZIP: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setZipDownloading(false);
    }
  };

  /**
   * Descarga TODAS las fotos cargadas como archivos individuales.
   * NOTA: muchos navegadores bloquean las descargas multiples automaticas.
   * La primera vez Chrome/Edge mostraran un banner para "Permitir
   * descargas multiples" — el usuario tiene que aceptarlo o solo bajara
   * la primera foto.
   */
  const downloadAllIndividual = async () => {
    const available = fotoSlots.filter((s) => s.preview);
    if (available.length === 0) {
      alert("No hay fotos cargadas.");
      return;
    }
    setZipDownloading(true);
    setShowDownloadMenu(false);
    const urlsToCleanup: string[] = [];
    try {
      const prefix = filePrefix();
      let idx = 1;

      for (const slot of available) {
        try {
          const dataUrl = slot.preview!;
          const blob = await (await fetch(dataUrl)).blob();
          const objectUrl = URL.createObjectURL(blob);
          urlsToCleanup.push(objectUrl);

          const filename = `${prefix}_${String(idx).padStart(2, "0")}_${safeLabel(slot.label)}.jpg`;
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = filename;
          a.rel = "noopener";
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          idx++;
          await new Promise((r) => setTimeout(r, 600));
        } catch (e) {
          console.error("Error descargando foto", idx, e);
        }
      }
    } catch (err) {
      alert("Error descargando: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTimeout(() => {
        urlsToCleanup.forEach((url) => URL.revokeObjectURL(url));
      }, 30000);
      setZipDownloading(false);
    }
  };

  return (
    <div>
      {deleteId && (() => {
        const dv = vehiculos.find(x => x.id === deleteId);
        const nombre = dv ? `${dv.patente || "S/P"} — ${dv.marca} ${dv.modelo} ${dv.anio}`.trim() : undefined;
        return <DeleteModal vehiculoNombre={nombre} onConfirm={doDelete} onCancel={() => setDeleteId(null)} />;
      })()}

      {/* Visor de imagen grande (lightbox) para exhibir el auto en pantalla */}
      {lightboxIdx !== null && fotoSlots[lightboxIdx]?.preview && (() => {
        const conImg = fotoSlots.map((s, i) => (s.preview ? i : -1)).filter(i => i >= 0);
        const pos = conImg.indexOf(lightboxIdx);
        const ir = (delta: number) => setLightboxIdx(conImg[(pos + delta + conImg.length) % conImg.length]);
        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.92)" }}
            onClick={() => setLightboxIdx(null)}
          >
            <button onClick={() => setLightboxIdx(null)} className="absolute top-4 right-4 p-2 rounded-full text-white hover:bg-white/15" title="Cerrar">
              <X size={26} />
            </button>
            {conImg.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); ir(-1); }} className="absolute left-3 md:left-6 p-3 rounded-full text-white hover:bg-white/15" title="Anterior">
                  <ChevronLeft size={34} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); ir(1); }} className="absolute right-3 md:right-6 p-3 rounded-full text-white hover:bg-white/15" title="Siguiente">
                  <ChevronRight size={34} />
                </button>
              </>
            )}
            <img
              src={fotoSlots[lightboxIdx].preview!}
              alt={fotoSlots[lightboxIdx].label}
              className="max-h-[90vh] max-w-[92vw] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-5 left-0 right-0 flex justify-center">
              <span className="px-4 py-1.5 rounded-full text-white text-sm font-medium" style={{ background: "rgba(0,0,0,0.6)" }}>
                {fotoSlots[lightboxIdx].label} · {pos + 1} / {conImg.length}
              </span>
            </div>
          </div>
        );
      })()}

      <div className="page-header">
        <div>
          <h1 className="page-title">Vehículos</h1>
          <p className="page-subtitle">{vehiculosLoading ? "Cargando..." : `${vehiculos.length} vehículos en inventario`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => excelImportRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
            <Upload size={15} /> Importar Excel
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
            <Table size={15} /> Exportar Excel
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
            <Plus size={16} /> Crear Vehículo
          </button>
          <input ref={excelImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <select className="border rounded px-3 py-2 text-sm bg-card" style={{ borderColor: "hsl(var(--border))" }}
          value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="TODOS">Todos</option>
          {ESTADOS_VEHICULO.map(e => <option key={e} value={e}>{e.charAt(0) + e.slice(1).toLowerCase()}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
          <input className="pl-9 pr-3 py-2 border rounded text-sm bg-card" style={{ borderColor: "hsl(var(--border))" }}
            placeholder="Buscar por marca, modelo, patente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="ml-auto text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{filtered.length} / {vehiculos.length}</span>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
        {/* Desktop: tabla completa. En movil es demasiado ancha, asi que abajo
            se muestra una vista de tarjetas (md:hidden). */}
        <table className="hidden md:table w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <th className="px-4 py-3 text-left font-semibold">Patente</th>
              <th className="px-4 py-3 text-left font-semibold">Marca</th>
              <th className="px-4 py-3 text-left font-semibold">Tipo</th>
              <th className="px-4 py-3 text-left font-semibold">Modelo</th>
              <th className="px-4 py-3 text-left font-semibold">Año</th>
              <th className="px-4 py-3 text-left font-semibold">Precio Venta</th>
              <th className="px-4 py-3 text-left font-semibold">Sucursal</th>
              <th className="px-4 py-3 text-left font-semibold">Estado</th>
              <th className="px-4 py-3 text-left font-semibold">Publicado</th>
              <th className="px-4 py-3 text-left font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(v => (
              <tr key={v.id} className="table-row-hover border-b" style={{ borderColor: "hsl(var(--border))" }}>
                <td className="px-4 py-3 font-medium cursor-pointer" style={{ color: "hsl(var(--primary))" }} onClick={() => openEdit(v)}>
                  <div className="flex items-center gap-2">
                    <span>{v.patente || "—"}</span>
                    {esVehiculoNuevo(v) && (
                      <span
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                        style={{ background: "#16a34a", color: "white", letterSpacing: 0.3 }}
                        title={`Subido el ${v.createdAt ? new Date(v.createdAt).toLocaleString("es-CL") : ""}`}
                      >
                        ★ Nueva unidad
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{v.marca}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{v.tipo}</td>
                <td className="px-4 py-3 font-medium cursor-pointer" style={{ color: "hsl(var(--primary))", cursor: "pointer" }} onClick={() => openEdit(v)}>{v.modelo}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{v.anio}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{fmt(v.precioVenta)}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{v.sucursal || "—"}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{statusBadge(v.estado)}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>
                  {v.publicadoYapo ? (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{ background: "#f97316", color: "white", letterSpacing: 0.3 }}
                      title="Publicado en Yapo.cl">
                      YAPO
                    </span>
                  ) : (
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(v)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--primary))" }}><Edit2 size={14} /></button>
                    {isAdmin && (
                      <button onClick={(e) => { e.stopPropagation(); confirmDelete(v.id); }} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--destructive))" }}><Trash2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay vehículos</td></tr>
            )}
          </tbody>
        </table>

        {/* ── Vista MOVIL: tarjetas tappables (la tabla es muy ancha para telefono) ── */}
        <div className="md:hidden divide-y" style={{ borderColor: "hsl(var(--border))" }}>
          {visibles.map(v => (
            <button
              key={v.id}
              onClick={() => openEdit(v)}
              className="w-full text-left px-4 py-3 active:bg-muted/50 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold" style={{ color: "hsl(var(--primary))" }}>{v.patente || "—"}</span>
                  {esVehiculoNuevo(v) && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ background: "#16a34a", color: "white", letterSpacing: 0.3 }}>★ Nueva</span>
                  )}
                  {v.publicadoYapo && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ background: "#f97316", color: "white", letterSpacing: 0.3 }}>Yapo</span>
                  )}
                </div>
                <div className="text-sm font-medium mt-0.5 truncate">{v.marca} {v.modelo}</div>
                <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{v.anio || "—"} · {v.sucursal || "—"}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold whitespace-nowrap">{fmt(v.precioVenta)}</div>
                <div className="mt-1 flex justify-end">{statusBadge(v.estado)}</div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No hay vehículos</div>
          )}
        </div>

        {visibleCount < filtered.length && (
          <div className="flex items-center justify-center gap-3 py-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
            <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Mostrando {visibles.length} de {filtered.length}
            </span>
            <button
              onClick={() => setVisibleCount(c => c + 40)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "hsl(var(--primary))" }}
            >
              Cargar más
            </button>
            <button
              onClick={() => setVisibleCount(filtered.length)}
              className="px-3 py-2 rounded-lg text-sm font-medium border hover:bg-muted"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              Ver todos
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-3xl mx-4 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>
                  {editId ? `${isReadOnly ? "Vehículo" : "Editar Vehículo"} — ${form.patente}` : "Nuevo Vehículo"}
                </span>
                {editId && isReadOnly && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                    Solo lectura
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editId && isReadOnly && (
                  <button onClick={() => setIsReadOnly(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>
                    <Edit2 size={13} /> Editar
                  </button>
                )}
                {editId && !isReadOnly && isAdmin && (
                  <button onClick={() => confirmDelete(editId)} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium" style={{ color: "hsl(var(--destructive))", border: "1px solid hsl(var(--destructive)/0.3)" }}>
                    <Trash2 size={13} /> Eliminar
                  </button>
                )}
                <button onClick={() => setShowModal(false)}><X size={18} /></button>
              </div>
            </div>
            <div className="flex border-b px-6" style={{ borderColor: "hsl(var(--border))" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-primary" : "border-transparent"}`}
                  style={{ color: tab === t ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              <fieldset disabled={isReadOnly} className="contents">
              {tab === "general" && (
                <div>
                  {/* Publicar en la web (Auto Path) — botón independiente del estado */}
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border p-3"
                    style={{ borderColor: form.publicadoWeb ? "rgb(34 197 94)" : "hsl(var(--border))", background: form.publicadoWeb ? "rgb(34 197 94 / 0.07)" : "transparent" }}>
                    <div className="flex items-center gap-2.5">
                      <Globe size={20} style={{ color: form.publicadoWeb ? "rgb(22 163 74)" : "hsl(var(--muted-foreground))" }} />
                      <div>
                        <div className="text-sm font-semibold">Publicar en la página web</div>
                        <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {form.publicadoWeb ? "Visible en la web pública de Egaña" : "No aparece en la web pública"}
                        </div>
                      </div>
                    </div>
                    {form.publicadoWeb ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "rgb(34 197 94)" }}>
                          <CheckSquare size={15} /> Publicado
                        </span>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, publicadoWeb: false })}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border"
                          style={{ borderColor: "rgb(220 38 38)", color: "rgb(220 38 38)" }}
                        >
                          <EyeOff size={15} /> Quitar publicación
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, publicadoWeb: true })}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white shrink-0"
                        style={{ background: "hsl(var(--primary))" }}
                      >
                        <Globe size={15} /> Publicar
                      </button>
                    )}
                  </div>

                  <div className="section-divider mb-4">DATOS PRINCIPALES</div>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">Patente/STK *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.patente || ""} onChange={e => setForm({ ...form, patente: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Tipo</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.tipo || ""} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                        {TIPOS_VEHICULO.map(o => <option key={o}>{o}</option>)}
                      </select></div>
                    <div><label className="block text-xs font-medium mb-1">Año</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.anio || ""} onChange={e => setForm({ ...form, anio: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Estado</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.estado || "DISPONIBLE"} onChange={e => setForm({ ...form, estado: e.target.value as VehiculoEstado })}>
                        {ESTADOS_VEHICULO.map(o => <option key={o} value={o}>{o.charAt(0) + o.slice(1).toLowerCase()}</option>)}
                      </select></div>
                  </div>
                  {/* Marca + Modelo en fila de 2 columnas: a Modelo se le da el doble
                      de ancho para que los nombres largos quepan completos. Si aun
                      asi no entra, la letra se achica (auto-fit medido, ver useEffect). */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">Marca *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.marca || ""} onChange={e => setForm({ ...form, marca: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Modelo *</label>
                      <input ref={modeloRef} className="w-full border rounded px-3 py-2 text-sm bg-background" title={form.modelo || ""}
                        style={{ borderColor: "hsl(var(--border))" }}
                        value={form.modelo || ""} onChange={e => setForm({ ...form, modelo: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">N° Motor</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.nMotor || ""} onChange={e => setForm({ ...form, nMotor: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Combustible</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.combustible || "Bencina"} onChange={e => setForm({ ...form, combustible: e.target.value })}>
                        {["Bencina","Diesel","Eléctrico","Híbrido","Gas"].map(o => <option key={o}>{o}</option>)}
                      </select></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">VIN/Chasis</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.vin || ""} onChange={e => setForm({ ...form, vin: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Color</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.color || ""} onChange={e => setForm({ ...form, color: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Kilometraje</label>
                      <NumberInput value={form.kilometraje ?? 0} onChange={(n) => setForm({ ...form, kilometraje: n })} placeholder="0 km" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">Precio Venta</label>
                      <NumberInput value={form.precioVenta ?? 0} onChange={(n) => setForm({ ...form, precioVenta: n })} currency placeholder="Ej: 10.500.000" /></div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        <span className="inline-flex items-center gap-1.5">
                          Precio Piso
                          {/* span (no button): el fieldset disabled del modo lectura
                              no lo bloquea, y el ojo debe funcionar siempre */}
                          <span
                            role="button"
                            onClick={() => setShowPisoModal(v => !v)}
                            className="p-0.5 rounded hover:bg-muted cursor-pointer inline-flex"
                            title={showPisoModal ? "Ocultar precio piso" : "Mostrar precio piso"}
                          >
                            {showPisoModal ? <EyeOff size={12} /> : <Eye size={12} />}
                          </span>
                        </span>
                      </label>
                      {showPisoModal ? (
                        esVendedor ? (
                          // Vendedor: ve el precio piso pero NO lo puede modificar.
                          <div
                            className="w-full border rounded px-3 py-2 text-sm bg-muted/40 select-none"
                            style={{ borderColor: "hsl(var(--border))" }}
                            title="Solo lectura: los vendedores no pueden modificar el precio piso"
                          >
                            {form.precioPiso ? `$${(form.precioPiso).toLocaleString("es-CL")}` : "—"}
                          </div>
                        ) : (
                          <NumberInput value={form.precioPiso ?? 0} onChange={(n) => setForm({ ...form, precioPiso: n })} currency placeholder="Ej: 9.000.000" />
                        )
                      ) : (
                        <div
                          className="w-full border rounded px-3 py-2 text-sm bg-background select-none"
                          style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))", letterSpacing: 2 }}
                        >
                          {form.precioPiso ? "••••••" : "—"}
                        </div>
                      )}
                    </div>
                    <div><label className="block text-xs font-medium mb-1">Sucursal</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.sucursal || ""} onChange={e => setForm({ ...form, sucursal: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">Ubicación</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.ubicacion || ""} onChange={e => setForm({ ...form, ubicacion: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">Transmisión</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.transmision || ""} onChange={e => setForm({ ...form, transmision: e.target.value })}>
                        <option value="">— Seleccionar —</option>
                        {TRANSMISIONES.map(o => <option key={o}>{o}</option>)}
                      </select></div>
                    <div><label className="block text-xs font-medium mb-1">Tracción</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.traccion || ""} onChange={e => setForm({ ...form, traccion: e.target.value })}>
                        <option value="">— Seleccionar —</option>
                        {TRACCIONES.map(o => <option key={o}>{o}</option>)}
                      </select></div>
                    <div><label className="block text-xs font-medium mb-1">Usuario Asignado</label>
                      <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/40" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.usuarioAsignado || ""} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">Procedencia</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={(form as any).procedencia || "Propio"} onChange={e => setForm({ ...form, procedencia: e.target.value, consignatarioId: e.target.value === "Propio" ? "" : (form as any).consignatarioId || "" } as any)}>
                        {PROCEDENCIAS.map(o => <option key={o}>{o}</option>)}
                      </select></div>
                  </div>
                  {(form as any).procedencia === "Consignado" && (
                    <div className="mb-4">
                      <label className="block text-xs font-medium mb-1">Cliente Consignatario *</label>
                      <SearchableSelect
                        value={(form as any).consignatarioId || ""}
                        onChange={(v) => setForm({ ...form, consignatarioId: v } as any)}
                        placeholder="Escribe nombre, RUT o teléfono del cliente..."
                        emptyMessage="Sin clientes que coincidan"
                        options={clientes.map(c => ({
                          value: c.id,
                          label: `${c.nombres} ${c.apellidos}`.trim() || "Sin nombre",
                          hint: [c.rut ? `RUT: ${c.rut}` : null, c.telefono].filter(Boolean).join(" · "),
                          search: `${c.nombres} ${c.apellidos} ${c.rut ?? ""} ${c.telefono ?? ""} ${c.email ?? ""}`,
                        }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {tab === "datos_adicionales" && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-medium mb-2">Comentarios / Notas del Vehículo</label>
                    <textarea rows={5} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="Ingrese comentarios adicionales sobre el vehículo..."
                      value={form.comentarios || ""} onChange={e => setForm({ ...form, comentarios: e.target.value })} />
                  </div>

                  {/* Aire acondicionado + equipamiento adicional (antes en la pestaña Equipamiento) */}
                  <div>
                    <button onClick={() => setForm({ ...form, aireAcondicionado: !form.aireAcondicionado })}
                      className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition-colors ${form.aireAcondicionado ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}>
                      {form.aireAcondicionado ? <CheckSquare size={15} style={{ color: "hsl(var(--primary))" }} /> : <Square size={15} style={{ color: "hsl(var(--muted-foreground))" }} />}
                      Aire Acondicionado
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>Equipamiento Adicional</label>
                    <div className="flex gap-2 mb-3">
                      <input className="flex-1 border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="Agregar equipamiento..." value={nuevoEquipamiento} onChange={e => setNuevoEquipamiento(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addEquipamiento()} />
                      <button onClick={addEquipamiento} className="px-4 py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Agregar</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(form.equipamientoExtra || []).map(item => (
                        <span key={item} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border"
                          style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))", background: "hsl(var(--primary)/0.08)" }}>
                          {item}
                          <button onClick={() => toggleEquipExtra(item)}><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* ── Documentos del auto (fotos o PDF: padron, permiso, etc) ── */}
                  <div className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--border))" }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                      <div>
                        <h3 className="text-sm font-bold flex items-center gap-1.5"><Paperclip size={14} /> Documentos del Vehículo</h3>
                        <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Adjunta fotos o documentos del auto (padrón, permiso de circulación, revisión técnica, etc). Se pueden ver y descargar.
                        </p>
                      </div>
                      {!isReadOnly && (
                        <button
                          onClick={() => docInputRef.current?.click()}
                          disabled={subiendoDocs}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                          style={{ background: "hsl(var(--primary))" }}
                        >
                          {subiendoDocs ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                          Adjuntar archivo
                        </button>
                      )}
                      <input
                        ref={docInputRef}
                        type="file"
                        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                        multiple
                        className="hidden"
                        onChange={handleDocsChange}
                      />
                    </div>

                    {(form.documentos || []).length === 0 && docsPendientes.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Sin documentos adjuntos.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {/* Documentos ya guardados */}
                        {(form.documentos || []).map((doc) => (
                          <div key={doc.url} className="flex items-center gap-3 p-2 rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
                            {doc.tipo === "imagen" ? (
                              <img src={doc.url} alt={doc.name} className="w-12 h-12 object-cover rounded cursor-pointer" onClick={() => abrirDoc(doc.url)} />
                            ) : (
                              <div className="w-12 h-12 rounded flex items-center justify-center bg-muted shrink-0"><FileText size={20} style={{ color: "hsl(var(--primary))" }} /></div>
                            )}
                            <span className="flex-1 text-sm truncate" title={doc.name}>{doc.name}</span>
                            <button onClick={() => abrirDoc(doc.url)} className="p-2 rounded hover:bg-muted" title="Ver / abrir"><Eye size={15} /></button>
                            <a href={doc.url} download={doc.name} target="_blank" rel="noreferrer" className="p-2 rounded hover:bg-muted" title="Descargar"><Download size={15} /></a>
                            {!isReadOnly && (
                              <button onClick={() => removeDocGuardado(doc.url)} className="p-2 rounded hover:bg-muted text-red-600" title="Eliminar"><Trash2 size={15} /></button>
                            )}
                          </div>
                        ))}
                        {/* Documentos pendientes de guardar */}
                        {docsPendientes.map((d, i) => (
                          <div key={`pend-${i}`} className="flex items-center gap-3 p-2 rounded-lg border border-dashed" style={{ borderColor: "hsl(var(--primary))" }}>
                            <div className="w-12 h-12 rounded flex items-center justify-center bg-muted shrink-0">
                              {d.tipo === "imagen" ? <Images size={20} style={{ color: "hsl(var(--primary))" }} /> : <FileText size={20} style={{ color: "hsl(var(--primary))" }} />}
                            </div>
                            <span className="flex-1 text-sm truncate" title={d.name}>{d.name}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--primary)/0.12)", color: "hsl(var(--primary))" }}>Se guarda al guardar</span>
                            <button onClick={() => removeDocPendiente(i)} className="p-2 rounded hover:bg-muted text-red-600" title="Quitar"><X size={15} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              </fieldset>
              {/* ⚠️ Galeria FUERA del fieldset: la descarga debe funcionar incluso en modo lectura.
                  Los botones de modificacion (Subir, IA, X, flechas, drag) se deshabilitan
                  manualmente con isReadOnly. */}

              {tab === "galeria" && (
                <div>
                  {/* Publicar en la web (Auto Path) — visible también acá para publicar
                      apenas terminás de trabajar las fotos. */}
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border p-3"
                    style={{ borderColor: form.publicadoWeb ? "rgb(34 197 94)" : "hsl(var(--border))", background: form.publicadoWeb ? "rgb(34 197 94 / 0.07)" : "transparent" }}>
                    <div className="flex items-center gap-2.5">
                      <Globe size={20} style={{ color: form.publicadoWeb ? "rgb(22 163 74)" : "hsl(var(--muted-foreground))" }} />
                      <div>
                        <div className="text-sm font-semibold">Publicar en la página web</div>
                        <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {form.publicadoWeb ? "Visible en la web pública de Egaña (acordate de Guardar)" : "No aparece en la web. Apretá Publicar y luego Guardar."}
                        </div>
                      </div>
                    </div>
                    {form.publicadoWeb ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "rgb(34 197 94)" }}>
                          <CheckSquare size={15} /> Publicado
                        </span>
                        <button
                          type="button"
                          onClick={() => { if (isReadOnly) setIsReadOnly(false); setForm({ ...form, publicadoWeb: false }); }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border"
                          style={{ borderColor: "rgb(220 38 38)", color: "rgb(220 38 38)" }}
                        >
                          <EyeOff size={15} /> Quitar publicación
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { if (isReadOnly) setIsReadOnly(false); setForm({ ...form, publicadoWeb: true }); }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white shrink-0"
                        style={{ background: "hsl(var(--primary))" }}
                      >
                        <Globe size={15} /> Publicar
                      </button>
                    )}
                  </div>

                  {/* Header + acciones */}
                  <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
                    <div className="min-w-[200px]">
                      <h3 className="text-sm font-bold">📷 Registro Fotográfico</h3>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Usá "Subir múltiples" para cargar varias fotos a la vez, o hacé clic en un cuadrante para una sola.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-3 py-1 rounded-full bg-muted flex items-center gap-1.5">
                        {fotosLoading && <Loader2 size={11} className="animate-spin" />}
                        {fotosLoading ? "Cargando fotos…" : `${fotosCount} / ${FOTO_SLOTS.length} fotos`}
                      </span>
                      {/* Subir multiples: si el vehiculo esta en modo lectura, lo pasa
                          a edicion automaticamente y abre el selector de varias fotos. */}
                      <button
                        onClick={() => {
                          if (isReadOnly) setIsReadOnly(false);
                          multiUploadRef.current?.click();
                        }}
                        disabled={batchUploading || fotosLoading || fotosCount >= FOTO_SLOTS.length}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: "hsl(var(--primary))" }}
                        title={fotosCount >= FOTO_SLOTS.length ? "Todos los slots ocupados" : "Selecciona varias fotos a la vez"}
                      >
                        {batchUploading ? <Loader2 size={13} className="animate-spin" /> : <Images size={13} />}
                        Subir múltiples
                      </button>
                      <input
                        ref={multiUploadRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleMultiFotoChange}
                      />
                      {/* Boton principal: ZIP en TODOS los dispositivos. Es la unica
                          forma 100% confiable de bajar TODAS las fotos de una vez
                          (en celular el share nativo o la descarga suelta a veces solo
                          guardaba la primera). El share queda como opcion secundaria. */}
                      <div className="relative flex">
                        <button
                          onClick={downloadAllAsZip}
                          disabled={zipDownloading || fotosCount === 0}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg border text-xs font-semibold hover:bg-muted disabled:opacity-50"
                          style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--primary))" }}
                          title="Descarga 1 archivo .zip con TODAS las fotos del vehículo."
                        >
                          {zipDownloading
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Archive size={13} />}
                          {zipDownloading ? "Empacando…" : "Descargar todas"}
                        </button>
                        <button
                          onClick={() => setShowDownloadMenu(v => !v)}
                          disabled={zipDownloading || fotosCount === 0}
                          className="flex items-center px-2 py-1.5 rounded-r-lg border border-l-0 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                          style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--primary))" }}
                          title="Más opciones de descarga"
                        >
                          <ChevronDown size={12} />
                        </button>
                        {showDownloadMenu && !zipDownloading && (
                          <div
                            className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
                            onClick={() => setShowDownloadMenu(false)}
                          >
                            <div
                              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl border max-h-[85vh] overflow-y-auto"
                              style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-wider border-b sticky top-0" style={{ color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border))", background: "hsl(var(--background))" }}>
                                Opciones de descarga
                                <button onClick={() => setShowDownloadMenu(false)} aria-label="Cerrar" style={{ color: "hsl(var(--muted-foreground))" }}>
                                  <X size={18} />
                                </button>
                              </div>
                              {/* Compartir con app (WhatsApp, Fotos, Marketplace…): util en celular */}
                              {SUPPORTS_SHARE_FILES && (
                                <>
                                  <button
                                    onClick={downloadAllViaShare}
                                    className="w-full text-left px-3 py-2.5 hover:bg-muted flex items-start gap-2"
                                  >
                                    <Share2 size={15} className="mt-0.5 flex-shrink-0" />
                                    <div>
                                      <div className="text-xs font-semibold">Compartir con app</div>
                                      <div className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                                        Abre el menú compartir del sistema (WhatsApp, Mail, Fotos, etc.).
                                      </div>
                                    </div>
                                  </button>
                                  <div className="border-t" style={{ borderColor: "hsl(var(--border))" }} />
                                </>
                              )}
                              {SUPPORTS_FS_ACCESS && (
                                <>
                                  <button
                                    onClick={downloadAllToFolder}
                                    className="w-full text-left px-3 py-2.5 hover:bg-muted flex items-start gap-2"
                                  >
                                    <FolderOpen size={15} className="mt-0.5 flex-shrink-0" />
                                    <div>
                                      <div className="text-xs font-semibold">Elegir carpeta destino</div>
                                      <div className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                                        Tú eliges dónde guardar las fotos sueltas. (Chrome/Edge desktop)
                                      </div>
                                    </div>
                                  </button>
                                  <div className="border-t" style={{ borderColor: "hsl(var(--border))" }} />
                                </>
                              )}
                              <button
                                onClick={downloadAllIndividual}
                                className="w-full text-left px-3 py-2.5 hover:bg-muted flex items-start gap-2"
                              >
                                <Download size={15} className="mt-0.5 flex-shrink-0" />
                                <div>
                                  <div className="text-xs font-semibold">Descargar archivos sueltos</div>
                                  <div className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                                    {fotosCount} archivos .jpg directo a Descargas. El navegador puede pedir "permitir descargas múltiples" — acéptalo.
                                  </div>
                                </div>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── AI Background panel (oculto por defecto) ──────────── */}
                  <div className="mb-4 rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--primary)/0.25)" }}>
                    {/* Header — clickeable para mostrar/ocultar el editor */}
                    <button
                      type="button"
                      onClick={() => setShowAIEditor(v => !v)}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left"
                      style={{ background: "hsl(var(--primary)/0.06)" }}
                    >
                      <Sparkles size={15} style={{ color: "hsl(var(--primary))" }} />
                      <span className="text-sm font-bold" style={{ color: "hsl(var(--primary))" }}>Fondo blanco automático</span>
                      <span className="text-[10px]" style={{ color: removeBgKeySaved ? "rgb(22 163 74)" : "hsl(var(--muted-foreground))" }}>
                        {removeBgKeySaved ? "✓ remove.bg conectado" : "(falta API key)"}
                      </span>
                      <ChevronDown size={15} className="ml-auto" style={{ color: "hsl(var(--primary))", transform: showAIEditor ? "rotate(180deg)" : "" }} />
                    </button>

                    {/* Body — solo si esta expandido */}
                    {showAIEditor && (
                    <div className="px-4 pb-4 pt-3">
                      <p className="text-xs mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Pasa el cursor sobre una foto y haz clic en <strong>✨ IA</strong>. Se <strong>recorta el auto exacto</strong> (mismo color, mismo ángulo y mismo tamaño) y se pega sobre un <strong>fondo blanco</strong> con una sombra suave.
                      </p>

                      {/* API key de remove.bg */}
                      <div className="mb-3 rounded-lg border p-3" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.4)" }}>
                        <label className="block text-xs font-semibold mb-1" style={{ color: "hsl(var(--foreground))" }}>
                          API key de remove.bg
                        </label>
                        <p className="text-[11px] mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Crea una cuenta gratis en{" "}
                          <a href="https://www.remove.bg/users/sign_up" target="_blank" rel="noopener noreferrer"
                            className="font-semibold underline" style={{ color: "hsl(var(--primary))" }}>remove.bg</a>{" "}
                          → entra a <strong>API Keys</strong> → copia tu clave y pégala acá. (Gratis las primeras 50 fotos al mes.)
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={removeBgKey}
                            onChange={e => { setRemoveBgKeyInput(e.target.value); setRemoveBgKeySaved(false); }}
                            placeholder="Pega aquí tu API key de remove.bg"
                            className="flex-1 border rounded px-3 py-2 text-sm bg-background font-mono"
                            style={{ borderColor: "hsl(var(--border))" }}
                          />
                          <button
                            type="button"
                            onClick={() => { setRemoveBgKey(removeBgKey); setRemoveBgKeySaved(hasRemoveBgKey()); setAiError(null); }}
                            disabled={!removeBgKey.trim()}
                            className="px-4 py-2 rounded-lg text-sm font-semibold text-white shrink-0 disabled:opacity-50"
                            style={{ background: "hsl(var(--primary))" }}
                          >
                            Guardar
                          </button>
                        </div>
                        {removeBgKeySaved && (
                          <p className="text-[11px] mt-1.5 font-semibold flex items-center gap-1" style={{ color: "rgb(22 163 74)" }}>
                            <CheckSquare size={12} /> Clave guardada. Ya puedes usar el botón ✨ en las fotos.
                          </p>
                        )}
                      </div>

                      {/* Error message */}
                      {aiError && (
                        <div className="mt-3 flex items-start gap-2 px-3 py-3 rounded-lg text-xs font-semibold"
                          style={{ background: "#fef2f2", color: "#b91c1c", border: "1.5px solid #fca5a5" }}>
                          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                          <span>{aiError}</span>
                        </div>
                      )}
                    </div>
                    )}
                  </div>

                  {/* Aviso/Error de IA — visible siempre (no escondido en el panel). */}
                  {aiError && (
                    <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold"
                      style={{ background: "#fef2f2", color: "#b91c1c", border: "1.5px solid #fca5a5" }}>
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <span>{aiError}</span>
                      <button onClick={() => setAiError(null)} className="ml-auto shrink-0" style={{ color: "#b91c1c" }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* ── Photo grid ──────────────────────────────────────── */}
                  <p className="text-[11px] mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                    💡 Las fotos se suben por orden alfabético del nombre del archivo. Usa las flechas ◀ ▶ en cada foto, o arrástralas, para reordenarlas.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {fotoSlots.map((slot, i) => (
                      <div
                        key={i}
                        className="relative group"
                        draggable={!isReadOnly && !!slot.preview && processingAI !== i}
                        onDragStart={(e) => {
                          if (isReadOnly || !slot.preview) return;
                          setDragSrcIdx(i);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => { if (!isReadOnly) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                        onDrop={(e) => {
                          if (isReadOnly) return;
                          e.preventDefault();
                          if (dragSrcIdx !== null && dragSrcIdx !== i) swapSlots(dragSrcIdx, i);
                          setDragSrcIdx(null);
                        }}
                        onDragEnd={() => setDragSrcIdx(null)}
                      >
                        <div
                          onClick={() => {
                            if (processingAI === i) return;
                            // Con foto: abrir visor grande. Vacio en edicion: subir.
                            if (slot.preview) setLightboxIdx(i);
                            else if (!isReadOnly) fotoRefs.current[i]?.click();
                          }}
                          className="border-2 border-dashed rounded-xl aspect-square flex flex-col items-center justify-center transition-colors relative overflow-hidden"
                          style={{
                            borderColor: dragSrcIdx === i ? "hsl(var(--primary))" :
                                          slot.preview ? "hsl(var(--primary))" : "hsl(var(--border))",
                            cursor: processingAI === i ? "default" : "pointer",
                            opacity: dragSrcIdx === i ? 0.4 : 1,
                          }}>

                          {slot.preview ? (
                            <>
                              <img src={slot.preview} alt={slot.label} className="w-full h-full object-cover absolute inset-0 rounded-xl" />

                              {/* ── Processing overlay ─────────────── */}
                              {processingAI === i && (
                                <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-3"
                                  style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(2px)" }}>
                                  {/* Animated ring */}
                                  <div className="relative w-12 h-12">
                                    <div className="absolute inset-0 rounded-full border-4 border-white/20" />
                                    <div className="absolute inset-0 rounded-full border-4 border-t-white animate-spin" />
                                    <Sparkles size={18} className="absolute inset-0 m-auto text-white" />
                                  </div>
                                  <div className="text-center px-3">
                                    <p className="text-white text-xs font-bold">Procesando con IA</p>
                                    <p className="text-white/70 text-xs mt-0.5">Cambiando el fondo…</p>
                                  </div>
                                </div>
                              )}

                              {/* Label bar */}
                              <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5" style={{ background: "rgba(0,0,0,0.55)" }}>
                                <span className="text-white text-xs font-semibold">{slot.label}</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-1 hover:opacity-70 transition-opacity">
                              <Upload size={20} style={{ color: "hsl(var(--muted-foreground))" }} />
                              <span className="text-xs font-semibold text-center px-2">{slot.label}</span>
                              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Clic para subir</span>
                            </div>
                          )}
                        </div>

                        {/* Botones de acción — SIEMPRE visibles (también en celular) */}
                        {slot.preview && processingAI !== i && (
                          <div className="absolute top-2 right-2 flex gap-1 opacity-95 transition-opacity z-10">
                            {/* Recorte (remove.bg): solo cambia el FONDO a blanco, MISMO ángulo. */}
                            <button
                              onClick={e => { e.stopPropagation(); if (isReadOnly) setIsReadOnly(false); applyAIBackground(i); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white text-xs font-bold shadow-lg"
                              style={{ background: "hsl(var(--primary))" }}
                              title="FONDO: deja el fondo blanco conservando el color exacto. NO cambia el ángulo del auto.">
                              <Sparkles size={11} /> Fondo
                            </button>
                            {/* Estudio IA (Gemini): reorienta al ángulo estándar + fondo estudio. */}
                            <button
                              onClick={e => { e.stopPropagation(); if (isReadOnly) setIsReadOnly(false); runStudioAI(i); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white text-xs font-bold shadow-lg"
                              style={{ background: "#7c3aed" }}
                              title="ESTUDIO IA (EXPERIMENTAL): reorienta + fondo de estudio, pero puede CAMBIAR EL COLOR. Para color fiel usá 'Fondo'.">
                              <Star size={11} /> Estudio <span className="opacity-80 font-normal">beta</span>
                            </button>
                            {/* Download — SIEMPRE activo (es solo lectura) */}
                            {/* Agrandar — ver la foto grande (exhibir en pantalla) */}
                            <button
                              onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                              className="p-1.5 rounded-lg shadow-lg"
                              style={{ background: "rgba(0,0,0,0.7)" }}
                              title="Ver grande">
                              <Maximize2 size={11} className="text-white" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); downloadFoto(slot.preview!, slot.label); }}
                              className="p-1.5 rounded-lg shadow-lg"
                              style={{ background: "rgba(0,0,0,0.7)" }}
                              title="Descargar foto">
                              <Download size={11} className="text-white" />
                            </button>
                            {/* X eliminar — siempre disponible; entra a edicion solo
                                para que aparezca "Guardar" y el cambio persista. */}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (confirm("¿Quitar esta foto? Acordate de apretar Guardar para que el cambio quede.")) {
                                  if (isReadOnly) setIsReadOnly(false);
                                  removeFoto(i);
                                }
                              }}
                              className="p-1.5 rounded-lg shadow-lg"
                              style={{ background: "#dc2626" }}
                              title="Quitar foto">
                              <X size={11} className="text-white" />
                            </button>
                          </div>
                        )}

                        {/* Insignia PORTADA en la primera foto. Va abajo-izquierda y
                            con pointer-events-none para NO tapar ni bloquear los
                            botones de acción (IA/Estudio) de arriba. */}
                        {slot.preview && i === 0 && (
                          <span className="absolute bottom-9 left-2 z-10 pointer-events-none flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow"
                            style={{ background: "rgb(34 197 94)" }}>
                            <Star size={10} className="fill-white" /> PORTADA
                          </span>
                        )}

                        {/* Botones reordenar — SIEMPRE visibles. Si está en solo
                            lectura, al usarlos entra a edición para poder Guardar. */}
                        {slot.preview && processingAI !== i && (
                          <>
                            {i > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); if (isReadOnly) setIsReadOnly(false); swapSlots(i, i - 1); }}
                                className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full shadow-lg opacity-80 hover:opacity-100 active:opacity-100 z-10"
                                style={{ background: "rgba(0,0,0,0.65)" }}
                                title="Mover a la posición anterior">
                                <ArrowLeft size={12} className="text-white" />
                              </button>
                            )}
                            {i < fotoSlots.length - 1 && (
                              <button
                                onClick={e => { e.stopPropagation(); if (isReadOnly) setIsReadOnly(false); swapSlots(i, i + 1); }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full shadow-lg opacity-80 hover:opacity-100 active:opacity-100 z-10"
                                style={{ background: "rgba(0,0,0,0.65)" }}
                                title="Mover a la posición siguiente">
                                <ArrowRight size={12} className="text-white" />
                              </button>
                            )}
                            {/* Hacer principal (portada) en un clic */}
                            {i > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); if (isReadOnly) setIsReadOnly(false); moveToFirst(i); }}
                                className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-full shadow-lg text-[10px] font-bold text-white opacity-90 hover:opacity-100 active:opacity-100 z-10"
                                style={{ background: "hsl(var(--primary))" }}
                                title="Poner esta foto de primera (portada)">
                                <Star size={10} /> Hacer principal
                              </button>
                            )}
                          </>
                        )}

                        <input
                          ref={el => { fotoRefs.current[i] = el; }}
                          type="file" accept="image/*" className="hidden"
                          onChange={e => handleFotoChange(i, e)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "publicar_yapo" && (
                <div className="space-y-5">
                  <div className="rounded-lg border p-4" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
                    <div className="flex items-start gap-3">
                      <Send size={18} style={{ color: "hsl(var(--primary))", flexShrink: 0, marginTop: 2 }} />
                      <div className="flex-1">
                        <h3 className="text-sm font-bold mb-1">📢 Publicar en Yapo.cl</h3>
                        <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Se enviarán <b>{fotosCargadas.length} fotos</b> y los datos del vehículo a tu cuenta Yapo Pro
                          ({" "}<i>bastian-rey-aguirre</i> ). La plantilla de texto se autocompleta con la info del auto —
                          podés editarla antes de publicar.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Feed XML para la Importacion automatica de Yapo */}
                  <div className="rounded-lg border p-4" style={{ borderColor: "hsl(var(--primary)/0.4)", background: "hsl(var(--primary)/0.05)" }}>
                    <h4 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--primary))" }}>
                      ⚡ Conexión con Yapo (configurar una sola vez)
                    </h4>
                    <p className="text-xs mb-2 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Solo los vehículos que vos publiques con el botón <b>"Publicar en Yapo"</b> entran al feed —
                      nada se publica automático. Para conectar tu cuenta (una sola vez): en Yapo andá a{" "}
                      <b>Mis anuncios → Importación de XML/XLS</b> y pegá esta URL:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[10px] px-2 py-1.5 rounded border bg-background break-all" style={{ borderColor: "hsl(var(--border))" }}>
                        https://nxeepkpfvhwobhgpltml.supabase.co/functions/v1/yapo-feed?key=rj41deS3hsrbFtZDR5cDKzlKtuWMgqlr
                      </code>
                      <button
                        onClick={() => { navigator.clipboard.writeText("https://nxeepkpfvhwobhgpltml.supabase.co/functions/v1/yapo-feed?key=rj41deS3hsrbFtZDR5cDKzlKtuWMgqlr"); alert("URL del feed copiada"); }}
                        className="flex items-center gap-1 px-2 py-1.5 rounded border text-[10px] font-semibold hover:bg-muted flex-shrink-0"
                        style={{ borderColor: "hsl(var(--border))" }}
                      >
                        <Copy size={11} /> Copiar
                      </button>
                    </div>
                  </div>

                  {/* Resumen de datos que se enviaran */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded border p-2" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="text-[10px] uppercase font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Marca / Modelo</div>
                      <div className="font-semibold">{(form.marca || "—") + " " + (form.modelo || "")}</div>
                    </div>
                    <div className="rounded border p-2" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="text-[10px] uppercase font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Año</div>
                      <div className="font-semibold">{form.anio || "—"}</div>
                    </div>
                    <div className="rounded border p-2" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="text-[10px] uppercase font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Precio</div>
                      <div className="font-semibold">{fmt(form.precioVenta || 0)}</div>
                    </div>
                    <div className="rounded border p-2" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="text-[10px] uppercase font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Kilometraje</div>
                      <div className="font-semibold">{Number(form.kilometraje || 0).toLocaleString("es-CL")} km</div>
                    </div>
                    <div className="rounded border p-2" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="text-[10px] uppercase font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Color</div>
                      <div className="font-semibold">{form.color || "—"}</div>
                    </div>
                    <div className="rounded border p-2" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="text-[10px] uppercase font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Fotos</div>
                      <div className="font-semibold">{fotosCargadas.length} / {FOTO_SLOTS.length}</div>
                    </div>
                  </div>

                  {/* Titulo del aviso */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Título del aviso
                    </label>
                    <input
                      type="text"
                      value={yapoTitulo}
                      onChange={e => setYapoTitulo(e.target.value)}
                      placeholder={yapoTituloFinal || "Marca Modelo Año"}
                      className="w-full border rounded px-3 py-2 text-sm bg-background"
                      style={{ borderColor: "hsl(var(--border))" }}
                      maxLength={80}
                    />
                    <p className="text-[10px] mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Dejá vacío para usar: <b>{yapoTituloFinal || "Marca Modelo Año"}</b>
                    </p>
                  </div>

                  {/* Plantilla editable */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Plantilla del aviso (editable)
                      </label>
                      <button
                        onClick={() => setYapoTemplate(YAPO_BODY_TEMPLATE)}
                        className="text-[10px] underline"
                        style={{ color: "hsl(var(--primary))" }}
                      >
                        Restaurar plantilla
                      </button>
                    </div>
                    <textarea
                      value={yapoTemplate}
                      onChange={e => setYapoTemplate(e.target.value)}
                      rows={10}
                      className="w-full border rounded px-3 py-2 text-xs bg-background font-mono"
                      style={{ borderColor: "hsl(var(--border))" }}
                    />
                    <p className="text-[10px] mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Variables disponibles: <code>{"{marca}"}</code>, <code>{"{modelo}"}</code>, <code>{"{anio}"}</code>,{" "}
                      <code>{"{kilometraje}"}</code>, <code>{"{color}"}</code>, <code>{"{combustible}"}</code>,{" "}
                      <code>{"{transmision}"}</code>, <code>{"{traccion}"}</code>, <code>{"{precio}"}</code>,{" "}
                      <code>{"{equipamiento}"}</code>
                    </p>
                  </div>

                  {/* Preview del texto final */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Vista previa del aviso
                      </label>
                      <button
                        onClick={() => { navigator.clipboard.writeText(yapoCuerpoRenderizado); alert("Texto copiado"); }}
                        className="flex items-center gap-1 text-[10px] underline"
                        style={{ color: "hsl(var(--primary))" }}
                      >
                        <Copy size={11} /> Copiar
                      </button>
                    </div>
                    <pre
                      className="rounded border p-3 text-xs whitespace-pre-wrap font-sans"
                      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.4)", maxHeight: 280, overflow: "auto" }}
                    >
                      {yapoCuerpoRenderizado}
                    </pre>
                  </div>

                  {/* Preview fotos */}
                  {fotosCargadas.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Fotos a publicar ({fotosCargadas.length})
                      </label>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {fotosCargadas.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={`foto-${i + 1}`}
                            className="h-20 w-28 object-cover rounded border flex-shrink-0"
                            style={{ borderColor: "hsl(var(--border))" }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resultado */}
                  {yapoResult && (
                    <div
                      className="rounded border p-3 text-xs"
                      style={{
                        borderColor: yapoResult.ok ? "rgb(34 197 94)" : "rgb(239 68 68)",
                        background: yapoResult.ok ? "rgb(34 197 94 / 0.08)" : "rgb(239 68 68 / 0.08)",
                      }}
                    >
                      <div className="font-semibold mb-1">{yapoResult.ok ? "✅ OK" : "❌ Error"}</div>
                      <pre className="whitespace-pre-wrap font-mono text-[10px]" style={{ maxHeight: 200, overflow: "auto" }}>
                        {yapoResult.msg}
                      </pre>
                    </div>
                  )}

                  {/* Botones de accion */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
                    <div className="flex items-center gap-2">
                      {form.publicadoYapo && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                          style={{ background: "rgb(34 197 94 / 0.12)", color: "rgb(22 163 74)" }}>
                          ✅ Publicado en Yapo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href="https://www.yapo.cl/perfil/bastian-rey-aguirre"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded border text-xs font-semibold hover:bg-muted"
                        style={{ borderColor: "hsl(var(--border))" }}
                      >
                        <ExternalLink size={13} /> Ver perfil Yapo
                      </a>
                      {form.publicadoYapo ? (
                        <button
                          onClick={() => togglePublicarYapo(false)}
                          disabled={yapoPublishing}
                          className="flex items-center gap-1.5 px-4 py-2 rounded border text-xs font-semibold hover:bg-muted disabled:opacity-50"
                          style={{ borderColor: "rgb(239 68 68)", color: "rgb(239 68 68)" }}
                        >
                          {yapoPublishing ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                          {yapoPublishing ? "Quitando…" : "Quitar de Yapo"}
                        </button>
                      ) : (
                        <button
                          onClick={() => togglePublicarYapo(true)}
                          disabled={yapoPublishing || !form.marca || !form.modelo || !form.precioVenta || fotosCargadas.length === 0}
                          className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold text-white disabled:opacity-50"
                          style={{ background: "hsl(var(--primary))" }}
                        >
                          {yapoPublishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          {yapoPublishing ? "Publicando…" : "Publicar en Yapo"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-sm border bg-card hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
                {isReadOnly ? "Cerrar" : "Cancelar"}
              </button>
              {!isReadOnly && (
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-60" style={{ background: "hsl(var(--primary))" }}>
                  {subiendoFotos ? "Subiendo fotos..." : saving ? "Guardando..." : "Guardar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
