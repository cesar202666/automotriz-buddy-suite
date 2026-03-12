import { Car, Users, UserCheck, CreditCard, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";

const stats = [
  { label: "Clientes", value: "4", icon: Users, path: "/clientes", color: "hsl(217,91%,50%)" },
  { label: "Vehículos", value: "1", icon: Car, path: "/vehiculos", color: "hsl(142,71%,45%)" },
  { label: "Consignatarios", value: "1", icon: UserCheck, path: "/consignatarios", color: "hsl(38,92%,50%)" },
  { label: "Créditos", value: "2", icon: CreditCard, path: "/creditos", color: "hsl(0,84%,60%)" },
  { label: "Ventas", value: "0", icon: ShoppingCart, path: "/ventas", color: "hsl(262,80%,58%)" },
];

export default function Dashboard() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Bienvenido a Egaña Automotriz CRM</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <Link key={s.path} to={s.path} className="bg-card rounded-xl border p-5 hover:shadow-md transition-shadow" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: s.color + "20" }}>
                  <Icon size={18} style={{ color: s.color }} />
                </div>
              </div>
              <div className="text-2xl font-bold mb-0.5">{s.value}</div>
              <div className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
