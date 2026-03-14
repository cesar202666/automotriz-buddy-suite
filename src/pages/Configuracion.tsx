import { useState } from "react";
import { Wrench, Key, Lock, CheckCircle, XCircle, Loader2, Eye, EyeOff, Cpu, Globe, Copy, ChevronDown, ChevronUp } from "lucide-react";

const MASTER_PASS = "123cuatro";

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

interface ApiConfig {
  provider: string;
  apiKey: string;
  model: string;
  connected: boolean | null;
}

export default function Configuracion() {
  const [authenticated, setAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

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

  const [metaConfig, setMetaConfig] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("ea_meta_config") || "{}"); } catch { return {}; }
  });
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);
  const [testingMeta, setTestingMeta] = useState(false);
  const [showMetaKeys, setShowMetaKeys] = useState<Record<string, boolean>>({});

  const [testing, setTesting] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "";
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/meta-webhook`;

  const handleLogin = () => {
    if (passInput === MASTER_PASS) { setAuthenticated(true); setPassError(false); }
    else { setPassError(true); setPassInput(""); }
  };

  const updateConfig = (provider: string, field: keyof ApiConfig, value: string | boolean | null) => {
    setConfigs(prev => prev.map(c => c.provider === provider ? { ...c, [field]: value } : c));
  };

  const testConnection = async (cfg: ApiConfig) => {
    if (!cfg.apiKey.trim()) { alert("Ingresa una API Key antes de conectar."); return; }
    setTesting(cfg.provider);
    updateConfig(cfg.provider, "connected", null);
    try {
      let ok = false;
      if (cfg.provider === "openai") { const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${cfg.apiKey}` } }); ok = res.ok; }
      else if (cfg.provider === "gemini") { const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cfg.apiKey}`); ok = res.ok; }
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
              <input type={showPass ? "text" : "password"} className={`w-full border rounded-lg px-4 py-3 text-sm bg-background pr-10`} style={{ borderColor: passError ? "hsl(var(--destructive))" : "hsl(var(--border))" }} placeholder="Clave de acceso" value={passInput} onChange={e => { setPassInput(e.target.value); setPassError(false); }} onKeyDown={e => e.key === "Enter" && handleLogin()} />
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
        <div><h1 className="page-title">Configuración del Sistema</h1><p className="page-subtitle">APIs de IA, Meta Business y ajustes generales</p></div>
        <button onClick={saveAll} className="px-4 py-2 rounded-md text-sm font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>Guardar Configuración</button>
      </div>

      <div className="grid gap-6 max-w-3xl">
        {/* IA Providers */}
        {PROVIDERS.map(provider => {
          const cfg = configs.find(c => c.provider === provider.id)!;
          const isVisible = showKeys[provider.id];
          const isTesting = testing === provider.id;
          return (
            <div key={provider.id} className="bg-card border rounded-xl p-6 shadow-sm" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "hsl(var(--primary)/0.1)" }}><Cpu size={18} style={{ color: "hsl(var(--primary))" }} /></div>
                <div><h2 className="text-sm font-bold">{provider.label}</h2><p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Configurar acceso a la API</p></div>
                <div className="ml-auto">
                  {cfg.connected === true && <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle size={13} /> Conectado</span>}
                  {cfg.connected === false && <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}><XCircle size={13} /> Error</span>}
                  {cfg.connected === null && cfg.apiKey && <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}><Key size={13} /> Sin verificar</span>}
                </div>
              </div>
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
            </div>
          );
        })}

        {/* Meta Business API */}
        <div className="bg-card border rounded-xl p-6 shadow-sm" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#1877F220" }}><Globe size={18} style={{ color: "#1877F2" }} /></div>
            <div><h2 className="text-sm font-bold">Meta Business API</h2><p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>WhatsApp, Instagram y Facebook</p></div>
            <div className="ml-auto">
              {metaConnected === true && <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle size={13} /> Conectado</span>}
              {metaConnected === false && <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}><XCircle size={13} /> Error</span>}
            </div>
          </div>
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
        </div>

        {/* Webhook URL */}
        <div className="bg-card border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} style={{ color: "hsl(var(--primary))" }} />
            <h3 className="text-sm font-bold">URL del Webhook de Meta</h3>
          </div>
          <div className="rounded-lg p-3 font-mono text-xs break-all mb-2" style={{ background: "hsl(var(--muted))", color: "hsl(var(--primary))" }}>{webhookUrl}</div>
          <button onClick={() => { navigator.clipboard.writeText(webhookUrl); alert("URL copiada"); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium" style={{ borderColor: "hsl(var(--border))" }}>
            <Copy size={13} /> Copiar URL
          </button>
          <div className="mt-3 text-xs space-y-1" style={{ color: "hsl(var(--muted-foreground))" }}>
            <p className="font-semibold">Eventos a suscribir en Meta for Developers:</p>
            <p>• WhatsApp: <code>messages, message_deliveries, message_reads</code></p>
            <p>• Instagram: <code>messages, comments, story_mentions</code></p>
            <p>• Facebook: <code>messages, messaging_postbacks, feed</code></p>
          </div>
        </div>

        {/* Guía acordeón */}
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

        {/* Info card IA */}
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
