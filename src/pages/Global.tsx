/**
 * Global — Vista ejecutiva con datos de Gemma.cl (CRM de financieras).
 *
 * Solo visible para master / administracion. Default = última semana.
 *
 * Estructura:
 *  - Header con filtros: vendedor, sucursal, rango de fechas (con presets)
 *  - 6 KPI cards del periodo (Ingresados, Aprobadas, Rechazadas acum,
 *    Por cursar, Por validar, Casos abiertos)
 *  - Chart multi-serie por día (ingresados / aprobadas / cursar / validar)
 *  - Top vendedores duales: solicitudes vs aprobadas
 *  - Casos abiertos top 10 (más días en cola)
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
  CalendarRange,
  Users,
  Building2,
  Loader2,
  Award,
  Send,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import {
  fetchGemmaDashboard,
  fetchGemmaMetricasPeriodo,
  fetchGemmaResumenEmpresas,
  checkGemmaHealth,
  GEMMA_VENDEDORES,
  GEMMA_SUCURSALES,
  formatCLP,
  toGemmaDate,
  fromGemmaDate,
  type DashboardResponse,
  type MetricasPeriodoResponse,
  type CasoAbierto,
  type HealthResponse,
  type EmpresaResumen,
} from "@/lib/gemmaService";
import { GemmaSessionExpiredBanner } from "@/components/GemmaSessionExpiredBanner";
import { useApp } from "@/context/AppContext";

// ─── Helpers ───────────────────────────────────────────────────────

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function shortDate(ddmmyyyy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(ddmmyyyy);
  if (!m) return ddmmyyyy;
  return `${m[1]} ${MESES[Number(m[2]) - 1]}`;
}

/** Convierte DD/MM/YYYY a YYYY-MM-DD para <input type="date">. */
function toInputDate(ddmmyyyy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(ddmmyyyy);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Convierte YYYY-MM-DD (input) a DD/MM/YYYY (Gemma format). */
function fromInputDate(yyyymmdd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyymmdd);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

interface RangoPreset {
  label: string;
  dias: number;
}
const PRESETS: RangoPreset[] = [
  { label: "Hoy", dias: 0 },
  { label: "Última semana", dias: 6 },
  { label: "Últimas 2 semanas", dias: 13 },
  { label: "Último mes", dias: 29 },
  { label: "Últimos 3 meses", dias: 89 },
];

function rellenarDias(
  serie: { fecha: string; ingresados: number; aprobadas: number; cursar: number; validar: number }[],
  desde: Date,
  hasta: Date,
) {
  const map = new Map(serie.map((s) => [s.fecha, s]));
  const out: typeof serie = [];
  const d = new Date(desde);
  d.setHours(0, 0, 0, 0);
  const end = new Date(hasta);
  end.setHours(23, 59, 59, 999);
  while (d <= end) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const key = `${dd}/${mm}/${d.getFullYear()}`;
    out.push(map.get(key) ?? { fecha: key, ingresados: 0, aprobadas: 0, cursar: 0, validar: 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ─── Componente ────────────────────────────────────────────────────

export default function Global() {
  const { usuarioActual } = useApp();
  const rol = usuarioActual?.rol ?? "vendedor";

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

  // ── Filtros ───────────────────────────────────────────────────
  const [vendedorRut, setVendedorRut] = useState("");
  // Default: Egaña 931 (sucursal 4). El detalle de la pagina se enfoca en Egaña.
  const [sucursalId, setSucursalId] = useState("4");
  // Default: últimos 7 días incluyendo hoy
  const hoyInicial = useMemo(() => new Date(), []);
  const haceSeisInicial = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d;
  }, []);
  const [desde, setDesde] = useState<string>(toGemmaDate(haceSeisInicial));
  const [hasta, setHasta] = useState<string>(toGemmaDate(hoyInicial));
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Estado de carga ───────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [metricas, setMetricas] = useState<MetricasPeriodoResponse | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [empresasExternas, setEmpresasExternas] = useState<EmpresaResumen[]>([]);

  // ── Aplicar preset ───────────────────────────────────────────
  const aplicarPreset = (dias: number) => {
    const h = new Date();
    const d = new Date();
    d.setDate(h.getDate() - dias);
    setDesde(toGemmaDate(d));
    setHasta(toGemmaDate(h));
  };

  // ── Cargar data ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const h = await checkGemmaHealth();
        if (cancelled) return;
        setHealth(h);
        if (h.sessionExpired) {
          setSessionExpired(true);
          setLoading(false);
          return;
        }

        const [dash, met, resEmp] = await Promise.all([
          fetchGemmaDashboard(vendedorRut, sucursalId),
          fetchGemmaMetricasPeriodo(desde, hasta, vendedorRut, sucursalId),
          fetchGemmaResumenEmpresas(),
        ]);
        if (cancelled) return;

        const anyExpired = !!(dash.sessionExpired || met.sessionExpired || resEmp.sessionExpired);
        setSessionExpired(anyExpired);
        if (!dash.ok && !anyExpired) {
          setErrorMsg(dash.error || "No se pudo cargar Gemma");
        }
        setDashboard(dash);
        setMetricas(met);
        setEmpresasExternas(resEmp.empresas || []);
      } catch (e) {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [vendedorRut, sucursalId, desde, hasta, refreshKey]);

  // ── Serie por día rellena ─────────────────────────────────────
  const serieDia = useMemo(() => {
    const d1 = fromGemmaDate(desde) ?? new Date();
    const d2 = fromGemmaDate(hasta) ?? new Date();
    return rellenarDias(metricas?.por_dia ?? [], d1, d2);
  }, [metricas, desde, hasta]);

  // ── KPI cards ─────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const t = metricas?.totales;
    const dashTotales = dashboard?.totales;
    return [
      { label: "Ingresados", value: t?.ingresados ?? 0, icon: Send, color: "hsl(217,91%,50%)", sub: "en periodo" },
      { label: "Aprobadas (periodo)", value: t?.aprobadas ?? 0, icon: CheckCircle2, color: "hsl(142,71%,45%)", sub: "en periodo" },
      { label: "Aprobadas total", value: t?.aprobadas_total_acumulado ?? 0, icon: Award, color: "hsl(142,71%,38%)", sub: "acumulado Gemma" },
      { label: "Rechazadas total", value: t?.rechazadas_total_acumulado ?? 0, icon: XCircle, color: "hsl(0,84%,60%)", sub: "acumulado Gemma" },
      { label: "Por cursar", value: dashTotales?.cursar ?? 0, icon: FileCheck2, color: "hsl(262,80%,58%)", sub: "actual" },
      { label: "Por validar", value: dashTotales?.validar ?? 0, icon: TrendingUp, color: "hsl(173,80%,40%)", sub: "actual" },
    ];
  }, [metricas, dashboard]);

  // ── Top vendedores: solicitudes vs aprobadas ──────────────────
  const topSolicitudes = useMemo(() => {
    return (metricas?.por_vendedor ?? [])
      .filter((v) => v.solicitudes > 0)
      .slice()
      .sort((a, b) => b.solicitudes - a.solicitudes)
      .slice(0, 10);
  }, [metricas]);

  const topAprobadas = useMemo(() => {
    return (metricas?.por_vendedor ?? [])
      .filter((v) => v.aprobadas > 0)
      .slice()
      .sort((a, b) => b.aprobadas - a.aprobadas)
      .slice(0, 10);
  }, [metricas]);

  // ── Casos abiertos top por días ──────────────────────────────
  const casosTop = useMemo<CasoAbierto[]>(() => {
    return (dashboard?.casos_abiertos || [])
      .slice()
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 10);
  }, [dashboard]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Global · Egaña Automotriz</h1>
          <p className="page-subtitle">
            COMERCIAL REY-AGUIRRE SPA · Sucursal EGAÑA 931 · Periodo: {desde} → {hasta}
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

      {/* Filtro de fechas con presets */}
      <div
        className="border rounded-xl p-3 flex items-center gap-3 flex-wrap"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
          <CalendarRange size={13} /> Periodo:
        </span>
        <input
          type="date"
          value={toInputDate(desde)}
          onChange={(e) => setDesde(fromInputDate(e.target.value))}
          className="text-xs border rounded-lg px-2 py-1 bg-background"
          style={{ borderColor: "hsl(var(--border))" }}
        />
        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>→</span>
        <input
          type="date"
          value={toInputDate(hasta)}
          onChange={(e) => setHasta(fromInputDate(e.target.value))}
          className="text-xs border rounded-lg px-2 py-1 bg-background"
          style={{ borderColor: "hsl(var(--border))" }}
        />
        <div className="flex items-center gap-1 ml-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => aplicarPreset(p.dias)}
              className="text-[11px] px-2 py-1 rounded border hover:bg-muted"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {sessionExpired && !loading && (
        <GemmaSessionExpiredBanner onSaved={() => setRefreshKey((k) => k + 1)} />
      )}

      {!sessionExpired && health?.cookies_set && health.last_ping_at && (
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: health.last_ping_ok ? "hsl(142,71%,45%)" : "hsl(0,84%,60%)" }} />
            Sesión Gemma activa
          </span>
          <span>·</span>
          <span>último ping: {new Date(health.last_ping_at).toLocaleString("es-CL")}</span>
          {health.updated_by && <><span>·</span><span>configurado por: {health.updated_by}</span></>}
        </div>
      )}

      {errorMsg && !loading && !sessionExpired && (
        <div className="flex items-start gap-3 border rounded-xl p-4" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
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
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: k.color + "20" }}>
                  <Icon size={16} style={{ color: k.color }} />
                </div>
              </div>
              <div className="text-xl font-bold mb-0.5 leading-tight">
                {loading ? "…" : k.value.toLocaleString("es-CL")}
              </div>
              <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {k.label}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                {k.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart multi-serie por día */}
      <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <TrendingUp size={16} style={{ color: "hsl(217,91%,50%)" }} />
            Métricas día a día — {desde} → {hasta}
          </h3>
          <div className="flex items-center gap-3 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            <span>{serieDia.length} días</span>
            <span>·</span>
            <span>{metricas?.totales?.ingresados ?? 0} ingresados total</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={serieDia} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={shortDate} interval={Math.max(0, Math.floor(serieDia.length / 14))} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ingresados" name="Ingresados" fill="hsl(217,91%,50%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="aprobadas" name="Aprobadas" fill="hsl(142,71%,45%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="cursar" name="Por cursar" fill="hsl(262,80%,58%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="validar" name="Por validar" fill="hsl(173,80%,40%)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top vendedores: solicitudes vs aprobadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Solicitudes */}
        <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Send size={16} style={{ color: "hsl(217,91%,50%)" }} />
            Quién envía más solicitudes ({desde} → {hasta})
          </h3>
          {topSolicitudes.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "hsl(var(--muted-foreground))" }}>
              {loading ? "Cargando…" : "Sin datos"}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, topSolicitudes.length * 32)}>
              <BarChart data={topSolicitudes} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="vendedor" tick={{ fontSize: 10 }} width={130} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, _n, p: { payload?: { monto_total?: number; pct_aprobacion?: number } }) => [
                    `${v} · ${formatCLP(p.payload?.monto_total ?? 0)} · ${p.payload?.pct_aprobacion ?? 0}% aprob`,
                    "Solicitudes",
                  ]}
                />
                <Bar dataKey="solicitudes" name="Solicitudes" fill="hsl(217,91%,50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Aprobadas */}
        <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Award size={16} style={{ color: "hsl(142,71%,45%)" }} />
            Quién tiene más aprobadas ({desde} → {hasta})
          </h3>
          {topAprobadas.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "hsl(var(--muted-foreground))" }}>
              {loading ? "Cargando…" : "Sin datos"}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, topAprobadas.length * 32)}>
              <BarChart data={topAprobadas} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="vendedor" tick={{ fontSize: 10 }} width={130} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, _n, p: { payload?: { monto_total?: number; solicitudes?: number } }) => [
                    `${v} aprobadas de ${p.payload?.solicitudes ?? 0} solicit. · ${formatCLP(p.payload?.monto_total ?? 0)}`,
                    "Aprobadas",
                  ]}
                />
                <Bar dataKey="aprobadas" radius={[0, 4, 4, 0]}>
                  {topAprobadas.map((_, i) => (
                    <Cell key={i} fill="hsl(142,71%,45%)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Casos abiertos con más días */}
      <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
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

      {/* Resumen de otras empresas externas — solo cuenta total cursar/validar */}
      {empresasExternas.length > 0 && (
        <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Building2 size={16} style={{ color: "hsl(38,92%,50%)" }} />
              Otras empresas — resumen
            </h3>
            <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              {empresasExternas.length} empresas externas visibles para tu cuenta
            </span>
          </div>
          <p className="text-[11px] mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
            Volumen actual de créditos por cursar/validar en otras empresas del distribuidor.
            Detalle completo solo de Egaña arriba.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--muted))" }}>
                  <th className="px-3 py-2 text-left text-xs font-semibold">ID</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Empresa</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Por cursar</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Por validar</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Total activos</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Monto total</th>
                </tr>
              </thead>
              <tbody>
                {empresasExternas.map((e) => (
                  <tr key={e.distribuidor_id} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="px-3 py-2 text-[11px] font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>{e.distribuidor_id}</td>
                    <td className="px-3 py-2 text-xs font-medium">{e.distribuidor_nombre}</td>
                    <td className="px-3 py-2 text-xs text-right">{e.cursar}</td>
                    <td className="px-3 py-2 text-xs text-right">{e.validar}</td>
                    <td className="px-3 py-2 text-xs text-right font-semibold">{e.total}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCLP(e.monto_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] mt-3" style={{ color: "hsl(var(--muted-foreground))" }}>
            ⓘ Gemma no expone aprobados/rechazados desglosados por empresa — el sidebar de su sistema mezcla todas. Solo podemos contar lo activo (cursar/validar) por distribuidor.
          </p>
        </div>
      )}
    </div>
  );
}
