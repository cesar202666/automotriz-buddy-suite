import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Car, UserCheck, CreditCard,
  ShoppingCart, Settings2, TrendingUp, BarChart3, Wrench, MessageSquare,
  Zap
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Clientes", icon: Users, path: "/clientes" },
  { label: "Vehículos", icon: Car, path: "/vehiculos" },
  { label: "Consignatarios", icon: UserCheck, path: "/consignatarios" },
  { label: "Créditos", icon: CreditCard, path: "/creditos" },
  { label: "Ventas", icon: ShoppingCart, path: "/ventas" },
  { label: "Administración", icon: Settings2, path: "/administracion" },
  { label: "Gerencia", icon: TrendingUp, path: "/gerencia" },
  { label: "Embudo", icon: Zap, path: "/embudo" },
  { label: "Conversaciones", icon: MessageSquare, path: "/conversaciones" },
  { label: "Métricas", icon: BarChart3, path: "/metricas" },
  { label: "Configuración", icon: Wrench, path: "/configuracion" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 flex flex-col" style={{ background: "hsl(var(--sidebar-background))" }}>
        {/* Logo */}
        <div className="px-3 py-4 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight text-white">Egaña</div>
              <div className="text-xs leading-tight" style={{ color: "hsl(var(--sidebar-foreground))" }}>CRM + AI Agents</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link key={item.path} to={item.path} className={`sidebar-link${active ? " active" : ""}`}>
                <Icon size={15} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="text-xs font-semibold text-white">Egaña Automotriz</div>
          <div className="text-xs" style={{ color: "hsl(var(--sidebar-foreground))" }}>Sistema CRM IA</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
