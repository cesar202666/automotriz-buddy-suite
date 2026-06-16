import { useState, useRef } from "react";
import { Plus, Search, Check, X, Upload, FileText, Download, AlertTriangle, Lock, ChevronRight, ChevronLeft } from "lucide-react";
import { useApp, Venta, TipoVenta, Cliente } from "@/context/AppContext";
import { SearchableSelect } from "@/components/SearchableSelect";
import { NumberInput } from "@/components/NumberInput";

const fmt = (n: number) => n ? "$" + n.toLocaleString("es-CL") : "—";

const TIPO_VENTA_OPTIONS: { value: TipoVenta; label: string }[] = [
  { value: "CREDITO", label: "Crédito" },
  { value: "CREDITO_PIE", label: "Crédito + Pie" },
  { value: "CREDITO_APP", label: "Crédito más APP" },
  { value: "CREDITO_PIE_APP", label: "Crédito + Pie + APP" },
  { value: "APP_PIE", label: "APP + Pie" },
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "APP", label: "APP" },
];

const calcComision = (precioVenta: number) => Math.round(precioVenta * 0.015) + 100000;

const FINANCIERAS = ["Global", "Autofin", "Unidad", "Falabella"];

interface DocField {
  dataUrl: string | null;
  name: string | null;
}

const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
};

const emptyVenta = (ejecutiva: string): Omit<Venta, "id"> => ({
  ejecutiva, fechaVenta: todayStr(), sucursal: "", clienteId: "", clienteNombre: "",
  informeTecnico: null, informeTecnicoName: null, patente: "", marca: "", modelo: "",
  anioVehiculo: "", colorVehiculo: "", kilometrajeVehiculo: 0,
  precioRetoma: 0, precioPublicado: 0, precioVenta: 0, margenBruto: 0, nCredito: "", financiera: "", comisionCredito: 0,
  gastosAdmin: 0, precioVtaFinal: 0, creditoFirmado: "NO", creditoFirmadoDoc: null, creditoFirmadoDocName: null,
  montoPieCaja: 0, prepago: "NO", prepagoDoc: null, prepagoDocName: null,
  documentacionVenta: null, documentacionVentaName: null, tipoVenta: "CREDITO", estado: "BORRADOR", verificacion: false,
});

