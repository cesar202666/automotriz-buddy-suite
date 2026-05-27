import { useState, useEffect } from "react";
import {
  Wrench, Key, Lock, CheckCircle, XCircle, Loader2, Eye, EyeOff,
  Cpu, Globe, Copy, ChevronDown, ChevronUp, Bot, Users, Clock,
  AlertCircle, Settings2, ArrowUp, ArrowDown, RotateCw, Smartphone,
  UserPlus, Trash2, Shield,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useApp, type Usuario } from "@/context/AppContext";

const MASTER_PASS = "ankker2026$$";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { id: "gemini", label: "Google Gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"] },
];

const META_FIELDS = [
  { id: "META_VERIFY_TOKEN", label: "Token de Verificación del Webhook", desc: "Texto que tú defines. Meta lo usará para verificar tu webhook." },
  { id: "META_ACCESS_TOKEN", label: "Access Token de Meta", desc: "Token de larga duración de tu app en Meta for Developers" },
  { id: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone Number ID de WhatsApp", desc: "Meta for Developers → WhatsApp → Configuración API → Phone Number ID" },
  { id: "FACEBOOK_PAGE_ID", label: "ID de Página de Facebook", desc: "Configuración de tu página → Información → ID de página" },
  { id: "INSTAGRAM_ACCOUNT_ID", label: "ID de cuenta Instagram Business", desc: "Meta for Developers → Instagram → ID de cuenta" },
  { id: "MANYCHAT_API_KEY", label: "API Key de ManyChat", desc: "ManyChat → Settings → API → API Key (necesaria para campañas)" },
];

const AGENT_MODELS = [
  { group: "OpenAI", models: ["openai/gpt-4o", "openai/gpt-4o-mini", "openai/gpt-3.5-turbo"] },
  { group: "Google Gemini", models: ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "google/gemini-1.5-flash"] },
];

const DEFAULT_SYSTEM_PROMPT = `Eres el asistente virtual de Egaña Automotriz, una automotora ubicada en Chile.
Tu nombre es "Asistente Egaña". Atiendes por WhatsApp, Instagram y Facebook.

OBJETIVO PRINCIPAL:
Calificar leads y capturar sus datos para que un vendedor los contacte.

COMPORTAMIENTO:
- Saluda cordialmente usando el nombre del cliente si lo tienes
- Sé breve, máximo 3 líneas por respuesta
- Usa español chileno informal pero respetuoso
- Nunca inventes precios ni disponibilidad de vehículos específicos
- Nunca digas que eres una IA a menos que te lo pregunten directamente

PREGUNTAS QUE DEBES HACER EN ORDEN:
1. ¿Qué tipo de vehículo estás buscando? (marca, modelo, año aproximado)
2. ¿Cuál es tu presupuesto aproximado?
3. ¿Lo necesitas pronto o estás cotizando?
4. ¿Me puedes dar tu nombre completo y teléfono para que un vendedor te contacte?

SCORING — evalúa internamente al cliente:
- Tiene presupuesto definido → lead caliente (score alto)
- Necesita el vehículo pronto → urgencia alta
- Solo está cotizando sin presupuesto → lead frío (score bajo)
- Pregunta por modelos específicos → lead calificado

CUÁNDO ESCALAR AL VENDEDOR:
Cuando tengas nombre, teléfono e interés claro, o cuando el cliente diga alguna de estas frases:
"quiero hablar con un vendedor", "necesito hablar con alguien", "me pueden llamar",
"quiero que me contacten", "quiero hablar con una persona"

Cuando escales responde:
"¡Perfecto [nombre]! Le voy a pasar tus datos a uno de nuestros ejecutivos para que te contacte a la brevedad. ¡Gracias por contactarnos!"

TEMAS QUE NO DEBES RESPONDER:
- Precios exactos de vehículos específicos
- Disponibilidad de stock en tiempo real
- Condiciones de crédito específicas
- Temas no relacionados con la compra de vehículos`;

const DEFAULT_PALABRAS_CLAVE = [
  "quiero hablar con un vendedor",
  "necesito hablar con alguien",
  "me pueden llamar",
  "quiero que me contacten",
  "quiero hablar con una persona",
  "hablar con ejecutivo",
  "necesito un ejecutivo",
].join("\n");

const DEFAULT_MSG_NOTIF = `Hola {{vendedor}}, tienes un nuevo lead:
👤 Cliente: {{nombre_cliente}}
📱 Canal: {{canal}}
🚗 Interés: {{interes}}
📞 Teléfono: {{telefono}}
⭐ Score: {{score}}/100`;

const DEFAULT_MSG_FUERA = "Hola, en este momento estamos fuera de horario de atención. Nuestro horario es de Lunes a Viernes de 9:00 a 19:00 hrs. Te contactaremos a la brevedad. ¡Gracias!";

const DIAS_DEFAULT = [
  { dia: "Lunes", activo: true, inicio: "09:00", fin: "19:00" },
  { dia: "Martes", activo: true, inicio: "09:00", fin: "19:00" },
  { dia: "Miércoles", activo: true, inicio: "09:00", fin: "19:00" },
  { dia: "Jueves", activo: true, inicio: "09:00", fin: "19:00" },
  { dia: "Viernes", activo: true, inicio: "09:00", fin: "19:00" },
  { dia: "Sábado", activo: true, inicio: "10:00", fin: "14:00" },
  { dia: "Domingo", activo: false, inicio: "09:00", fin: "18:00" },
  { dia: "Festivos", activo: false, inicio: "09:00", fin: "18:00" },
];

