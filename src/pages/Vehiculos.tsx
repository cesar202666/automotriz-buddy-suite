import { useState, useRef } from "react";
import { Plus, Search, X, Upload, CheckSquare, Square } from "lucide-react";

type VehiculoEstado = "DISPONIBLE" | "VENDIDO" | "RESERVADO" | "EN PROCESO";

interface FotoSlot {
  label: string;
  file: File | null;
  preview: string | null;
}

const FOTO_SLOTS = [
  "FRONTAL 3/4 IZQUIERDA", "FRONTAL", "TRASERA 3/4 DERECHA",
  "TRASERA", "ASIENTOS DELANTEROS", "ASIENTOS TRASEROS",
  "MALETERO / CAJA CARGA", "INTERIOR FRONTAL", "FOTOS ESPECIALES"
];

const TRANSMISIONES = [
  "Transmisión Manual", "Transmisión Automática", "Transmisión CVT",
  "Transmisión Automática de Doble Embrague", "Transmisión Secuencial"
];

const TRACCIONES = [
  "Tracción Delantera", "Tracción Trasera", "Tracción 4x4", "Tracción Integral"
];

interface Vehiculo {
  id: string;
  folio: string;
  patente: string;
  tipo: string;
  marca: string;
  modelo: string;
  anio: string;
  estado: VehiculoEstado;
  precioVenta: number;
  precioCosto: number;
  sucursal: string;
  usuarioAsignado: string;
  combustible: string;
  nMotor: string;
  vin: string;
  color: string;
  kilometraje: number;
  ubicacion: string;
  comentarios: string;
  transmision: string;
  traccion: string;
  aireAcondicionado: boolean;
  equipamientoExtra: string[];
  fotos: string[];
}

const initialVehiculos: Vehiculo[] = [
  {
    id: "1", folio: "00002", patente: "ABC123", tipo: "SUV", marca: "Toyota",
    modelo: "Corolla", anio: "2026", estado: "DISPONIBLE", precioVenta: 12000000,
    precioCosto: 10000000, sucursal: "Egaña", usuarioAsignado: "", combustible: "Bencina",
    nMotor: "", vin: "", color: "Blanco", kilometraje: 0, ubicacion: "", comentarios: "",
    transmision: "Transmisión Automática", traccion: "Tracción Delantera", aireAcondicionado: true,
    equipamientoExtra: [], fotos: []
  }
];

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

