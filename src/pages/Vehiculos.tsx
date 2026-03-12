import { useState, useRef } from "react";
import { Plus, Search, X, Upload, CheckSquare, Square, Download, Wand2, Table, Trash2, Edit2, Sparkles } from "lucide-react";
import { useApp, Vehiculo } from "@/context/AppContext";
import * as XLSX from "xlsx";
import { applyVehicleBackground, hasAiConfig } from "@/lib/aiImageService";

type VehiculoEstado = "DISPONIBLE" | "VENDIDO" | "RESERVADO" | "EN PROCESO";

interface FotoSlot { label: string; file: File | null; preview: string | null; }

const FOTO_SLOTS = [
  "FRONTAL 3/4 IZQUIERDA", "FRONTAL", "TRASERA 3/4 DERECHA",
  "TRASERA", "ASIENTOS DELANTEROS", "ASIENTOS TRASEROS",
  "MALETERO / CAJA CARGA", "INTERIOR FRONTAL", "FOTOS ESPECIALES"
];
const TRANSMISIONES = [
  "Transmisión Manual", "Transmisión Automática", "Transmisión CVT",
  "Transmisión Automática de Doble Embrague", "Transmisión Secuencial"
];
const TRACCIONES = ["Tracción Delantera", "Tracción Trasera", "Tracción 4x4", "Tracción Integral"];

const MASTER_PASS = "123cuatro";

const DEFAULT_BG_PROMPT = "Cambia el fondo del vehículo: piso de baldosas grises lisas, pared blanca limpia, iluminación suave de estudio fotográfico, pequeña sombra debajo del vehículo, fondo profesional de concesionaria, realista, alta calidad";

const emptyVehiculo = (): Partial<Vehiculo> => ({
  folio: "", patente: "", tipo: "AUTOMOVIL", marca: "", modelo: "", anio: "2026",
  estado: "DISPONIBLE", precioVenta: 0, precioCosto: 0, sucursal: "", usuarioAsignado: "",
  combustible: "Bencina", nMotor: "", vin: "", color: "", kilometraje: 0, ubicacion: "",
  comentarios: "", transmision: "", traccion: "", aireAcondicionado: false,
  equipamientoExtra: [], fotos: []
});

const fmt = (n: number) => "$" + n.toLocaleString("es-CL");

const statusBadge = (estado: string) => {
  if (estado === "DISPONIBLE") return <span className="badge-success">{estado}</span>;
  if (estado === "VENDIDO") return <span className="badge-destructive">{estado}</span>;
  if (estado === "RESERVADO") return <span className="badge-warning">{estado}</span>;
  return <span className="badge-muted">{estado}</span>;
};

