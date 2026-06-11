import { useState, useEffect } from "react";
import { Lock, Plus, Trash2, TrendingUp, Car, DollarSign, BarChart2 } from "lucide-react";
import { useApp, Adquisicion } from "@/context/AppContext";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

const fmt = (n: number) => "$" + n.toLocaleString("es-CL");
const CLAVE_GERENCIA = "ankker2026$$";

const emptyAdq = (): Omit<Adquisicion, "id"> => ({
  empresa: "", tipoProcedencia: "", observaciones: "", patente: "", marca: "", modelo: "",
  anio: "", kilometraje: "", tipo: "", color: "", obsVehiculo: "", precioOriginal: 0,
  fechaCompra: "", gastosExtra: [], costoTotal: 0, precioSugerido: 0,
});

export default function Gerencia() {
  const { adquisiciones, addAdquisicion, vehiculos, ventas, usuarioActual } = useApp();
  // Solo master puede entrar a Gerencia sin clave; otros deben ingresarla
  const isMaster = usuarioActual?.rol === "master";
  const [unlocked, setUnlocked] = useState(isMaster);
  const [clave, setClave] = useState("");
  const [claveError, setClaveError] = useState("");
  const [tab, setTab] = useState<"ficha" | "inventario">("ficha");
  const [form, setForm] = useState<Omit<Adquisicion, "id">>(emptyAdq());
  const [nuevoGasto, setNuevoGasto] = useState({ descripcion: "", monto: 0 });

  useEffect(() => {
    if (isMaster && !unlocked) setUnlocked(true);
  }, [isMaster, unlocked]);

  const tryUnlock = () => {
    if (clave === CLAVE_GERENCIA) { setUnlocked(true); setClaveError(""); }
    else { setClaveError("Clave incorrecta"); }
  };

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="bg-card rounded-xl shadow-lg p-8 w-full max-w-sm border" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="flex items-center gap-2 mb-4" style={{ color: "hsl(var(--primary))" }}>
            <Lock size={22} />
            <h2 className="text-lg font-bold">Módulo Gerencia</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Ingrese la clave de acceso para continuar.</p>
          <input type="password" className="w-full border rounded px-3 py-2 text-sm bg-background mb-2"
            style={{ borderColor: claveError ? "#ef4444" : "hsl(var(--border))" }}
            placeholder="Clave de gerencia" value={clave}
            onChange={e => { setClave(e.target.value); setClaveError(""); }}
            onKeyDown={e => e.key === "Enter" && tryUnlock()} autoFocus />
          {claveError && <p className="text-xs text-red-500 mb-3">{claveError}</p>}
          <button onClick={tryUnlock} className="w-full py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Ingresar</button>
        </div>
      </div>
    );
  }

  const calcCostoTotal = (precioBase: number, gastos: { monto: number }[]) =>
    precioBase + gastos.reduce((s, g) => s + g.monto, 0);

  const updatePrecio = (val: number) => {
    const ct = calcCostoTotal(val, form.gastosExtra);
    const sugerido = ct + 850000;
    setForm(f => ({ ...f, precioOriginal: val, costoTotal: ct, precioSugerido: sugerido }));
  };

  const addGasto = () => {
    if (!nuevoGasto.descripcion.trim() || !nuevoGasto.monto) return;
    const newGastos = [...form.gastosExtra, { ...nuevoGasto }];
    const ct = calcCostoTotal(form.precioOriginal, newGastos);
    setForm(f => ({ ...f, gastosExtra: newGastos, costoTotal: ct, precioSugerido: ct + 850000 }));
    setNuevoGasto({ descripcion: "", monto: 0 });
  };

  const removeGasto = (i: number) => {
    const newGastos = form.gastosExtra.filter((_, idx) => idx !== i);
    const ct = calcCostoTotal(form.precioOriginal, newGastos);
    setForm(f => ({ ...f, gastosExtra: newGastos, costoTotal: ct, precioSugerido: ct + 850000 }));
  };

  const guardarCompra = async () => {
    if (!form.patente || !form.marca) return alert("Patente y Marca son requeridos.");
    // Persistir en DB (antes solo quedaba en memoria y se perdia al recargar)
    const saved = await addAdquisicion(form);
    if (saved) setForm(emptyAdq());
  };

  // KPI data
  const inversionTotal = adquisiciones.reduce((s, a) => s + a.costoTotal, 0);
  const unidadesStock = vehiculos.filter(v => v.estado === "DISPONIBLE").length;
  const costoPromedio = adquisiciones.length > 0 ? inversionTotal / adquisiciones.length : 0;
  const margenProyectado = adquisiciones.reduce((s, a) => s + (a.precioSugerido - a.costoTotal), 0);

  const chartData = adquisiciones.slice(-6).map((a, i) => ({
    mes: a.fechaCompra || `Compra ${i + 1}`,
    Compras: a.costoTotal,
    Ventas: ventas[i]?.precioVenta || 0,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Módulo Gerencia</h1>
          <p className="page-subtitle">Gestión de Adquisiciones, Rentabilidad e Inventario</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {[{ key: "ficha" as const, label: "1. Ficha de Ingreso" }, { key: "inventario" as const, label: "2. Inventario y KPIs" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${tab === t.key ? "text-white" : "border hover:bg-muted"}`}
            style={tab === t.key ? { background: "hsl(var(--primary))" } : { borderColor: "hsl(var(--border))" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ficha" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Registrar Nueva Adquisición</h2>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Complete los datos de procedencia y costos reales</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setForm(emptyAdq())} className="px-4 py-2 rounded text-sm border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Limpiar</button>
              <button onClick={guardarCompra} className="px-4 py-2 rounded text-sm font-medium text-white flex items-center gap-2" style={{ background: "hsl(var(--primary))" }}>
                ✓ Guardar Compra
              </button>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="border rounded-lg p-5" style={{ borderColor: "hsl(var(--border))" }}>
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>
                  <Car size={16} /> Procedencia del Vehículo
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs font-medium mb-1">Empresa / Nombre *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="Ej: Renttmontt SPA..." value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))} /></div>
                  <div><label className="block text-xs font-medium mb-1">Tipo Procedencia</label>
                    <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={form.tipoProcedencia} onChange={e => setForm(f => ({ ...f, tipoProcedencia: e.target.value }))}>
                      <option value="">Seleccionar</option>
                      <option>Compraventa</option>
                      <option>Consignación</option>
                      <option>Subasta</option>
                      <option>Permuta</option>
                      <option>Importación</option>
                    </select></div>
                  <div><label className="block text-xs font-medium mb-1">Observaciones</label>
                    <textarea rows={3} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                      value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
                </div>
              </div>

              <div className="border rounded-lg p-5" style={{ borderColor: "hsl(var(--border))" }}>
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>
                  <Car size={16} /> Identificación del Vehículo
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs font-medium mb-1">Patente *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background font-mono text-center tracking-widest" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="AB · CD · 12" value={form.patente} onChange={e => setForm(f => ({ ...f, patente: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium mb-1">Marca *</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} /></div>
                    <div><label className="block text-xs font-medium mb-1">Modelo</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} /></div>
                    <div><label className="block text-xs font-medium mb-1">Año</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={form.anio} onChange={e => setForm(f => ({ ...f, anio: e.target.value }))} /></div>
                    <div><label className="block text-xs font-medium mb-1">Kilometraje</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={form.kilometraje} onChange={e => setForm(f => ({ ...f, kilometraje: e.target.value }))} /></div>
                    <div><label className="block text-xs font-medium mb-1">Tipo</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                        <option value="">Seleccionar</option>
                        {["AUTOMOVIL","SUV","PICKUP","FURGON","CAMION","MOTO"].map(o => <option key={o}>{o}</option>)}
                      </select></div>
                    <div><label className="block text-xs font-medium mb-1">Color</label>
                      <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></div>
                  </div>
                  <div><label className="block text-xs font-medium mb-1">Observaciones Vehículo</label>
                    <textarea rows={2} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                      value={form.obsVehiculo} onChange={e => setForm(f => ({ ...f, obsVehiculo: e.target.value }))} /></div>
                </div>
              </div>
            </div>

            <div className="w-80">
              <div className="border-2 rounded-lg p-5" style={{ borderColor: "hsl(var(--primary))" }}>
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold" style={{ color: "#f59e0b" }}>
                  <DollarSign size={16} /> Finanzas y Gastos Reales
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs font-medium mb-1">PRECIO ORIGINAL *</label>
                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>$</span>
                      <input type="number" className="w-full border rounded pl-8 pr-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={form.precioOriginal || ""} onChange={e => updatePrecio(Number(e.target.value))} /></div></div>
                  <div><label className="block text-xs font-medium mb-1">FECHA COMPRA *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="DD-MM-YYYY" value={form.fechaCompra} onChange={e => setForm(f => ({ ...f, fechaCompra: e.target.value }))} /></div>

                  <div className="border rounded-lg p-3" style={{ borderColor: "hsl(var(--border))", borderStyle: "dashed" }}>
                    <p className="text-xs font-semibold mb-2">Gastos Asociados Individuales</p>
                    <div className="flex gap-2 mb-2">
                      <input className="flex-1 border rounded px-2 py-1 text-xs bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="Descripción" value={nuevoGasto.descripcion}
                        onChange={e => setNuevoGasto(g => ({ ...g, descripcion: e.target.value }))} />
                      <input type="number" className="w-20 border rounded px-2 py-1 text-xs bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        placeholder="Monto" value={nuevoGasto.monto || ""}
                        onChange={e => setNuevoGasto(g => ({ ...g, monto: Number(e.target.value) }))} />
                      <button onClick={addGasto} className="px-2 py-1 rounded text-xs font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
                        <Plus size={12} />
                      </button>
                    </div>
                    {form.gastosExtra.map((g, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b" style={{ borderColor: "hsl(var(--border))" }}>
                        <span>{g.descripcion}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-red-500">{fmt(g.monto)}</span>
                          <button onClick={() => removeGasto(i)}><Trash2 size={11} className="text-destructive" /></button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs mt-2 font-semibold">
                      <span>Subtotal Gastos</span>
                      <span>{fmt(form.gastosExtra.reduce((s, g) => s + g.monto, 0))}</span>
                    </div>
                  </div>

                  <div className="rounded-lg p-3 border" style={{ background: "hsl(var(--muted))", borderColor: "hsl(var(--border))" }}>
                    <p className="text-xs font-medium mb-1">Costo Total Real de Adquisición</p>
                    <p className="text-lg font-bold" style={{ color: "hsl(var(--primary))" }}>{fmt(form.costoTotal)}</p>
                  </div>
                  <div className="rounded-lg p-3 border-2" style={{ borderColor: "hsl(var(--primary))" }}>
                    <p className="text-xs font-medium mb-1">Precio Piso Comercial Sugerido</p>
                    <p className="text-lg font-bold" style={{ color: "hsl(var(--primary))" }}>{fmt(form.precioSugerido)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "inventario" && (
        <div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Inversión Stock Activo", value: fmt(inversionTotal), icon: <DollarSign size={18} />, color: "from-purple-600 to-blue-600" },
              { label: "Unidades en Stock", value: `${unidadesStock} vehículos`, icon: <Car size={18} />, color: "from-blue-500 to-blue-700" },
              { label: "Costo Promedio (Un.)", value: fmt(costoPromedio), icon: <BarChart2 size={18} />, color: "from-teal-500 to-emerald-600" },
              { label: "Margen Proyectado Piso", value: fmt(margenProyectado), icon: <TrendingUp size={18} />, color: "from-emerald-500 to-green-700" },
            ].map(kpi => (
              <div key={kpi.label} className={`rounded-lg p-4 bg-gradient-to-br ${kpi.color} text-white`}>
                <div className="flex items-center justify-between mb-2 opacity-70">{kpi.icon}</div>
                <p className="text-xs opacity-80 mb-1">{kpi.label}</p>
                <p className="text-xl font-bold">{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-lg border p-5 mb-4" style={{ borderColor: "hsl(var(--border))" }}>
            <p className="text-sm font-semibold mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>Flujo Financiero (M$): Compras vs Ventas</p>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: number) => fmt(val)} />
                  <Legend />
                  <Line type="monotone" dataKey="Ventas" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Compras" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>
                <TrendingUp size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Registre adquisiciones para ver el gráfico</p>
              </div>
            )}
          </div>

          <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="px-4 py-3 border-b font-semibold text-sm" style={{ borderColor: "hsl(var(--border))" }}>Detalle Descriptivo de Compras</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase" style={{ background: "hsl(220,25%,10%)", color: "#fff" }}>
                  {["Fecha Compra","Procedencia","Patente","Vehículo","Costo Base","Gastos Extra","Total Final","Precio Piso"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adquisiciones.map(a => (
                  <tr key={a.id} className="border-b table-row-hover" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="px-4 py-3">{a.fechaCompra}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.empresa}</p>
                      <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{a.tipoProcedencia}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold">{a.patente}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.marca} {a.modelo}</p>
                      <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{a.anio} · {a.color}</p>
                    </td>
                    <td className="px-4 py-3">{fmt(a.precioOriginal)}</td>
                    <td className="px-4 py-3 text-red-500">{fmt(a.costoTotal - a.precioOriginal)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "hsl(var(--primary))" }}>{fmt(a.costoTotal)}</td>
                    <td className="px-4 py-3 font-semibold text-green-600">{fmt(a.precioSugerido)}</td>
                  </tr>
                ))}
                {adquisiciones.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>Sin adquisiciones registradas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
