import { useEffect, useState, useRef } from "react";
import { MessageSquare, Bot, User, Bell, BellOff, CheckCircle, Clock, PhoneCall, ChevronDown, ChevronUp, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";

interface Conversacion {
  id: string;
  contact_id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  canal: string;
  mensaje_cliente: string;
  respuesta_agente: string;
  leido: boolean;
  notificado_vendedor: boolean;
  vendedor_asignado: string | null;
  interes: string | null;
  created_at: string;
}

// Group messages by contact_id
type ContactGroup = {
  contact_id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  mensajes: Conversacion[];
  ultimoMensaje: string;
  sinLeer: number;
  notificado: boolean;
};

export default function Conversaciones() {
  const { usuarios } = useApp();
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [asignando, setAsignando] = useState<string | null>(null);
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState<Record<string, string>>({});
  const [realtime, setRealtime] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ENDPOINT = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/agente-egana`;

  // Load initial data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("conversaciones")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!error && data) setConversaciones(data as Conversacion[]);
      setLoading(false);
    };
    load();
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!realtime) return;
    const channel = supabase
      .channel("conversaciones-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversaciones" }, (payload) => {
        setConversaciones((prev) => [payload.new as Conversacion, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversaciones" }, (payload) => {
        setConversaciones((prev) =>
          prev.map((c) => (c.id === (payload.new as Conversacion).id ? (payload.new as Conversacion) : c))
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [realtime]);

  // Scroll to bottom when selected contact changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedContact, conversaciones]);

  // Group by contact
  const contactGroups: ContactGroup[] = Object.values(
    conversaciones.reduce<Record<string, ContactGroup>>((acc, c) => {
      if (!acc[c.contact_id]) {
        acc[c.contact_id] = {
          contact_id: c.contact_id,
          nombre: c.nombre,
          apellido: c.apellido,
          telefono: c.telefono,
          mensajes: [],
          ultimoMensaje: "",
          sinLeer: 0,
          notificado: false,
        };
      }
      acc[c.contact_id].mensajes.push(c);
      if (!c.leido) acc[c.contact_id].sinLeer++;
      if (c.notificado_vendedor) acc[c.contact_id].notificado = true;
      return acc;
    }, {})
  ).map((g) => ({
    ...g,
    mensajes: g.mensajes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    ultimoMensaje: g.mensajes[g.mensajes.length - 1]?.mensaje_cliente || "",
  })).sort((a, b) => {
    const lastA = a.mensajes[a.mensajes.length - 1]?.created_at || "";
    const lastB = b.mensajes[b.mensajes.length - 1]?.created_at || "";
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  const marcarLeido = async (contactId: string) => {
    const ids = conversaciones.filter((c) => c.contact_id === contactId && !c.leido).map((c) => c.id);
    if (!ids.length) return;
    await supabase.from("conversaciones").update({ leido: true }).in("id", ids);
    setConversaciones((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, leido: true } : c)));
  };

  const notificarVendedor = async (contactId: string) => {
    const vendedor = vendedorSeleccionado[contactId] || "";
    if (!vendedor) { alert("Selecciona un vendedor primero"); return; }
    setAsignando(contactId);
    const ids = conversaciones.filter((c) => c.contact_id === contactId).map((c) => c.id);
    await supabase.from("conversaciones").update({ notificado_vendedor: true, vendedor_asignado: vendedor }).in("id", ids);
    setConversaciones((prev) =>
      prev.map((c) => ids.includes(c.id) ? { ...c, notificado_vendedor: true, vendedor_asignado: vendedor } : c)
    );
    setAsignando(null);
    alert(`✅ ${vendedor} ha sido notificado/a para contactar a este cliente.`);
  };

  const selectedGroup = contactGroups.find((g) => g.contact_id === selectedContact);
  const totalSinLeer = contactGroups.reduce((acc, g) => acc + g.sinLeer, 0);
  const vendedores = usuarios.filter((u) => u.rol === "vendedor" || u.rol === "master" || u.rol === "administracion");

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
  };

  return (
    <div className="flex flex-col h-full" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="page-header flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="page-title">Conversaciones</h1>
            <p className="page-subtitle">Agente IA ManyChat · {totalSinLeer > 0 && <span className="font-bold" style={{ color: "hsl(var(--primary))" }}>{totalSinLeer} sin leer</span>}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Webhook URL copy */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.5)" }}>
            <span style={{ color: "hsl(var(--muted-foreground))" }}>Webhook ManyChat:</span>
            <code className="font-mono text-xs" style={{ color: "hsl(var(--primary))" }}>/agente-egana</code>
            <button
              onClick={() => { navigator.clipboard.writeText(ENDPOINT); alert("URL copiada al portapapeles"); }}
              className="ml-1 underline text-xs"
              style={{ color: "hsl(var(--primary))" }}>
              Copiar URL
            </button>
          </div>
          {/* Realtime toggle */}
          <button
            onClick={() => setRealtime(!realtime)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              borderColor: "hsl(var(--border))",
              background: realtime ? "hsl(var(--primary)/0.1)" : "hsl(var(--muted))",
              color: realtime ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"
            }}>
            <Wifi size={13} />
            {realtime ? "Tiempo real ON" : "Tiempo real OFF"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: "hsl(var(--muted-foreground))" }}>
          <div className="text-center">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-30 animate-pulse" />
            <p className="text-sm">Cargando conversaciones...</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden gap-4">
          {/* ── Lista de contactos ────────────────────────────────────────────── */}
          <div className="w-72 flex-shrink-0 flex flex-col border rounded-xl overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="p-3 border-b text-xs font-semibold" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.4)", color: "hsl(var(--muted-foreground))" }}>
              {contactGroups.length} CONTACTOS
            </div>
            <div className="flex-1 overflow-y-auto">
              {contactGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <MessageSquare size={32} className="mb-2 opacity-30" />
                  <p className="text-xs">Aún no hay conversaciones.<br />Configura el webhook en ManyChat para empezar.</p>
                </div>
              ) : (
                contactGroups.map((g) => (
                  <button
                    key={g.contact_id}
                    onClick={() => { setSelectedContact(g.contact_id); marcarLeido(g.contact_id); }}
                    className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 relative"
                    style={{
                      borderColor: "hsl(var(--border))",
                      background: selectedContact === g.contact_id ? "hsl(var(--primary)/0.08)" : undefined,
                    }}>
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                        style={{ background: "hsl(var(--primary)/0.15)", color: "hsl(var(--primary))" }}>
                        {g.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-medium truncate">{g.nombre} {g.apellido || ""}</span>
                          {g.sinLeer > 0 && (
                            <span className="w-4 h-4 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0"
                              style={{ background: "hsl(var(--primary))", fontSize: 10 }}>
                              {g.sinLeer}
                            </span>
                          )}
                        </div>
                        <p className="text-xs truncate mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {g.ultimoMensaje}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {fmtDate(g.mensajes[g.mensajes.length - 1]?.created_at || "")}
                          </span>
                          {g.notificado && (
                            <span className="text-xs flex items-center gap-0.5" style={{ color: "#16a34a" }}>
                              <CheckCircle size={10} /> Vendedor asignado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Panel de chat ─────────────────────────────────────────────────── */}
          {selectedGroup ? (
            <div className="flex-1 flex flex-col border rounded-xl overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
              {/* Chat header */}
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold"
                    style={{ background: "hsl(var(--primary)/0.15)", color: "hsl(var(--primary))" }}>
                    {selectedGroup.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{selectedGroup.nombre} {selectedGroup.apellido || ""}</p>
                    <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      ID: {selectedGroup.contact_id}
                      {selectedGroup.telefono && ` · ${selectedGroup.telefono}`}
                    </p>
                  </div>
                </div>
                {/* Notify vendor */}
                <div className="flex items-center gap-2">
                  {selectedGroup.notificado ? (
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}>
                      <CheckCircle size={12} /> Vendedor notificado
                    </span>
                  ) : (
                    <>
                      <select
                        className="border rounded-md px-2 py-1.5 text-xs bg-background"
                        style={{ borderColor: "hsl(var(--border))" }}
                        value={vendedorSeleccionado[selectedGroup.contact_id] || ""}
                        onChange={(e) => setVendedorSeleccionado((prev) => ({ ...prev, [selectedGroup.contact_id]: e.target.value }))}>
                        <option value="">Asignar vendedor...</option>
                        {vendedores.map((v) => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
                      </select>
                      <button
                        onClick={() => notificarVendedor(selectedGroup.contact_id)}
                        disabled={asignando === selectedGroup.contact_id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                        style={{ background: "hsl(var(--primary))" }}>
                        <PhoneCall size={12} />
                        {asignando === selectedGroup.contact_id ? "Notificando..." : "Notificar vendedor"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedGroup.mensajes.map((m) => (
                  <div key={m.id} className="space-y-2">
                    {/* Cliente */}
                    <div className="flex items-start gap-2 justify-end">
                      <div className="max-w-xs lg:max-w-md">
                        <div className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm" style={{ background: "hsl(var(--primary)/0.12)", color: "hsl(var(--foreground))" }}>
                          {m.mensaje_cliente}
                        </div>
                        <p className="text-xs mt-1 text-right flex items-center justify-end gap-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                          <User size={10} /> {selectedGroup.nombre} · {fmtTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                    {/* Agente */}
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "hsl(var(--primary))" }}>
                        <Bot size={14} className="text-white" />
                      </div>
                      <div className="max-w-xs lg:max-w-md">
                        <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm" style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
                          {m.respuesta_agente}
                        </div>
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                          <Bot size={10} /> Agente Egaña · {fmtTime(m.created_at)}
                          {m.leido && <CheckCircle size={10} style={{ color: "#16a34a" }} />}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border rounded-xl" style={{ borderColor: "hsl(var(--border))" }}>
              <MessageSquare size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Selecciona una conversación</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Los mensajes de ManyChat aparecen aquí en tiempo real</p>
              {/* Webhook info */}
              <div className="mt-6 mx-4 p-4 rounded-xl border text-xs text-center max-w-sm" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.4)" }}>
                <p className="font-semibold mb-2" style={{ color: "hsl(var(--foreground))" }}>Configuración ManyChat</p>
                <p className="mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>Agrega este webhook en tu flujo de ManyChat:</p>
                <code className="block bg-background rounded px-2 py-1 font-mono break-all" style={{ color: "hsl(var(--primary))" }}>
                  {ENDPOINT}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(ENDPOINT); alert("URL copiada"); }}
                  className="mt-2 underline"
                  style={{ color: "hsl(var(--primary))" }}>
                  Copiar URL
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