// --- Delete password modal ---
function DeleteModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
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
  const { vehiculos, setVehiculos } = useApp();
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("DISPONIBLE");
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState("general");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Vehiculo>>(emptyVehiculo());
  const [fotoSlots, setFotoSlots] = useState<FotoSlot[]>(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
  const [nuevoEquipamiento, setNuevoEquipamiento] = useState("");
  const fotoRefs = useRef<(HTMLInputElement | null)[]>([]);
  const excelImportRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // AI bg state
  const [bgPrompt, setBgPrompt] = useState(DEFAULT_BG_PROMPT);
  const [processingAI, setProcessingAI] = useState<number | null>(null);

  const exportExcel = () => {
    const data = vehiculos.map(v => ({
      ID: v.id, Folio: v.folio, Patente: v.patente, Tipo: v.tipo,
      Marca: v.marca, Modelo: v.modelo, "Año": v.anio, Estado: v.estado,
      "Precio Venta": v.precioVenta, "Precio Costo": v.precioCosto,
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
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws);
      const nuevos: Vehiculo[] = rows.map((r, i) => ({
        id: String(r["ID"] || Date.now() + i),
        folio: String(r["Folio"] || ""),
        patente: String(r["Patente"] || ""),
        tipo: String(r["Tipo"] || "AUTOMOVIL"),
        marca: String(r["Marca"] || ""),
        modelo: String(r["Modelo"] || ""),
        anio: String(r["Año"] || r["Anio"] || ""),
        estado: (String(r["Estado"] || "DISPONIBLE")) as Vehiculo["estado"],
        precioVenta: Number(r["Precio Venta"] || 0),
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
      setVehiculos([...vehiculos, ...nuevos]);
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
    setForm(emptyVehiculo());
    setFotoSlots(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
    setEditId(null); setTab("general"); setShowModal(true);
  };

  const openEdit = (v: Vehiculo) => {
    setForm({ ...v });
    setFotoSlots(FOTO_SLOTS.map((label, i) => ({ label, file: null, preview: v.fotos[i] || null })));
    setEditId(v.id); setTab("general"); setShowModal(true);
  };

  const handleSave = () => {
    if (!form.patente?.trim() || !form.marca?.trim()) return alert("Patente y Marca son requeridos.");
    const fotos = fotoSlots.map(s => s.preview || "");
    const nextFolio = String(vehiculos.length + 1).padStart(5, "0");
    if (editId) {
      setVehiculos(vehiculos.map(v => v.id === editId ? { ...v, ...form, fotos } as Vehiculo : v));
    } else {
      const newV: Vehiculo = { id: String(Date.now()), folio: nextFolio, ...(form as Vehiculo), fotos };
      setVehiculos([...vehiculos, newV]);
    }
    setShowModal(false);
  };

  const confirmDelete = (id: string) => setDeleteId(id);

  const doDelete = () => {
    if (deleteId) setVehiculos(vehiculos.filter(v => v.id !== deleteId));
    setDeleteId(null);
    setShowModal(false);
  };

  // AI background replacement using Lovable AI gateway
  const applyAIBackground = async (slotIndex: number) => {
    const slot = fotoSlots[slotIndex];
    if (!slot.preview) return;

    // Get saved config
    let apiKey = "";
    let provider = "gemini";
    let model = "gemini-2.5-flash";
    try {
      const saved = JSON.parse(localStorage.getItem("ea_api_configs") || "[]");
      const geminiCfg = saved.find((c: { provider: string }) => c.provider === "gemini");
      const openaiCfg = saved.find((c: { provider: string }) => c.provider === "openai");
      if (geminiCfg?.apiKey) { apiKey = geminiCfg.apiKey; provider = "gemini"; model = geminiCfg.model || "gemini-2.5-flash"; }
      else if (openaiCfg?.apiKey) { apiKey = openaiCfg.apiKey; provider = "openai"; model = openaiCfg.model || "gpt-4o"; }
    } catch {}

    if (!apiKey) {
      alert("Configura una API Key en el módulo de Configuración primero.");
      return;
    }

    setProcessingAI(slotIndex);

    try {
      let resultDataUrl: string | null = null;

      if (provider === "gemini") {
        // Use Gemini image editing
        const base64Data = slot.preview.split(",")[1];
        const mimeType = slot.preview.split(";")[0].split(":")[1] || "image/jpeg";

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: bgPrompt },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
              }],
              generationConfig: { responseModalities: ["image", "text"] }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const imgPart = data.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData);
          if (imgPart?.inlineData) {
            resultDataUrl = `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
          }
        }
      } else {
        // OpenAI DALL-E image edit
        const base64Data = slot.preview.split(",")[1];
        const byteString = atob(base64Data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: "image/png" });

        const formData = new FormData();
        formData.append("image", blob, "vehicle.png");
        formData.append("prompt", bgPrompt);
        formData.append("model", "dall-e-2");
        formData.append("response_format", "b64_json");

        const response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.data?.[0]?.b64_json) {
            resultDataUrl = `data:image/png;base64,${data.data[0].b64_json}`;
          }
        }
      }

      if (resultDataUrl) {
        setFotoSlots(prev => prev.map((s, idx) => idx === slotIndex ? { ...s, preview: resultDataUrl! } : s));
      } else {
        alert("La IA no pudo procesar la imagen. Verifica tu API Key y el modelo configurado.");
      }
    } catch (err) {
      console.error("AI error:", err);
      alert("Error al conectar con la IA. Verifica tu conexión y configuración.");
    } finally {
      setProcessingAI(null);
    }
  };

  const handleFotoChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFotoSlots(prev => prev.map((s, idx) => idx === i ? { ...s, file, preview: ev.target?.result as string } : s));
    };
    reader.readAsDataURL(file);
  };

  const downloadFoto = (dataUrl: string, label: string) => {
    const a = document.createElement("a"); a.href = dataUrl; a.download = label + ".jpg"; a.click();
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

  const TABS = ["general", "datos_adicionales", "galeria", "equipamiento"];
  const TAB_LABELS: Record<string, string> = { general: "General", datos_adicionales: "Datos Adicionales", galeria: "Galería", equipamiento: "Equipamiento" };

  return (
    <div>
      {deleteId && (
        <DeleteModal onConfirm={doDelete} onCancel={() => setDeleteId(null)} />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Vehículos</h1>
          <p className="page-subtitle">{vehiculos.length} vehículos en inventario</p>
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
          <option value="DISPONIBLE">Disponible</option>
          <option value="VENDIDO">Vendido</option>
          <option value="RESERVADO">Reservado</option>
          <option value="EN PROCESO">En Proceso</option>
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
              <th className="px-4 py-3 text-left font-semibold">Folio/Patente</th>
              <th className="px-4 py-3 text-left font-semibold">Marca</th>
              <th className="px-4 py-3 text-left font-semibold">Tipo</th>
              <th className="px-4 py-3 text-left font-semibold">Modelo</th>
              <th className="px-4 py-3 text-left font-semibold">Año</th>
              <th className="px-4 py-3 text-left font-semibold">Precio Venta</th>
              <th className="px-4 py-3 text-left font-semibold">Sucursal</th>
              <th className="px-4 py-3 text-left font-semibold">Estado</th>
              <th className="px-4 py-3 text-left font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id} className="table-row-hover border-b" style={{ borderColor: "hsl(var(--border))" }}>
                <td className="px-4 py-3 font-medium cursor-pointer" style={{ color: "hsl(var(--primary))" }} onClick={() => openEdit(v)}>{v.folio} - {v.patente}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{v.marca}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{v.tipo}</td>
                <td className="px-4 py-3 font-medium cursor-pointer" style={{ color: "hsl(var(--primary))", cursor: "pointer" }} onClick={() => openEdit(v)}>{v.modelo}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{v.anio}</td>
                <td className="px-4 py-3" onClick={() => openEdit(v)} style={{ cursor: "pointer" }}>{fmt(v.precioVenta)}</td>
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
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>
                {editId ? `Editar Vehículo — ${form.patente}` : "Nuevo Vehículo"}
              </span>
              <div className="flex items-center gap-2">
                {editId && (
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
                        {["AUTOMOVIL","SUV","PICKUP","FURGON","CAMION","MOTO"].map(o => <option key={o}>{o}</option>)}
                      </select></div>
                    <div><label className="block text-xs font-medium mb-1">Año</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.anio || ""} onChange={e => setForm({ ...form, anio: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Estado</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.estado || "DISPONIBLE"} onChange={e => setForm({ ...form, estado: e.target.value as VehiculoEstado })}>
                        {["DISPONIBLE","VENDIDO","RESERVADO","EN PROCESO"].map(o => <option key={o}>{o}</option>)}
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
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.kilometraje || 0} onChange={e => setForm({ ...form, kilometraje: Number(e.target.value) })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="block text-xs font-medium mb-1">Precio Venta</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.precioVenta || 0} onChange={e => setForm({ ...form, precioVenta: Number(e.target.value) })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Precio Costo</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.precioCosto || 0} onChange={e => setForm({ ...form, precioCosto: Number(e.target.value) })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Sucursal</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.sucursal || ""} onChange={e => setForm({ ...form, sucursal: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Usuario Asignado</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.usuarioAsignado || ""} onChange={e => setForm({ ...form, usuarioAsignado: e.target.value })} /></div>
                    <div><label className="block text-xs font-medium mb-1">Ubicación</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.ubicacion || ""} onChange={e => setForm({ ...form, ubicacion: e.target.value })} /></div>
                  </div>
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

              {tab === "galeria" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold">📷 Registro Fotográfico Requerido</h3>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Haz clic en cada cuadrante para cargar la vista correspondiente.</p>
                    </div>
                    <span className="text-xs font-medium px-3 py-1 rounded-full bg-muted">{fotosCount} / 9 fotos</span>
                  </div>

                  {/* AI Background section */}
                  <div className="mb-4 p-4 rounded-xl border" style={{ borderColor: "hsl(var(--primary)/0.3)", background: "hsl(var(--primary)/0.04)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Wand2 size={16} style={{ color: "hsl(var(--primary))" }} />
                      <span className="text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>IA — Cambio de Fondo</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted ml-auto">Requiere API Key en Configuración</span>
                    </div>
                    <p className="text-xs mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Al subir una foto, usa la IA para reemplazar el fondo por un ambiente profesional de concesionaria. Haz clic en el ícono ✨ sobre cada foto para aplicar.
                    </p>
                    <label className="block text-xs font-medium mb-1">Prompt Fondo de Vehículo</label>
                    <textarea
                      rows={3}
                      className="w-full border rounded px-3 py-2 text-sm bg-background resize-none"
                      style={{ borderColor: "hsl(var(--border))" }}
                      value={bgPrompt}
                      onChange={e => setBgPrompt(e.target.value)}
                      placeholder="Describe el fondo que deseas para el vehículo..."
                    />
                    <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Puedes modificar este prompt para cambiar el piso, la pared u otros elementos del fondo.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {fotoSlots.map((slot, i) => (
                      <div key={i} className="relative group">
                        <div onClick={() => fotoRefs.current[i]?.click()}
                          className="border-2 border-dashed rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors relative overflow-hidden"
                          style={{ borderColor: slot.preview ? "hsl(var(--primary))" : "hsl(var(--border))" }}>
                          {slot.preview ? (
                            <>
                              <img src={slot.preview} alt={slot.label} className="w-full h-full object-cover absolute inset-0 rounded-lg" />
                              {processingAI === i && (
                                <div className="absolute inset-0 flex items-center justify-center rounded-lg" style={{ background: "rgba(0,0,0,0.6)" }}>
                                  <div className="text-center">
                                    <Loader2 size={24} className="animate-spin text-white mx-auto mb-1" />
                                    <p className="text-white text-xs font-semibold">Procesando IA...</p>
                                  </div>
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                                <span className="text-white text-xs font-semibold">{slot.label}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <Upload size={20} style={{ color: "hsl(var(--muted-foreground))" }} />
                              <span className="text-xs font-semibold mt-2 text-center px-2">{slot.label}</span>
                              <span className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Hacer clic para subir</span>
                            </>
                          )}
                        </div>
                        {slot.preview && processingAI !== i && (
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); applyAIBackground(i); }}
                              className="p-1.5 rounded-lg text-white font-bold text-xs flex items-center gap-1"
                              style={{ background: "hsl(var(--primary))" }}
                              title="Aplicar IA al fondo">
                              <Wand2 size={11} /> IA
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); downloadFoto(slot.preview!, slot.label); }}
                              className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90">
                              <Download size={11} className="text-white" />
                            </button>
                          </div>
                        )}
                        <input ref={el => { fotoRefs.current[i] = el; }} type="file" accept="image/*" className="hidden" onChange={e => handleFotoChange(i, e)} />
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
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-sm border bg-card hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
