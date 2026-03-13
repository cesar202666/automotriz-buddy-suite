import { useEffect, useState, useRef, useCallback } from "react";
import {
  MessageSquare, Search, Wifi, WifiOff, Circle, Instagram, Facebook,
  Phone, Check, CheckCheck, ChevronDown, Bot, User as UserIcon, Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  manychat_subscriber_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  channel: string;
  avatar_url: string | null;
  last_seen: string | null;
  created_at: string;
}

interface Conversation {
  id: string;
  contact_id: string;
  channel: string;
  status: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  assigned_to: string | null;
  created_at: string;
  contact?: Contact;
}

interface Message {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  direction: "inbound" | "outbound";
  content: string;
  channel: string;
  sent_at: string;
  created_at: string;
}

type ChannelFilter = "all" | "whatsapp" | "instagram" | "facebook";

// ── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_CONFIG = {
  whatsapp: { label: "WhatsApp", color: "#25D366", bg: "#dcfce7", text: "#166534" },
  instagram: { label: "Instagram", color: "#C13584", bg: "#fce7f3", text: "#9d174d" },
  facebook: { label: "Facebook", color: "#1877F2", bg: "#dbeafe", text: "#1d4ed8" },
};

function getChannelConfig(channel: string) {
  return CHANNEL_CONFIG[channel as keyof typeof CHANNEL_CONFIG] || CHANNEL_CONFIG.whatsapp;
}

function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  if (channel === "instagram") return <Instagram size={size} />;
  if (channel === "facebook") return <Facebook size={size} />;
  // WhatsApp SVG icon
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const cfg = getChannelConfig(channel);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      <ChannelIcon channel={channel} size={11} />
      {cfg.label}
    </span>
  );
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const colors = ["#0f5132", "#1d4ed8", "#7e22ce", "#c2410c", "#0e7490", "#1e3a5f"];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: colors[idx], fontSize: size * 0.35 }}
    >
      {initials || "?"}
    </div>
  );
}

function fmtTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "ahora";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return d.toLocaleDateString("es-CL", { weekday: "short" });
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

function fmtFullTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Conversaciones() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [realtime, setRealtime] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/manychat-webhook`;

  // ── Load conversations ───────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (!error && data) setConversations(data as Conversation[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Load messages for selected conversation ──────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    setMessagesLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("sent_at", { ascending: true })
      .limit(500);
    if (!error && data) setMessages(data as Message[]);
    setMessagesLoading(false);
  }, []);

  useEffect(() => {
    if (selectedConvId) loadMessages(selectedConvId);
    else setMessages([]);
  }, [selectedConvId, loadMessages]);

  // ── Mark as read ─────────────────────────────────────────────────────────
  const markRead = async (convId: string) => {
    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", convId);
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, unread_count: 0 } : c));
  };

  // ── Realtime subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (!realtime) return;

    const convChannel = supabase
      .channel("conv-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, async () => {
        await loadConversations();
      })
      .subscribe();

    const msgChannel = supabase
      .channel("msg-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.conversation_id === selectedConvId) {
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [realtime, loadConversations, selectedConvId]);

  // ── Auto scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Derived state ────────────────────────────────────────────────────────
  const filtered = conversations.filter((c) => {
    const matchChannel = channelFilter === "all" || c.channel === channelFilter;
    const matchSearch = !search || c.contact?.name?.toLowerCase().includes(search.toLowerCase());
    return matchChannel && matchSearch;
  });

  const selectedConv = conversations.find((c) => c.id === selectedConvId);
  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const activeCount = conversations.filter((c) => c.status === "active").length;

  const CHANNELS: ChannelFilter[] = ["all", "whatsapp", "instagram", "facebook"];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
            <MessageSquare size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: "hsl(var(--foreground))" }}>Egaña Conversaciones</h1>
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              {activeCount} activas{totalUnread > 0 && <span className="ml-1 font-semibold" style={{ color: "hsl(var(--primary))" }}>· {totalUnread} sin leer</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Webhook URL */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.5)" }}>
            <span style={{ color: "hsl(var(--muted-foreground))" }}>Webhook:</span>
            <code className="font-mono" style={{ color: "hsl(var(--primary))" }}>/manychat-webhook</code>
            <button onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); }} className="text-xs underline" style={{ color: "hsl(var(--primary))" }}>
              Copiar
            </button>
          </div>
          {/* Realtime toggle */}
          <button
            onClick={() => setRealtime(!realtime)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
            style={{
              borderColor: realtime ? "hsl(var(--primary)/0.5)" : "hsl(var(--border))",
              background: realtime ? "hsl(var(--primary)/0.1)" : "hsl(var(--muted))",
              color: realtime ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"
            }}>
            {realtime ? <Wifi size={13} /> : <WifiOff size={13} />}
            {realtime ? "En vivo" : "Pausado"}
          </button>
        </div>
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <div className="flex flex-col w-80 flex-shrink-0 border-r" style={{ borderColor: "hsl(var(--border))", background: "hsl(220 25% 10%)" }}>
          {/* Search */}
          <div className="p-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.4)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contacto..."
                className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
          </div>

          {/* Channel filter tabs */}
          <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {CHANNELS.map((ch) => {
              const cfg = ch !== "all" ? getChannelConfig(ch) : null;
              const isActive = channelFilter === ch;
              const chCount = ch === "all" ? conversations.length : conversations.filter((c) => c.channel === ch).length;
              return (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className="flex-1 py-2 text-xs font-medium transition-all flex flex-col items-center gap-0.5"
                  style={{
                    color: isActive ? (cfg?.color || "hsl(var(--primary))") : "rgba(255,255,255,0.45)",
                    borderBottom: isActive ? `2px solid ${cfg?.color || "hsl(var(--primary))"}` : "2px solid transparent",
                  }}>
                  {ch !== "all" && <ChannelIcon channel={ch} size={13} />}
                  <span>{ch === "all" ? `Todo (${chCount})` : chCount}</span>
                </button>
              );
            })}
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col gap-2 p-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="w-10 h-10 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 rounded" style={{ background: "rgba(255,255,255,0.1)", width: "60%" }} />
                      <div className="h-2 rounded" style={{ background: "rgba(255,255,255,0.07)", width: "80%" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <MessageSquare size={32} className="mb-3 opacity-20" style={{ color: "white" }} />
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {search ? "Sin resultados" : "No hay conversaciones aún"}
                </p>
                {!search && (
                  <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Conecta ManyChat con el webhook para empezar
                  </p>
                )}
              </div>
            ) : (
              filtered.map((conv) => {
                const isActive = selectedConvId === conv.id;
                const cfg = getChannelConfig(conv.channel);
                const contactName = conv.contact?.name || "Desconocido";
                return (
                  <button
                    key={conv.id}
                    onClick={() => { setSelectedConvId(conv.id); markRead(conv.id); }}
                    className="w-full text-left px-3 py-3 flex items-center gap-3 transition-all relative"
                    style={{
                      background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                      borderLeft: isActive ? `3px solid ${cfg.color}` : "3px solid transparent",
                    }}>
                    <div className="relative">
                      <Avatar name={contactName} size={42} />
                      <div
                        className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5 flex items-center justify-center"
                        style={{ background: "hsl(220 25% 10%)", color: cfg.color, width: 18, height: 18 }}>
                        <ChannelIcon channel={conv.channel} size={10} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.92)" }}>
                          {contactName}
                        </span>
                        <span className="text-xs ml-2 flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {fmtTime(conv.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {conv.last_message || "Sin mensajes"}
                        </p>
                        {conv.unread_count > 0 && (
                          <span
                            className="flex-shrink-0 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold"
                            style={{ background: cfg.color, fontSize: 10 }}>
                            {conv.unread_count > 9 ? "9+" : conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ───────────────────────────────────────────────── */}
        {selectedConv ? (
          <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "hsl(var(--background))" }}>
            {/* Chat header */}
            <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
              <div className="flex items-center gap-3">
                <Avatar name={selectedConv.contact?.name || "?"} size={38} />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {selectedConv.contact?.name || "Desconocido"}
                    </p>
                    <ChannelBadge channel={selectedConv.channel} />
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: selectedConv.status === "active" ? "#dcfce7" : "hsl(var(--muted))",
                        color: selectedConv.status === "active" ? "#166534" : "hsl(var(--muted-foreground))"
                      }}>
                      {selectedConv.status === "active" ? "● Activa" : "Cerrada"}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {selectedConv.contact?.phone || ""}
                    {selectedConv.contact?.phone && selectedConv.contact?.email ? " · " : ""}
                    {selectedConv.contact?.email || ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedConv.contact?.phone && (
                  <a
                    href={`https://wa.me/${selectedConv.contact.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                    style={{ borderColor: "#25D366", color: "#25D366", background: "#f0fdf4" }}>
                    <Phone size={12} />
                    WhatsApp
                  </a>
                )}
                <button
                  onClick={async () => {
                    const newStatus = selectedConv.status === "active" ? "closed" : "active";
                    await supabase.from("conversations").update({ status: newStatus }).eq("id", selectedConv.id);
                    setConversations((prev) => prev.map((c) => c.id === selectedConv.id ? { ...c, status: newStatus } : c));
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                  style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))", background: "hsl(var(--muted)/0.5)" }}>
                  {selectedConv.status === "active" ? "Cerrar chat" : "Reabrir chat"}
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div
              className="flex-1 overflow-y-auto p-5 space-y-3"
              style={{ background: "hsl(220 20% 97%)" }}>
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <div className="text-center">
                    <Clock size={28} className="mx-auto mb-2 opacity-30 animate-spin" />
                    <p className="text-sm">Cargando mensajes...</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <div className="text-center">
                    <MessageSquare size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No hay mensajes en esta conversación</p>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isInbound = msg.direction === "inbound";
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const showDateSep =
                    !prevMsg ||
                    new Date(msg.sent_at).toDateString() !== new Date(prevMsg.sent_at).toDateString();

                  return (
                    <div key={msg.id}>
                      {/* Date separator */}
                      {showDateSep && (
                        <div className="flex items-center justify-center my-3">
                          <span className="text-xs px-3 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.07)", color: "hsl(var(--muted-foreground))" }}>
                            {new Date(msg.sent_at).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
                          </span>
                        </div>
                      )}
                      {/* Bubble */}
                      <div className={`flex items-end gap-2 ${isInbound ? "justify-start" : "justify-end"}`}>
                        {isInbound && (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5" style={{ background: "hsl(var(--primary)/0.15)" }}>
                            <UserIcon size={14} style={{ color: "hsl(var(--primary))" }} />
                          </div>
                        )}
                        <div className={`max-w-sm lg:max-w-lg ${isInbound ? "" : "items-end"} flex flex-col`}>
                          <div
                            className="px-4 py-2.5 text-sm shadow-sm"
                            style={{
                              background: isInbound ? "white" : "hsl(var(--primary))",
                              color: isInbound ? "hsl(var(--foreground))" : "white",
                              borderRadius: isInbound ? "0px 16px 16px 16px" : "16px 0px 16px 16px",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                            }}>
                            {msg.content}
                          </div>
                          <div className={`flex items-center gap-1 mt-1 text-xs ${isInbound ? "justify-start" : "justify-end"}`} style={{ color: "hsl(var(--muted-foreground))" }}>
                            {!isInbound && <Bot size={9} />}
                            <span>{fmtFullTime(msg.sent_at)}</span>
                            {!isInbound && <CheckCheck size={10} style={{ color: "#3b82f6" }} />}
                          </div>
                        </div>
                        {!isInbound && (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5" style={{ background: "hsl(var(--primary))" }}>
                            <Bot size={14} className="text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer info */}
            <div className="px-5 py-2 border-t flex items-center gap-3 text-xs flex-shrink-0" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))" }}>
              <Bot size={12} />
              <span>Respondido automáticamente por Agente IA Egaña</span>
              <span>·</span>
              <span>{messages.length} mensajes</span>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "hsl(220 20% 97%)" }}>
            <div className="text-center max-w-sm px-6">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "hsl(var(--primary)/0.1)" }}>
                <MessageSquare size={28} style={{ color: "hsl(var(--primary))" }} />
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ color: "hsl(var(--foreground))" }}>
                Selecciona una conversación
              </h3>
              <p className="text-sm mb-6" style={{ color: "hsl(var(--muted-foreground))" }}>
                Los mensajes de ManyChat aparecen aquí en tiempo real
              </p>
              {/* Webhook config card */}
              <div className="text-left rounded-xl p-4 border text-xs space-y-2" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
                <p className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>📡 Configuración ManyChat</p>
                <p style={{ color: "hsl(var(--muted-foreground))" }}>Usa este webhook en tu flujo de ManyChat:</p>
                <div className="rounded-lg p-2 font-mono break-all" style={{ background: "hsl(var(--muted))", color: "hsl(var(--primary))" }}>
                  {WEBHOOK_URL}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => navigator.clipboard.writeText(WEBHOOK_URL)}
                    className="flex-1 py-1.5 rounded-lg font-medium text-center transition-opacity hover:opacity-80"
                    style={{ background: "hsl(var(--primary))", color: "white" }}>
                    Copiar URL
                  </button>
                </div>
                <div className="pt-1 space-y-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <p>• Método: <strong>POST</strong></p>
                  <p>• Campos: <code>contact_id</code>, <code>first_name</code>, <code>last_input_text</code></p>
                  <p>• Canal: <code>channel</code> (whatsapp/instagram/facebook)</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
