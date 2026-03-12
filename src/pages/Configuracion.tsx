import { useState } from "react";
import { Wrench, Key, Lock, CheckCircle, XCircle, Loader2, Eye, EyeOff, Cpu } from "lucide-react";

const MASTER_PASS = "123cuatro";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { id: "gemini", label: "Google Gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"] },
];

interface ApiConfig {
  provider: string;
  apiKey: string;
  model: string;
  connected: boolean | null; // null = not tested, true/false = result
}

export default function Configuracion() {
  const [authenticated, setAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [configs, setConfigs] = useState<ApiConfig[]>(
    PROVIDERS.map(p => ({ provider: p.id, apiKey: "", model: p.models[0], connected: null }))
  );
  const [testing, setTesting] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const handleLogin = () => {
    if (passInput === MASTER_PASS) {
      setAuthenticated(true);
      setPassError(false);
    } else {
      setPassError(true);
      setPassInput("");
    }
  };

  const updateConfig = (provider: string, field: keyof ApiConfig, value: string | boolean | null) => {
    setConfigs(prev => prev.map(c => c.provider === provider ? { ...c, [field]: value } : c));
  };

  const testConnection = async (cfg: ApiConfig) => {
    if (!cfg.apiKey.trim()) {
      alert("Ingresa una API Key antes de conectar.");
      return;
    }
    setTesting(cfg.provider);
    updateConfig(cfg.provider, "connected", null);

    try {
      let ok = false;
      if (cfg.provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
        });
        ok = res.ok;
      } else if (cfg.provider === "gemini") {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${cfg.apiKey}`
        );
        ok = res.ok;
      }
      updateConfig(cfg.provider, "connected", ok);
    } catch {
      updateConfig(cfg.provider, "connected", false);
    } finally {
      setTesting(null);
    }
  };

  // Save config to localStorage
  const saveAll = () => {
    localStorage.setItem("ea_api_configs", JSON.stringify(configs));
    alert("Configuración guardada correctamente.");
  };

  if (!authenticated) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Configuración</h1>
            <p className="page-subtitle">Acceso restringido — solo Administrador Master</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="bg-card border rounded-2xl shadow-lg p-10 w-full max-w-sm" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "hsl(var(--primary)/0.1)" }}>
                <Lock size={28} style={{ color: "hsl(var(--primary))" }} />
              </div>
              <h2 className="text-lg font-bold">Área Restringida</h2>
              <p className="text-xs mt-1 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>
                Ingresa la clave del Administrador Master para continuar
              </p>
            </div>
            <div className="relative mb-4">
              <input
                type={showPass ? "text" : "password"}
                className={`w-full border rounded-lg px-4 py-3 text-sm bg-background pr-10 ${passError ? "border-destructive" : ""}`}
                style={{ borderColor: passError ? "hsl(var(--destructive))" : "hsl(var(--border))" }}
                placeholder="Clave de acceso"
                value={passInput}
                onChange={e => { setPassInput(e.target.value); setPassError(false); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setShowPass(!showPass)}
                style={{ color: "hsl(var(--muted-foreground))" }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passError && (
              <p className="text-xs mb-3" style={{ color: "hsl(var(--destructive))" }}>
                Clave incorrecta. Inténtalo de nuevo.
              </p>
            )}
            <button
              onClick={handleLogin}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white"
              style={{ background: "hsl(var(--primary))" }}>
              Ingresar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración del Sistema</h1>
          <p className="page-subtitle">Gestión de APIs de Inteligencia Artificial</p>
        </div>
        <button
          onClick={saveAll}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ background: "hsl(var(--primary))" }}>
          Guardar Configuración
        </button>
      </div>

      <div className="grid gap-6 max-w-3xl">
        {PROVIDERS.map(provider => {
          const cfg = configs.find(c => c.provider === provider.id)!;
          const isVisible = showKeys[provider.id];
          const isTesting = testing === provider.id;

          return (
            <div key={provider.id} className="bg-card border rounded-xl p-6 shadow-sm" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "hsl(var(--primary)/0.1)" }}>
                  <Cpu size={18} style={{ color: "hsl(var(--primary))" }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold">{provider.label}</h2>
                  <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Configurar acceso a la API</p>
                </div>
                <div className="ml-auto">
                  {cfg.connected === true && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}>
                      <CheckCircle size={13} /> Conectado
                    </span>
                  )}
                  {cfg.connected === false && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#fee2e2", color: "#dc2626" }}>
                      <XCircle size={13} /> Error de conexión
                    </span>
                  )}
                  {cfg.connected === null && cfg.apiKey && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                      <Key size={13} /> Sin verificar
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {/* API Key */}
                <div>
                  <label className="block text-xs font-medium mb-1">API Key</label>
                  <div className="relative">
                    <input
                      type={isVisible ? "text" : "password"}
                      className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background pr-10"
                      style={{ borderColor: "hsl(var(--border))" }}
                      placeholder={`Pega tu API Key de ${provider.label}...`}
                      value={cfg.apiKey}
                      onChange={e => { updateConfig(provider.id, "apiKey", e.target.value); updateConfig(provider.id, "connected", null); }}
                    />
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                      style={{ color: "hsl(var(--muted-foreground))" }}>
                      {isVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Model selector */}
                <div>
                  <label className="block text-xs font-medium mb-1">Modelo a Utilizar</label>
                  <select
                    className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background"
                    style={{ borderColor: "hsl(var(--border))" }}
                    value={cfg.model}
                    onChange={e => updateConfig(provider.id, "model", e.target.value)}>
                    {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                {/* Test button */}
                <button
                  onClick={() => testConnection(cfg)}
                  disabled={isTesting || !cfg.apiKey.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-muted disabled:opacity-50"
                  style={{ borderColor: "hsl(var(--border))" }}>
                  {isTesting ? (
                    <><Loader2 size={14} className="animate-spin" /> Verificando conexión...</>
                  ) : (
                    <><CheckCircle size={14} style={{ color: "hsl(var(--primary))" }} /> Probar Conexión</>
                  )}
                </button>

                {/* Status message */}
                {cfg.connected === true && (
                  <p className="text-xs font-medium" style={{ color: "#16a34a" }}>
                    ✅ Conexión establecida correctamente con {provider.label}. Modelo seleccionado: <strong>{cfg.model}</strong>
                  </p>
                )}
                {cfg.connected === false && (
                  <p className="text-xs font-medium" style={{ color: "#dc2626" }}>
                    ❌ No se pudo conectar. Verifica que la API Key sea correcta y tenga permisos activos.
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Info card */}
        <div className="bg-card border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--primary)/0.04)" }}>
          <div className="flex items-start gap-3">
            <Wrench size={18} style={{ color: "hsl(var(--primary))", marginTop: 2 }} />
            <div>
              <p className="text-sm font-semibold mb-1">¿Dónde obtengo mi API Key?</p>
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
