/**
 * Global — Vista ejecutiva con datos de Gemma.cl (CRM de financieras).
 *
 * Solo visible para master / administracion (filtro de menú en Layout.tsx,
 * y guardia adicional en este componente).
 *
 * Estructura:
 *  - Header con filtro de vendedor + sucursal
 *  - 6 KPI cards de HOY (Aprobadas, Rechazadas, Casos Abiertos, Cursar, Validar, Total)
 *  - Gráfico SEMANAL (últimos 7 días) — barras
 *  - Gráfico MENSUAL (últimos 30 días) — área
 *  - Tabla por vendedor (Solicitudes, Aprobadas, %Aprobación, Cursadas, %Cierre, %Eficiencia)
 *  - Tabla de casos abiertos (top 10)
 */

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Briefcase,
  FileCheck2,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  ChartBar,
  CalendarRange,
  Users,
  Building2,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  fetchGemmaDashboard,
  fetchGemmaEstadisticas,
  fetchGemmaIngresadosRango,
  GEMMA_VENDEDORES,
  GEMMA_SUCURSALES,
  formatCLP,
  formatPct,
  toGemmaDate,
  type DashboardResponse,
  type EstadisticaVendedor,
  type CasoAbierto,
} from "@/lib/gemmaService";
import { useApp } from "@/context/AppContext";

// ─── Helpers ───────────────────────────────────────────────────────

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function shortDate(ddmmyyyy: string): string {
  // "27/05/2026" → "27 May"
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(ddmmyyyy);
  if (!m) return ddmmyyyy;
  return `${m[1]} ${MESES[Number(m[2]) - 1]}`;
}

// ─── Componente ────────────────────────────────────────────────────