export default function Vehiculos() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(initialVehiculos);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("DISPONIBLE");
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState("general");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Vehiculo>>(emptyVehiculo());
  const [fotoSlots, setFotoSlots] = useState<FotoSlot[]>(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
  const [nuevoEquipamiento, setNuevoEquipamiento] = useState("");
  const fotoRefs = useRef<(HTMLInputElement | null)[]>([]);

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
    setFotoSlots(FOTO_SLOTS.map(label => ({ label, file: null, preview: null })));
    setEditId(v.id); setTab("general"); setShowModal(true);
  };

  const handleSave = () => {
    if (!form.patente?.trim() || !form.marca?.trim()) return alert("Patente y Marca son requeridos.");
    const fotos = fotoSlots.filter(s => s.preview).map(s => s.preview as string);
    const nextFolio = String(vehiculos.length + 1).padStart(5, "0");
    if (editId) {
      setVehiculos(vehiculos.map(v => v.id === editId ? { ...v, ...form, fotos } as Vehiculo : v));
    } else {
      const newV: Vehiculo = {
        id: String(Date.now()), folio: nextFolio,
        ...(form as Vehiculo), fotos
      };
      setVehiculos([...vehiculos, newV]);
    }
    setShowModal(false);
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Vehículos</h1>
          <p className="page-subtitle">{vehiculos.length} vehículos en inventario</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
          <Plus size={16} /> Crear Vehículo
        </button>
      </div>

      {/* Filters */}
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

      {/* Table */}
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
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id} className="table-row-hover border-b cursor-pointer" style={{ borderColor: "hsl(var(--border))" }} onClick={() => openEdit(v)}>
                <td className="px-4 py-3 font-medium" style={{ color: "hsl(var(--primary))" }}>{v.folio} - {v.patente}</td>
                <td className="px-4 py-3">{v.marca}</td>
                <td className="px-4 py-3">{v.tipo}</td>
                <td className="px-4 py-3 font-medium" style={{ color: "hsl(var(--primary))" }}>{v.modelo}</td>
                <td className="px-4 py-3">{v.anio}</td>
                <td className="px-4 py-3">{fmt(v.precioVenta)}</td>
                <td className="px-4 py-3">{v.sucursal || "—"}</td>
                <td className="px-4 py-3">{statusBadge(v.estado)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay vehículos</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-3xl mx-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Vehículos &rsaquo; {editId ? "editar" : "crear"}</span>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            {/* Tabs */}
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
              {/* === GENERAL TAB === */}
              {tab === "general" && (
                <div>
                  <div className="section-divider mb-4">DATOS PRINCIPALES</div>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Patente/STK *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="ABC123" value={form.patente || ""} onChange={e => setForm({ ...form, patente: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Tipo *</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.tipo || ""} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                        {["AUTOMOVIL","SUV","PICKUP","FURGON","CAMION","MOTO"].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Año *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.anio || ""} onChange={e => setForm({ ...form, anio: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Estado</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.estado || "DISPONIBLE"} onChange={e => setForm({ ...form, estado: e.target.value as VehiculoEstado })}>
                        {["DISPONIBLE","VENDIDO","RESERVADO","EN PROCESO"].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Marca *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="Toyota" value={form.marca || ""} onChange={e => setForm({ ...form, marca: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Modelo *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="Corolla" value={form.modelo || ""} onChange={e => setForm({ ...form, modelo: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">N° Motor</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.nMotor || ""} onChange={e => setForm({ ...form, nMotor: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Combustible</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.combustible || "Bencina"} onChange={e => setForm({ ...form, combustible: e.target.value })}>
                        {["Bencina","Diesel","Eléctrico","Híbrido","Gas"].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">VIN/Chasis</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.vin || ""} onChange={e => setForm({ ...form, vin: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Color</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.color || ""} onChange={e => setForm({ ...form, color: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Kilometraje</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.kilometraje || 0} onChange={e => setForm({ ...form, kilometraje: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Ubicación</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.ubicacion || ""} onChange={e => setForm({ ...form, ubicacion: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Precio Venta</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.precioVenta || 0} onChange={e => setForm({ ...form, precioVenta: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Precio Costo</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.precioCosto || 0} onChange={e => setForm({ ...form, precioCosto: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Sucursal</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="Seleccionar" value={form.sucursal || ""} onChange={e => setForm({ ...form, sucursal: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Usuario Asignado *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="Nombre" value={form.usuarioAsignado || ""} onChange={e => setForm({ ...form, usuarioAsignado: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              {/* === DATOS ADICIONALES TAB === */}
              {tab === "datos_adicionales" && (
                <div>
                  <label className="block text-xs font-medium mb-2">Comentarios / Notas del Vehículo</label>
                  <textarea rows={8} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                    placeholder="Ingrese comentarios adicionales sobre el vehículo..."
                    value={form.comentarios || ""} onChange={e => setForm({ ...form, comentarios: e.target.value })} />
                </div>
              )}

              {/* === GALERÍA TAB === */}
              {tab === "galeria" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2"><span style={{ color: "hsl(var(--primary))" }}>📷</span> Registro Fotográfico Requerido</h3>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Haz clic en cada cuadrante para cargar la vista correspondiente del vehículo.</p>
                    </div>
                    <span className="text-xs font-medium px-3 py-1 rounded-full bg-muted">{fotosCount} / 9 fotos</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {fotoSlots.map((slot, i) => (
                      <div key={i} onClick={() => fotoRefs.current[i]?.click()}
                        className="border-2 border-dashed rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors relative overflow-hidden"
                        style={{ borderColor: slot.preview ? "hsl(var(--primary))" : "hsl(var(--border))" }}>
                        {slot.preview ? (
                          <img src={slot.preview} alt={slot.label} className="w-full h-full object-cover absolute inset-0 rounded-lg" />
                        ) : (
                          <>
                            <Upload size={20} style={{ color: "hsl(var(--muted-foreground))" }} />
                            <span className="text-xs font-semibold mt-2 text-center px-2" style={{ color: "hsl(var(--foreground))" }}>{slot.label}</span>
                            <span className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Hacer clic para subir</span>
                          </>
                        )}
                        {slot.preview && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                            <span className="text-white text-xs font-semibold">{slot.label}</span>
                          </div>
                        )}
                        <input ref={el => { fotoRefs.current[i] = el; }} type="file" accept="image/*" className="hidden" onChange={e => handleFotoChange(i, e)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* === EQUIPAMIENTO TAB === */}
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

            {/* Footer */}
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