// Mini form to create a client inline
function CreateClienteInline({ onCreated, onCancel }: { onCreated: (c: Cliente) => void; onCancel: () => void }) {
  const { addCliente, usuarioActual } = useApp();
  const [f, setF] = useState({ nombres: "", apellidos: "", telefono: "", email: "", rut: "", direccion: "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.nombres.trim() || !f.apellidos.trim() || !f.telefono.trim()) return alert("Nombre, apellido y teléfono son obligatorios");
    setSaving(true);
    // Persistir en la DB (antes solo quedaba en memoria y se perdia al recargar)
    const nuevo = await addCliente({
      nombres: f.nombres, apellidos: f.apellidos, telefono: f.telefono,
      email: f.email, direccion: f.direccion, rut: f.rut || null,
      comentario: null, estadoCivil: null, ciudad: null, casaHabita: null, estudios: null,
      seguimiento: null, seguimientoComentario1: null, seguimientoComentario2: null, seguimientoComentario3: null,
      creadoPor: usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : null,
    });
    setSaving(false);
    if (nuevo) onCreated(nuevo);
  };
  const inp = "w-full border rounded px-3 py-2 text-sm bg-background";
  const bd = { borderColor: "hsl(var(--border))" };
  return (
    <div className="mt-3 p-4 rounded-lg border bg-muted/20" style={bd}>
      <div className="text-xs font-bold mb-3" style={{ color: "hsl(var(--primary))" }}>CREAR NUEVO CLIENTE</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs mb-1">Nombres *</label><input className={inp} style={bd} value={f.nombres} onChange={e => setF({...f, nombres: e.target.value})} /></div>
        <div><label className="block text-xs mb-1">Apellidos *</label><input className={inp} style={bd} value={f.apellidos} onChange={e => setF({...f, apellidos: e.target.value})} /></div>
        <div><label className="block text-xs mb-1">Teléfono *</label><input className={inp} style={bd} value={f.telefono} onChange={e => setF({...f, telefono: e.target.value})} /></div>
        <div><label className="block text-xs mb-1">Email</label><input className={inp} style={bd} value={f.email} onChange={e => setF({...f, email: e.target.value})} /></div>
        <div><label className="block text-xs mb-1">RUT</label><input className={inp} style={bd} placeholder="12.345.678-9" value={f.rut} onChange={e => setF({...f, rut: e.target.value})} /></div>
        <div><label className="block text-xs mb-1">Dirección</label><input className={inp} style={bd} value={f.direccion} onChange={e => setF({...f, direccion: e.target.value})} /></div>
      </div>
      <div className="flex gap-2 mt-3 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm border rounded hover:bg-muted" style={bd}>Cancelar</button>
        <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm rounded font-medium text-white disabled:opacity-60" style={{ background: "hsl(var(--primary))" }}>{saving ? "Guardando..." : "Crear y Asignar"}</button>
      </div>
    </div>
  );
}

const WIZARD_STEPS = [
  { key: "identificacion", label: "Identificación" },
  { key: "vehiculo", label: "Vehículo" },
  { key: "tipo_venta", label: "Tipo de Venta" },
  { key: "valores", label: "Valores" },
] as const;
type WizardStep = typeof WIZARD_STEPS[number]["key"];

export default function Ventas() {
  const { ventas, addVenta, updateVenta, clientes, vehiculos, addCuentaCobrar, usuarioActual } = useApp();
  const [savingVenta, setSavingVenta] = useState(false);
  const [search, setSearch] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Venta, "id">>(emptyVenta(""));
  const [wizardStep, setWizardStep] = useState<WizardStep>("identificacion");
  const [infTecDoc, setInfTecDoc] = useState<DocField>({ dataUrl: null, name: null });
  const [prepagoDoc, setPrepagoDoc] = useState<DocField>({ dataUrl: null, name: null });
  const [creditoFirmDoc, setCreditoFirmDoc] = useState<DocField>({ dataUrl: null, name: null });
  const [docVentaDoc, setDocVentaDoc] = useState<DocField>({ dataUrl: null, name: null });
  const [showValidarModal, setShowValidarModal] = useState(false);
  const [validarId, setValidarId] = useState<string | null>(null);
  const [claveValidar, setClaveValidar] = useState("");
  const [claveError, setClaveError] = useState("");
  const [filtro, setFiltro] = useState<"TODOS" | "VALIDADAS" | "PENDIENTE_VALIDACION">("TODOS");
  const [showCreateCliente, setShowCreateCliente] = useState(false);

  const infTecRef = useRef<HTMLInputElement>(null);
  const prepagoRef = useRef<HTMLInputElement>(null);
  const creditoFirmRef = useRef<HTMLInputElement>(null);
  const docVentaRef = useRef<HTMLInputElement>(null);

  const filtered = ventas.filter(v => {
    const matchSearch = `${v.patente} ${v.clienteNombre} ${v.ejecutiva} ${v.marca} ${v.modelo}`.toLowerCase().includes(search.toLowerCase());
    const matchFiltro = filtro === "TODOS" || v.estado === filtro;
    return matchSearch && matchFiltro;
  });

  const pendientes = ventas.filter(v => v.estado === "PENDIENTE_VALIDACION").length;

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>, setter: (d: DocField) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter({ dataUrl: ev.target?.result as string, name: file.name });
    reader.readAsDataURL(file);
  };

  const download = (dataUrl: string, name: string) => {
    const a = document.createElement("a"); a.href = dataUrl; a.download = name; a.click();
  };

  const calcFields = (pVenta: number, pRetoma: number, gastosAdm: number) => {
    const margen = pVenta - pRetoma;
    const comision = calcComision(pVenta);
    const final = pVenta + comision - gastosAdm;
    return { margenBruto: margen, comisionCredito: comision, precioVtaFinal: final };
  };

  const updatePrecio = (field: "precioVenta" | "precioRetoma" | "gastosAdmin", val: number) => {
    const pVenta = field === "precioVenta" ? val : form.precioVenta;
    const pRetoma = field === "precioRetoma" ? val : form.precioRetoma;
    const gastosAdm = field === "gastosAdmin" ? val : form.gastosAdmin;
    const calc = calcFields(pVenta, pRetoma, gastosAdm);
    setForm(f => ({ ...f, [field]: val, ...calc }));
  };

  const getEjecutivaDefault = () => {
    if (usuarioActual) return `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim();
    return "";
  };

  const openCreate = () => {
    setForm(emptyVenta(getEjecutivaDefault()));
    setInfTecDoc({ dataUrl: null, name: null });
    setPrepagoDoc({ dataUrl: null, name: null });
    setCreditoFirmDoc({ dataUrl: null, name: null });
    setDocVentaDoc({ dataUrl: null, name: null });
    setEditId(null);
    setSelectedVehiculoId("");
    setWizardStep("identificacion");
    setShowCreateCliente(false);
    setShowModal(true);
  };

  const openEdit = (v: Venta) => {
    setForm({ ...v });
    setInfTecDoc({ dataUrl: v.informeTecnico, name: v.informeTecnicoName });
    setPrepagoDoc({ dataUrl: v.prepagoDoc, name: v.prepagoDocName });
    setCreditoFirmDoc({ dataUrl: v.creditoFirmadoDoc, name: v.creditoFirmadoDocName });
    setDocVentaDoc({ dataUrl: v.documentacionVenta, name: v.documentacionVentaName });
    setEditId(v.id);
    // Derivar el id del vehiculo desde la patente guardada (primera coincidencia)
    setSelectedVehiculoId(vehiculos.find(x => x.patente === v.patente)?.id ?? "");
    setWizardStep("identificacion");
    setShowCreateCliente(false);
    setShowModal(true);
  };

  const selectCliente = (clienteId: string) => {
    const c = clientes.find(x => x.id === clienteId);
    if (c) {
      setForm(f => ({ ...f, clienteId, clienteNombre: `${c.nombres} ${c.apellidos}` }));
    } else {
      setForm(f => ({ ...f, clienteId: "", clienteNombre: "" }));
    }
  };

  // Vehiculo seleccionado por ID (la patente NO es unica: muchos son "S/P",
  // lo que rompia el buscador con keys duplicadas y seleccion ambigua).
  const [selectedVehiculoId, setSelectedVehiculoId] = useState("");

  const selectVehiculo = (id: string) => {
    setSelectedVehiculoId(id);
    const v = vehiculos.find(x => x.id === id);
    if (v) {
      const calc = calcFields(v.precioVenta, v.precioCosto, form.gastosAdmin);
      setForm(f => ({
        ...f, patente: v.patente, marca: v.marca, modelo: v.modelo,
        precioRetoma: v.precioCosto, precioVenta: v.precioVenta, precioPublicado: v.precioVenta,
        sucursal: v.sucursal, anioVehiculo: v.anio, colorVehiculo: v.color,
        kilometrajeVehiculo: v.kilometraje, ...calc
      }));
    } else {
      setForm(f => ({ ...f, patente: "" }));
    }
  };

  const handleSave = async (solicitar = false) => {
    if (!form.patente || !form.ejecutiva) return alert("Ejecutiva y Patente son requeridos.");
    const payload: Omit<Venta, "id"> = {
      ...form,
      informeTecnico: infTecDoc.dataUrl, informeTecnicoName: infTecDoc.name,
      prepagoDoc: prepagoDoc.dataUrl, prepagoDocName: prepagoDoc.name,
      creditoFirmadoDoc: creditoFirmDoc.dataUrl, creditoFirmadoDocName: creditoFirmDoc.name,
      documentacionVenta: docVentaDoc.dataUrl, documentacionVentaName: docVentaDoc.name,
      estado: solicitar ? "PENDIENTE_VALIDACION" : (editId ? form.estado : "BORRADOR"),
    };
    setSavingVenta(true);
    if (editId) {
      const ok = await updateVenta({ ...payload, id: editId });
      setSavingVenta(false);
      if (!ok) return;
    } else {
      const saved = await addVenta(payload);
      setSavingVenta(false);
      if (!saved) return;
      await addCuentaCobrar({
        idVenta: saved.id, patente: saved.patente,
        fechaVenta: saved.fechaVenta, idComprador: saved.clienteId,
        nombreComprador: saved.clienteNombre, precioVenta: saved.precioVenta,
        comisionCredito: saved.comisionCredito, tipoFinanciamiento: saved.tipoVenta,
      });
    }
    setShowModal(false);
  };

  const validarVenta = async (id: string) => {
    const v = ventas.find(x => x.id === id);
    if (!v) return;
    await updateVenta({ ...v, estado: "VALIDADA", verificacion: true });
  };

  const iniciarValidacion = (id: string) => {
    // Master valida directo sin pedir clave
    if (usuarioActual?.rol === "master") {
      validarVenta(id);
      return;
    }
    setValidarId(id); setClaveValidar(""); setClaveError(""); setShowValidarModal(true);
  };

  const confirmarValidacion = async () => {
    if (usuarioActual?.rol !== "master" && claveValidar !== "ankker2026$$") {
      setClaveError("Clave incorrecta"); return;
    }
    if (validarId) await validarVenta(validarId);
    setShowValidarModal(false);
  };

  const rowBg = (v: Venta) => {
    if (v.estado === "PENDIENTE_VALIDACION") return "bg-yellow-50 dark:bg-yellow-900/20";
    return "";
  };

  const stepIndex = WIZARD_STEPS.findIndex(s => s.key === wizardStep);
  const canGoNext = stepIndex < WIZARD_STEPS.length - 1;
  const canGoPrev = stepIndex > 0;

  const bd = { borderColor: "hsl(var(--border))" };
  const inp = "w-full border rounded px-3 py-2 text-sm bg-background";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ventas Operativas</h1>
          <p className="page-subtitle">Registro de ventas, formas de pago y validaciones de expedientes</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
          <Plus size={16} /> Registrar Venta
        </button>
      </div>

      {pendientes > 0 && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg border border-yellow-400 bg-yellow-50 text-yellow-800 text-sm font-medium dark:bg-yellow-900/20 dark:text-yellow-300">
          <AlertTriangle size={16} />
          {pendientes} venta(s) pendiente(s) de validación
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
          <input className="pl-9 pr-3 py-2 border rounded text-sm bg-card w-64" style={bd}
            placeholder="Buscar patente, vendedor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <label className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>DESDE</label>
        <input type="date" className="border rounded px-2 py-1.5 text-sm bg-card" style={bd} value={desde} onChange={e => setDesde(e.target.value)} />
        <label className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>HASTA</label>
        <input type="date" className="border rounded px-2 py-1.5 text-sm bg-card" style={bd} value={hasta} onChange={e => setHasta(e.target.value)} />
        <div className="ml-auto flex gap-2">
          {(["TODOS","VALIDADAS","PENDIENTE_VALIDACION"] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filtro === f ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"}`}>
              {f === "TODOS" ? "Todos" : f === "VALIDADAS" ? "Validadas" : "Pendiente Validación"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto" style={bd}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
              {["ID","Tipo Vta","Prepago","Fecha Vta","Ejecutiva","Sucursal","Cliente","Inf. Tec.","Patente","Marca","Modelo","Color","Km","P. Publicado","P. Venta","Margen","N° Crédito","G. Admin","Com. Crédito","P. Vta Final","Cred. Firmado","Monto Pie","Verificación"].map(h => (
                <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} className={`border-b table-row-hover cursor-pointer ${rowBg(v)}`}
                style={bd} onClick={() => openEdit(v)}>
                <td className="px-3 py-2 font-semibold" style={{ color: "hsl(var(--primary))" }}>#{v.id.slice(-6)}</td>
                <td className="px-3 py-2 capitalize">{v.tipoVenta?.replace(/_/g, " ").toLowerCase()}</td>
                <td className="px-3 py-2">
                  {v.prepago === "SI" ? (
                    v.prepagoDoc ? <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">Sí ✓</span>
                      : <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">Sí (Falta Doc)</span>
                  ) : <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{v.fechaVenta}</td>
                <td className="px-3 py-2 font-medium">{v.ejecutiva}</td>
                <td className="px-3 py-2">{v.sucursal}</td>
                <td className="px-3 py-2" style={{ color: "hsl(var(--primary))" }}>{v.clienteNombre || "—"}</td>
                <td className="px-3 py-2">
                  {v.informeTecnico ? <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">✓ Ok</span>
                    : <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">Pendiente</span>}
                </td>
                <td className="px-3 py-2 font-semibold">{v.patente}</td>
                <td className="px-3 py-2">{v.marca}</td>
                <td className="px-3 py-2">{v.modelo}</td>
                <td className="px-3 py-2">{v.colorVehiculo || "—"}</td>
                <td className="px-3 py-2">{v.kilometrajeVehiculo ? v.kilometrajeVehiculo.toLocaleString("es-CL") : "—"}</td>
                <td className="px-3 py-2">{fmt(v.precioPublicado)}</td>
                <td className="px-3 py-2 font-semibold">{fmt(v.precioVenta)}</td>
                <td className="px-3 py-2" style={{ color: "hsl(var(--chart-2))" }}>{fmt(v.margenBruto)}</td>
                <td className="px-3 py-2">{v.nCredito || "—"}</td>
                <td className="px-3 py-2">{fmt(v.gastosAdmin)}</td>
                <td className="px-3 py-2">{fmt(v.comisionCredito)}</td>
                <td className="px-3 py-2 font-semibold">{fmt(v.precioVtaFinal)}</td>
                <td className="px-3 py-2">
                  {v.creditoFirmado === "SI" ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${v.creditoFirmadoDoc ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                      {v.creditoFirmadoDoc ? "Sí ✓" : "Sí (Falta)"}
                    </span>
                  ) : <span style={{ color: "hsl(var(--muted-foreground))" }}>NO</span>}
                </td>
                <td className="px-3 py-2">{fmt(v.montoPieCaja)}</td>
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  {v.estado === "VALIDADA" ? (
                    <span className="text-green-600 font-bold text-base">✓</span>
                  ) : (
                    <button onClick={() => iniciarValidacion(v.id)}
                      className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${v.estado === "PENDIENTE_VALIDACION" ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      <Lock size={10} /> Validar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={23} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay ventas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Wizard */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 overflow-y-auto" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={bd}>
              <h2 className="text-base font-bold" style={{ color: "hsl(var(--primary))" }}>
                {editId ? "Editar Venta" : "Crear Nueva Venta"}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            {/* Wizard Steps indicator */}
            <div className="flex border-b px-6" style={bd}>
              {WIZARD_STEPS.map((s, i) => (
                <button key={s.key} onClick={() => setWizardStep(s.key)}
                  className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${wizardStep === s.key ? "border-primary" : "border-transparent"}`}
                  style={{ color: wizardStep === s.key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${wizardStep === s.key ? "bg-primary text-white" : "bg-muted"}`}>{i+1}</span>
                  {s.label}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 min-h-[320px]">

              {/* Step 1: Identificación */}
              {wizardStep === "identificacion" && (
                <div className="space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>IDENTIFICACIÓN DE VENTA Y CLIENTE</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Ejecutiva *</label>
                      <input className={inp} style={bd} value={form.ejecutiva} onChange={e => setForm(f => ({ ...f, ejecutiva: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Fecha Venta</label>
                      <input className={inp} style={bd} value={form.fechaVenta} onChange={e => setForm(f => ({ ...f, fechaVenta: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Sucursal</label>
                      <input className={inp} style={bd} value={form.sucursal} onChange={e => setForm(f => ({ ...f, sucursal: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Cliente Asignado</label>
                      <SearchableSelect
                        value={form.clienteId}
                        onChange={(v) => { selectCliente(v); setShowCreateCliente(false); }}
                        placeholder="Escribe nombre, teléfono o RUT..."
                        emptyMessage="Sin clientes que coincidan"
                        options={clientes.map(c => ({
                          value: c.id,
                          label: `${c.nombres} ${c.apellidos}`.trim() || "Sin nombre",
                          hint: [c.telefono, c.rut ? `RUT: ${c.rut}` : null].filter(Boolean).join(" · "),
                          search: `${c.nombres} ${c.apellidos} ${c.telefono ?? ""} ${c.rut ?? ""} ${c.email ?? ""}`,
                        }))}
                      />
                      {form.clienteId && (
                        <div className="mt-1.5 text-xs p-2 rounded bg-muted/40">
                          {(() => {
                            const c = clientes.find(x => x.id === form.clienteId);
                            if (!c) return null;
                            return <span>{c.nombres} {c.apellidos} · {c.telefono} {c.rut ? `· RUT: ${c.rut}` : ""}</span>;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setShowCreateCliente(v => !v)} className="text-xs font-medium flex items-center gap-1" style={{ color: "hsl(var(--primary))" }}>
                    <Plus size={12} /> {showCreateCliente ? "Cancelar nuevo cliente" : "Crear nuevo cliente"}
                  </button>
                  {showCreateCliente && (
                    <CreateClienteInline
                      onCreated={(c) => { selectCliente(c.id); setShowCreateCliente(false); }}
                      onCancel={() => setShowCreateCliente(false)}
                    />
                  )}
                </div>
              )}

              {wizardStep === "vehiculo" && (
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>ESPECIFICACIONES DE VEHÍCULO</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">Patente *</label>
                      <SearchableSelect
                        value={selectedVehiculoId || (vehiculos.find(x => x.patente === form.patente)?.id ?? "")}
                        onChange={(v) => selectVehiculo(v)}
                        placeholder="Escribe patente, marca o modelo..."
                        emptyMessage="Sin vehículos que coincidan"
                        options={vehiculos.map(v => ({
                          value: v.id,
                          label: `${v.patente || "S/P"} — ${v.marca} ${v.modelo}`,
                          hint: [v.anio ? `Año ${v.anio}` : null, v.color, v.estado].filter(Boolean).join(" · "),
                          search: `${v.patente} ${v.marca} ${v.modelo} ${v.anio} ${v.color ?? ""}`,
                        }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Marca</label>
                      <input className={inp} style={bd} value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Modelo</label>
                      <input className={inp} style={bd} value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Año</label>
                      <input className={inp} style={bd} value={form.anioVehiculo} onChange={e => setForm(f => ({ ...f, anioVehiculo: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Color</label>
                      <input className={inp} style={bd} value={form.colorVehiculo} onChange={e => setForm(f => ({ ...f, colorVehiculo: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Kilometraje</label>
                      <NumberInput value={form.kilometrajeVehiculo ?? 0} onChange={(n) => setForm(f => ({ ...f, kilometrajeVehiculo: n }))} placeholder="0 km" className={inp} style={bd} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Precio Publicado</label>
                      <NumberInput value={form.precioPublicado ?? 0} onChange={(n) => setForm(f => ({ ...f, precioPublicado: n }))} currency placeholder="Ej: 10.500.000" className={inp} style={bd} />
                    </div>
                    {/* Prepago in vehiculo card */}
                    <div className="col-span-2 border rounded-lg p-3" style={bd}>
                      <label className="block text-xs font-medium mb-2">Prepago</label>
                      <div className="flex gap-2 items-center">
                        <select className="flex-1 border rounded px-3 py-2 text-sm bg-background" style={bd}
                          value={form.prepago} onChange={e => setForm(f => ({ ...f, prepago: e.target.value }))}>
                          <option value="NO">NO</option>
                          <option value="SI">SI</option>
                        </select>
                        {form.prepago === "SI" && (
                          <div className="flex gap-1">
                            <button onClick={() => prepagoRef.current?.click()}
                              className={`px-2 py-1 rounded border text-xs flex items-center gap-1 ${!prepagoDoc.dataUrl ? "border-red-400 text-red-600 bg-red-50" : "border-primary text-primary"}`}>
                              {prepagoDoc.dataUrl ? <><FileText size={12} />Doc</> : <><Upload size={12} />Subir</>}
                            </button>
                            {prepagoDoc.dataUrl && <button onClick={() => download(prepagoDoc.dataUrl!, prepagoDoc.name!)} className="px-2 py-1 rounded border hover:bg-muted"><Download size={14} /></button>}
                          </div>
                        )}
                        <input ref={prepagoRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={e => handleFileRead(e, setPrepagoDoc)} />
                      </div>
                    </div>
                    {/* Informe Técnico */}
                    <div className="col-span-2">
                      <label className={`block text-xs font-medium mb-1 ${!infTecDoc.dataUrl ? "text-red-500" : ""}`}>
                        Informe Técnico {!infTecDoc.dataUrl && "(Pendiente)"}
                      </label>
                      <div className="flex gap-2">
                        <div onClick={() => infTecRef.current?.click()}
                          className={`flex-1 border-2 border-dashed rounded-lg flex items-center justify-center py-2 cursor-pointer hover:bg-muted/30 transition-colors ${!infTecDoc.dataUrl ? "border-red-400 bg-red-50/50" : "border-primary"}`}>
                          {infTecDoc.dataUrl ? (
                            <span className="text-xs flex items-center gap-1" style={{ color: "hsl(var(--primary))" }}><FileText size={12} />{infTecDoc.name}</span>
                          ) : (
                            <span className="text-xs flex items-center gap-1 text-red-500"><Upload size={12} /> Subir Inf. Tec.</span>
                          )}
                        </div>
                        {infTecDoc.dataUrl && <button onClick={() => download(infTecDoc.dataUrl!, infTecDoc.name!)} className="p-2 rounded border hover:bg-muted"><Download size={14} /></button>}
                      </div>
                      <input ref={infTecRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={e => handleFileRead(e, setInfTecDoc)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Tipo de Venta */}
              {wizardStep === "tipo_venta" && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>TIPO DE VENTA *</div>
                  <div className="grid grid-cols-2 gap-3">
                    {TIPO_VENTA_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setForm(f => ({ ...f, tipoVenta: opt.value }))}
                        className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors text-center ${form.tipoVenta === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>DOCUMENTACIÓN VENTA</div>
                    <div onClick={() => docVentaRef.current?.click()}
                      className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-6 cursor-pointer hover:bg-muted/30 transition-colors"
                      style={{ borderColor: docVentaDoc.dataUrl ? "hsl(var(--primary))" : "hsl(var(--border))" }}>
                      {docVentaDoc.dataUrl ? (
                        <><FileText size={20} style={{ color: "hsl(var(--primary))" }} />
                          <span className="text-xs mt-1 text-center truncate w-full px-2" style={{ color: "hsl(var(--primary))" }}>{docVentaDoc.name}</span></>
                      ) : (
                        <><Upload size={20} style={{ color: "hsl(var(--muted-foreground))" }} />
                          <span className="text-xs mt-1 font-medium" style={{ color: "hsl(var(--primary))" }}>Subir Documentos</span>
                          <span className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Factura y anexos</span></>
                      )}
                    </div>
                    {docVentaDoc.dataUrl && (
                      <button onClick={() => download(docVentaDoc.dataUrl!, docVentaDoc.name!)} className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded border text-xs hover:bg-muted" style={bd}>
                        <Download size={12} /> Descargar
                      </button>
                    )}
                    <input ref={docVentaRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={e => handleFileRead(e, setDocVentaDoc)} />
                  </div>
                </div>
              )}

              {/* Step 4: Valores */}
              {wizardStep === "valores" && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>VALORES Y FINANCIAMIENTO COMERCIAL</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Precio Venta *</label>
                      <NumberInput value={form.precioVenta ?? 0} onChange={(n) => updatePrecio("precioVenta", n)} currency placeholder="Ej: 10.500.000" className={inp} style={bd} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Margen Bruto (auto)</label>
                      <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/50 font-semibold" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--chart-2))" }}
                        value={fmt(form.margenBruto)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Monto Pie Caja</label>
                      <NumberInput value={form.montoPieCaja ?? 0} onChange={(n) => setForm(f => ({ ...f, montoPieCaja: n }))} currency placeholder="Ej: 1.500.000" className={inp} style={bd} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">N° Crédito</label>
                      <input className={inp} style={bd} value={form.nCredito} onChange={e => setForm(f => ({ ...f, nCredito: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Financiera</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                        value={form.financiera || ""} onChange={e => setForm(f => ({ ...f, financiera: e.target.value }))}>
                        <option value="">— Seleccionar —</option>
                        {FINANCIERAS.map(fin => <option key={fin} value={fin}>{fin}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Gastos Administrativos</label>
                      <NumberInput value={form.gastosAdmin ?? 0} onChange={(n) => updatePrecio("gastosAdmin", n)} currency placeholder="Ej: 200.000" className={inp} style={bd} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Comisión Crédito (auto 1.5%+$100k)</label>
                      <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/50" style={bd} value={fmt(form.comisionCredito)} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">Precio Vta Final (auto)</label>
                      <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/50 font-semibold" style={{ ...bd, color: "hsl(var(--primary))" }}
                        value={fmt(form.precioVtaFinal)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Crédito Firmado</label>
                      <div className="flex gap-2 items-center">
                        <select className="flex-1 border rounded px-3 py-2 text-sm bg-background" style={bd}
                          value={form.creditoFirmado} onChange={e => setForm(f => ({ ...f, creditoFirmado: e.target.value }))}>
                          <option value="NO">NO</option>
                          <option value="SI">SI</option>
                        </select>
                        {form.creditoFirmado === "SI" && (
                          <div className="flex gap-1">
                            <button onClick={() => creditoFirmRef.current?.click()}
                              className={`px-2 py-1 rounded border text-xs flex items-center gap-1 ${!creditoFirmDoc.dataUrl ? "border-red-400 text-red-600 bg-red-50" : "border-primary text-primary"}`}>
                              {creditoFirmDoc.dataUrl ? <><FileText size={12} />Doc</> : <><Upload size={12} />Subir</>}
                            </button>
                            {creditoFirmDoc.dataUrl && <button onClick={() => download(creditoFirmDoc.dataUrl!, creditoFirmDoc.name!)} className="px-2 py-1 rounded border hover:bg-muted"><Download size={14} /></button>}
                          </div>
                        )}
                        <input ref={creditoFirmRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={e => handleFileRead(e, setCreditoFirmDoc)} />
                      </div>
                    </div>
                    <div className="border rounded-lg p-3" style={bd}>
                      <div className="text-xs font-bold uppercase mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>ESTADO ACTUAL</div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${form.estado === "VALIDADA" ? "bg-green-100 text-green-700" : form.estado === "PENDIENTE_VALIDACION" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600"}`}>
                        {form.estado === "VALIDADA" ? "✓ Validada" : form.estado === "PENDIENTE_VALIDACION" ? "⏳ Pendiente" : "Borrador"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer navigation */}
            <div className="flex items-center justify-between px-6 py-4 border-t" style={bd}>
              <button onClick={() => canGoPrev && setWizardStep(WIZARD_STEPS[stepIndex - 1].key)}
                disabled={!canGoPrev}
                className="flex items-center gap-1 px-4 py-2 rounded text-sm border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed" style={bd}>
                <ChevronLeft size={15} /> Anterior
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-sm border bg-card hover:bg-muted" style={bd}>Cancelar</button>
                {canGoNext ? (
                  <button onClick={() => setWizardStep(WIZARD_STEPS[stepIndex + 1].key)}
                    className="flex items-center gap-1 px-4 py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
                    Siguiente <ChevronRight size={15} />
                  </button>
                ) : (
                  <>
                    <button onClick={() => handleSave(false)} disabled={savingVenta} className="px-4 py-2 rounded text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-60">
                      {savingVenta ? "Guardando..." : "Guardar (Borrador)"}
                    </button>
                    {form.estado !== "VALIDADA" && (
                      <button onClick={() => handleSave(true)} disabled={savingVenta} className="px-4 py-2 rounded text-sm font-medium text-white flex items-center gap-2 disabled:opacity-60" style={{ background: "hsl(var(--primary))" }}>
                        <Check size={15} /> {savingVenta ? "Guardando..." : "Solicitar Verificación"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Validar */}
      {showValidarModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock size={20} style={{ color: "hsl(var(--primary))" }} />
              <h3 className="text-base font-bold">Validar Venta</h3>
            </div>
            <p className="text-sm mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Ingrese la clave de validación para confirmar esta venta.</p>
            <input type="password" className="w-full border rounded px-3 py-2 text-sm bg-background mb-1"
              style={{ borderColor: claveError ? "#ef4444" : "hsl(var(--border))" }}
              placeholder="Clave de validación" value={claveValidar} onChange={e => { setClaveValidar(e.target.value); setClaveError(""); }}
              onKeyDown={e => e.key === "Enter" && confirmarValidacion()} autoFocus />
            {claveError && <p className="text-xs text-red-500 mb-3">{claveError}</p>}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowValidarModal(false)} className="px-4 py-2 rounded text-sm border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={confirmarValidacion} className="px-4 py-2 rounded text-sm font-medium text-white flex items-center gap-1" style={{ background: "hsl(var(--primary))" }}>
                <Check size={15} /> Validar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