export default function Global() {
  const { usuarioActual } = useApp();
  const rol = usuarioActual?.rol ?? "vendedor";

  // Guardia: solo master/administracion
  if (rol !== "master" && rol !== "administracion") {
    return (
      <div className="space-y-4">
        <div className="page-header">
          <div>
            <h1 className="page-title">Global</h1>
            <p className="page-subtitle">Acceso restringido</p>
          </div>
        </div>
        <div className="border rounded-xl p-6 flex items-start gap-3" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <AlertTriangle size={20} style={{ color: "hsl(38,92%,50%)" }} />
          <div>
            <p className="font-semibold mb-1">No tienes permiso para ver esta sección</p>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              La vista Global está disponible solo para usuarios con rol Administración o Master.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Estado ────────────────────────────────────────────────────
  const [vendedorRut, setVendedorRut] = useState("");
  const [sucursalId, setSucursalId] = useState("0");
  const [refreshKey, setRefreshKey] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [estadisticas, setEstadisticas] = useState<EstadisticaVendedor[]>([]);
  const [serieSemanal, setSerieSemanal] = useState<{ fecha: string; ingresados: number }[]>([]);
  const [serieMensual, setSerieMensual] = useState<{ fecha: string; ingresados: number }[]>([]);

  // ── Cargar todo en paralelo ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrorMsg("");

      const hoy = new Date();
      const haceSiete = new Date();
      haceSiete.setDate(hoy.getDate() - 6); // 7 días incluyendo hoy
      const haceTreinta = new Date();
      haceTreinta.setDate(hoy.getDate() - 29);

      try {
        const [dash, ests, semana, mes] = await Promise.all([
          fetchGemmaDashboard(vendedorRut, sucursalId),
          fetchGemmaEstadisticas(vendedorRut),
          fetchGemmaIngresadosRango(toGemmaDate(haceSiete), toGemmaDate(hoy), vendedorRut, sucursalId),
          fetchGemmaIngresadosRango(toGemmaDate(haceTreinta), toGemmaDate(hoy), vendedorRut, sucursalId),
        ]);
        if (cancelled) return;

        if (!dash.ok) {
          setErrorMsg(dash.error || "No se pudo cargar el dashboard de Gemma");
        }
        setDashboard(dash);
        setEstadisticas(ests.estadisticas || []);
        setSerieSemanal(fillEmptyDays(semana.serie || [], haceSiete, hoy));
        setSerieMensual(fillEmptyDays(mes.serie || [], haceTreinta, hoy));
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [vendedorRut, sucursalId, refreshKey]);

  // ── Casos abiertos top 10 por días en cola ──────────────────────
  const casosTop = useMemo<CasoAbierto[]>(() => {
    return (dashboard?.casos_abiertos || [])
      .slice()
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 10);
  }, [dashboard]);

  // ── KPI cards ──────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const t = dashboard?.totales || { aprobadas: 0, rechazadas: 0, casos_abiertos: 0, cursar: 0, validar: 0 };
    const totalSolicitudes = Number(t.aprobadas || 0) + Number(t.rechazadas || 0);
    return [
      { label: "Solicitudes", value: totalSolicitudes, icon: ChartBar, color: "hsl(217,91%,50%)" },
      { label: "Aprobadas", value: Number(t.aprobadas || 0), icon: CheckCircle2, color: "hsl(142,71%,45%)" },
      { label: "Rechazadas", value: Number(t.rechazadas || 0), icon: XCircle, color: "hsl(0,84%,60%)" },
      { label: "Casos abiertos", value: Number(t.casos_abiertos || 0), icon: Briefcase, color: "hsl(38,92%,50%)" },
      { label: "Por cursar", value: Number(t.cursar || 0), icon: FileCheck2, color: "hsl(262,80%,58%)" },
      { label: "Por validar", value: Number(t.validar || 0), icon: TrendingUp, color: "hsl(173,80%,40%)" },
    ];
  }, [dashboard]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header con filtros */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Global · Gemma.cl</h1>
          <p className="page-subtitle">
            Distribuidor 647 — COMERCIAL REY-AGUIRRE SPA · Datos en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Users size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
            <select
              value={vendedorRut}
              onChange={(e) => setVendedorRut(e.target.value)}
              className="text-sm border rounded-lg pl-8 pr-3 py-1.5 bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              {GEMMA_VENDEDORES.map((v) => (
                <option key={v.rut || "all"} value={v.rut}>{v.nombre}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="text-sm border rounded-lg pl-8 pr-3 py-1.5 bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              {GEMMA_SUCURSALES.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted disabled:opacity-50"
            style={{ borderColor: "hsl(var(--border))" }}
            title="Recargar"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refrescar
          </button>
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && !loading && (
        <div
          className="flex items-start gap-3 border rounded-xl p-4"
          style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}
        >
          <AlertTriangle size={18} />
          <div className="text-sm">
            <p className="font-semibold mb-0.5">No se pudo cargar Gemma</p>
            <p className="text-xs opacity-90">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="bg-card rounded-xl border p-4 h-full"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: k.color + "20" }}
                >
                  <Icon size={16} style={{ color: k.color }} />
                </div>
              </div>
              <div className="text-xl font-bold mb-0.5 leading-tight">
                {loading ? "…" : k.value.toLocaleString("es-CL")}
              </div>
              <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {k.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráfico semanal */}
      <div
        className="border rounded-xl p-5"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <CalendarRange size={16} style={{ color: "hsl(217,91%,50%)" }} />
            Ingresados — últimos 7 días
          </h3>
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Total: {serieSemanal.reduce((s, d) => s + d.ingresados, 0)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={serieSemanal} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={shortDate} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="ingresados" name="Ingresados" fill="hsl(217,91%,50%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico mensual */}
      <div
        className="border rounded-xl p-5"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <TrendingUp size={16} style={{ color: "hsl(262,80%,58%)" }} />
            Ingresados — últimos 30 días
          </h3>
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Total: {serieMensual.reduce((s, d) => s + d.ingresados, 0)} · Promedio:{" "}
            {serieMensual.length > 0
              ? (serieMensual.reduce((s, d) => s + d.ingresados, 0) / serieMensual.length).toFixed(1)
              : 0}/día
          </span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={serieMensual} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gemmaGradMens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(262,80%,58%)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(262,80%,58%)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={shortDate} interval={Math.floor(serieMensual.length / 8)} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="ingresados"
              name="Ingresados"
              stroke="hsl(262,80%,58%)"
              strokeWidth={2.5}
              fill="url(#gemmaGradMens)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla por vendedor */}
      <div
        className="border rounded-xl p-5"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Users size={16} style={{ color: "hsl(38,92%,50%)" }} />
          Estadísticas por vendedor
        </h3>
        {estadisticas.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: "hsl(var(--muted-foreground))" }}>
            {loading ? "Cargando…" : "Sin datos en el rango seleccionado"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--muted))" }}>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Vendedor</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Solicitudes</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Aprobadas</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">%Aprob.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Cursadas</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">%Cierre</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">%Eficiencia</th>
                </tr>
              </thead>
              <tbody>
                {estadisticas.map((e, i) => (
                  <tr key={`${e.vendedor}-${i}`} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="px-3 py-2 text-xs font-medium">{e.vendedor}</td>
                    <td className="px-3 py-2 text-xs text-right">{e.solicitudes}</td>
                    <td className="px-3 py-2 text-xs text-right">{e.aprobadas}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatPct(e.pct_aprobacion)}</td>
                    <td className="px-3 py-2 text-xs text-right">{e.cursadas}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatPct(e.pct_cierre)}</td>
                    <td className="px-3 py-2 text-xs text-right font-semibold" style={{ color: e.pct_eficiencia >= 50 ? "hsl(142,71%,45%)" : "hsl(0,84%,60%)" }}>
                      {formatPct(e.pct_eficiencia)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Casos abiertos con más días */}
      <div
        className="border rounded-xl p-5"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Briefcase size={16} style={{ color: "hsl(0,84%,60%)" }} />
          Casos abiertos con más días en cola
        </h3>
        {casosTop.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: "hsl(var(--muted-foreground))" }}>
            {loading ? "Cargando…" : "Sin casos abiertos"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--muted))" }}>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Código</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Cliente</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Vehículo</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Precio</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Saldo</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Días</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Vendedor</th>
                </tr>
              </thead>
              <tbody>
                {casosTop.map((c) => (
                  <tr key={c.simulacion_id} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="px-3 py-2 text-xs font-mono">{c.codigo}</td>
                    <td className="px-3 py-2 text-xs">{c.cliente_full || `${c.cliente_nombre} ${c.cliente_apellido}`}</td>
                    <td className="px-3 py-2 text-xs">{c.marca} {c.modelo} {c.anio}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCLP(c.precio)}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCLP(c.saldo_precio)}</td>
                    <td className="px-3 py-2 text-xs text-right font-semibold" style={{ color: c.dias > 10 ? "hsl(0,84%,60%)" : "hsl(38,92%,50%)" }}>{c.dias}</td>
                    <td className="px-3 py-2 text-xs">{c.vendedor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Rellena con 0 los días sin datos en una serie diaria. */
function fillEmptyDays(
  serie: { fecha: string; ingresados: number }[],
  desde: Date,
  hasta: Date,
): { fecha: string; ingresados: number }[] {
  const map = new Map(serie.map((s) => [s.fecha, s.ingresados]));
  const out: { fecha: string; ingresados: number }[] = [];
  const d = new Date(desde);
  while (d <= hasta) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const key = `${dd}/${mm}/${d.getFullYear()}`;
    out.push({ fecha: key, ingresados: map.get(key) || 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}
