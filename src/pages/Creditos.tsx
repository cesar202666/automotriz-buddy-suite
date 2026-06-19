import { useState, useEffect } from "react";
import { Plus, Search, ChevronDown, X } from "lucide-react";
import { NumberInput } from "@/components/NumberInput";

type EstadoSolicitud = "EN EVALUACIÓN" | "APROBADA" | "NEGOCIO CERRADO" | "SIN RESPUESTA" | "RECHAZADA";

interface Credito {
  id: string;
  financiera: string;
  cotizacion: string;
  descripcion: string;
  estado: EstadoSolicitud;
  tiempoRespuesta: string;
  comentario: string;
  // Oferta solicitud
  montoFinanciar: number;
  cuotas: string;
  valorCuota: number;
  tasaInteres: string;
  comision: number;
  // Cliente
  clienteId: string;
  clienteNombre: string;
  clienteDesc: string;
  rut: string;
  estadoCivil: string;
  fechaNacimiento: string;
  nombres: string;
  apellidos: string;
  direccion: string;
  ciudad: string;
  casaHabita: string;
  estudios: string;
  // Financiera
  precioVehiculo: number;
  montoPie: number;
  situacionLaboral: string;
  patrimonio: string;
  banco: string;
  antiguedad: string;
  tipoCredito: string;
  marcaVehiculo: string;
  modeloVehiculo: string;
  patenteVehiculo: string;
  anioVehiculo: string;
}

const FINANCIERAS = ["Falabella","Global","Autofin","Unidad"];
const ESTADOS: EstadoSolicitud[] = ["EN EVALUACIÓN","APROBADA","NEGOCIO CERRADO","SIN RESPUESTA","RECHAZADA"];
const CUOTAS = ["12","24","36","48","60","72","84"];
const ESTADOS_CIVILES = ["Soltero/a","Casado/a","Divorciado/a","Viudo/a","Conviviente civil"];
const SITUACIONES = ["Dependiente","Independiente","Jubilado/a","Sin actividad"];

const initialCreditos: Credito[] = [];

const emptyCredito = (): Partial<Credito> => ({
  financiera:"", cotizacion:"", descripcion:"", estado:"EN EVALUACIÓN", tiempoRespuesta:"", comentario:"",
  montoFinanciar:0, cuotas:"12", valorCuota:0, tasaInteres:"", comision:0,
  clienteId:"", clienteNombre:"", clienteDesc:"", rut:"", estadoCivil:"Soltero/a", fechaNacimiento:"",
  nombres:"", apellidos:"", direccion:"", ciudad:"", casaHabita:"", estudios:"",
  precioVehiculo:0, montoPie:0, situacionLaboral:"Dependiente", patrimonio:"", banco:"",
  antiguedad:"", tipoCredito:"", marcaVehiculo:"", modeloVehiculo:"", patenteVehiculo:"", anioVehiculo:""
});

const estadoBadge = (estado: EstadoSolicitud) => {
  if (estado === "APROBADA") return <span className="badge-success">{estado}</span>;
  if (estado === "NEGOCIO CERRADO") return <span style={{ background: "#10b981", color: "white" }} className="text-xs font-semibold px-2 py-0.5 rounded-full">{estado}</span>;
  if (estado === "SIN RESPUESTA") return <span className="badge-destructive">{estado}</span>;
  if (estado === "RECHAZADA") return <span className="badge-destructive">{estado}</span>;
  return <span className="badge-warning">{estado}</span>;
};

