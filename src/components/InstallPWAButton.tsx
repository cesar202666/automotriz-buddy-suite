import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const IOS_DISMISS_KEY = "ios-install-banner-dismissed";

function isIOS() {
  const ua = window.navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  // iPadOS 13+ reports as Mac with touch
  const iPadOS = ua.includes("Mac") && "ontouchend" in document;
  return iOSDevice || iPadOS;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function isSafari() {
  const ua = window.navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export default function InstallPWAButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setHidden(true);
      return;
    }

    if (isIOS()) {
      const dismissed = localStorage.getItem(IOS_DISMISS_KEY) === "1";
      if (!dismissed) setShowIOS(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setHidden(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (hidden) return null;

  // iOS banner
  if (showIOS) {
    const safari = isSafari();
    return (
      <div
        className="fixed top-2 left-2 right-2 z-50 rounded-xl px-3 py-3 shadow-lg"
        style={{ background: "hsl(var(--card))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "hsl(var(--primary))" }}>
            <Download size={16} />
            <span>Instalar en iPhone</span>
          </div>
          <button
            onClick={() => {
              localStorage.setItem(IOS_DISMISS_KEY, "1");
              setShowIOS(false);
            }}
            className="p-1 opacity-70 hover:opacity-100"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        <ol className="text-xs space-y-1 leading-snug" style={{ color: "hsl(var(--foreground))" }}>
          {!safari && (
            <li>
              <span className="font-semibold">1.</span> Abre este enlace en <span className="font-semibold">Safari</span> (no funciona en Chrome).
            </li>
          )}
          <li>
            <span className="font-semibold">{safari ? "1." : "2."}</span> Toca el botón{" "}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded align-middle" style={{ background: "hsl(var(--muted))" }}>
              <Share size={12} style={{ color: "#0a84ff" }} />
              Compartir
            </span>{" "}
            (cuadrado con flecha ↑).
          </li>
          <li>
            <span className="font-semibold">{safari ? "2." : "3."}</span> Selecciona{" "}
            <span className="font-semibold">"Agregar a pantalla de inicio"</span>.
          </li>
        </ol>
      </div>
    );
  }

  if (!evt) return null;

  return (
    <div
      className="fixed top-2 left-2 right-2 z-50 flex items-center justify-between gap-2 rounded-xl px-3 py-2 shadow-lg"
      style={{ background: "hsl(var(--primary))", color: "white" }}
    >
      <div className="flex items-center gap-2 text-sm">
        <Download size={16} />
        <span className="font-semibold">Instalar Automotriz Egaña</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={async () => {
            await evt.prompt();
            const choice = await evt.userChoice;
            if (choice.outcome === "accepted") setHidden(true);
            setEvt(null);
          }}
          className="text-xs font-bold bg-white text-primary px-3 py-1.5 rounded-lg"
        >
          Instalar
        </button>
        <button onClick={() => setHidden(true)} className="p-1 opacity-80 hover:opacity-100">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