interface ApiConfig {
  provider: string;
  apiKey: string;
  model: string;
  connected: boolean | null;
}

interface Vendedor {
  id: string;
  nombre: string;
  sucursal?: string;
}

interface DiaHorario {
  dia: string;
  activo: boolean;
  inicio: string;
  fin: string;
}

interface RotacionVendedor {
  vendedor_id: string;
  nombre: string;
  sucursal: string;
  activo: boolean;
  consecutivos: number;
}

// ── Helper: upsert a single key in configuracion_sistema ─────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sbAny = supabase as any;
async function upsertConfig(clave: string, valor: string) {
  await sbAny.from("configuracion_sistema").upsert({ clave, valor }, { onConflict: "clave" });
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm" style={{ borderColor: "hsl(var(--border))" }}>
      {children}
    </div>
  );
}

function CardHeader({ icon, color, title, subtitle, badge }: {
  icon: React.ReactNode; color?: string; title: string; subtitle: string; badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: color || "hsl(var(--primary)/0.1)" }}>
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{subtitle}</p>
      </div>
      {badge && <div className="ml-auto">{badge}</div>}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none"
      style={{ background: value ? "hsl(var(--primary))" : "hsl(var(--muted))" }}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: value ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
function AccesoMovilCRM() {
  const url = `${import.meta.env.VITE_PUBLIC_APP_URL ?? window.location.origin}/#/crm-movil`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="flex items-center gap-2 mb-1">
        <Smartphone size={18} style={{ color: "hsl(var(--primary))" }} />
        <h3 className="text-base font-bold">Acceso Móvil CRM</h3>
      </div>
      <p className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
        Comparte este enlace con los vendedores para que usen el CRM desde su celular como una app instalable.
      </p>

      <div className="flex flex-col md:flex-row gap-5 items-start">
        <div className="flex-1 w-full space-y-3">
          <div>
            <label className="text-xs font-semibold block mb-1">URL del CRM móvil</label>
            <div className="rounded-lg p-3 font-mono text-xs break-all select-all" style={{ background: "hsl(var(--muted))", color: "hsl(var(--primary))" }}>
              {url}
            </div>
          </div>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--border))" }}
          >
            {copied ? <CheckCircle size={14} style={{ color: "hsl(var(--success))" }} /> : <Copy size={14} />}
            {copied ? "¡Enlace copiado!" : "Copiar enlace"}
          </button>
          <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            📱 Abre este enlace en Chrome desde tu celular para instalar la app <strong>Egaña CRM</strong> en tu pantalla de inicio.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 mx-auto md:mx-0">
          <div className="bg-white p-3 rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
            <QRCodeSVG value={url} size={140} level="M" />
          </div>
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Escanea con tu cámara</span>
        </div>
      </div>
    </div>
  );
}

