/**
 * Banner que se muestra en /global cuando la sesión Gemma expiró o no
 * existe ningún secret GEMMA_COOKIES configurado.
 *
 * Da instrucciones exactas paso a paso para que el usuario actualice las
 * cookies sin tocar código.
 */

import { useState } from "react";
import { AlertTriangle, Copy, ExternalLink, ChevronDown, ChevronUp, Check } from "lucide-react";

const PASOS = [
  {
    n: 1,
    titulo: "Abre Gemma e inicia sesión normalmente",
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
        con tu RUT y clave. Espera a ver la pantalla principal con datos.
      </span>
    ),
  },
  {
    n: 2,
    titulo: "Abre DevTools del navegador",
    detalle: (
      <span>
        Click derecho en cualquier parte → <strong>Inspeccionar</strong>. O
        presiona <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">F12</kbd>.
      </span>
    ),
  },
  {
    n: 3,
    titulo: "Ve a Application → Cookies → www.gemma.cl",
    detalle: (
      <span>
        En la pestaña superior <strong>Application</strong> (Chrome) o{" "}
        <strong>Storage</strong> (Firefox), expande <strong>Cookies</strong> y
        click en <strong>https://www.gemma.cl</strong>.
      </span>
    ),
  },
  {
    n: 4,
    titulo: "Copia las 3 cookies en este formato",
    detalle: (
      <span>
        Necesitas <strong>GX_SESSION_ID</strong>, <strong>ASP.NET_SessionId</strong>{" "}
        y <strong>GX_CLIENT_ID</strong>. Pégalas en este formato (separadas por <code>;</code>):
      </span>
    ),
    code: `GX_SESSION_ID=tuvalor1; ASP.NET_SessionId=tuvalor2; GX_CLIENT_ID=tuvalor3`,
  },
  {
    n: 5,
    titulo: "Pega el string completo en Supabase Secrets",
    detalle: (
      <span>
        Abre{" "}
        <a
          href="https://supabase.com/dashboard/project/nxeepkpfvhwobhgpltml/settings/functions"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium inline-flex items-center gap-1"
        >
          Supabase → Edge Functions Secrets <ExternalLink size={11} />
        </a>
        . Crea o edita el secret <strong>GEMMA_COOKIES</strong> y pega el string.
        Click <strong>Save</strong>.
      </span>
    ),
  },
  {
    n: 6,
    titulo: "Vuelve aquí y refresca",
    detalle: (
      <span>
        En unos segundos la edge function tomará el secret nuevo. Click en{" "}
        <strong>Refrescar</strong> arriba a la derecha. Si todo está bien, los
        KPI cards se llenarán con datos reales de Gemma.
      </span>
    ),
  },
];

export function GemmaSessionExpiredBanner() {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const codeExample = `GX_SESSION_ID=...; ASP.NET_SessionId=...; GX_CLIENT_ID=...`;

  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText(codeExample);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
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
              Las cookies de gemma.cl no son válidas. Sigue los 6 pasos para
              actualizarlas (toma 2 minutos).
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} style={{ color: "#92400e" }} /> : <ChevronDown size={16} style={{ color: "#92400e" }} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "#fde68a" }}>
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
                  {p.code && (
                    <div className="mt-2 flex items-center gap-2">
                      <code
                        className="flex-1 px-3 py-2 rounded text-[11px] font-mono break-all"
                        style={{ background: "#fef3c7", color: "#451a03" }}
                      >
                        {p.code}
                      </code>
                      <button
                        onClick={copyExample}
                        className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium border hover:bg-amber-50"
                        style={{ borderColor: "#fcd34d", background: "#fffbeb", color: "#92400e" }}
                      >
                        {copied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <p
            className="text-[11px] pt-2 border-t"
            style={{ color: "#a16207", borderColor: "#fde68a" }}
          >
            💡 Tip: Gemma cierra sesión tras ~30 min de inactividad. Cuando veas este
            mensaje, repite los pasos. En la próxima iteración podemos automatizarlo
            con un browser headless si te interesa.
          </p>
        </div>
      )}
    </div>
  );
}
