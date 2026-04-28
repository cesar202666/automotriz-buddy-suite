import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";
import { BarChart3, Users, ThermometerSun, Globe } from "lucide-react";

interface Lead {
  id: string;
  nombre: string;
  calificacion: string | null;
  canal: string | null;
  vendedor_asignado: string | null;
  etapa: string | null;
  primer_apertura_at: string | null;
  created_at: string;
}

const CALIFICACION_COLORS: Record<string, string> = {
  frio: "hsl(200 80% 55%)",
  tibio: "hsl(40 90% 55%)",
  caliente: "hsl(0 80% 55%)",
};

const CANAL_COLORS: Record<string, string> = {
  whatsapp: "hsl(142 70% 45%)",
  instagram: "hsl(330 70% 55%)",
  messenger: "hsl(217 90% 55%)",
  facebook: "hsl(217 90% 55%)",
  manychat: "hsl(200 60% 50%)",
};

const PIE_COLORS = [
  "hsl(217 91% 50%)",
  "hsl(142 70% 45%)",
  "hsl(330 70% 55%)",
  "hsl(40 90% 55%)",
  "hsl(0 80% 55%)",
  "hsl(270 60% 55%)",
];

function deduplicateFirstName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return parts.slice(1).join(" ");
  }
  return name;
}

