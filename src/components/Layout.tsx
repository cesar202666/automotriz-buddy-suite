import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Car, UserCheck, CreditCard,
  ShoppingCart, Settings2, TrendingUp, Wrench, MessageSquare, Lock, LogOut,
} from "lucide-react";
import logoEa from "@/assets/logo-ea.jpg";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Clientes", icon: Users, path: "/clientes" },
  { label: "Vehículos", icon: Car, path: "/vehiculos" },
  { label: "Consignatarios", icon: UserCheck, path: "/consignatarios" },
  { label: "Créditos", icon: CreditCard, path: "/creditos" },
  { label: "Ventas", icon: ShoppingCart, path: "/ventas" },
  { label: "Administración", icon: Settings2, path: "/administracion" },
  { label: "Gerencia", icon: TrendingUp, path: "/gerencia" },
  { label: "CRM", icon: MessageSquare, path: "/conversaciones" },
  { label: "Configuración", icon: Wrench, path: "/configuracion" },
];

// Roles que pueden ver admin/gerencia
const ADMIN_ROUTES = ["/administracion", "/gerencia"];
const VENDEDOR_HIDDEN = ["/administracion", "/gerencia"];

function LoginScreen({ onLogin }: { onLogin: (clave: string) => boolean }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onLogin(clave);
    if (!ok) { setError("Clave incorrecta"); setClave(""); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="bg-card rounded-2xl shadow-2xl p-10 w-full max-w-sm border" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="flex items-center gap-3 mb-8">
          <img src={logoEa} alt="Egaña" className="w-12 h-12 rounded-lg object-cover" />
          <div>
            <div className="text-lg font-bold">Egaña Automotriz</div>
            <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Sistema ERP</div>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-1" style={{ color: "hsl(var(--primary))" }}>
          <Lock size={18} />
          <h2 className="text-base font-bold">Iniciar Sesión</h2>
        </div>
        <p className="text-xs mb-5" style={{ color: "hsl(var(--muted-foreground))" }}>Ingresa tu contraseña para acceder al sistema.</p>
        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-medium mb-1">Contraseña</label>
          <input
            type="password"
            autoFocus
            className="w-full border rounded-lg px-4 py-3 text-sm bg-background mb-2 focus:outline-none focus:ring-2"
            style={{ borderColor: error ? "hsl(var(--destructive))" : "hsl(var(--border))" }}
            placeholder="Tu contraseña..."
            value={clave}
            onChange={e => { setClave(e.target.value); setError(""); }}
          />
          {error && <p className="text-xs mb-3" style={{ color: "hsl(var(--destructive))" }}>{error}</p>}
          <button type="submit" className="w-full py-2.5 rounded-lg text-sm font-medium text-white mt-1" style={{ background: "hsl(var(--primary))" }}>
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { usuarioActual, setUsuarioActual, usuarios } = useApp();
  const [newLeadsCount, setNewLeadsCount] = useState(0);

  // ── Poll for new unassigned/new leads as notification badge ────────────────
  useEffect(() => {
    if (!usuarioActual) return;
    const loadBadge = async () => {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("etapa", "contactado")
        .is("primer_apertura_at", null);
      setNewLeadsCount(count || 0);
    };
    loadBadge();
    const ch = supabase.channel("leads-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, loadBadge)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [usuarioActual]);
    const found = usuarios.find(u => u.clave === clave);
    if (found) { setUsuarioActual(found); return true; }
    return false;
  };

  if (!usuarioActual) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const rolUsuario = usuarioActual.rol;
  const visibleNavItems = navItems.filter(item => {
    if (rolUsuario === "vendedor" && VENDEDOR_HIDDEN.includes(item.path)) return false;
    return true;
  });

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 flex flex-col" style={{ background: "hsl(var(--sidebar-background))" }}>
        {/* Logo */}
        <div className="px-3 py-4 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="flex items-center gap-2">
            <img src={logoEa} alt="Egaña Automotriz" className="w-9 h-9 rounded-md object-cover" />
            <div>
              <div className="text-sm font-bold leading-tight text-white">Egaña</div>
              <div className="text-xs leading-tight" style={{ color: "hsl(var(--sidebar-foreground))" }}>Automotriz</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {visibleNavItems.map((item) => {
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

        {/* Footer - user info + logout */}
        <div className="px-3 py-3 border-t" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="text-xs font-semibold text-white truncate">{usuarioActual.nombre} {usuarioActual.apellido}</div>
          <div className="text-xs mb-2" style={{ color: "hsl(var(--sidebar-foreground))" }}>
            {rolUsuario === "master" ? "Admin Master" : rolUsuario === "administracion" ? "Administración" : "Vendedor"}
          </div>
          <button
            onClick={() => setUsuarioActual(null)}
            className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded w-full hover:bg-white/10 transition-colors"
            style={{ color: "hsl(var(--sidebar-foreground))" }}>
            <LogOut size={12} /> Cerrar sesión
          </button>
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
