import { BarChart3 } from "lucide-react";
export default function Metricas() {
  return (
    <div>
      <div className="page-header"><div><h1 className="page-title">Métricas</h1><p className="page-subtitle">Análisis y reportes</p></div></div>
      <div className="flex flex-col items-center justify-center py-20" style={{ color: "hsl(var(--muted-foreground))" }}>
        <BarChart3 size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium">Módulo de Métricas</p>
        <p className="text-sm mt-1">Próximamente disponible</p>
      </div>
    </div>
  );
}