export default function Metricas() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeads = async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, nombre, calificacion, canal, vendedor_asignado, etapa, primer_apertura_at, created_at")
        .order("created_at", { ascending: false });
      setLeads((data as Lead[]) || []);
      setLoading(false);
    };
    fetchLeads();
  }, []);

  // --- Data transformations ---

  // 1. Calificación breakdown
  const calificacionData = (() => {
    const counts: Record<string, number> = { frio: 0, tibio: 0, caliente: 0 };
    leads.forEach((l) => {
      const cal = l.calificacion || "frio";
      counts[cal] = (counts[cal] || 0) + 1;
    });
    return [
      { name: "❄️ Frío", value: counts.frio, fill: CALIFICACION_COLORS.frio },
      { name: "🌤 Tibio", value: counts.tibio, fill: CALIFICACION_COLORS.tibio },
      { name: "🔥 Caliente", value: counts.caliente, fill: CALIFICACION_COLORS.caliente },
    ];
  })();

  // 2. Origen (canal) breakdown
  const origenData = (() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => {
      const canal = l.canal || "desconocido";
      counts[canal] = (counts[canal] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: CANAL_COLORS[name] || PIE_COLORS[i % PIE_COLORS.length],
    }));
  })();

  // 3. Por vendedor: asignados vs contactados (primer_apertura_at = respondido)
  const vendedorData = (() => {
    const map: Record<string, { asignados: number; contactados: number }> = {};
    leads.forEach((l) => {
      const v = l.vendedor_asignado?.trim();
      if (!v) return;
      if (!map[v]) map[v] = { asignados: 0, contactados: 0 };
      map[v].asignados++;
      if (l.primer_apertura_at) map[v].contactados++;
    });
    return Object.entries(map)
      .map(([vendedor, data]) => ({ vendedor, ...data }))
      .sort((a, b) => b.asignados - a.asignados);
  })();

  // 4. Summary stats
  const totalLeads = leads.length;
  const totalCalificados = leads.filter(
    (l) => l.calificacion === "tibio" || l.calificacion === "caliente"
  ).length;
  const totalContactados = leads.filter((l) => l.primer_apertura_at).length;

  // 5. Serie diaria de leads (últimos 30 días)
  const dailyLeadsData = (() => {
    const days: { date: string; label: string; leads: number }[] = [];
    const map: Record<string, number> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
      days.push({ date: key, label, leads: 0 });
      map[key] = 0;
    }
    leads.forEach((l) => {
      if (!l.created_at) return;
      const key = l.created_at.slice(0, 10);
      if (key in map) map[key]++;
    });
    return days.map((d) => ({ ...d, leads: map[d.date] }));
  })();

  // 6. Últimos leads calificados (tibio/caliente)
  const leadsCalificados = leads
    .filter((l) => l.calificacion === "tibio" || l.calificacion === "caliente")
    .slice(0, 10);

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Métricas</h1>
            <p className="page-subtitle">Análisis y reportes</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Cargando datos...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Métricas</h1>
          <p className="page-subtitle">Análisis y reportes de leads</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{totalLeads}</p>
              <p className="text-sm text-muted-foreground">Total Leads</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ThermometerSun className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{totalCalificados}</p>
              <p className="text-sm text-muted-foreground">Calificados (Tibio/Caliente)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Globe className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{totalContactados}</p>
              <p className="text-sm text-muted-foreground">Contactados por Vendedor</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evolución diaria de leads (30 días) */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Evolución de Leads — Últimos 30 días
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              leads: { label: "Leads", color: "hsl(217 91% 50%)" },
            }}
            className="h-[300px] w-full"
          >
            <LineChart data={dailyLeadsData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="leads"
                stroke="hsl(217 91% 50%)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(217 91% 50%)" }}
                activeDot={{ r: 5 }}
                name="Leads"
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Row 1: Calificación + Origen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Calificación Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Calificación de Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                frio: { label: "Frío", color: CALIFICACION_COLORS.frio },
                tibio: { label: "Tibio", color: CALIFICACION_COLORS.tibio },
                caliente: { label: "Caliente", color: CALIFICACION_COLORS.caliente },
              }}
              className="h-[280px] w-full"
            >
              <PieChart>
                <Pie
                  data={calificacionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {calificacionData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Origen Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Origen de Leads (Canal)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={Object.fromEntries(
                origenData.map((d) => [
                  d.name.toLowerCase(),
                  { label: d.name, color: d.fill },
                ])
              )}
              className="h-[280px] w-full"
            >
              <PieChart>
                <Pie
                  data={origenData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {origenData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Vendedores Bar Chart */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Leads por Vendedor — Asignados vs Contactados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vendedorData.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">
              No hay leads asignados a vendedores aún
            </p>
          ) : (
            <ChartContainer
              config={{
                asignados: { label: "Asignados", color: "hsl(217 91% 50%)" },
                contactados: { label: "Contactados", color: "hsl(142 70% 45%)" },
              }}
              className="h-[320px] w-full"
            >
              <BarChart data={vendedorData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="vendedor"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="asignados"
                  fill="hsl(217 91% 50%)"
                  radius={[0, 4, 4, 0]}
                  name="Asignados"
                />
                <Bar
                  dataKey="contactados"
                  fill="hsl(142 70% 45%)"
                  radius={[0, 4, 4, 0]}
                  name="Contactados"
                />
                <Legend />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Row 3: Tabla de leads calificados */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Últimos Leads Calificados (Tibio / Caliente)</CardTitle>
        </CardHeader>
        <CardContent>
          {leadsCalificados.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">
              No hay leads calificados aún
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Nombre</th>
                    <th className="py-2 pr-4">Calificación</th>
                    <th className="py-2 pr-4">Canal</th>
                    <th className="py-2 pr-4">Vendedor</th>
                    <th className="py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsCalificados.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        {deduplicateFirstName(l.nombre)}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor:
                              l.calificacion === "caliente"
                                ? "hsl(0 80% 95%)"
                                : "hsl(40 90% 93%)",
                            color:
                              l.calificacion === "caliente"
                                ? "hsl(0 80% 40%)"
                                : "hsl(40 80% 30%)",
                          }}
                        >
                          {l.calificacion === "caliente" ? "🔥" : "🌤"}{" "}
                          {l.calificacion === "caliente" ? "Caliente" : "Tibio"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 capitalize">{l.canal || "—"}</td>
                      <td className="py-2 pr-4">{l.vendedor_asignado || "—"}</td>
                      <td className="py-2">
                        {l.primer_apertura_at ? (
                          <span className="text-green-600 font-medium">🟢 Contactado</span>
                        ) : (
                          <span className="text-red-500 font-medium">🔴 Pendiente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
