import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, Search, X, Upload, CheckSquare, Square, Download, Table, Trash2, Edit2, Sparkles, AlertTriangle, Images, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import { useApp, Vehiculo } from "@/context/AppContext";
import * as XLSX from "xlsx";
import { applyVehicleBackground, hasAiConfig } from "@/lib/aiImageService";
import { SearchableSelect } from "@/components/SearchableSelect";
import { NumberInput } from "@/components/NumberInput";

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

const DEFAULT_BG_PROMPT = `CRITICAL RULES — DO NOT VIOLATE:
1. PRESERVE the vehicle EXACTLY as it appears: same model, exact color, exact body shape, exact wheels/rims, exact license plate, exact angle and proportions. DO NOT change, recolor, restyle, or "improve" the car in any way.
2. KEEP the same camera angle, perspective and framing of the original photo.
3. KEEP the lighting direction on the vehicle consistent with the original.

TASK:
Replace ONLY the background with a clean professional automotive studio setting:
- Floor: light grey polished concrete with subtle, natural reflection of the car underneath
- Wall: clean white-to-light-grey seamless backdrop, no patterns, no objects
- Soft, even, diffused studio lighting (key + fill), no harsh shadows on the vehicle
- Photorealistic, high-resolution dealership quality photo
- Car should occupy ~70% of the frame, centered, with visible floor space below and to both sides

OUTPUT FORMAT: high-quality photo of the SAME vehicle on the new background. No text overlays, no logos, no watermarks, no people, no other cars.`;

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
  equipamientoExtra: [], fotos: [],
  procedencia: "Propio", consignatarioId: "",
});

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

