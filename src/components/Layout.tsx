import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Car, UserCheck, CreditCard,
  ShoppingCart, Settings2, TrendingUp, Wrench, MessageSquare, Lock, LogOut, BarChart3,
  Eye, EyeOff,
} from "lucide-react";
import logoEa from "@/assets/logo-ea.jpg";
import { useApp, type Usuario } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Clientes", icon: Users, path: "/clientes" },
  { label: "Vehículos", icon: Car, path: "/vehiculos" },
  { label: "AutoRed", icon: BarChart3, path: "/autored" },
  { label: "Consignatarios", icon: UserCheck, path: "/consignatarios" },
  { label: "Créditos", icon: CreditCard, path: "/creditos" },
  { label: "Ventas", icon: ShoppingCart, path: "/ventas" },
  { label: "Administración", icon: Settings2, path: "/administracion" },
  { label: "Gerencia", icon: TrendingUp, path: "/gerencia" },
  { label: "CRM", icon: MessageSquare, path: "/conversaciones" },
  { label: "Configuración", icon: Wrench, path: "/configuracion" },
];

// Restricciones de navegación por rol:
// - vendedor: no ve Administración, Gerencia ni Configuración
// - administracion: no ve Gerencia
// - master: ve todo
const VENDEDOR_HIDDEN = ["/administracion", "/gerencia", "/configuracion"];
const ADMIN_HIDDEN = ["/gerencia"];

type BackendLoginRow = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  clave: string | null;
  activo: boolean | null;
  rol: string | null;
};

function normalizeLoginValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function splitNombreLogin(nombreCompleto: string) {
  const limpio = nombreCompleto.trim().replace(/\s+/g, " ");
  if (!limpio) return { nombre: "", apellido: "" };

  const [nombre, ...resto] = limpio.split(" ");
  return { nombre, apellido: resto.join(" ") };
}

function resolveUserRole(email: string, matchedUser: Usuario | null, dbRol: string | null): Usuario["rol"] {
  const validRoles: Usuario["rol"][] = ["master", "administracion", "vendedor"];
  if (dbRol && validRoles.includes(dbRol as Usuario["rol"])) return dbRol as Usuario["rol"];
  if (matchedUser) return matchedUser.rol;
  if (email === "cesar@egana.cl") return "master";
  if (email === "pamela@egana.cl") return "administracion";
  return "vendedor";
}

