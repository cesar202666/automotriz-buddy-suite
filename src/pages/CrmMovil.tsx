import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, type Usuario } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Lock, LayoutGrid, Car, ShoppingCart, Users, UserCheck, CreditCard, LayoutDashboard, BarChart3, X } from "lucide-react";
import logoEa from "@/assets/logo-ea.jpg";
import Conversaciones from "@/pages/Conversaciones";
import InstallPWAButton from "@/components/InstallPWAButton";
import MobileNotifications from "@/components/MobileNotifications";

// Modulos accesibles desde el menu del CRM movil. Se filtran por rol.
const MOBILE_MODULES = [
  { label: "Vehículos", icon: Car, path: "/vehiculos" },
  { label: "Ventas", icon: ShoppingCart, path: "/ventas" },
  { label: "Clientes", icon: Users, path: "/clientes" },
  { label: "Consignatarios", icon: UserCheck, path: "/consignatarios" },
  { label: "Créditos", icon: CreditCard, path: "/creditos" },
  { label: "AutoRed", icon: BarChart3, path: "/autored" },
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
];

type BackendLoginRow = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  clave: string | null;
  activo: boolean | null;
  rol: string | null;
};

function norm(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

function splitNombre(nombre: string) {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  const [n, ...rest] = limpio.split(" ");
  return { nombre: n || "", apellido: rest.join(" ") };
}

function resolveRol(email: string, dbRol: string | null): Usuario["rol"] {
  const valid: Usuario["rol"][] = ["master", "administracion", "vendedor"];
  if (dbRol && valid.includes(dbRol as Usuario["rol"])) return dbRol as Usuario["rol"];
  if (email === "cesar@egana.cl") return "master";
  if (email === "pamela@egana.cl") return "administracion";
  return "vendedor";
}

function MobileLogin({ onLogin }: { onLogin: (clave: string) => Promise<boolean> }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onLogin(clave);
      if (!ok) {
        setError("Clave incorrecta");
        setClave("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-sm border" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="flex items-center gap-3 mb-6">
          <img src={logoEa} alt="Egaña" className="w-12 h-12 rounded-lg object-cover" />
          <div>
            <div className="text-base font-bold">Egaña CRM</div>
            <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Acceso móvil</div>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-1" style={{ color: "hsl(var(--primary))" }}>
          <Lock size={16} />
          <h2 className="text-sm font-bold">Iniciar Sesión</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Ingresa tu contraseña.</p>
        <form onSubmit={handle}>
          <input
            type="password"
            autoFocus
            disabled={busy}
            className="w-full border rounded-lg px-4 py-3 text-sm bg-background mb-2 focus:outline-none focus:ring-2"
            style={{ borderColor: error ? "hsl(var(--destructive))" : "hsl(var(--border))" }}
            placeholder="Tu contraseña..."
            value={clave}
            onChange={(e) => { setClave(e.target.value); setError(""); }}
          />
          {error && <p className="text-xs mb-2" style={{ color: "hsl(var(--destructive))" }}>{error}</p>}
          <button type="submit" disabled={busy} className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-70" style={{ background: "hsl(var(--primary))" }}>
            {busy ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CrmMovil() {
  const { usuarioActual, setUsuarioActual, usuarios, setUsuarios } = useApp();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);

  // Vendedor no ve Global/Administración/Gerencia/Configuración (igual que el sidebar).
  // De los modulos del menu movil, todos son accesibles para vendedor salvo ninguno extra.
  const modulosVisibles = MOBILE_MODULES;

  const handleLogin = async (clave: string): Promise<boolean> => {
    const c = clave.trim();
    if (!c) return false;
    const found = usuarios.find((u) => u.clave.trim() === c);
    if (found) { setUsuarioActual(found); return true; }

    const { data, error } = await supabase
      .from("vendedores")
      .select("id, nombre, email, telefono, clave, activo, rol")
      .eq("activo", true)
      .eq("clave", c)
      .limit(1)
      .maybeSingle();
    if (error || !data) return false;
    const v = data as unknown as BackendLoginRow;
    const email = norm(v.email);
    const split = splitNombre(v.nombre);
    const u: Usuario = {
      id: v.id,
      nombre: split.nombre || v.nombre,
      apellido: split.apellido,
      telefono: (v.telefono ?? "").trim(),
      clave: v.clave ?? c,
      rol: resolveRol(email, v.rol),
      email,
    };
    const idx = usuarios.findIndex(x => x.id === u.id || (email && norm(x.email) === email));
    if (idx >= 0) {
      const next = [...usuarios]; next[idx] = u; setUsuarios(next);
    } else {
      setUsuarios([...usuarios, u]);
    }
    setUsuarioActual(u);
    return true;
  };

  if (!usuarioActual) {
    return (
      <>
        <InstallPWAButton />
        <MobileLogin onLogin={handleLogin} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <InstallPWAButton />
      <MobileNotifications />
      <div className="crm-movil-wrap">
        <Conversaciones />
      </div>

      {/* Botón flotante: abre el menú para ir a Vehículos, Ventas, etc. */}
      <button
        onClick={() => setShowMenu(true)}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-white font-semibold text-sm"
        style={{ background: "hsl(var(--primary))" }}
        aria-label="Abrir menú de módulos"
      >
        <LayoutGrid size={18} /> Menú
      </button>

      {/* Hoja inferior con los módulos del ERP */}
      {showMenu && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowMenu(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full bg-card rounded-t-2xl p-4 pb-6 animate-fade-in"
            style={{ borderTop: "1px solid hsl(var(--border))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold">Ir a un módulo</div>
              <button onClick={() => setShowMenu(false)} className="p-1.5 rounded-full hover:bg-muted" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {modulosVisibles.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.path}
                    onClick={() => { setShowMenu(false); navigate(m.path); }}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border active:bg-muted/50"
                    style={{ borderColor: "hsl(var(--border))" }}
                  >
                    <Icon size={24} style={{ color: "hsl(var(--primary))" }} />
                    <span className="text-xs font-medium text-center">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