// --- Delete password modal ---
function DeleteModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { usuarioActual } = useApp();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const isMaster = usuarioActual?.rol === "master";

  useEffect(() => {
    if (isMaster) onConfirm();
  }, [isMaster, onConfirm]);

  if (isMaster) return null;

  const submit = () => {
    if (pass === MASTER_PASS) { onConfirm(); }
    else { setErr(true); setPass(""); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="bg-card rounded-xl shadow-2xl p-7 w-80 animate-fade-in" style={{ border: "1px solid hsl(var(--border))" }}>
        <h3 className="font-bold text-sm mb-1" style={{ color: "hsl(var(--destructive))" }}>Eliminar Vehículo</h3>
        <p className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Ingresa la clave de Administrador Master para confirmar.</p>
        <input type="password" className={`w-full border rounded px-3 py-2 text-sm bg-background mb-2 ${err ? "border-destructive" : ""}`}
          style={{ borderColor: err ? "hsl(var(--destructive))" : "hsl(var(--border))" }}
          placeholder="Clave master" value={pass} onChange={e => { setPass(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && submit()} autoFocus />
        {err && <p className="text-xs mb-2" style={{ color: "hsl(var(--destructive))" }}>Clave incorrecta</p>}
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onCancel} className="px-3 py-1.5 rounded border text-sm hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
          <button onClick={submit} className="px-3 py-1.5 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--destructive))" }}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

export default function Vehiculos() {
  const { vehiculos, vehiculosLoading, addVehiculo, updateVehiculo, deleteVehiculo, clientes, usuarioActual } = useApp();
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("DISPONIBLE");
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState("general");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Vehiculo & { procedencia: string; consignatarioId: string }>>(emptyVehiculo(usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : ""));
  const [fotoSlots, setFotoSlots] = useState<FotoSlot[]>(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
  const [nuevoEquipamiento, setNuevoEquipamiento] = useState("");
  const fotoRefs = useRef<(HTMLInputElement | null)[]>([]);
  const multiUploadRef = useRef<HTMLInputElement>(null);
  const excelImportRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  // Por defecto cuando se abre un vehiculo a editar, esta en modo lectura.
  // El usuario debe pulsar "Editar" para habilitar los inputs (previene clicks accidentales).
  const [isReadOnly, setIsReadOnly] = useState(true);

  // AI bg state
  const [bgPrompt, setBgPrompt] = useState(DEFAULT_BG_PROMPT);
  const [processingAI, setProcessingAI] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

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
        aireAcondicionado: false, equipamientoExtra: [], fotos: [],
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

  const openCreate = () => {
    const ua = usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : "";
    setForm(emptyVehiculo(ua));
    setFotoSlots(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
    setEditId(null); setTab("general"); setShowModal(true);
    setIsReadOnly(false); // crear siempre editable
  };

  const openEdit = (v: Vehiculo) => {
    setForm({ ...v });
    setFotoSlots(FOTO_SLOTS.map((label, i) => ({ label, file: null, preview: v.fotos[i] || null })));
    setEditId(v.id); setTab("general"); setShowModal(true);
    setIsReadOnly(true); // editar arranca en modo lectura
  };

  const handleSave = async () => {
    if (!form.patente?.trim() || !form.marca?.trim()) return alert("Patente y Marca son requeridos.");
    const fotos = fotoSlots.map(s => s.preview || "");
    const nextFolio = String(vehiculos.length + 1).padStart(5, "0");
    setSaving(true);
    if (editId) {
      await updateVehiculo({ ...form, fotos, id: editId } as Vehiculo);
    } else {
      const newV: Vehiculo = { id: crypto.randomUUID(), folio: nextFolio, ...(form as Vehiculo), fotos };
      await addVehiculo(newV);
    }
    setSaving(false);
    setShowModal(false);
  };

  const confirmDelete = (id: string) => setDeleteId(id);

  const doDelete = async () => {
    if (deleteId) await deleteVehiculo(deleteId);
    setDeleteId(null);
    setShowModal(false);
  };

  // ── AI background replacement ────────────────────────────────────
  const runAI = useCallback(async (dataUrl: string, slotIndex: number, prompt: string) => {
    console.log("[Vehiculos] runAI llamado, slot:", slotIndex, "hasConfig:", hasAiConfig());
    if (!hasAiConfig()) {
      setAiError("❌ No hay API Key guardada. Ve a Configuración → ingresa tu clave de Gemini o OpenAI → presiona 'Guardar Configuración'.");
      setProcessingAI(null);
      return;
    }
    setAiError(null);
    setProcessingAI(slotIndex);
    try {
      const result = await applyVehicleBackground(dataUrl, prompt);
      console.log("[Vehiculos] resultado IA ok:", result.ok, "| dataUrl length:", result.dataUrl?.length ?? 0, "| error:", result.error);
      if (result.ok && result.dataUrl) {
        setFotoSlots(prev => prev.map((s, idx) => idx === slotIndex ? { ...s, preview: result.dataUrl! } : s));
        setAiError(null);
      } else {
        setAiError(`⚠️ ${result.error ?? "La IA no pudo procesar la imagen."}`);
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
    if (slot?.preview) runAI(slot.preview, slotIndex, bgPrompt);
  };

  const handleFotoChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setFotoSlots(prev => prev.map((s, idx) => idx === i ? { ...s, file, preview: dataUrl } : s));
      // Auto-apply IA only on first slot
      if (i === 0 && dataUrl) {
        runAI(dataUrl, 0, bgPrompt);
      }
    };
    reader.readAsDataURL(file);
  };


  const downloadFoto = (dataUrl: string, label: string) => {
    const a = document.createElement("a"); a.href = dataUrl; a.download = label + ".jpg"; a.click();
  };

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

      // Capturar si el slot 0 estaba vacio antes — si si, auto-IA a la primera
      const slot0EraVacio = !fotoSlots[0]?.preview;

      // Distribuir resultados en los slots vacios
      setFotoSlots((prev) =>
        prev.map((s, i) => {
          const matchPos = emptyIndices.indexOf(i);
          if (matchPos < 0 || matchPos >= results.length) return s;
          return { ...s, file: results[matchPos].file, preview: results[matchPos].dataUrl };
        }),
      );

      // Auto-IA a la primera foto si el slot 0 estaba vacio
      if (slot0EraVacio && emptyIndices[0] === 0 && results[0]) {
        runAI(results[0].dataUrl, 0, bgPrompt);
      }

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

  const TABS = ["general", "equipamiento", "datos_adicionales", "galeria"];
  const TAB_LABELS: Record<string, string> = { general: "General", equipamiento: "Equipamiento", datos_adicionales: "Datos Adicionales", galeria: "Galería" };

  /**
   * Descarga TODAS las fotos cargadas como archivos individuales.
   *
   * Trucos para que el navegador no bloquee descargas multiples:
   *  1. Convertir cada dataUrl a Blob + Object URL (mas confiable que
   *     dataUrls largas en bucle, que Chrome puede rechazar).
   *  2. Delay generoso (600ms) entre cada descarga — Chrome necesita tiempo
   *     para procesar cada una antes de aceptar la siguiente.
   *  3. La primera vez Chrome/Edge mostraran un banner pidiendo permiso
   *     para "Descargar varios archivos automaticamente" — el usuario debe
   *     pulsar "Permitir" o no descargara nada despues de la primera.
   */
  const downloadAllFotos = async () => {
    const available = fotoSlots.filter((s) => s.preview);
    if (available.length === 0) {
      alert("No hay fotos cargadas.");
      return;
    }
    setZipDownloading(true);
    const urlsToCleanup: string[] = [];
    try {
      const safe = (s: string) => s.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim() || "foto";
      const patente = (form.patente || "").toString().replace(/[^a-zA-Z0-9]/g, "");
      const marca = (form.marca || "").toString().replace(/[^a-zA-Z0-9]/g, "");
      const prefix = [patente, marca].filter(Boolean).join("_") || "vehiculo";

      let idx = 1;
      let failures = 0;

      for (const slot of available) {
        try {
          // Convertir dataUrl a Blob (mas eficiente y compatible que dataUrl directo)
          const dataUrl = slot.preview!;
          const blob = await (await fetch(dataUrl)).blob();
          const objectUrl = URL.createObjectURL(blob);
          urlsToCleanup.push(objectUrl);

          const filename = `${prefix}_${String(idx).padStart(2, "0")}_${safe(slot.label)}.jpg`;
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = filename;
          a.rel = "noopener";
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          idx++;
          // 600ms entre descargas: Chrome necesita tiempo para no rechazar
          // las siguientes. Probado: 120ms no era suficiente.
          await new Promise((r) => setTimeout(r, 600));
        } catch (e) {
          failures++;
          console.error("Error descargando foto", idx, e);
        }
      }

      if (failures > 0) {
        alert(
          `${idx - 1 - failures} fotos descargadas. ${failures} fallaron.\n\n` +
          `Si solo se descargó la primera, tu navegador bloqueó las demás. ` +
          `Mira arriba del navegador: aparece un aviso "Este sitio quiere descargar varios archivos". ` +
          `Pulsa "Permitir" y reintenta.`
        );
      }
    } catch (err) {
      alert("Error descargando: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      // Cleanup de Object URLs despues de 30s (margen para que las descargas terminen)
      setTimeout(() => {
        urlsToCleanup.forEach((url) => URL.revokeObjectURL(url));
      }, 30000);
      setZipDownloading(false);
    }
  };

  return (
    <div>
      {deleteId && (
        <DeleteModal onConfirm={doDelete} onCancel={() => setDeleteId(null)} />
      )}

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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <th className="px-4 py-3 text-left font-semibold">Patente</th>
              <th className="px-4 py-3 text-left font-semibold">Marca</th>
              <th className="px-4 py-3 text-left font-semibold">Tipo</th>
              <th className="px-4 py-3 text-left font-semibold">Modelo</th>
              <th className="px-4 py-3 text-left font-semibold">Año</th>
              <th className="px-4 py-3 text-left font-semibold">Precio Venta</th>
              <th className="px-4 py-3 text-left font-semibold">Precio Piso</th>
              <th className="px-4 py-3 text-left font-semibold">Sucursal</th>
              <th className="px-4 py-3 text-left font-semibold">Estado</th>
              <th className="px-4 py-3 text-left font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
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
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer", color: "hsl(var(--muted-foreground))" }}>{v.precioPiso ? fmt(v.precioPiso) : "—"}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{v.sucursal || "—"}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{statusBadge(v.estado)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(v)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--primary))" }}><Edit2 size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); confirmDelete(v.id); }} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--destructive))" }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay vehículos</td></tr>
            )}
          </tbody>
        </table>
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
                {editId && !isReadOnly && (
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
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div><label className="block text-xs font-medium mb-1">Marca *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.marca || ""} onChange={e => setForm({ ...form, marca: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Modelo *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.modelo || ""} onChange={e => setForm({ ...form, modelo: e.target.value })} /></div>
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
                    <div><label className="block text-xs font-medium mb-1">Precio Piso</label>
                      <NumberInput value={form.precioPiso ?? 0} onChange={(n) => setForm({ ...form, precioPiso: n })} currency placeholder="Ej: 9.000.000" /></div>
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
                    <div><label className="block text-xs font-medium mb-1">Usuario Asignado</label>
                      <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/40" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.usuarioAsignado || ""} /></div>
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
                <div>
                  <label className="block text-xs font-medium mb-2">Comentarios / Notas del Vehículo</label>
                  <textarea rows={8} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                    placeholder="Ingrese comentarios adicionales sobre el vehículo..."
                    value={form.comentarios || ""} onChange={e => setForm({ ...form, comentarios: e.target.value })} />
                </div>
              )}
              </fieldset>
              {/* ⚠️ Galeria FUERA del fieldset: la descarga debe funcionar incluso en modo lectura.
                  Los botones de modificacion (Subir, IA, X, flechas, drag) se deshabilitan
                  manualmente con isReadOnly. */}

              {tab === "galeria" && (
                <div>
                  {/* Header + acciones */}
                  <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
                    <div className="min-w-[200px]">
                      <h3 className="text-sm font-bold">📷 Registro Fotográfico</h3>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Haz clic en cada cuadrante o usa "Subir múltiples" para cargar varias a la vez.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-3 py-1 rounded-full bg-muted">
                        {fotosCount} / {FOTO_SLOTS.length} fotos
                      </span>
                      {/* Subir multiples */}
                      <button
                        onClick={() => multiUploadRef.current?.click()}
                        disabled={batchUploading || fotosCount >= FOTO_SLOTS.length || isReadOnly}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: "hsl(var(--primary))" }}
                        title={isReadOnly ? "Activa el modo Editar para subir fotos" : fotosCount >= FOTO_SLOTS.length ? "Todos los slots ocupados" : "Selecciona varias fotos a la vez"}
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
                      {/* Descargar todas (individuales) */}
                      <button
                        onClick={downloadAllFotos}
                        disabled={zipDownloading || fotosCount === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted disabled:opacity-50"
                        style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--primary))" }}
                        title="Descarga cada foto como archivo individual. La primera vez tu navegador te pedirá Permitir descargas múltiples — acéptalo."
                      >
                        {zipDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        {zipDownloading ? `Descargando ${fotosCount}…` : "Descargar todas"}
                      </button>
                    </div>
                  </div>

                  {/* ── AI Background panel ─────────────────────────────── */}
                  <div className="mb-4 rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--primary)/0.25)" }}>
                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-3" style={{ background: "hsl(var(--primary)/0.06)" }}>
                      <Sparkles size={15} style={{ color: "hsl(var(--primary))" }} />
                      <span className="text-sm font-bold" style={{ color: "hsl(var(--primary))" }}>Editor de Fondo con IA</span>
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: hasAiConfig() ? "#dcfce7" : "hsl(var(--muted))",
                          color: hasAiConfig() ? "#16a34a" : "hsl(var(--muted-foreground))"
                        }}>
                        {hasAiConfig() ? "✓ Gemini conectado" : "Configura API Key en Configuración"}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="px-4 pb-4 pt-3">
                      <p className="text-xs mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Sube una foto, pasa el cursor sobre ella y haz clic en <strong>✨ IA</strong> para reemplazar el fondo automáticamente por un estudio profesional.
                      </p>

                      <label className="block text-xs font-semibold mb-1.5" style={{ color: "hsl(var(--foreground))" }}>
                        Prompt Fondo de Vehículo
                      </label>
                      <textarea
                        rows={3}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1"
                        style={{ borderColor: "hsl(var(--border))", lineHeight: 1.5 }}
                        value={bgPrompt}
                        onChange={e => { setBgPrompt(e.target.value); setAiError(null); }}
                        placeholder="Describe el fondo que deseas para el vehículo..."
                      />
                      <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Edita este prompt para personalizar el piso, paredes, iluminación, etc.
                      </p>

                      {/* Error message */}
                      {aiError && (
                        <div className="mt-3 flex items-start gap-2 px-3 py-3 rounded-lg text-xs font-semibold"
                          style={{ background: "#fef2f2", color: "#b91c1c", border: "1.5px solid #fca5a5" }}>
                          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                          <span>{aiError}</span>
                        </div>
                      )}
                    </div>
                  </div>

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
                          onClick={() => !isReadOnly && processingAI !== i && fotoRefs.current[i]?.click()}
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

                        {/* Hover action buttons — esquina superior derecha */}
                        {slot.preview && processingAI !== i && (
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 sm:group-hover:opacity-100 transition-opacity z-10">
                            {/* IA — solo en modo edicion */}
                            {!isReadOnly && (
                              <button
                                onClick={e => { e.stopPropagation(); applyAIBackground(i); }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-white text-xs font-bold shadow-lg"
                                style={{ background: "hsl(var(--primary))" }}
                                title="Aplicar IA — cambiar fondo">
                                <Sparkles size={11} /> IA
                              </button>
                            )}
                            {/* Download — SIEMPRE activo (es solo lectura) */}
                            <button
                              onClick={e => { e.stopPropagation(); downloadFoto(slot.preview!, slot.label); }}
                              className="p-1.5 rounded-lg shadow-lg"
                              style={{ background: "rgba(0,0,0,0.7)" }}
                              title="Descargar foto">
                              <Download size={11} className="text-white" />
                            </button>
                            {/* X eliminar — solo en modo edicion */}
                            {!isReadOnly && (
                              <button
                                onClick={e => { e.stopPropagation(); if (confirm("¿Quitar esta foto?")) removeFoto(i); }}
                                className="p-1.5 rounded-lg shadow-lg"
                                style={{ background: "#dc2626" }}
                                title="Quitar foto">
                                <X size={11} className="text-white" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Botones reordenar — solo en modo edicion */}
                        {slot.preview && processingAI !== i && !isReadOnly && (
                          <>
                            {i > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); swapSlots(i, i - 1); }}
                                className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full shadow-lg opacity-70 hover:opacity-100 active:opacity-100 z-10"
                                style={{ background: "rgba(0,0,0,0.65)" }}
                                title="Mover a la posición anterior">
                                <ArrowLeft size={12} className="text-white" />
                              </button>
                            )}
                            {i < fotoSlots.length - 1 && (
                              <button
                                onClick={e => { e.stopPropagation(); swapSlots(i, i + 1); }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full shadow-lg opacity-70 hover:opacity-100 active:opacity-100 z-10"
                                style={{ background: "rgba(0,0,0,0.65)" }}
                                title="Mover a la posición siguiente">
                                <ArrowRight size={12} className="text-white" />
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

              {tab === "equipamiento" && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>Transmisión</label>
                    <div className="grid grid-cols-2 gap-2">
                      {TRANSMISIONES.map(t => {
                        const sel = form.transmision === t;
                        return (
                          <button key={t} onClick={() => setForm({ ...form, transmision: sel ? "" : t })}
                            className={`flex items-center gap-2 px-3 py-2 rounded border text-sm text-left transition-colors ${sel ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}>
                            {sel ? <CheckSquare size={15} style={{ color: "hsl(var(--primary))", flexShrink: 0 }} /> : <Square size={15} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />}
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>Tipo de Tracción</label>
                    <div className="grid grid-cols-2 gap-2">
                      {TRACCIONES.map(t => {
                        const sel = form.traccion === t;
                        return (
                          <button key={t} onClick={() => setForm({ ...form, traccion: sel ? "" : t })}
                            className={`flex items-center gap-2 px-3 py-2 rounded border text-sm text-left transition-colors ${sel ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}>
                            {sel ? <CheckSquare size={15} style={{ color: "hsl(var(--primary))", flexShrink: 0 }} /> : <Square size={15} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />}
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
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
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-sm border bg-card hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
                {isReadOnly ? "Cerrar" : "Cancelar"}
              </button>
              {!isReadOnly && (
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-60" style={{ background: "hsl(var(--primary))" }}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