export default function Creditos() {
  const [creditos, setCreditos] = useState<Credito[]>(initialCreditos);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("Todos");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Credito>>(emptyCredito());
  const [section, setSection] = useState<"oferta"|"cotizante"|"financiera">("oferta");

  const filtered = creditos.filter(c => {
    const matchFiltro = filtro === "Todos" || c.estado === filtro;
    const matchSearch = `${c.financiera} ${c.cotizacion}`.toLowerCase().includes(search.toLowerCase());
    return matchFiltro && matchSearch;
  });

  // Render por tramos: primeros 20 + "Cargar mas".
  const PAGE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [filtro, search]);
  const visibles = filtered.slice(0, visibleCount);

  const openCreate = () => { setForm(emptyCredito()); setEditId(null); setSection("oferta"); setShowModal(true); };
  const openEdit = (c: Credito) => { setForm({ ...c }); setEditId(c.id); setSection("oferta"); setShowModal(true); };

  const handleSave = () => {
    if (!form.cotizacion?.trim()) return alert("La cotización es requerida.");
    if (editId) {
      setCreditos(creditos.map(c => c.id === editId ? { ...c, ...form } as Credito : c));
    } else {
      setCreditos([...creditos, { id: String(Date.now()), ...form } as Credito]);
    }
    setShowModal(false);
  };

  const f = form as Credito;
  const setF = (p: Partial<Credito>) => setForm(prev => ({ ...prev, ...p }));

  const Field = ({ label, field, type = "text", placeholder = "" }: { label: string; field: keyof Credito; type?: string; placeholder?: string }) => {
    if (type === "number") {
      return (
        <div>
          <label className="block text-xs font-medium mb-1">{label}</label>
          <NumberInput
            value={Number(f[field] ?? 0)}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(n) => setF({ [field]: n } as any)}
            currency
            placeholder={placeholder || "Ej: 10.500.000"}
          />
        </div>
      );
    }
    return (
      <div>
        <label className="block text-xs font-medium mb-1">{label}</label>
        <input type={type} className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          placeholder={placeholder} value={String(f[field] ?? "")} onChange={e => setF({ [field]: e.target.value } as any)} />
      </div>
    );
  };

  const SECTIONS = [
    { key: "oferta", label: "Oferta Solicitud" },
    { key: "cotizante", label: "Información Cotizante" },
    { key: "financiera", label: "Información Financiera" },
  ] as const;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Créditos</h1>
          <p className="page-subtitle">{creditos.length} solicitudes registradas</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
          <Plus size={16} /> Crear Crédito
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <select className="border rounded px-3 py-2 text-sm bg-card" style={{ borderColor: "hsl(var(--border))" }}
          value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option>Todos</option>
          {ESTADOS.map(e => <option key={e}>{e}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
          <input className="pl-9 pr-3 py-2 border rounded text-sm bg-card" style={{ borderColor: "hsl(var(--border))" }}
            placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto" style={{ borderColor: "hsl(var(--border))" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <th className="w-8 px-4 py-3"></th>
              <th className="px-4 py-3 text-left font-semibold">Financiera</th>
              <th className="px-4 py-3 text-left font-semibold">Cotización</th>
              <th className="px-4 py-3 text-left font-semibold">Descripción</th>
              <th className="px-4 py-3 text-left font-semibold">Estado de Solicitud</th>
              <th className="px-4 py-3 text-left font-semibold">Tiempo de respuesta</th>
              <th className="px-4 py-3 text-left font-semibold">Comentario</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(c => (
              <tr key={c.id} className="table-row-hover border-b cursor-pointer" style={{ borderColor: "hsl(var(--border))" }} onClick={() => openEdit(c)}>
                <td className="px-4 py-3"><input type="checkbox" className="w-4 h-4" onClick={e => e.stopPropagation()} /></td>
                <td className="px-4 py-3 font-medium" style={{ color: "hsl(var(--primary))" }}>{c.financiera}</td>
                <td className="px-4 py-3">{c.cotizacion}</td>
                <td className="px-4 py-3 max-w-xs truncate" style={{ color: "hsl(var(--muted-foreground))" }}>{c.descripcion || "—"}</td>
                <td className="px-4 py-3">{estadoBadge(c.estado)}</td>
                <td className="px-4 py-3" style={{ color: "hsl(var(--muted-foreground))" }}>{c.tiempoRespuesta || "—"}</td>
                <td className="px-4 py-3" style={{ color: "hsl(var(--muted-foreground))" }}>{c.comentario || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay créditos</td></tr>
            )}
          </tbody>
        </table>
        {visibleCount < filtered.length && (
          <div className="flex items-center justify-center gap-3 py-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
            <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Mostrando {visibles.length} de {filtered.length}</span>
            <button onClick={() => setVisibleCount(c => c + 40)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>Cargar más</button>
            <button onClick={() => setVisibleCount(filtered.length)} className="px-3 py-2 rounded-lg text-sm font-medium border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Ver todos</button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-3">
                <button onClick={handleSave} className="px-4 py-1.5 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Guardar</button>
                <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded text-sm border bg-card hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              </div>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-6">
              {/* Oferta Solicitud */}
              <div>
                <div className="section-divider">OFERTA SOLICITUD</div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Financiera</label>
                    <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={f.financiera || ""} onChange={e => setF({ financiera: e.target.value })}>
                      <option value="">Seleccionar</option>
                      {FINANCIERAS.map(fin => <option key={fin}>{fin}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Estado de Solicitud</label>
                    <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={f.estado || "EN EVALUACIÓN"} onChange={e => setF({ estado: e.target.value as EstadoSolicitud })}>
                      {ESTADOS.map(e => <option key={e}>{e}</option>)}
                    </select>
                  </div>
                  <Field label="Tiempo de respuesta" field="tiempoRespuesta" placeholder="—" />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Monto a Financiar" field="montoFinanciar" type="number" />
                  <div>
                    <label className="block text-xs font-medium mb-1">Cuotas</label>
                    <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={f.cuotas || "12"} onChange={e => setF({ cuotas: e.target.value })}>
                      {CUOTAS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <Field label="Valor Cuota" field="valorCuota" type="number" />
                  <Field label="Tasa de Interés" field="tasaInteres" placeholder="%" />
                  <Field label="Comisión" field="comision" type="number" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Comentario</label>
                  <textarea rows={2} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                    value={f.comentario || ""} onChange={e => setF({ comentario: e.target.value })} />
                </div>
              </div>

              {/* Información Cotizante */}
              <div>
                <div className="section-divider">INFORMACIÓN COTIZANTE</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Cliente *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="Ingrese nombre del cliente" value={f.cotizacion || ""} onChange={e => setF({ cotizacion: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Descripción</label>
                    <textarea rows={2} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                      value={f.clienteDesc || ""} onChange={e => setF({ clienteDesc: e.target.value })} />
                  </div>
                  <Field label="RUT" field="rut" placeholder="12.345.678-9" />
                  <div>
                    <label className="block text-xs font-medium mb-1">Estado Civil</label>
                    <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={f.estadoCivil || ""} onChange={e => setF({ estadoCivil: e.target.value })}>
                      {ESTADOS_CIVILES.map(e => <option key={e}>{e}</option>)}
                    </select>
                  </div>
                  <Field label="Fecha de Nacimiento" field="fechaNacimiento" placeholder="DD/MM/AAAA" />
                  <Field label="Nombre" field="nombres" />
                  <Field label="Apellidos" field="apellidos" />
                  <Field label="Dirección" field="direccion" />
                  <Field label="Ciudad" field="ciudad" />
                  <Field label="Casa que habita" field="casaHabita" placeholder="Arrendada / Propia" />
                  <Field label="Estudios" field="estudios" placeholder="Universitario / Técnico..." />
                </div>
              </div>

              {/* Información Financiera */}
              <div>
                <div className="section-divider">INFORMACIÓN FINANCIERA</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Precio Vehículo" field="precioVehiculo" type="number" />
                  <Field label="Monto Pie" field="montoPie" type="number" />
                  <div>
                    <label className="block text-xs font-medium mb-1">Situación Laboral</label>
                    <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={f.situacionLaboral || ""} onChange={e => setF({ situacionLaboral: e.target.value })}>
                      {SITUACIONES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <Field label="Patrimonio" field="patrimonio" />
                  <Field label="Banco" field="banco" />
                  <Field label="Antigüedad de la cuenta" field="antiguedad" />
                  <Field label="Tipo" field="tipoCredito" />
                  <Field label="Marca" field="marcaVehiculo" />
                  <Field label="Modelo" field="modeloVehiculo" />
                  <Field label="Patente" field="patenteVehiculo" />
                  <Field label="Año" field="anioVehiculo" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
