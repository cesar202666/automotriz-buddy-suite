import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPWAButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setHidden(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!evt || hidden) return null;

  return (
    <div
      className="fixed top-2 left-2 right-2 z-50 flex items-center justify-between gap-2 rounded-xl px-3 py-2 shadow-lg"
      style={{ background: "hsl(var(--primary))", color: "white" }}
    >
      <div className="flex items-center gap-2 text-sm">
        <Download size={16} />
        <span className="font-semibold">Instalar Egaña CRM</span>
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
