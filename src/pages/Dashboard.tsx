import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Car,
  Users,
  UserCheck,
  ShoppingCart,
  TrendingUp,
  Calendar,
  RefreshCw,
  DollarSign,
  Layers,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";

/** Normaliza nombre para comparación (sin tildes, minúsculas, trim). */
const normName = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// ─── Tipos y helpers ──────────────────────────────────────────

type FiltroPeriodo = "todos" | "este_mes" | "mes_anterior" | "ultimos_3" | "ultimos_6" | "ultimos_12" | string;

interface DashboardData {
  clientes: { id: string; created_at: string }[];
  vehiculos: { id: string; estado: string; precio_venta: number; created_at: string }[];
  consignatarios: { id: string; precio: number; created_at: string }[];
  ventas: { id: string; precio_venta: number; precio_vta_final: number; margen_bruto: number; fecha_venta: string; ejecutiva: string; marca: string; tipo: string | null }[];
}

/** Normaliza un valor de "tipo" de vehículo (quita tildes, mayúsculas, agrupa variantes). */
const normalizarTipo = (raw: string | null | undefined): string => {
  if (!raw) return "SIN TIPO";
  const t = raw
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
  // Agrupa "FURGON"/"FURGÓN"; "AUTO"/"AUTOMOVIL"
  if (t.startsWith("FURGON")) return "FURGON";
  if (t.startsWith("AUTOMO") || t === "AUTO") return "AUTOMOVIL";
  if (t === "STATION WAGON" || t === "STATIONWAGON") return "STATION WAGON";
  return t;
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const fmtCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + Math.round(n).toLocaleString("es-CL");
};

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const PIE_COLORS = ["#16a34a", "#dc2626", "#f59e0b", "#3b82f6", "#7c3aed"];

// ─── Componente ───────────────────────────────────────────────

