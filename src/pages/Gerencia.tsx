import { TrendingUp } from "lucide-react";
export default function Gerencia() {
  return (
    <div>
      <div className="page-header"><div><h1 className="page-title">Gerencia</h1><p className="page-subtitle">Panel de gerencia</p></div></div>
      <div className="flex flex-col items-center justify-center py-20" style={{ color: "hsl(var(--muted-foreground))" }}>
        <TrendingUp size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium">Módulo de Gerencia</p>
        <p className="text-sm mt-1">Próximamente disponible</p>
      </div>
    </div>
  );
}