function LoginScreen({ onLogin }: { onLogin: (nombre: string, clave: string) => Promise<boolean> }) {
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [showClave, setShowClave] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const ok = await onLogin(nombre, clave);
      if (!ok) {
        setError("Nombre o contraseña incorrectos");
        setClave("");
        setShowClave(false);
      }
    } finally {
      setIsSubmitting(false);
    }
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
        <p className="text-xs mb-5" style={{ color: "hsl(var(--muted-foreground))" }}>Ingresa tu nombre y contraseña para acceder al sistema.</p>
        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-medium mb-1">Nombre</label>
          <input
            type="text"
            autoFocus
            disabled={isSubmitting}
            className="w-full border rounded-lg px-4 py-3 text-sm bg-background mb-3 focus:outline-none focus:ring-2"
            style={{ borderColor: error ? "hsl(var(--destructive))" : "hsl(var(--border))" }}
            placeholder="Tu nombre..."
            value={nombre}
            onChange={e => { setNombre(e.target.value); setError(""); }}
          />
          <label className="block text-xs font-medium mb-1">Contraseña</label>
          <div className="relative mb-2">
            <input
              type={showClave ? "text" : "password"}
              disabled={isSubmitting}
              className="w-full border rounded-lg px-4 py-3 pr-11 text-sm bg-background focus:outline-none focus:ring-2"
              style={{ borderColor: error ? "hsl(var(--destructive))" : "hsl(var(--border))" }}
              placeholder="Tu contraseña..."
              value={clave}
              onChange={e => { setClave(e.target.value); setError(""); }}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowClave(s => !s)}
              disabled={isSubmitting}
              aria-label={showClave ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              {showClave ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <p className="text-xs mb-3" style={{ color: "hsl(var(--destructive))" }}>{error}</p>}
          <button type="submit" disabled={isSubmitting} className="w-full py-2.5 rounded-lg text-sm font-medium text-white mt-1 disabled:opacity-70" style={{ background: "hsl(var(--primary))" }}>
            {isSubmitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { usuarioActual, setUsuarioActual, usuarios, setUsuarios } = useApp();
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

  const handleLogin = async (nombreEnviado: string, clave: string): Promise<boolean> => {
    const claveIngresada = clave.trim();
    const nombreIngresado = nombreEnviado.trim();
    if (!claveIngresada || !nombreIngresado) return false;

    const nombreNorm = nombreIngresado.toLowerCase();

    // 1. Buscar en usuarios locales por nombre (primer nombre, nombre+apellido, o email)
    const found = usuarios.find((u) => {
      if (u.clave.trim() !== claveIngresada) return false;
      const primer = u.nombre.trim().toLowerCase();
      const completo = `${u.nombre} ${u.apellido}`.trim().toLowerCase();
      const email = (u.email || "").trim().toLowerCase();
      return primer === nombreNorm || completo === nombreNorm || email === nombreNorm;
    });
    if (found) {
      setUsuarioActual(found);
      return true;
    }

    // 2. Consultar Supabase: clave + nombre/email coincide
    const { data: rows, error } = await supabase
      .from("vendedores")
      .select("id, nombre, email, telefono, clave, activo, rol")
      .eq("activo", true)
      .eq("clave", claveIngresada);

    if (error || !rows || rows.length === 0) return false;

    // Filtrar por nombre/email
    const data = (rows as BackendLoginRow[]).find((row) => {
      const nombreCompleto = (row.nombre || "").trim().toLowerCase();
      const primerNombre = nombreCompleto.split(/\s+/)[0] || "";
      const emailNorm = (row.email || "").trim().toLowerCase();
      return nombreCompleto === nombreNorm || primerNombre === nombreNorm || emailNorm === nombreNorm;
    });

    if (!data) return false;

    const vendedor = data;
    const email = normalizeLoginValue(vendedor.email);
    const nombreNormalizado = normalizeLoginValue(vendedor.nombre);
    const telefono = (vendedor.telefono ?? "").trim();

    const existingIndex = usuarios.findIndex((item) => {
      const nombreCompleto = normalizeLoginValue(`${item.nombre} ${item.apellido}`);
      return item.id === vendedor.id || (email && normalizeLoginValue(item.email) === email) || nombreCompleto === nombreNormalizado;
    });

    const existingUser = existingIndex >= 0 ? usuarios[existingIndex] : null;
    const nombreSeparado = splitNombreLogin(vendedor.nombre);
    const usuarioSincronizado: Usuario = {
      id: vendedor.id,
      nombre: existingUser?.nombre || nombreSeparado.nombre || vendedor.nombre,
      apellido: existingUser?.apellido || nombreSeparado.apellido,
      telefono: existingUser?.telefono || telefono,
      clave: vendedor.clave ?? claveIngresada,
      rol: resolveUserRole(email, existingUser, vendedor.rol),
      email: existingUser?.email || email,
    };

    if (existingIndex >= 0) {
      const nextUsuarios = [...usuarios];
      nextUsuarios[existingIndex] = usuarioSincronizado;
      setUsuarios(nextUsuarios);
    } else {
      setUsuarios([...usuarios, usuarioSincronizado]);
    }

    setUsuarioActual(usuarioSincronizado);
    return true;
  };

  if (!usuarioActual) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const rolUsuario = usuarioActual.rol;
  const visibleNavItems = navItems.filter(item => {
    if (rolUsuario === "vendedor" && VENDEDOR_HIDDEN.includes(item.path)) return false;
    if (rolUsuario === "administracion" && ADMIN_HIDDEN.includes(item.path)) return false;
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
            const isCRM = item.path === "/conversaciones";
            return (
              <Link key={item.path} to={item.path} className={`sidebar-link${active ? " active" : ""}`}>
                <Icon size={15} />
                <span className="flex-1">{item.label}</span>
                {isCRM && newLeadsCount > 0 && (
                  <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full text-white text-xs flex items-center justify-center font-bold px-1"
                    style={{ background: "#ef4444", fontSize: 10 }}>
                    {newLeadsCount > 9 ? "9+" : newLeadsCount}
                  </span>
                )}
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
