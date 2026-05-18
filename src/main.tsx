import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// eslint-disable-next-line no-console
console.log("[app] arrancando React");

const rootEl = document.getElementById("root");

try {
  if (!rootEl) throw new Error("No se encontró el elemento #root en index.html");
  createRoot(rootEl).render(<App />);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? "" : "";
  // eslint-disable-next-line no-console
  console.error("[app] error fatal al montar:", err);
  if (rootEl) {
    rootEl.innerHTML = `
      <div style="min-height:100vh;background:#0a0a0a;color:#fff;padding:32px;
                  font-family:monospace;font-size:13px;line-height:1.5">
        <h1 style="color:#ef4444;font-size:20px;margin-bottom:16px">
          ⚠ Error fatal antes de montar React
        </h1>
        <pre style="background:#1a1a1a;padding:12px;border-radius:6px;white-space:pre-wrap">${message}</pre>
        <pre style="background:#1a1a1a;padding:12px;border-radius:6px;margin-top:12px;
                    font-size:11px;max-height:240px;overflow:auto">${stack}</pre>
      </div>
    `;
  }
}
