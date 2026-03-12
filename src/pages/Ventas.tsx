import { useState, useRef } from "react";
import { Plus, Search, Check, X, Upload, FileText, Download, AlertTriangle, Lock } from "lucide-react";
import { useApp, Venta, TipoVenta } from "@/context/AppContext";

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

const calcComision = (precioVenta: number) => Math.round(precioVenta * 0.015) + 80000;

interface DocField {
  dataUrl: string | null;
  name: string | null;
}

const emptyVenta = (): Omit<Venta, "id"> => ({
  ejecutiva: "", fechaVenta: "", sucursal: "", clienteId: "", clienteNombre: "",
  informeTecnico: null, informeTecnicoName: null, patente: "", marca: "", modelo: "",
  precioRetoma: 0, precioVenta: 0, margenBruto: 0, nCredito: "", comisionCredito: 0,
  gastosAdmin: 0, precioVtaFinal: 0, creditoFirmado: "NO", creditoFirmadoDoc: null, creditoFirmadoDocName: null,
  montoPieCaja: 0, prepago: "NO", prepagoDoc: null, prepagoDocName: null,
  documentacionVenta: null, documentacionVentaName: null, tipoVenta: "CREDITO", estado: "BORRADOR", verificacion: false,
});

export default function Ventas() {
  const { ventas, setVentas, clientes, vehiculos, cuentasCobrar, setCuentasCobrar } = useApp();
  const [search, setSearch] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Venta, "id">>(emptyVenta());
  const [infTecDoc, setInfTecDoc] = useState<DocField>({ dataUrl: null, name: null });
  const [prepagoDoc, setPrepagoDoc] = useState<DocField>({ dataUrl: null, name: null });
  const [creditoFirmDoc, setCreditoFirmDoc] = useState<DocField>({ dataUrl: null, name: null });
  const [docVentaDoc, setDocVentaDoc] = useState<DocField>({ dataUrl: null, name: null });
  const [showValidarModal, setShowValidarModal] = useState(false);
  const [validarId, setValidarId] = useState<string | null>(null);
  const [claveValidar, setClaveValidar] = useState("");
  const [claveError, setClaveError] = useState("");
  const [filtro, setFiltro] = useState<"TODOS" | "VALIDADAS" | "PENDIENTE_VALIDACION">("TODOS");

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

  const handleFileRead = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (d: DocField) => void
  ) => {
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

  const openCreate = () => {
    setForm(emptyVenta());
    setInfTecDoc({ dataUrl: null, name: null });
    setPrepagoDoc({ dataUrl: null, name: null });
    setCreditoFirmDoc({ dataUrl: null, name: null });
    setDocVentaDoc({ dataUrl: null, name: null });
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (v: Venta) => {
    setForm({ ...v });
    setInfTecDoc({ dataUrl: v.informeTecnico, name: v.informeTecnicoName });
    setPrepagoDoc({ dataUrl: v.prepagoDoc, name: v.prepagoDocName });
    setCreditoFirmDoc({ dataUrl: v.creditoFirmadoDoc, name: v.creditoFirmadoDocName });
    setDocVentaDoc({ dataUrl: v.documentacionVenta, name: v.documentacionVentaName });
    setEditId(v.id);
    setShowModal(true);
  };

  const selectCliente = (clienteId: string) => {
    const c = clientes.find(x => x.id === clienteId);
    setForm(f => ({ ...f, clienteId, clienteNombre: c ? `${c.nombres} ${c.apellidos}` : "" }));
  };

  const selectVehiculo = (patente: string) => {
    const v = vehiculos.find(x => x.patente === patente);
    if (v) {
      const calc = calcFields(v.precioVenta, v.precioCosto, form.gastosAdmin);
      setForm(f => ({ ...f, patente: v.patente, marca: v.marca, modelo: v.modelo, precioRetoma: v.precioCosto, precioVenta: v.precioVenta, sucursal: v.sucursal, ...calc }));
    }
  };

  // Save without any mandatory-doc blocking — user can save anytime
  const handleSave = (solicitar = false) => {
    if (!form.patente || !form.ejecutiva) return alert("Ejecutiva y Patente son requeridos.");

    const saved: Venta = {
      ...form,
      id: editId || String(Date.now()),
      informeTecnico: infTecDoc.dataUrl,
      informeTecnicoName: infTecDoc.name,
      prepagoDoc: prepagoDoc.dataUrl,
      prepagoDocName: prepagoDoc.name,
      creditoFirmadoDoc: creditoFirmDoc.dataUrl,
      creditoFirmadoDocName: creditoFirmDoc.name,
      documentacionVenta: docVentaDoc.dataUrl,
      documentacionVentaName: docVentaDoc.name,
      estado: solicitar ? "PENDIENTE_VALIDACION" : (editId ? form.estado : "BORRADOR"),
    };

    if (editId) {
      setVentas(ventas.map(v => v.id === editId ? saved : v));
    } else {
      setVentas([...ventas, saved]);
      setCuentasCobrar([...cuentasCobrar, {
        id: String(Date.now()), idVenta: saved.id, patente: saved.patente,
        fechaVenta: saved.fechaVenta, idComprador: saved.clienteId,
        nombreComprador: saved.clienteNombre, precioVenta: saved.precioVenta,
        comisionCredito: saved.comisionCredito, tipoFinanciamiento: saved.tipoVenta,
      }]);
    }
    setShowModal(false);
  };

  const iniciarValidacion = (id: string) => {
    setValidarId(id); setClaveValidar(""); setClaveError(""); setShowValidarModal(true);
  };

  const confirmarValidacion = () => {
    if (claveValidar !== "123cuatro") { setClaveError("Clave incorrecta"); return; }
    setVentas(ventas.map(v => v.id === validarId ? { ...v, estado: "VALIDADA", verificacion: true } : v));
    setShowValidarModal(false);
  };

  const rowBg = (v: Venta) => {
    if (v.estado === "PENDIENTE_VALIDACION") return "bg-yellow-50 dark:bg-yellow-900/20";
    return "";
  };

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
          {pendientes} venta(s) pendiente(s) de validación — haga clic en "Validar" en la columna Verificación
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
          <input className="pl-9 pr-3 py-2 border rounded text-sm bg-card w-64" style={{ borderColor: "hsl(var(--border))" }}
            placeholder="Buscar patente, vendedor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <label className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>DESDE</label>
        <input type="date" className="border rounded px-2 py-1.5 text-sm bg-card" style={{ borderColor: "hsl(var(--border))" }} value={desde} onChange={e => setDesde(e.target.value)} />
        <label className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>HASTA</label>
        <input type="date" className="border rounded px-2 py-1.5 text-sm bg-card" style={{ borderColor: "hsl(var(--border))" }} value={hasta} onChange={e => setHasta(e.target.value)} />
        <div className="ml-auto flex gap-2">
          {(["TODOS","VALIDADAS","PENDIENTE_VALIDACION"] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filtro === f ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"}`}>
              {f === "TODOS" ? "Todos" : f === "VALIDADAS" ? "Validadas" : "Pendiente Validación"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto" style={{ borderColor: "hsl(var(--border))" }}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">ID</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Tipo Vta</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Prepago</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Fecha Vta</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Ejecutiva</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Sucursal</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Cliente</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Inf. Tec.</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Patente</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Marca</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Modelo</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">P. Retoma</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">P. Venta</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Margen</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">N° Crédito</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">G. Admin</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Com. Crédito</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">P. Vta Final</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Cred. Firmado</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Monto Pie</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Verificación</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} className={`border-b table-row-hover cursor-pointer ${rowBg(v)}`}
                style={{ borderColor: "hsl(var(--border))" }} onClick={() => openEdit(v)}>
                <td className="px-3 py-2 font-semibold" style={{ color: "hsl(var(--primary))" }}>#{v.id.slice(-6)}</td>
                <td className="px-3 py-2 capitalize">{v.tipoVenta?.replace(/_/g, " ").toLowerCase()}</td>
                <td className="px-3 py-2">
                  {v.prepago === "SI" ? (
                    v.prepagoDoc
                      ? <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">Sí ✓</span>
                      : <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">Sí (Falta Doc)</span>
                  ) : <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{v.fechaVenta}</td>
                <td className="px-3 py-2 font-medium">{v.ejecutiva}</td>
                <td className="px-3 py-2">{v.sucursal}</td>
                <td className="px-3 py-2" style={{ color: "hsl(var(--primary))" }}>{v.clienteNombre || v.clienteId || "—"}</td>
                <td className="px-3 py-2">
                  {v.informeTecnico ? (
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">✓ Ok</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">Pendiente</span>
                  )}
                </td>
                <td className="px-3 py-2 font-semibold">{v.patente}</td>
                <td className="px-3 py-2">{v.marca}</td>
                <td className="px-3 py-2">{v.modelo}</td>
                <td className="px-3 py-2">{fmt(v.precioRetoma)}</td>
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
                      <Lock size={10} /> {v.estado === "PENDIENTE_VALIDACION" ? "Validar" : "Validar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={21} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay ventas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear/Editar Venta */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 overflow-y-auto" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-4xl mx-4 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <h2 className="text-base font-bold" style={{ color: "hsl(var(--primary))" }}>
                {editId ? "Editar Venta" : "Crear Nueva Venta"}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <div className="flex gap-6 p-6">
              {/* Left column */}
              <div className="flex-1 space-y-5">
                {/* Identificación */}
                <div className="border rounded-lg p-4" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>IDENTIFICACIÓN DE VENTA Y CLIENTE</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Ejecutiva *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.ejecutiva} onChange={e => setForm(f => ({ ...f, ejecutiva: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Fecha Venta</label>
                      <input type="text" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="DD-MM-YYYY" value={form.fechaVenta} onChange={e => setForm(f => ({ ...f, fechaVenta: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Sucursal</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.sucursal} onChange={e => setForm(f => ({ ...f, sucursal: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Cliente Asignado</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.clienteId} onChange={e => selectCliente(e.target.value)}>
                        <option value="">-- Seleccionar --</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombres} {c.apellidos}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Vehículo */}
                <div className="border rounded-lg p-4" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>ESPECIFICACIONES DE VEHÍCULO</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
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
                    <div>
                      <label className="block text-xs font-medium mb-1">Patente *</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.patente} onChange={e => selectVehiculo(e.target.value)}>
                        <option value="">-- Seleccionar --</option>
                        {vehiculos.map(v => <option key={v.id} value={v.patente}>{v.patente} - {v.marca} {v.modelo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Marca</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Modelo</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Valores */}
                <div className="border rounded-lg p-4" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>VALORES Y FINANCIAMIENTO COMERCIAL</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Precio Retoma</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.precioRetoma || ""} onChange={e => updatePrecio("precioRetoma", Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Precio Venta *</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.precioVenta || ""} onChange={e => updatePrecio("precioVenta", Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Margen Bruto (auto)</label>
                      <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/50 font-semibold" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--chart-2))" }}
                        value={fmt(form.margenBruto)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Monto Pie Caja</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.montoPieCaja || ""} onChange={e => setForm(f => ({ ...f, montoPieCaja: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">N° Crédito</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.nCredito} onChange={e => setForm(f => ({ ...f, nCredito: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Gastos Administrativos</label>
                      <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.gastosAdmin || ""} onChange={e => updatePrecio("gastosAdmin", Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Comisión Crédito (auto 1.5%+$80k)</label>
                      <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/50" style={{ borderColor: "hsl(var(--border))" }}
                        value={fmt(form.comisionCredito)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Precio Vta Final (auto)</label>
                      <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/50 font-semibold" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--primary))" }}
                        value={fmt(form.precioVtaFinal)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Crédito Firmado</label>
                      <div className="flex gap-2 items-center">
                        <select className="flex-1 border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
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
                    <div>
                      <label className="block text-xs font-medium mb-1">Prepago</label>
                      <div className="flex gap-2 items-center">
                        <select className="flex-1 border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
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
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="w-64 space-y-4">
                <div className="border rounded-lg p-4" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>TIPO DE VENTA *</div>
                  <div className="grid grid-cols-2 gap-2">
                    {TIPO_VENTA_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setForm(f => ({ ...f, tipoVenta: opt.value }))}
                        className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors text-center ${form.tipoVenta === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border rounded-lg p-4" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>DOCUMENTACIÓN VENTA</div>
                  <div onClick={() => docVentaRef.current?.click()}
                    className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-6 cursor-pointer hover:bg-muted/30 transition-colors"
                    style={{ borderColor: docVentaDoc.dataUrl ? "hsl(var(--primary))" : "hsl(var(--border))" }}>
                    {docVentaDoc.dataUrl ? (
                      <>
                        <FileText size={20} style={{ color: "hsl(var(--primary))" }} />
                        <span className="text-xs mt-1 text-center truncate w-full px-2" style={{ color: "hsl(var(--primary))" }}>{docVentaDoc.name}</span>
                      </>
                    ) : (
                      <>
                        <Upload size={20} style={{ color: "hsl(var(--muted-foreground))" }} />
                        <span className="text-xs mt-1 font-medium" style={{ color: "hsl(var(--primary))" }}>Subir Documentos</span>
                        <span className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Factura y anexos</span>
                      </>
                    )}
                  </div>
                  {docVentaDoc.dataUrl && (
                    <button onClick={() => download(docVentaDoc.dataUrl!, docVentaDoc.name!)} className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded border text-xs hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
                      <Download size={12} /> Descargar
                    </button>
                  )}
                  <input ref={docVentaRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={e => handleFileRead(e, setDocVentaDoc)} />
                </div>

                {/* Estado visible */}
                <div className="border rounded-lg p-4" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>ESTADO ACTUAL</div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${form.estado === "VALIDADA" ? "bg-green-100 text-green-700" : form.estado === "PENDIENTE_VALIDACION" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600"}`}>
                    {form.estado === "VALIDADA" ? "✓ Validada" : form.estado === "PENDIENTE_VALIDACION" ? "⏳ Pendiente Validación" : "Borrador"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-sm border bg-card hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={() => handleSave(false)} className="px-4 py-2 rounded text-sm font-medium text-white bg-slate-700 hover:bg-slate-800">
                Guardar (Borrador)
              </button>
              {form.estado !== "VALIDADA" && (
                <button onClick={() => handleSave(true)} className="px-4 py-2 rounded text-sm font-medium text-white flex items-center gap-2" style={{ background: "hsl(var(--primary))" }}>
                  <Check size={15} /> Solicitar Verificación
                </button>
              )}
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
            <p className="text-sm mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
              Ingrese la clave de validación para confirmar esta venta.
            </p>
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
