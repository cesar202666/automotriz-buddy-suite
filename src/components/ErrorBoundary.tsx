import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "(vacío)";
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
      ? `${String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).slice(0, 12)}…`
      : "(vacío)";

    return (
      <div style={{ minHeight:"100vh", background:"#0a0a0a", color:"#fff",
                    padding:"32px", fontFamily:"monospace", fontSize:"13px",
                    lineHeight:1.5, overflow:"auto" }}>
        <h1 style={{ color:"#ef4444", fontSize:"20px", marginBottom:"16px" }}>
          ⚠ Error al iniciar la aplicación
        </h1>
        <div style={{ marginBottom:"24px" }}>
          <strong>Mensaje:</strong>
          <pre style={{ background:"#1a1a1a", padding:"12px", borderRadius:"6px",
                        marginTop:"6px", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
            {this.state.error?.message || "(sin mensaje)"}
          </pre>
        </div>
        <div style={{ marginBottom:"24px" }}>
          <strong>Stack:</strong>
          <pre style={{ background:"#1a1a1a", padding:"12px", borderRadius:"6px",
                        marginTop:"6px", whiteSpace:"pre-wrap", wordBreak:"break-word",
                        fontSize:"11px", maxHeight:"240px", overflow:"auto" }}>
            {this.state.error?.stack || "(sin stack)"}
          </pre>
        </div>
        <div style={{ marginBottom:"24px" }}>
          <strong>Configuración detectada en build:</strong>
          <pre style={{ background:"#1a1a1a", padding:"12px", borderRadius:"6px",
                        marginTop:"6px" }}>
            VITE_SUPABASE_URL = {supabaseUrl}{"\n"}
            VITE_SUPABASE_PUBLISHABLE_KEY = {supabaseKey}
          </pre>
        </div>
        <button onClick={() => window.location.reload()}
                style={{ background:"#3b82f6", color:"#fff", border:"none",
                         padding:"10px 20px", borderRadius:"6px", cursor:"pointer",
                         fontSize:"13px" }}>
          Reintentar
        </button>
      </div>
    );
  }
}
