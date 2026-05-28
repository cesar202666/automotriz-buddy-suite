/**
 * Banner + formulario para actualizar las cookies de sesión Gemma.cl.
 *
 * Se muestra en /global cuando la BD reporta expired=true o cookies vacías.
 * El usuario pega las 3 cookies aquí mismo y se guardan en la tabla
 * gemma_session via action set_cookies. La edge function valida con un
 * keepalive inmediato; si OK, los KPIs se cargan al instante.
 *
 * Después, un cron pg_cron hace keepalive cada 5 min para que la sesión
 * NUNCA expire por inactividad.
 */

import { useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { saveGemmaCookies } from "@/lib/gemmaService";
import { useApp } from "@/context/AppContext";

interface Props {
  onSaved?: () => void;
}

const PASOS = [
  {
    n: 1,
    titulo: "Abre Gemma en otra pestaña",
    detalle: (
      <span>
        Entra a{" "}
        <a
          href="https://www.gemma.cl/gemma/seclogin.aspx?1257261690"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium inline-flex items-center gap-1"
        >
          gemma.cl <ExternalLink size={11} />
        </a>{" "}
        con tu RUT y clave, espera a ver el dashboard con datos.
      </span>
    ),
  },
  {
    n: 2,
    titulo: "Abre DevTools (F12) → Application → Cookies → www.gemma.cl",
    detalle: (
      <span>
        Pulsa <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">F12</kbd>,
        pestaña <strong>Application</strong>, expande <strong>Cookies</strong>{" "}
        y click en <strong>https://www.gemma.cl</strong>.
      </span>
    ),
  },
  {
    n: 3,
    titulo: "Copia los valores de las 3 cookies en el campo de abajo",
    detalle: (
      <span>
        Necesitas el VALUE de <strong>GX_SESSION_ID</strong>,{" "}
        <strong>ASP.NET_SessionId</strong> y <strong>GX_CLIENT_ID</strong> —
        pegalas separadas por <code>;</code>.
      </span>
    ),
  },
  {
    n: 4,
    titulo: "Click Guardar — listo, se queda activo para siempre",
    detalle: (
      <span>
        El sistema valida automáticamente y hace ping cada 5 minutos para
        renovar la sesión. Solo vuelves a hacer esto si Gemma cierra la
        sesión del lado servidor (muy raro).
      </span>
    ),
  },
];

const EXAMPLE = "GX_SESSION_ID=...; ASP.NET_SessionId=...; GX_CLIENT_ID=...";

export function GemmaSessionExpiredBanner({ onSaved }: Props) {
  const { usuarioActual } = useApp();
  const [expanded, setExpanded] = useState(true);
  const [cookieInput, setCookieInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSave = async () => {
    if (!cookieInput.trim()) {
      setResult({ ok: false, msg: "Pega las cookies primero" });
      return;
    }
    setSaving(true);
    setResult(null);
    const updatedBy = usuarioActual
      ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() || usuarioActual.email || "manual"
      : "manual";
    try {
      const r = await saveGemmaCookies(cookieInput, updatedBy);
      if (r.ok) {
        setResult({ ok: true, msg: "Cookies guardadas y validadas. Refrescando dashboard..." });
        setCookieInput("");
        setTimeout(() => onSaved?.(), 800);
      } else {
        setResult({
          ok: false,
          msg: r.error
            || (r.validation?.sessionExpired
              ? "Las cookies pegadas no son válidas (Gemma las rechazó). Verifica que copiaste el VALUE correcto."
              : "No se pudo guardar."),
        });
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="border rounded-xl overflow-hidden"
      style={{ borderColor: "#fcd34d", background: "#fffbeb" }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-amber-100/40 transition-colors"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} style={{ color: "#b45309" }} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm" style={{ color: "#92400e" }}>
              Sesión Gemma expirada o no configurada
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#a16207" }}>
              Pega las cookies UNA vez aquí abajo. El sistema las mantiene vivas
              automáticamente con un ping cada 5 minutos.
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} style={{ color: "#92400e" }} /> : <ChevronDown size={16} style={{ color: "#92400e" }} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "#fde68a" }}>
          <ol className="space-y-3 mt-3">
            {PASOS.map((p) => (
              <li key={p.n} className="flex gap-3 text-xs">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full font-bold flex items-center justify-center text-[11px]"
                  style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }}
                >
                  {p.n}
                </span>
                <div className="flex-1" style={{ color: "#78350f" }}>
                  <p className="font-semibold mb-0.5">{p.titulo}</p>
                  <p className="opacity-90">{p.detalle}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Form para pegar y guardar */}
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "#fcd34d", background: "#fef3c7" }}>
            <label className="block text-xs font-semibold" style={{ color: "#78350f" }}>
              Cookies de gemma.cl
            </label>
            <textarea
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              placeholder={EXAMPLE}
              rows={3}
              className="w-full rounded border px-3 py-2 text-xs font-mono resize-y"
              style={{ borderColor: "#fcd34d", background: "white", color: "#1f2937" }}
              spellCheck={false}
            />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px]" style={{ color: "#a16207" }}>
                Formato: <code>name1=value1; name2=value2; name3=value3</code>
              </p>
              <button
                onClick={handleSave}
                disabled={saving || !cookieInput.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: "#b45309" }}
              >
                {saving ? <><Loader2 size={12} className="animate-spin" /> Validando…</> : "Guardar y validar"}
              </button>
            </div>
            {result && (
              <div
                className="flex items-start gap-2 mt-1 p-2 rounded text-xs"
                style={{
                  background: result.ok ? "#dcfce7" : "#fee2e2",
                  color: result.ok ? "#166534" : "#991b1b",
                }}
              >
                {result.ok ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" /> : <XCircle size={14} className="mt-0.5 flex-shrink-0" />}
                <span>{result.msg}</span>
              </div>
            )}
          </div>

          <p className="text-[11px] pt-2 border-t" style={{ color: "#a16207", borderColor: "#fde68a" }}>
            💡 Cómo funciona: las cookies se guardan en la BD. Cada request del CRM
            y un cron cada 5 min mantienen viva la sesión. Si Gemma alguna vez la
            invalida del lado servidor, vuelves a hacer este paso.
          </p>
        </div>
      )}
    </div>
  );
}