export default function Dashboard() {
  const { usuarioActual } = useApp();
  const esVendedor = usuarioActual?.rol === "vendedor";
  // Nombres a buscar para el filtro: nombre completo + primer nombre
  const vendedorNombres = useMemo(() => {
    if (!usuarioActual) return [] as string[];
    const completo = `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim();
    const primero = usuarioActual.nombre || "";
    const set = new Set<string>();
    if (completo) set.add(normName(completo));
    if (primero) set.add(normName(primero));
    return Array.from(set);
  }, [usuarioActual]);

  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<DashboardData>({
    clientes: [], vehiculos: [], consignatarios: [], ventas: [],
  });
  const [periodo, setPeriodo] = useState<FiltroPeriodo>("ultimos_6");

  // ── Cargar TODA la data del Supabase ────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [clientesR, vehiculosR, consigR, ventasR] = await Promise.all([
        supabase.from("clientes").select("id, created_at"),
        supabase.from("vehiculos").select("id, estado, precio_venta, created_at"),
        supabase.from("consignatarios").select("id, precio, created_at"),
        supabase.from("ventas").select("id, precio_venta, precio_vta_final, margen_bruto, fecha_venta, ejecutiva, marca, tipo"),
      ]);

      // Si es vendedor → filtramos ventas a las suyas (ejecutiva matchea su nombre)
      let ventasFiltered = ventasR.data || [];
      if (esVendedor && vendedorNombres.length > 0) {
        ventasFiltered = ventasFiltered.filter((v: { ejecutiva: string | null }) => {
          const ej = normName(v.ejecutiva || "");
          return vendedorNombres.some((n) => ej === n || ej.startsWith(n + " ") || ej.includes(" " + n));
        });
      }

      setData({
        clientes: clientesR.data || [],
        vehiculos: vehiculosR.data || [],
        consignatarios: consigR.data || [],
        ventas: ventasFiltered,
      });
      setLoading(false);
    };
    load();
  }, [refreshKey, esVendedor, vendedorNombres]);

  // ── Determinar rango de fechas para filtro ────────────────────
  const { desde, hasta, periodoLabel } = useMemo(() => {
    const now = new Date();
    const labelMap: Record<string, string> = {
      todos: "Histórico completo",
      este_mes: "Este mes",
      mes_anterior: "Mes anterior",
      ultimos_3: "Últimos 3 meses",
      ultimos_6: "Últimos 6 meses",
      ultimos_12: "Últimos 12 meses",
    };

    if (periodo === "todos") {
      return { desde: new Date(1990, 0, 1), hasta: now, periodoLabel: labelMap.todos };
    }
    if (periodo === "este_mes") {
      return {
        desde: new Date(now.getFullYear(), now.getMonth(), 1),
        hasta: now,
        periodoLabel: `${MESES[now.getMonth()]} ${now.getFullYear()}`,
      };
    }
    if (periodo === "mes_anterior") {
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return {
        desde: new Date(y, m, 1),
        hasta: new Date(y, m + 1, 0, 23, 59, 59),
        periodoLabel: `${MESES[m]} ${y}`,
      };
    }
    const meses = parseInt(periodo.replace("ultimos_", ""), 10);
    if (!Number.isNaN(meses)) {
      return {
        desde: new Date(now.getFullYear(), now.getMonth() - meses + 1, 1),
        hasta: now,
        periodoLabel: labelMap[`ultimos_${meses}`] || `Últimos ${meses} meses`,
      };
    }
    return { desde: new Date(1990, 0, 1), hasta: now, periodoLabel: "Todos" };
  }, [periodo]);

  // ── Filtrar data por el periodo ──────────────────────────────
  const filtered = useMemo(() => {
    const inRange = (iso: string | null | undefined): boolean => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= desde.getTime() && t <= hasta.getTime();
    };
    return {
      clientes: data.clientes.filter((c) => inRange(c.created_at)),
      vehiculos: data.vehiculos.filter((v) => inRange(v.created_at)),
      consignatarios: data.consignatarios.filter((c) => inRange(c.created_at)),
      ventas: data.ventas.filter((v) => inRange(v.fecha_venta)),
    };
  }, [data, desde, hasta]);

  // ── KPIs ─────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalVentas = filtered.ventas.reduce((s, v) => s + (v.precio_vta_final || v.precio_venta || 0), 0);
    const margenTotal = filtered.ventas.reduce((s, v) => s + (v.margen_bruto || 0), 0);
    return [
      {
        label: "Clientes",
        valueTotal: data.clientes.length,
        valuePeriodo: filtered.clientes.length,
        icon: Users,
        path: "/clientes",
        color: "hsl(217,91%,50%)",
      },
      {
        label: "Vehículos",
        valueTotal: data.vehiculos.length,
        valuePeriodo: filtered.vehiculos.length,
        icon: Car,
        path: "/vehiculos",
        color: "hsl(142,71%,45%)",
      },
      {
        label: "Consignatarios",
        valueTotal: data.consignatarios.length,
        valuePeriodo: filtered.consignatarios.length,
        icon: UserCheck,
        path: "/consignatarios",
        color: "hsl(38,92%,50%)",
      },
      {
        label: "Ventas",
        valueTotal: data.ventas.length,
        valuePeriodo: filtered.ventas.length,
        icon: ShoppingCart,
        path: "/ventas",
        color: "hsl(262,80%,58%)",
        extra: fmtCompact(totalVentas),
      },
      {
        label: "Margen bruto",
        valueTotal: null,
        valuePeriodo: null,
        icon: DollarSign,
        path: "/administracion",
        color: "hsl(173,80%,40%)",
        extra: fmtCompact(margenTotal),
        only: true,
      },
    ];
  }, [data, filtered]);

  // ── Datos para gráfico: Ventas por mes (últimos 12) ──────────
  const ventasPorMes = useMemo(() => {
    const buckets = new Map<string, { mes: string; ventas: number; monto: number; margen: number }>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, { mes: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, ventas: 0, monto: 0, margen: 0 });
    }
    for (const v of data.ventas) {
      if (!v.fecha_venta) continue;
      const d = new Date(v.fecha_venta);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key);
      if (b) {
        b.ventas += 1;
        b.monto += v.precio_vta_final || v.precio_venta || 0;
        b.margen += v.margen_bruto || 0;
      }
    }
    return Array.from(buckets.values());
  }, [data.ventas]);

  // ── Vehículos por estado ────────────────────────────────────
  const vehiculosPorEstado = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of data.vehiculos) {
      const e = (v.estado || "DESCONOCIDO").toUpperCase();
      m.set(e, (m.get(e) || 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [data.vehiculos]);

  // ── Top vendedores ──────────────────────────────────────────
  const topVendedores = useMemo(() => {
    const m = new Map<string, { vendedor: string; ventas: number; monto: number }>();
    for (const v of filtered.ventas) {
      const vendedor = (v.ejecutiva || "Sin asignar").trim() || "Sin asignar";
      if (!m.has(vendedor)) m.set(vendedor, { vendedor, ventas: 0, monto: 0 });
      const row = m.get(vendedor)!;
      row.ventas += 1;
      row.monto += v.precio_vta_final || v.precio_venta || 0;
    }
    return Array.from(m.values()).sort((a, b) => b.monto - a.monto).slice(0, 6);
  }, [filtered.ventas]);

  // ── Top marcas vendidas ─────────────────────────────────────
  const topMarcas = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of filtered.ventas) {
      const marca = (v.marca || "").trim().toUpperCase() || "SIN MARCA";
      m.set(marca, (m.get(marca) || 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filtered.ventas]);

  // ── Top tipos de vehículo vendidos ──────────────────────────
  const topTipos = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of filtered.ventas) {
      const tipo = normalizarTipo(v.tipo);
      m.set(tipo, (m.get(tipo) || 0) + 1);
    }
    const total = Array.from(m.values()).reduce((s, n) => s + n, 0) || 1;
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered.ventas]);

  // ── Clientes nuevos por mes (12 meses) ──────────────────────
  const clientesPorMes = useMemo(() => {
    const buckets = new Map<string, { mes: string; clientes: number }>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, { mes: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, clientes: 0 });
    }
    for (const c of data.clientes) {
      if (!c.created_at) continue;
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key);
      if (b) b.clientes += 1;
    }
    return Array.from(buckets.values());
  }, [data.clientes]);

  // ── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-sm animate-pulse" style={{ color: "hsl(var(--muted-foreground))" }}>
          Cargando dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con filtro de periodo */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {esVendedor ? `Mi panel${usuarioActual?.nombre ? ` · ${usuarioActual.nombre}` : ""}` : "Dashboard"}
          </h1>
          <p className="page-subtitle">
            {esVendedor
              ? `Tus ventas y desempeño · ${periodoLabel}`
              : `Bienvenido a Egaña Automotriz · ${periodoLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="text-sm border rounded-lg pl-8 pr-3 py-1.5 bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <option value="todos">Histórico completo</option>
              <option value="este_mes">Este mes</option>
              <option value="mes_anterior">Mes anterior</option>
              <option value="ultimos_3">Últimos 3 meses</option>
              <option value="ultimos_6">Últimos 6 meses</option>
              <option value="ultimos_12">Últimos 12 meses</option>
            </select>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted"
            style={{ borderColor: "hsl(var(--border))" }}
            title="Recargar datos"
          >
            <RefreshCw size={13} />
            Refrescar
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          const inner = (
            <div
              className="bg-card rounded-xl border p-4 hover:shadow-md transition-shadow h-full"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: k.color + "20" }}
                >
                  <Icon size={16} style={{ color: k.color }} />
                </div>
                {k.valuePeriodo !== null && k.valuePeriodo !== undefined && periodo !== "todos" && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: k.color + "20", color: k.color }}
                  >
                    +{k.valuePeriodo}
                  </span>
                )}
              </div>
              <div className="text-xl font-bold mb-0.5 leading-tight">
                {k.only ? k.extra : (k.valueTotal ?? 0).toLocaleString("es-CL")}
              </div>
              <div className="text-xs leading-tight" style={{ color: "hsl(var(--muted-foreground))" }}>
                {k.label}
              </div>
              {k.extra && !k.only && (
                <div className="text-[11px] mt-1 font-medium" style={{ color: k.color }}>
                  {k.extra} {periodo === "todos" ? "histórico" : "en periodo"}
                </div>
              )}
            </div>
          );
          return k.path ? (
            <Link key={k.label} to={k.path}>
              {inner}
            </Link>
          ) : (
            <div key={k.label}>{inner}</div>
          );
        })}
      </div>

      {/* Gráfico principal: Ventas por mes (línea con monto) */}
      <div
        className="border rounded-xl p-5"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <TrendingUp size={16} style={{ color: "hsl(var(--primary))" }} />
            Ventas — últimos 12 meses
          </h3>
          <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            {filtered.ventas.length} en periodo · monto {fmtCompact(filtered.ventas.reduce((s, v) => s + (v.precio_vta_final || v.precio_venta || 0), 0))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={ventasPorMes} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ventasMonto" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(262,80%,58%)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(262,80%,58%)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtCompact(v)}
            />
            <Tooltip
              formatter={(v: number, name: string) =>
                name === "monto" ? fmt(v) : v.toLocaleString("es-CL")
              }
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="monto"
              name="Monto vendido"
              stroke="hsl(262,80%,58%)"
              strokeWidth={2.5}
              fill="url(#ventasMonto)"
            />
            <Line
              type="monotone"
              dataKey="margen"
              name="Margen bruto"
              stroke="hsl(173,80%,40%)"
              strokeWidth={2}
              dot={{ r: 2.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Grid 2 columnas: Vehículos por estado + Clientes nuevos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className="border rounded-xl p-5"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
        >
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Car size={16} style={{ color: "hsl(142,71%,45%)" }} />
            Vehículos por estado
          </h3>
          {vehiculosPorEstado.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "hsl(var(--muted-foreground))" }}>
              Sin datos
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={vehiculosPorEstado}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  labelLine={false}
                  style={{ fontSize: 11 }}
                >
                  {vehiculosPorEstado.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div
          className="border rounded-xl p-5"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
        >
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Users size={16} style={{ color: "hsl(217,91%,50%)" }} />
            Clientes nuevos — últimos 12 meses
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={clientesPorMes} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="clientes" name="Clientes nuevos" fill="hsl(217,91%,50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid: Top vendedores (solo admin/master) + Top marcas */}
      <div className={`grid grid-cols-1 ${esVendedor ? "" : "lg:grid-cols-2"} gap-4`}>
        {!esVendedor && (
        <div
          className="border rounded-xl p-5"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
        >
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <ShoppingCart size={16} style={{ color: "hsl(262,80%,58%)" }} />
            Top vendedores ({periodoLabel})
          </h3>
          {topVendedores.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "hsl(var(--muted-foreground))" }}>
              Sin ventas en el periodo
            </p>
          ) : (
            <div className="space-y-2">
              {topVendedores.map((v, i) => {
                const maxMonto = topVendedores[0]?.monto || 1;
                const pct = (v.monto / maxMonto) * 100;
                return (
                  <div key={v.vendedor}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">
                        <span className="inline-block w-5 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          #{i + 1}
                        </span>
                        {v.vendedor}
                      </span>
                      <span className="text-xs font-bold">{fmtCompact(v.monto)} <span className="font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>· {v.ventas}</span></span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: "hsl(262,80%,58%)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        <div
          className="border rounded-xl p-5"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
        >
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Car size={16} style={{ color: "hsl(38,92%,50%)" }} />
            {esVendedor ? "Mis marcas vendidas" : "Top marcas vendidas"} ({periodoLabel})
          </h3>
          {topMarcas.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "hsl(var(--muted-foreground))" }}>
              Sin ventas en el periodo
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topMarcas} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" name="Ventas" fill="hsl(38,92%,50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top tipos de vehículo vendidos — inclinación del mercado */}
      <div
        className="border rounded-xl p-5"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Layers size={16} style={{ color: "hsl(173,80%,40%)" }} />
            Tipos de vehículo vendidos — inclinación del mercado ({periodoLabel})
          </h3>
          <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            {topTipos.length} {topTipos.length === 1 ? "categoría" : "categorías"}
          </span>
        </div>
        {topTipos.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: "hsl(var(--muted-foreground))" }}>
            Sin ventas en el periodo
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Barra horizontal */}
            <ResponsiveContainer width="100%" height={Math.max(180, topTipos.length * 32)}>
              <BarChart data={topTipos} layout="vertical" margin={{ top: 5, right: 30, left: 70, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, _name, props: { payload?: { pct?: number } }) => [
                    `${v} (${props.payload?.pct ?? 0}%)`,
                    "Ventas",
                  ]}
                />
                <Bar dataKey="value" name="Ventas" radius={[0, 4, 4, 0]}>
                  {topTipos.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Donut con porcentajes */}
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={topTipos}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={90}
                  paddingAngle={2}
                  label={(entry: { name?: string; pct?: number }) =>
                    `${entry.name}: ${entry.pct ?? 0}%`
                  }
                  labelLine={false}
                  style={{ fontSize: 11 }}
                >
                  {topTipos.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, _name, props: { payload?: { pct?: number } }) =>
                    `${v} (${props.payload?.pct ?? 0}%)`
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
