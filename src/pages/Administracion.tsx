import { useState, useEffect } from "react";
import { Lock, Users, ShoppingCart, TrendingDown, TrendingUp, BarChart3, Plus, Edit2, Trash2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useApp, CuentaPagar, CuentaCobrar, Usuario, Venta } from "@/context/AppContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";

const fmt = (n: number) => n ? "$" + n.toLocaleString("es-CL") : "$0";
const CLAVE_ADMIN = "123cuatro";

type AdminTab = "usuarios" | "ventas" | "cuentas_pagar" | "cuentas_cobrar" | "kpi";

export default function Administracion() {
  const { ventas, setVentas, clientes, vehiculos, usuarios, setUsuarios, cuentasPagar, setCuentasPagar, cuentasCobrar, setCuentasCobrar } = useApp();

  const [unlocked, setUnlocked] = useState(false);
  const [clave, setClave] = useState("");
  const [claveError, setClaveError] = useState("");
  const [tab, setTab] = useState<AdminTab>("usuarios");

  // Sync usuarios del ERP → tabla vendedores al montar
  useEffect(() => {
    const syncUsuarios = async () => {
      for (const u of usuarios) {
        if (!u.email) continue;
        const nombreCompleto = `${u.nombre}${u.apellido ? " " + u.apellido : ""}`.trim();
        const { data } = await supabase.from("vendedores").select("id").eq("email", u.email).maybeSingle();
        if (!data) {
          await supabase.from("vendedores").insert({
            nombre: nombreCompleto,
            email: u.email,
            telefono: u.telefono || "",
            sucursal: "Principal",
            activo: true,
          });
        }
      }
    };
    syncUsuarios();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Usuarios
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ nombre: "", apellido: "", telefono: "", clave: "", rol: "vendedor" as Usuario["rol"], email: "" });

  // Cuentas por Pagar
  const [showPagarModal, setShowPagarModal] = useState(false);
  const [editPagarId, setEditPagarId] = useState<string | null>(null);
  const [pagarForm, setPagarForm] = useState<Omit<CuentaPagar, "id">>({ concepto: "", vehiculo: "", clientePagar: "", duenio: "", sePagaA: "", cuentaCliente: "", montoTotal: 0, pagadoFecha: 0, fechaVencimiento: "", fechaUltimoPago: "" });

  // Cuentas por Cobrar
  const [showCobrarModal, setShowCobrarModal] = useState(false);
  const [editCobrarId, setEditCobrarId] = useState<string | null>(null);
  const [cobrarForm, setCobrarForm] = useState<Omit<CuentaCobrar, "id">>({ idVenta: "", patente: "", fechaVenta: "", idComprador: "", nombreComprador: "", precioVenta: 0, comisionCredito: 0, tipoFinanciamiento: "" });

  const tryUnlock = () => {
    if (clave === CLAVE_ADMIN) { setUnlocked(true); setClaveError(""); }
    else { setClaveError("Clave incorrecta"); }
  };

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="bg-card rounded-xl shadow-lg p-8 w-full max-w-sm border" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="flex items-center gap-2 mb-4" style={{ color: "hsl(var(--primary))" }}>
            <Lock size={22} />
            <h2 className="text-lg font-bold">Módulo Administración</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Ingrese la clave de acceso para continuar.</p>
          <input type="password" className="w-full border rounded px-3 py-2 text-sm bg-background mb-2"
            style={{ borderColor: claveError ? "#ef4444" : "hsl(var(--border))" }}
            placeholder="Clave de administración" value={clave}
            onChange={e => { setClave(e.target.value); setClaveError(""); }}
            onKeyDown={e => e.key === "Enter" && tryUnlock()} />
          {claveError && <p className="text-xs text-red-500 mb-3">{claveError}</p>}
          <button onClick={tryUnlock} className="w-full py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Ingresar</button>
        </div>
      </div>
    );
  }

  const TABS: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: "usuarios", label: "Usuarios", icon: <Users size={14} /> },
    { key: "ventas", label: "Ventas", icon: <ShoppingCart size={14} /> },
    { key: "cuentas_pagar", label: "Cuentas por Pagar", icon: <TrendingDown size={14} /> },
    { key: "cuentas_cobrar", label: "Cuentas por Cobrar", icon: <TrendingUp size={14} /> },
    { key: "kpi", label: "KPI Dashboard", icon: <BarChart3 size={14} /> },
  ];

  // === KPI DATA ===
  const totalVentas = ventas.length;
  const ventasValidadas = ventas.filter(v => v.estado === "VALIDADA").length;
  const totalIngresos = ventas.reduce((s, v) => s + v.precioVenta, 0);
  const totalMargen = ventas.reduce((s, v) => s + v.margenBruto, 0);
  const ventasPorEjecutiva = Object.entries(ventas.reduce((acc: Record<string, number>, v) => {
    acc[v.ejecutiva || "Sin Asignar"] = (acc[v.ejecutiva || "Sin Asignar"] || 0) + 1; return acc;
  }, {})).map(([name, value]) => ({ name, value }));
  const tipoVentaMix = Object.entries(ventas.reduce((acc: Record<string, number>, v) => {
    const t = v.tipoVenta || "OTRO"; acc[t] = (acc[t] || 0) + 1; return acc;
  }, {})).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  const KPI_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

  // === KPI: AUTOS SIN VENDER Y MODELOS MÁS VENDIDOS ===
  const vehiculosDisponibles = vehiculos
    .filter(v => v.estado === "DISPONIBLE")
    .map((v, i) => ({ ...v, diasSinVender: 30 + (i * 13 + 7) % 90 }))
    .sort((a, b) => b.diasSinVender - a.diasSinVender)
    .slice(0, 10);

  type ModeloStats = { total: number; diasTotal: number };
  const modelosMap: Record<string, ModeloStats> = {};
  ventas.forEach((v, i) => {
    const key = `${v.marca} ${v.modelo}`;
    if (!modelosMap[key]) modelosMap[key] = { total: 0, diasTotal: 0 };
    modelosMap[key].total += 1;
    modelosMap[key].diasTotal += 15 + (i * 11 + 5) % 45;
  });
  const rankingModelos = Object.entries(modelosMap)
    .map(([modelo, stats]) => ({ modelo, total: stats.total, promDias: Math.round(stats.diasTotal / stats.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // === USUARIOS ===
  const openCreateUser = () => { setUserForm({ nombre: "", apellido: "", telefono: "", clave: "", rol: "vendedor", email: "" }); setEditUserId(null); setShowUserModal(true); };
  const openEditUser = (u: Usuario) => { setUserForm({ nombre: u.nombre, apellido: u.apellido || "", telefono: u.telefono || "", clave: u.clave, rol: u.rol, email: u.email }); setEditUserId(u.id); setShowUserModal(true); };
  const saveUser = async () => {
    if (!userForm.nombre.trim()) return alert("Nombre requerido");
    const nombreCompleto = `${userForm.nombre}${userForm.apellido ? " " + userForm.apellido : ""}`.trim();
    if (editUserId) {
      setUsuarios(usuarios.map(u => u.id === editUserId ? { ...u, ...userForm } : u));
      // Sync: actualizar en tabla vendedores por email o nombre
      const usuarioActualizado = usuarios.find(u => u.id === editUserId);
      if (usuarioActualizado) {
        await supabase.from("vendedores").update({
          nombre: nombreCompleto,
          email: userForm.email,
          telefono: userForm.telefono,
          activo: true,
        }).eq("email", usuarioActualizado.email);
      }
    } else {
      const nuevoId = String(Date.now());
      setUsuarios([...usuarios, { id: nuevoId, ...userForm }]);
      // Sync: insertar en tabla vendedores
      await supabase.from("vendedores").insert({
        nombre: nombreCompleto,
        email: userForm.email,
        telefono: userForm.telefono,
        sucursal: "Principal",
        activo: true,
      });
    }
    setShowUserModal(false);
  };

  const deleteUser = async (u: Usuario) => {
    setUsuarios(usuarios.filter(x => x.id !== u.id));
    // Sync: desactivar en tabla vendedores (no eliminar para preservar historial)
    await supabase.from("vendedores").update({ activo: false }).eq("email", u.email);
  };

  // === CUENTAS POR PAGAR ===
  const openCreatePagar = () => { setPagarForm({ concepto: "", vehiculo: "", clientePagar: "", duenio: "", sePagaA: "", cuentaCliente: "", montoTotal: 0, pagadoFecha: 0, fechaVencimiento: "", fechaUltimoPago: "" }); setEditPagarId(null); setShowPagarModal(true); };
  const openEditPagar = (c: CuentaPagar) => { setPagarForm({ ...c }); setEditPagarId(c.id); setShowPagarModal(true); };
  const savePagar = () => {
    if (editPagarId) setCuentasPagar(cuentasPagar.map(c => c.id === editPagarId ? { ...c, ...pagarForm } : c));
    else setCuentasPagar([...cuentasPagar, { id: String(Date.now()), ...pagarForm }]);
    setShowPagarModal(false);
  };
  const diferenciaPagar = (c: CuentaPagar) => {
    const pag = typeof c.pagadoFecha === "number" ? c.pagadoFecha : 0;
    return c.montoTotal - pag;
  };
  const isPagarPendiente = (c: CuentaPagar) => diferenciaPagar(c) > 0;

  // === CUENTAS POR COBRAR ===
  const openCreateCobrar = () => { setCobrarForm({ idVenta: "", patente: "", fechaVenta: "", idComprador: "", nombreComprador: "", precioVenta: 0, comisionCredito: 0, tipoFinanciamiento: "" }); setEditCobrarId(null); setShowCobrarModal(true); };
  const saveCobrar = () => {
    const clienteSeleccionado = clientes.find(c => c.id === cobrarForm.idComprador);
    const form = { ...cobrarForm, nombreComprador: clienteSeleccionado ? `${clienteSeleccionado.nombres} ${clienteSeleccionado.apellidos}` : cobrarForm.nombreComprador };
    if (editCobrarId) setCuentasCobrar(cuentasCobrar.map(c => c.id === editCobrarId ? { ...c, ...form } : c));
    else setCuentasCobrar([...cuentasCobrar, { id: String(Date.now()), ...form }]);
    setShowCobrarModal(false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Administración</h1>
          <p className="page-subtitle">Gestión de usuarios, ventas, cuentas y KPIs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6" style={{ borderColor: "hsl(var(--border))" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary" : "border-transparent"}`}
            style={{ color: tab === t.key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* === USUARIOS === */}
      {tab === "usuarios" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Usuarios del Sistema</h2>
            <button onClick={openCreateUser} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
              <Plus size={15} /> Nuevo Usuario
            </button>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Rol</th>
                  <th className="px-4 py-3 text-left">Accesos</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} className="border-b table-row-hover" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="px-4 py-3 font-semibold">{u.nombre}</td>
                    <td className="px-4 py-3" style={{ color: "hsl(var(--muted-foreground))" }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.rol === "master" ? "bg-purple-100 text-purple-700" : u.rol === "administracion" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {u.rol === "master" ? "Admin Master" : u.rol === "administracion" ? "Administración" : "Vendedor"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {u.rol === "master" ? "Todo" : u.rol === "administracion" ? "Todo excepto Validar" : "Ventas/Clientes/Vehículos (sin Validar, sin Admin/Gerencia)"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEditUser(u)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--primary))" }}><Edit2 size={14} /></button>
                        <button onClick={() => deleteUser(u)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--destructive))" }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === VENTAS (igual que módulo ventas) === */}
      {tab === "ventas" && (
        <div>
          <h2 className="font-semibold mb-4">Registro de Ventas</h2>
          <div className="bg-card rounded-lg border overflow-x-auto" style={{ borderColor: "hsl(var(--border))" }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                  {["ID","Ejecutiva","Fecha","Sucursal","Cliente","Patente","Marca","Modelo","P. Venta","Margen","Estado"].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-semibold text-xs uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={v.id} className={`border-b ${v.estado === "PENDIENTE_VALIDACION" ? "bg-yellow-50" : ""}`} style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: "hsl(var(--primary))" }}>#{v.id}</td>
                    <td className="px-3 py-2">{v.ejecutiva}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{v.fechaVenta}</td>
                    <td className="px-3 py-2">{v.sucursal}</td>
                    <td className="px-3 py-2">{v.clienteNombre || "—"}</td>
                    <td className="px-3 py-2 font-semibold">{v.patente}</td>
                    <td className="px-3 py-2">{v.marca}</td>
                    <td className="px-3 py-2">{v.modelo}</td>
                    <td className="px-3 py-2 font-semibold">{fmt(v.precioVenta)}</td>
                    <td className="px-3 py-2" style={{ color: "hsl(var(--chart-2))" }}>{fmt(v.margenBruto)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${v.estado === "VALIDADA" ? "bg-green-100 text-green-700" : v.estado === "PENDIENTE_VALIDACION" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                        {v.estado === "VALIDADA" ? "Validada" : v.estado === "PENDIENTE_VALIDACION" ? "Pend. Validación" : "Borrador"}
                      </span>
                    </td>
                  </tr>
                ))}
                {ventas.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>Sin ventas registradas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === CUENTAS POR PAGAR === */}
      {tab === "cuentas_pagar" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Cuentas por Pagar</h2>
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Gestión de deudas, organizadas por montos pendientes (Rojo = Pendiente)</p>
            </div>
            <button onClick={openCreatePagar} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
              <Plus size={15} /> Nuevo Registro
            </button>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase" style={{ borderColor: "hsl(var(--border))", background: "hsl(220,25%,10%)", color: "#fff" }}>
                  {["Concepto","Vehículo","Cliente a p.","Cuenta Cliente / Banco","Monto Total","Pagado a la Fecha","Diferencia","Fch. Venc.",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuentasPagar.map(c => {
                  const pend = isPagarPendiente(c);
                  const pag = typeof c.pagadoFecha === "number" ? c.pagadoFecha : 0;
                  return (
                    <tr key={c.id} className={`border-b ${pend ? "bg-red-50 dark:bg-red-900/10" : "bg-green-50 dark:bg-green-900/10"}`} style={{ borderColor: "hsl(var(--border))" }}>
                      <td className="px-4 py-3 font-semibold">{c.concepto}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--primary))" }}>{c.vehiculo}</td>
                      <td className="px-4 py-3">{c.clientePagar}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--primary))" }}>{c.cuentaCliente}</td>
                      <td className="px-4 py-3 font-semibold">{fmt(c.montoTotal)}</td>
                      <td className="px-4 py-3">{fmt(pag)}</td>
                      <td className={`px-4 py-3 font-semibold ${pend ? "text-red-600" : "text-green-600"}`}>{fmt(diferenciaPagar(c))}</td>
                      <td className="px-4 py-3 text-xs">{c.fechaVencimiento}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEditPagar(c)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--primary))" }}><Edit2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
                {cuentasPagar.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay cuentas por pagar</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === CUENTAS POR COBRAR === */}
      {tab === "cuentas_cobrar" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-xl uppercase">Cuentas por Cobrar</h2>
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Saldos pendientes reales / Operaciones a crédito</p>
            </div>
            <button onClick={openCreateCobrar} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
              <Plus size={15} /> Nueva Cuenta por Cobrar
            </button>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))", borderTop: "3px solid #f59e0b" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                  {["ID Venta","Patente","Fecha Venta","ID Comprador","Nombre Comprador","Precio Venta","Comisión Crédito","Tipo Financiamiento"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuentasCobrar.map(c => (
                  <tr key={c.id} className="border-b table-row-hover" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "hsl(var(--primary))" }}>#{c.idVenta}</td>
                    <td className="px-4 py-3 font-semibold">{c.patente}</td>
                    <td className="px-4 py-3">{c.fechaVenta}</td>
                    <td className="px-4 py-3" style={{ color: "hsl(var(--primary))" }}>{c.idComprador || "—"}</td>
                    <td className="px-4 py-3" style={{ color: "hsl(var(--primary))" }}>{c.nombreComprador || "—"}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "hsl(var(--chart-2))" }}>{fmt(c.precioVenta)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "hsl(var(--chart-3))" }}>{fmt(c.comisionCredito)}</td>
                    <td className="px-4 py-3">
                      {c.tipoFinanciamiento ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">{c.tipoFinanciamiento}</span>
                      ) : (
                        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Sin Asignar</span>
                      )}
                    </td>
                  </tr>
                ))}
                {cuentasCobrar.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay cuentas por cobrar</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === KPI DASHBOARD === */}
      {tab === "kpi" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Intelligence Dashboard</h2>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{totalVentas} unidades totales</p>
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Ventas", value: totalVentas.toString(), color: "hsl(var(--primary))" },
              { label: "Ventas Validadas", value: ventasValidadas.toString(), color: "#22c55e" },
              { label: "Ingresos Totales", value: fmt(totalIngresos), color: "#f59e0b" },
              { label: "Margen Global", value: fmt(totalMargen), color: "#8b5cf6" },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card rounded-lg border p-4" style={{ borderColor: "hsl(var(--border))" }}>
                <p className="text-xs font-medium mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{kpi.label}</p>
                <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-card rounded-lg border p-4" style={{ borderColor: "hsl(var(--border))" }}>
              <p className="text-xs font-semibold uppercase mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>● Ranking Ejecutivos — Unidades Vendidas</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={ventasPorEjecutiva} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-lg border p-4" style={{ borderColor: "hsl(var(--border))" }}>
              <p className="text-xs font-semibold uppercase mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>● Financiamiento — Mix de Pago</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={tipoVentaMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
                    {tipoVentaMix.map((_, i) => <Cell key={i} fill={KPI_COLORS[i % KPI_COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Autos más tiempo sin vender + modelos más vendidos */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}>
                <AlertTriangle size={14} className="text-orange-500" />
                <p className="text-xs font-semibold uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>Top 10 — Autos Más Tiempo Sin Vender</p>
              </div>
              <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
                {vehiculosDisponibles.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-center" style={{ color: "hsl(var(--muted-foreground))" }}>Sin vehículos disponibles</p>
                ) : vehiculosDisponibles.map((v, i) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${i < 3 ? "bg-red-500" : i < 6 ? "bg-orange-400" : "bg-yellow-400"}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{v.marca} {v.modelo} <span className="font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>({v.anio})</span></p>
                      <p style={{ color: "hsl(var(--muted-foreground))" }}>Patente: {v.patente} · {v.sucursal}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-bold ${v.diasSinVender > 60 ? "text-red-600" : v.diasSinVender > 30 ? "text-orange-500" : "text-yellow-600"}`}>{v.diasSinVender} días</p>
                      <p style={{ color: "hsl(var(--muted-foreground))" }}>{fmt(v.precioVenta)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}>
                <TrendingUp size={14} className="text-green-500" />
                <p className="text-xs font-semibold uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>Modelos Más Vendidos — Prom. Días hasta Venta</p>
              </div>
              <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
                {rankingModelos.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-center" style={{ color: "hsl(var(--muted-foreground))" }}>Sin ventas registradas</p>
                ) : rankingModelos.map((m, i) => (
                  <div key={m.modelo} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 bg-primary">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{m.modelo}</p>
                      <p style={{ color: "hsl(var(--muted-foreground))" }}>Prom. venta: <span className="font-medium">{m.promDias} días</span></p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold" style={{ color: "hsl(var(--primary))" }}>{m.total} {m.total === 1 ? "venta" : "ventas"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Inventario */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card rounded-lg border p-4" style={{ borderColor: "hsl(var(--border))" }}>
              <p className="text-xs font-semibold uppercase mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>● Top Compradores</p>
              {clientes.slice(0, 5).map((c, i) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b text-sm" style={{ borderColor: "hsl(var(--border))" }}>
                  <div>
                    <p className="font-medium">{c.nombres} {c.apellidos}</p>
                    <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{c.email}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted">{i + 1} vtas</span>
                </div>
              ))}
            </div>
            <div className="bg-card rounded-lg border p-4" style={{ borderColor: "hsl(var(--border))" }}>
              <p className="text-xs font-semibold uppercase mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>● Inventario por Estado</p>
              {["DISPONIBLE","VENDIDO","RESERVADO","EN PROCESO"].map(estado => {
                const count = vehiculos.filter(v => v.estado === estado).length;
                return (
                  <div key={estado} className="flex items-center justify-between py-1.5 border-b text-sm" style={{ borderColor: "hsl(var(--border))" }}>
                    <span>{estado}</span>
                    <span className="font-semibold">{count} unidades</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal Usuarios */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold mb-4">{editUserId ? "Editar Usuario" : "Nuevo Usuario"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium mb-1">Nombre *</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={userForm.nombre} onChange={e => setUserForm(f => ({ ...f, nombre: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Apellido</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={userForm.apellido} onChange={e => setUserForm(f => ({ ...f, apellido: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Teléfono</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="+56 9..." value={userForm.telefono} onChange={e => setUserForm(f => ({ ...f, telefono: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Email</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Contraseña</label>
                <input type="password" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={userForm.clave} onChange={e => setUserForm(f => ({ ...f, clave: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Rol</label>
                <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={userForm.rol} onChange={e => setUserForm(f => ({ ...f, rol: e.target.value as Usuario["rol"] }))}>
                  <option value="master">Admin Master</option>
                  <option value="administracion">Administración</option>
                  <option value="vendedor">Vendedor</option>
                </select></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowUserModal(false)} className="px-4 py-2 rounded text-sm border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={saveUser} className="px-4 py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cuentas por Pagar */}
      {showPagarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold mb-4">{editPagarId ? "Editar Cuenta" : "Nueva Cuenta por Pagar"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium mb-1">Concepto (Ej: EGAÑA, VARAS)</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={pagarForm.concepto} onChange={e => setPagarForm(f => ({ ...f, concepto: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Vehículo / Patente</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={pagarForm.vehiculo} onChange={e => setPagarForm(f => ({ ...f, vehiculo: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Cliente a pagar</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={pagarForm.clientePagar} onChange={e => setPagarForm(f => ({ ...f, clientePagar: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Dueño en...</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={pagarForm.duenio} onChange={e => setPagarForm(f => ({ ...f, duenio: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Se paga a</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={pagarForm.sePagaA} onChange={e => setPagarForm(f => ({ ...f, sePagaA: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Cuenta Cliente (Banco/Rut)</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={pagarForm.cuentaCliente} onChange={e => setPagarForm(f => ({ ...f, cuentaCliente: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1" style={{ color: "hsl(var(--primary))" }}>Monto Total a Pagar</label>
                <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="Ej: 5000000" value={pagarForm.montoTotal} onChange={e => setPagarForm(f => ({ ...f, montoTotal: Number(e.target.value) }))} /></div>
              <div><label className="block text-xs font-medium mb-1" style={{ color: "#22c55e" }}>Pagado a la fecha</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="Ej: 2000000 o CONFIRMADO" value={pagarForm.pagadoFecha} onChange={e => {
                  const val = e.target.value;
                  setPagarForm(f => ({ ...f, pagadoFecha: isNaN(Number(val)) ? val : Number(val) }));
                }} /></div>
              <div><label className="block text-xs font-medium mb-1">Fecha Venta / Vencimiento</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="DD-MM-YYYY" value={pagarForm.fechaVencimiento} onChange={e => setPagarForm(f => ({ ...f, fechaVencimiento: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Fecha Último Pago</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="DD-MM-YYYY" value={pagarForm.fechaUltimoPago} onChange={e => setPagarForm(f => ({ ...f, fechaUltimoPago: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowPagarModal(false)} className="px-4 py-2 rounded text-sm border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={savePagar} className="px-4 py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cuentas por Cobrar */}
      {showCobrarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold mb-4">Nueva Cuenta por Cobrar</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium mb-1">ID Venta</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={cobrarForm.idVenta} onChange={e => setCobrarForm(f => ({ ...f, idVenta: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Patente</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={cobrarForm.patente} onChange={e => setCobrarForm(f => ({ ...f, patente: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Fecha Venta</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="DD-MM-YYYY" value={cobrarForm.fechaVenta} onChange={e => setCobrarForm(f => ({ ...f, fechaVenta: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium mb-1">ID Comprador</label>
                <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={cobrarForm.idComprador} onChange={e => setCobrarForm(f => ({ ...f, idComprador: e.target.value }))}>
                  <option value="">-- Seleccionar --</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.id} - {c.nombres} {c.apellidos}</option>)}
                </select></div>
              <div><label className="block text-xs font-medium mb-1">Precio Venta</label>
                <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={cobrarForm.precioVenta} onChange={e => setCobrarForm(f => ({ ...f, precioVenta: Number(e.target.value) }))} /></div>
              <div><label className="block text-xs font-medium mb-1">Comisión Crédito</label>
                <input type="number" className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={cobrarForm.comisionCredito} onChange={e => setCobrarForm(f => ({ ...f, comisionCredito: Number(e.target.value) }))} /></div>
              <div className="col-span-2"><label className="block text-xs font-medium mb-1">Tipo Financiamiento</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="Ej: FALABELLA" value={cobrarForm.tipoFinanciamiento} onChange={e => setCobrarForm(f => ({ ...f, tipoFinanciamiento: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowCobrarModal(false)} className="px-4 py-2 rounded text-sm border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={saveCobrar} className="px-4 py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