export default function Configuracion() {
  const { usuarioActual } = useApp();
  const isMaster = usuarioActual?.rol === "master";
  // Master entra sin pedir clave; otros usuarios deben ingresar la clave master
  const [authenticated, setAuthenticated] = useState(isMaster);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Si el usuario master se loguea después del primer render, autenticar automáticamente
  useEffect(() => {
    if (isMaster && !authenticated) setAuthenticated(true);
  }, [isMaster, authenticated]);

  // IA providers
  const [configs, setConfigs] = useState<ApiConfig[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ea_api_configs") || "[]") as ApiConfig[];
      return PROVIDERS.map(p => {
        const found = saved.find(c => c.provider === p.id);
        return found ? { ...found, connected: null } : { provider: p.id, apiKey: "", model: p.models[0], connected: null };
      });
    } catch {
      return PROVIDERS.map(p => ({ provider: p.id, apiKey: "", model: p.models[0], connected: null }));
    }
  });
  const [testing, setTesting] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Meta
  const [metaConfig, setMetaConfig] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("ea_meta_config") || "{}"); } catch { return {}; }
  });
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);
  const [testingMeta, setTestingMeta] = useState(false);
  const [showMetaKeys, setShowMetaKeys] = useState<Record<string, boolean>>({});

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "";
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/meta-webhook`;

  // ── Agente IA ──────────────────────────────────────────────────────────────
  const [agenteName, setAgenteName] = useState("Asistente Egaña");
  const [agentePrompt, setAgentePrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [agenteModel, setAgenteModel] = useState("google/gemini-2.5-flash");
  const [agenteMaxMsg, setAgenteMaxMsg] = useState(10);
  const [agenteTemp, setAgenteTemp] = useState(0.7);
  const [savingAgente, setSavingAgente] = useState(false);
  const [agenteSaved, setAgenteSaved] = useState<boolean | null>(null);

  // ── Distribución ──────────────────────────────────────────────────────────
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [modoAsignacion, setModoAsignacion] = useState("ORDENADO");
  const [vendedorDefault, setVendedorDefault] = useState("");
  const [asignacionPorCanal, setAsignacionPorCanal] = useState({ whatsapp: "", instagram: "", facebook: "", presencial: "" });
  const [scoreMinimo, setScoreMinimo] = useState(60);
  const [palabrasClave, setPalabrasClave] = useState(DEFAULT_PALABRAS_CLAVE);
  const [notificarVendedor, setNotificarVendedor] = useState(true);
  const [msgNotificacion, setMsgNotificacion] = useState(DEFAULT_MSG_NOTIF);
  const [savingDist, setSavingDist] = useState(false);
  const [distSaved, setDistSaved] = useState<boolean | null>(null);

  // ── Horarios ──────────────────────────────────────────────────────────────
  const [horariosActivos, setHorariosActivos] = useState(false);
  const [horariosConfig, setHorariosConfig] = useState<DiaHorario[]>(DIAS_DEFAULT);
  const [msgFueraHorario, setMsgFueraHorario] = useState(DEFAULT_MSG_FUERA);
  const [savingHorarios, setSavingHorarios] = useState(false);
  const [horariosSaved, setHorariosSaved] = useState<boolean | null>(null);

  // ── Rotación de Vendedores ──────────────────────────────────────────────
  const [rotacionVendedores, setRotacionVendedores] = useState<RotacionVendedor[]>([]);
  const [savingRotacion, setSavingRotacion] = useState(false);
  const [rotacionSaved, setRotacionSaved] = useState<boolean | null>(null);

  // Load config from DB on mount
  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      // 1) Load saved config first
      const { data: cfgData } = await sbAny.from("configuracion_sistema").select("clave, valor") as { data: { clave: string; valor: string }[] | null };
      const map = cfgData ? Object.fromEntries(cfgData.map((r) => [r.clave, r.valor])) : {};
      if (map.AGENT_NAME) setAgenteName(map.AGENT_NAME);
      if (map.AGENT_SYSTEM_PROMPT) setAgentePrompt(map.AGENT_SYSTEM_PROMPT);
      if (map.AGENT_MODEL) setAgenteModel(map.AGENT_MODEL);
      if (map.AGENT_MAX_MESSAGES) setAgenteMaxMsg(Number(map.AGENT_MAX_MESSAGES));
      if (map.AGENT_TEMPERATURE) setAgenteTemp(Number(map.AGENT_TEMPERATURE));
      if (map.ASIGNACION_MODO) setModoAsignacion(map.ASIGNACION_MODO);
      if (map.VENDEDOR_DEFAULT !== undefined) setVendedorDefault(map.VENDEDOR_DEFAULT);
      if (map.ASIGNACION_POR_CANAL) { try { setAsignacionPorCanal(JSON.parse(map.ASIGNACION_POR_CANAL)); } catch {} }
      if (map.SCORE_MINIMO_ESCALAR) setScoreMinimo(Number(map.SCORE_MINIMO_ESCALAR));
      if (map.PALABRAS_CLAVE_ESCALAR) {
        try { setPalabrasClave((JSON.parse(map.PALABRAS_CLAVE_ESCALAR) as string[]).join("\n")); } catch {}
      }
      if (map.NOTIFICAR_VENDEDOR !== undefined) setNotificarVendedor(map.NOTIFICAR_VENDEDOR === "true");
      if (map.MENSAJE_NOTIFICACION_VENDEDOR) setMsgNotificacion(map.MENSAJE_NOTIFICACION_VENDEDOR);
      if (map.HORARIOS_ACTIVOS !== undefined) setHorariosActivos(map.HORARIOS_ACTIVOS === "true");
      if (map.HORARIOS_CONFIG) { try { setHorariosConfig(JSON.parse(map.HORARIOS_CONFIG)); } catch {} }
      if (map.MENSAJE_FUERA_HORARIO) setMsgFueraHorario(map.MENSAJE_FUERA_HORARIO);

      let savedRotacion: RotacionVendedor[] = [];
      if (map.ROTACION_VENDEDORES) {
        try { savedRotacion = JSON.parse(map.ROTACION_VENDEDORES) as RotacionVendedor[]; } catch {}
      }

      // 2) Load active vendedores and merge into rotation
      const { data: vendData } = await supabase
        .from("vendedores")
        .select("id, nombre, sucursal")
        .eq("activo", true)
        .eq("rol", "vendedor");

      if (vendData) {
        setVendedores(vendData as Vendedor[]);
        const norm = (s: string) => (s || "").trim().toLowerCase();
        const activeNames = new Set((vendData as Vendedor[]).map(v => norm(v.nombre)));
        // Keep saved entries for vendedores that still exist and are active
        const filtered = savedRotacion.filter(p => activeNames.has(norm(p.nombre)));
        const existingNames = new Set(filtered.map(p => norm(p.nombre)));
        // Append any active vendedores that aren't in the saved list
        const additions = (vendData as Vendedor[])
          .filter(v => !existingNames.has(norm(v.nombre)))
          .map(v => ({
            vendedor_id: v.id,
            nombre: v.nombre,
            sucursal: v.sucursal || "",
            activo: true,
            consecutivos: 1,
          }));
        setRotacionVendedores([...filtered, ...additions]);
      } else {
        setRotacionVendedores(savedRotacion);
      }
    })();
  }, [authenticated]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    if (passInput === MASTER_PASS) { setAuthenticated(true); setPassError(false); }
    else { setPassError(true); setPassInput(""); }
  };

  // ── IA providers ──────────────────────────────────────────────────────────
  const updateConfig = (provider: string, field: keyof ApiConfig, value: string | boolean | null) => {
    setConfigs(prev => prev.map(c => c.provider === provider ? { ...c, [field]: value } : c));
  };

  const testConnection = async (cfg: ApiConfig) => {
    if (!cfg.apiKey.trim()) { alert("Ingresa una API Key antes de conectar."); return; }
    setTesting(cfg.provider);
    updateConfig(cfg.provider, "connected", null);
    try {
      let ok = false;
      if (cfg.provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
        ok = res.ok;
      } else if (cfg.provider === "gemini") {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cfg.apiKey}`);
        ok = res.ok;
      }
      updateConfig(cfg.provider, "connected", ok);
    } catch { updateConfig(cfg.provider, "connected", false); }
    finally { setTesting(null); }
  };

  const testMetaConnection = async () => {
    if (!metaConfig.META_ACCESS_TOKEN) { alert("Ingresa el Access Token de Meta primero."); return; }
    setTestingMeta(true); setMetaConnected(null);
    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${metaConfig.META_ACCESS_TOKEN}`);
      setMetaConnected(res.ok);
    } catch { setMetaConnected(false); }
    setTestingMeta(false);
  };

  const saveAll = () => {
    localStorage.setItem("ea_api_configs", JSON.stringify(configs));
    localStorage.setItem("ea_meta_config", JSON.stringify(metaConfig));
    alert("Configuración guardada correctamente.");
  };

  // ── Save Agente ────────────────────────────────────────────────────────────
  const saveAgente = async () => {
    setSavingAgente(true);
    localStorage.setItem("ea_agente_config", JSON.stringify({ agenteName, agentePrompt, agenteModel, agenteMaxMsg, agenteTemp }));
    try {
      await Promise.all([
        upsertConfig("AGENT_NAME", agenteName),
        upsertConfig("AGENT_SYSTEM_PROMPT", agentePrompt),
        upsertConfig("AGENT_MODEL", agenteModel),
        upsertConfig("AGENT_MAX_MESSAGES", String(agenteMaxMsg)),
        upsertConfig("AGENT_TEMPERATURE", String(agenteTemp)),
      ]);
      setAgenteSaved(true);
    } catch { setAgenteSaved(false); }
    setSavingAgente(false);
    setTimeout(() => setAgenteSaved(null), 3000);
  };

  // ── Save Distribución ──────────────────────────────────────────────────────
  const saveDist = async () => {
    setSavingDist(true);
    const palabrasArr = palabrasClave.split("\n").map(s => s.trim()).filter(Boolean);
    try {
      await Promise.all([
        upsertConfig("ASIGNACION_MODO", modoAsignacion),
        upsertConfig("VENDEDOR_DEFAULT", vendedorDefault),
        upsertConfig("ASIGNACION_POR_CANAL", JSON.stringify(asignacionPorCanal)),
        upsertConfig("SCORE_MINIMO_ESCALAR", String(scoreMinimo)),
        upsertConfig("PALABRAS_CLAVE_ESCALAR", JSON.stringify(palabrasArr)),
        upsertConfig("NOTIFICAR_VENDEDOR", String(notificarVendedor)),
        upsertConfig("MENSAJE_NOTIFICACION_VENDEDOR", msgNotificacion),
      ]);
      localStorage.setItem("ea_distribucion_config", JSON.stringify({ modoAsignacion, vendedorDefault, asignacionPorCanal, scoreMinimo, palabrasArr, notificarVendedor, msgNotificacion }));
      setDistSaved(true);
    } catch { setDistSaved(false); }
    setSavingDist(false);
    setTimeout(() => setDistSaved(null), 3000);
  };

  // ── Save Horarios ──────────────────────────────────────────────────────────
  const saveHorarios = async () => {
    setSavingHorarios(true);
    try {
      await Promise.all([
        upsertConfig("HORARIOS_ACTIVOS", String(horariosActivos)),
        upsertConfig("HORARIOS_CONFIG", JSON.stringify(horariosConfig)),
        upsertConfig("MENSAJE_FUERA_HORARIO", msgFueraHorario),
      ]);
      setHorariosSaved(true);
    } catch { setHorariosSaved(false); }
    setSavingHorarios(false);
    setTimeout(() => setHorariosSaved(null), 3000);
  };

  const updateHorario = (idx: number, field: keyof DiaHorario, value: string | boolean) => {
    setHorariosConfig(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  // ── Rotación helpers ──────────────────────────────────────────────────────
  const moveVendedorRotacion = (idx: number, dir: "up" | "down") => {
    setRotacionVendedores(prev => {
      const arr = [...prev];
      const targetIdx = dir === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= arr.length) return prev;
      [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
      return arr;
    });
  };

  const toggleVendedorRotacion = (idx: number) => {
    setRotacionVendedores(prev => prev.map((v, i) => i === idx ? { ...v, activo: !v.activo } : v));
  };

  const setConsecutivosRotacion = (idx: number, val: number) => {
    setRotacionVendedores(prev => prev.map((v, i) => i === idx ? { ...v, consecutivos: Math.max(1, val) } : v));
  };

  const saveRotacion = async () => {
    setSavingRotacion(true);
    try {
      await upsertConfig("ROTACION_VENDEDORES", JSON.stringify(rotacionVendedores));
      setRotacionSaved(true);
    } catch { setRotacionSaved(false); }
    setSavingRotacion(false);
    setTimeout(() => setRotacionSaved(null), 3000);
  };

  // ── Status badge helpers ───────────────────────────────────────────────────
  const SavedBadge = ({ saved }: { saved: boolean | null }) => {
    if (saved === null) return null;
    if (saved) return <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle size={13} /> Guardado</span>;
    return <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}><XCircle size={13} /> Error al guardar</span>;
  };

  const promptBadge = agentePrompt.trim()
    ? <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle size={13} /> Configurado</span>
    : <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#fef9c3", color: "#a16207" }}><AlertCircle size={13} /> Por configurar</span>;

  // ── Login screen ───────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div>
        <div className="page-header"><div><h1 className="page-title">Configuración</h1><p className="page-subtitle">Acceso restringido — solo Administrador Master</p></div></div>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="bg-card border rounded-2xl shadow-lg p-10 w-full max-w-sm" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "hsl(var(--primary)/0.1)" }}>
                <Lock size={28} style={{ color: "hsl(var(--primary))" }} />
              </div>
              <h2 className="text-lg font-bold">Área Restringida</h2>
              <p className="text-xs mt-1 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>Ingresa la clave del Administrador Master para continuar</p>
            </div>
            <div className="relative mb-4">
              <input type={showPass ? "text" : "password"} className="w-full border rounded-lg px-4 py-3 text-sm bg-background pr-10" style={{ borderColor: passError ? "hsl(var(--destructive))" : "hsl(var(--border))" }} placeholder="Clave de acceso" value={passInput} onChange={e => { setPassInput(e.target.value); setPassError(false); }} onKeyDown={e => e.key === "Enter" && handleLogin()} />
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPass(!showPass)} style={{ color: "hsl(var(--muted-foreground))" }}>{showPass ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
            {passError && <p className="text-xs mb-3" style={{ color: "hsl(var(--destructive))" }}>Clave incorrecta. Inténtalo de nuevo.</p>}
            <button onClick={handleLogin} className="w-full py-3 rounded-lg text-sm font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>Ingresar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Configuración del Sistema</h1><p className="page-subtitle">APIs de IA, Meta Business, Agente y ajustes generales</p></div>
        <button onClick={saveAll} className="px-4 py-2 rounded-md text-sm font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>Guardar APIs</button>
      </div>

      <div className="grid gap-6 max-w-3xl">

        {/* ── Acceso Móvil CRM ─────────────────────────────────────────────── */}
        <AccesoMovilCRM />

        {/* ── IA Providers ─────────────────────────────────────────────────── */}
        {PROVIDERS.map(provider => {
          const cfg = configs.find(c => c.provider === provider.id)!;
          const isVisible = showKeys[provider.id];
          const isTesting = testing === provider.id;
          return (
            <Card key={provider.id}>
              <CardHeader
                icon={<Cpu size={18} style={{ color: "hsl(var(--primary))" }} />}
                title={provider.label}
                subtitle="Configurar acceso a la API"
                badge={
                  cfg.connected === true ? <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle size={13} /> Conectado</span> :
                  cfg.connected === false ? <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}><XCircle size={13} /> Error</span> :
                  cfg.apiKey ? <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}><Key size={13} /> Sin verificar</span> : null
                }
              />
              <div className="space-y-4">
                <div><label className="block text-xs font-medium mb-1">API Key</label>
                  <div className="relative">
                    <input type={isVisible ? "text" : "password"} className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background pr-10" style={{ borderColor: "hsl(var(--border))" }} placeholder={`Pega tu API Key de ${provider.label}...`} value={cfg.apiKey} onChange={e => { updateConfig(provider.id, "apiKey", e.target.value); updateConfig(provider.id, "connected", null); }} />
                    <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))} style={{ color: "hsl(var(--muted-foreground))" }}>{isVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </div>
                </div>
                <div><label className="block text-xs font-medium mb-1">Modelo</label>
                  <select className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={cfg.model} onChange={e => updateConfig(provider.id, "model", e.target.value)}>
                    {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <button onClick={() => testConnection(cfg)} disabled={isTesting || !cfg.apiKey.trim()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-muted disabled:opacity-50" style={{ borderColor: "hsl(var(--border))" }}>
                  {isTesting ? <><Loader2 size={14} className="animate-spin" /> Verificando...</> : <><CheckCircle size={14} style={{ color: "hsl(var(--primary))" }} /> Probar Conexión</>}
                </button>
                {cfg.connected === true && <p className="text-xs font-medium" style={{ color: "#16a34a" }}>✅ Conexión establecida. Modelo: <strong>{cfg.model}</strong></p>}
                {cfg.connected === false && <p className="text-xs font-medium" style={{ color: "#dc2626" }}>❌ No se pudo conectar. Verifica la API Key.</p>}
              </div>
            </Card>
          );
        })}

        {/* ── TARJETA 1: Agente IA ──────────────────────────────────────────── */}
        <Card>
          <CardHeader
            icon={<Bot size={18} style={{ color: "hsl(var(--primary))" }} />}
            title="Agente IA — Comportamiento"
            subtitle="Personalidad, prompt y parámetros del bot de atención"
            badge={promptBadge}
          />
          <div className="space-y-5">
            {/* Nombre */}
            <div>
              <label className="block text-xs font-medium mb-1">Nombre del agente</label>
              <input className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={agenteName} onChange={e => setAgenteName(e.target.value)} placeholder="Asistente Egaña" />
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-medium mb-1">Proveedor y modelo del agente</label>
              <select className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={agenteModel} onChange={e => setAgenteModel(e.target.value)}>
                {AGENT_MODELS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Este modelo se usa en el agente-egana del backend</p>
            </div>

            {/* Prompt */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium">Instrucciones del agente IA (System Prompt)</label>
                <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{agentePrompt.length} chars</span>
              </div>
              <textarea
                rows={12}
                className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background font-mono resize-y"
                style={{ borderColor: "hsl(var(--border))" }}
                value={agentePrompt}
                onChange={e => setAgentePrompt(e.target.value)}
              />
            </div>

            {/* Max messages */}
            <div>
              <label className="block text-xs font-medium mb-1">Máx. mensajes antes de escalar al vendedor</label>
              <input type="number" min={1} max={50} className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={agenteMaxMsg} onChange={e => setAgenteMaxMsg(Number(e.target.value))} />
            </div>

            {/* Temperatura */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium">Temperatura (creatividad de respuestas)</label>
                <span className="text-xs font-semibold" style={{ color: "hsl(var(--primary))" }}>{agenteTemp.toFixed(1)}</span>
              </div>
              <input type="range" min={0} max={1} step={0.1} className="w-full accent-primary" value={agenteTemp} onChange={e => setAgenteTemp(Number(e.target.value))} />
              <div className="flex justify-between text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                <span>0 — Exacto</span><span>1 — Creativo</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveAgente}
                disabled={savingAgente}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "hsl(var(--primary))" }}
              >
                {savingAgente ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><CheckCircle size={14} /> Guardar configuración del agente</>}
              </button>
              <SavedBadge saved={agenteSaved} />
            </div>
          </div>
        </Card>

        {/* ── TARJETA 2: Distribución de Leads ─────────────────────────────── */}
        <Card>
          <CardHeader
            icon={<Users size={18} style={{ color: "hsl(var(--primary))" }} />}
            title="Distribución de Leads a Vendedores"
            subtitle="Cómo el agente asigna leads según canal, score y frases clave"
          />
          <div className="space-y-5">
            {/* Modo */}
            <div>
              <label className="block text-xs font-medium mb-1">¿Cómo asignar leads a vendedores?</label>
              <select className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={modoAsignacion} onChange={e => setModoAsignacion(e.target.value)}>
                <option value="ORDENADO">Balanceado — al vendedor con menos leads activos (recomendado)</option>
                <option value="RANDOM">Aleatorio — vendedor al azar</option>
                <option value="MANUAL">Manual — todos van sin asignar, el admin distribuye</option>
                <option value="POR_CANAL">Por canal — cada canal tiene vendedor fijo</option>
              </select>
            </div>

            {/* Vendedor default */}
            <div>
              <label className="block text-xs font-medium mb-1">Vendedor por defecto (cuando no hay otro criterio)</label>
              <select className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={vendedorDefault} onChange={e => setVendedorDefault(e.target.value)}>
                <option value="">Sin asignar</option>
                {vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}{v.sucursal ? ` — ${v.sucursal}` : ""}</option>)}
              </select>
            </div>

            {/* Por canal */}
            {modoAsignacion === "POR_CANAL" && (
              <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: "hsl(var(--border))" }}>
                <p className="text-xs font-semibold">Asignación por canal</p>
                {(["whatsapp", "instagram", "facebook", "presencial"] as const).map(canal => (
                  <div key={canal} className="flex items-center gap-3">
                    <span className="text-xs w-24 capitalize">{canal}</span>
                    <select className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={asignacionPorCanal[canal]} onChange={e => setAsignacionPorCanal(prev => ({ ...prev, [canal]: e.target.value }))}>
                      <option value="">Sin asignar</option>
                      {vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Score mínimo */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium">Score mínimo para pasar lead a vendedor automáticamente</label>
                <span className="text-xs font-semibold" style={{ color: "hsl(var(--primary))" }}>{scoreMinimo}/100</span>
              </div>
              <input type="range" min={0} max={100} step={5} className="w-full accent-primary" value={scoreMinimo} onChange={e => setScoreMinimo(Number(e.target.value))} />
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Si el lead alcanza este score, el agente lo escala sin esperar más</p>
            </div>

            {/* Palabras clave */}
            <div>
              <label className="block text-xs font-medium mb-1">Frases que activan transferencia a vendedor</label>
              <textarea rows={7} className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background font-mono resize-y" style={{ borderColor: "hsl(var(--border))" }} value={palabrasClave} onChange={e => setPalabrasClave(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Una frase por línea. Cuando el cliente escribe alguna de estas, el bot transfiere inmediatamente.</p>
            </div>

            {/* Notificar */}
            <div className="flex items-center gap-3">
              <Toggle value={notificarVendedor} onChange={setNotificarVendedor} />
              <label className="text-xs font-medium">Notificar al vendedor cuando recibe un lead</label>
            </div>

            {notificarVendedor && (
              <div>
                <label className="block text-xs font-medium mb-1">Mensaje de notificación al vendedor</label>
                <textarea rows={6} className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background font-mono resize-y" style={{ borderColor: "hsl(var(--border))" }} value={msgNotificacion} onChange={e => setMsgNotificacion(e.target.value)} />
                <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Variables: <code className="bg-muted px-1 rounded">{"{{vendedor}}"}</code> <code className="bg-muted px-1 rounded">{"{{nombre_cliente}}"}</code> <code className="bg-muted px-1 rounded">{"{{canal}}"}</code> <code className="bg-muted px-1 rounded">{"{{interes}}"}</code> <code className="bg-muted px-1 rounded">{"{{telefono}}"}</code> <code className="bg-muted px-1 rounded">{"{{score}}"}</code></p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={saveDist}
                disabled={savingDist}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "hsl(var(--primary))" }}
              >
                {savingDist ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><CheckCircle size={14} /> Guardar distribución</>}
              </button>
              <SavedBadge saved={distSaved} />
            </div>
          </div>
        </Card>

        {/* ── TARJETA: Rotación de Vendedores ──────────────────────────────── */}
        <Card>
          <CardHeader
            icon={<RotateCw size={18} style={{ color: "hsl(var(--primary))" }} />}
            title="Rotación de Vendedores"
            subtitle="Orden y cantidad de clientes que el agente IA asigna a cada vendedor"
            badge={
              rotacionVendedores.filter(v => v.activo).length > 0
                ? <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle size={13} /> {rotacionVendedores.filter(v => v.activo).length} activos</span>
                : <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}><XCircle size={13} /> Sin vendedores</span>
            }
          />
          <div className="space-y-4">
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Ordena los vendedores de arriba a abajo. El agente asignará clientes en ese orden. 
              Puedes definir cuántos clientes consecutivos recibe cada vendedor antes de pasar al siguiente, 
              y desactivar vendedores que no quieras incluir en la rotación.
            </p>

            <div className="border rounded-lg overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "hsl(var(--muted))" }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold w-10">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Vendedor</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold">Activo</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold">Clientes seguidos</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold w-20">Orden</th>
                  </tr>
                </thead>
                <tbody>
                  {rotacionVendedores.map((v, i) => (
                    <tr key={v.vendedor_id} className="border-t" style={{ borderColor: "hsl(var(--border))", opacity: v.activo ? 1 : 0.5 }}>
                      <td className="px-3 py-2 text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-medium">{v.nombre}</span>
                        {v.sucursal && <span className="text-xs ml-1" style={{ color: "hsl(var(--muted-foreground))" }}>— {v.sucursal}</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Toggle value={v.activo} onChange={() => toggleVendedorRotacion(i)} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          className="w-16 border rounded px-2 py-1 text-xs text-center bg-background"
                          style={{ borderColor: "hsl(var(--border))" }}
                          value={v.consecutivos}
                          onChange={e => setConsecutivosRotacion(i, Number(e.target.value))}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => moveVendedorRotacion(i, "up")}
                            disabled={i === 0}
                            className="p-1 rounded hover:bg-muted disabled:opacity-30"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => moveVendedorRotacion(i, "down")}
                            disabled={i === rotacionVendedores.length - 1}
                            className="p-1 rounded hover:bg-muted disabled:opacity-30"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rotacionVendedores.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>No hay vendedores registrados. Agrega vendedores en la sección Administración.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveRotacion}
                disabled={savingRotacion}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "hsl(var(--primary))" }}
              >
                {savingRotacion ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><CheckCircle size={14} /> Guardar rotación</>}
              </button>
              <SavedBadge saved={rotacionSaved} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<Clock size={18} style={{ color: "hsl(var(--primary))" }} />}
            title="Horarios de Atención del Bot"
            subtitle="Define cuándo el agente IA responde automáticamente"
            badge={
              horariosActivos
                ? <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle size={13} /> Activos</span>
                : <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>Desactivado</span>
            }
          />
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Toggle value={horariosActivos} onChange={setHorariosActivos} />
              <label className="text-xs font-medium">Usar horarios de atención</label>
            </div>

            {horariosActivos && (
              <>
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "hsl(var(--muted))" }}>
                        <th className="px-3 py-2 text-left text-xs font-semibold">Día</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold">Activo</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold">Inicio</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold">Fin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {horariosConfig.map((d, i) => (
                        <tr key={d.dia} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                          <td className="px-3 py-2 text-xs font-medium">{d.dia}</td>
                          <td className="px-3 py-2 text-center">
                            <Toggle value={d.activo} onChange={v => updateHorario(i, "activo", v)} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="time" className="border rounded px-2 py-1 text-xs bg-background" style={{ borderColor: "hsl(var(--border))" }} value={d.inicio} disabled={!d.activo} onChange={e => updateHorario(i, "inicio", e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="time" className="border rounded px-2 py-1 text-xs bg-background" style={{ borderColor: "hsl(var(--border))" }} value={d.fin} disabled={!d.activo} onChange={e => updateHorario(i, "fin", e.target.value)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Mensaje fuera de horario</label>
                  <textarea rows={4} className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background resize-y" style={{ borderColor: "hsl(var(--border))" }} value={msgFueraHorario} onChange={e => setMsgFueraHorario(e.target.value)} />
                </div>
              </>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={saveHorarios}
                disabled={savingHorarios}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "hsl(var(--primary))" }}
              >
                {savingHorarios ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><CheckCircle size={14} /> Guardar horarios</>}
              </button>
              <SavedBadge saved={horariosSaved} />
            </div>
          </div>
        </Card>

        {/* ── Meta Business API ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            icon={<Globe size={18} style={{ color: "#1877F2" }} />}
            color="#1877F220"
            title="Meta Business API"
            subtitle="WhatsApp, Instagram y Facebook"
            badge={
              metaConnected === true ? <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle size={13} /> Conectado</span> :
              metaConnected === false ? <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}><XCircle size={13} /> Error</span> : null
            }
          />
          <div className="space-y-4">
            {META_FIELDS.map(field => (
              <div key={field.id}>
                <label className="block text-xs font-medium mb-0.5">{field.label}</label>
                <p className="text-xs mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{field.desc}</p>
                <div className="relative">
                  <input type={showMetaKeys[field.id] ? "text" : "password"} className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background pr-10" style={{ borderColor: "hsl(var(--border))" }} placeholder={`Ingresa ${field.label}...`} value={metaConfig[field.id] || ""} onChange={e => setMetaConfig(p => ({ ...p, [field.id]: e.target.value }))} />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowMetaKeys(p => ({ ...p, [field.id]: !p[field.id] }))} style={{ color: "hsl(var(--muted-foreground))" }}>{showMetaKeys[field.id] ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
            ))}
            <button onClick={testMetaConnection} disabled={testingMeta} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border hover:bg-muted disabled:opacity-50" style={{ borderColor: "hsl(var(--border))" }}>
              {testingMeta ? <><Loader2 size={14} className="animate-spin" /> Verificando...</> : <><CheckCircle size={14} style={{ color: "#1877F2" }} /> Probar Conexión Meta</>}
            </button>
          </div>
        </Card>

        {/* ── Webhook URL ───────────────────────────────────────────────────── */}
        <div className="bg-card border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="flex items-center gap-2 mb-1">
            <Globe size={16} style={{ color: "hsl(var(--primary))" }} />
            <h3 className="text-sm font-bold">URLs de Webhooks</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
            Usa estas URLs en Meta for Developers y ManyChat para recibir mensajes.
          </p>
          <div className="space-y-4">
            {/* Meta Webhook */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">📡 Webhook Meta (WhatsApp / Instagram / Facebook)</span>
              </div>
              <div className="rounded-lg p-3 font-mono text-xs break-all mb-1.5" style={{ background: "hsl(var(--muted))", color: "hsl(var(--primary))" }}>{webhookUrl}</div>
              <button onClick={() => { navigator.clipboard.writeText(webhookUrl); alert("URL copiada"); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium" style={{ borderColor: "hsl(var(--border))" }}>
                <Copy size={13} /> Copiar URL Meta
              </button>
            </div>
            {/* ManyChat Webhook */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">💬 Webhook ManyChat</span>
              </div>
              <div className="rounded-lg p-3 font-mono text-xs break-all mb-1.5" style={{ background: "hsl(var(--muted))", color: "hsl(var(--primary))" }}>
                {`https://${projectId}.supabase.co/functions/v1/manychat-webhook`}
              </div>
              <button onClick={() => { navigator.clipboard.writeText(`https://${projectId}.supabase.co/functions/v1/manychat-webhook`); alert("URL copiada"); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium" style={{ borderColor: "hsl(var(--border))" }}>
                <Copy size={13} /> Copiar URL ManyChat
              </button>
            </div>
            {/* Agente Webhook */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">🤖 Agente IA (endpoint directo)</span>
              </div>
              <div className="rounded-lg p-3 font-mono text-xs break-all mb-1.5" style={{ background: "hsl(var(--muted))", color: "hsl(var(--primary))" }}>
                {`https://${projectId}.supabase.co/functions/v1/agente-egana`}
              </div>
              <button onClick={() => { navigator.clipboard.writeText(`https://${projectId}.supabase.co/functions/v1/agente-egana`); alert("URL copiada"); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium" style={{ borderColor: "hsl(var(--border))" }}>
                <Copy size={13} /> Copiar URL Agente
              </button>
            </div>
          </div>
          <div className="mt-4 text-xs space-y-1" style={{ color: "hsl(var(--muted-foreground))" }}>
            <p className="font-semibold">Eventos a suscribir en Meta for Developers:</p>
            <p>• WhatsApp: <code>messages, message_deliveries, message_reads</code></p>
            <p>• Instagram: <code>messages, comments, story_mentions</code></p>
            <p>• Facebook: <code>messages, messaging_postbacks, feed</code></p>
          </div>
        </div>

        {/* ── Guía acordeón ─────────────────────────────────────────────────── */}
        <div className="bg-card border rounded-xl overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
          <button onClick={() => setGuideOpen(!guideOpen)} className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold hover:bg-muted/30 transition-colors">
            <span>📖 ¿Cómo configurar Meta Business API?</span>
            {guideOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {guideOpen && (
            <div className="px-5 pb-5 text-xs space-y-4" style={{ color: "hsl(var(--muted-foreground))" }}>
              <div>
                <p className="font-bold text-foreground mb-1">WhatsApp Business:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ve a developers.facebook.com → Tu app → WhatsApp → Configuración API</li>
                  <li>Copia el "Phone Number ID" y pégalo arriba</li>
                  <li>Genera un Access Token y pégalo arriba</li>
                  <li>En "Webhooks" configura URL: <code className="bg-muted px-1 rounded">{webhookUrl}</code></li>
                  <li>El "Token de verificación" debe ser el mismo que ingresaste arriba</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-foreground mb-1">Instagram y Facebook:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>En tu app de Meta → Productos → Messenger → Configurar</li>
                  <li>Conecta tu Página de Facebook</li>
                  <li>El Page ID está en Configuración de la página → Información → ID de página</li>
                  <li>Instagram debe ser cuenta Business vinculada a esa Página</li>
                </ol>
              </div>
              <div>
                <p className="font-bold text-foreground mb-1">ManyChat:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Entra a ManyChat → Settings → API</li>
                  <li>Genera o copia tu API Key y pégala arriba</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* ── Info card IA ──────────────────────────────────────────────────── */}
        <div className="bg-card border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--primary)/0.04)" }}>
          <div className="flex items-start gap-3">
            <Wrench size={18} style={{ color: "hsl(var(--primary))", marginTop: 2 }} />
            <div>
              <p className="text-sm font-semibold mb-1">¿Dónde obtengo mi API Key de IA?</p>
              <ul className="text-xs space-y-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                <li>• <strong>OpenAI:</strong> platform.openai.com → API Keys</li>
                <li>• <strong>Google Gemini:</strong> aistudio.google.com → Get API Key</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
