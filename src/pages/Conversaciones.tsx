import { useEffect, useState, useRef, useCallback } from "react";
import {
  MessageSquare, Search, Wifi, WifiOff, Instagram, Facebook,
  Phone, CheckCheck, Bot, User as UserIcon, Clock, Target,
  Users, BarChart3, Megaphone, Plus, X, ChevronRight, Edit3,
  Trash2, Send, Filter, GripVertical, AlertCircle, Info,
  TrendingUp, DollarSign, Award, Zap, RefreshCw
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

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
  escalated?: boolean;
  escalated_at?: string | null;
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

interface Lead {
  id: string;
  contact_id: string | null;
  conversation_id: string | null;
  nombre: string;
  telefono: string;
  email: string;
  canal: string;
  interes: string;
  presupuesto: string;
  urgencia: string;
  score: number;
  etapa: string;
  vendedor_asignado: string;
  motivo_perdida: string;
  notas: string;
  primer_apertura_at: string | null;
  calificacion: string;
  observaciones_vendedor: string;
  estado_cierre: string;
  detalle_cierre: string;
  created_at: string;
  updated_at: string;
}

interface LeadActividad {
  id: string;
  lead_id: string;
  tipo: string;
  descripcion: string;
  usuario: string;
  created_at: string;
}

interface Vendedor {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  sucursal: string;
  activo: boolean;
}

interface Campana {
  id: string;
  nombre: string;
  mensaje: string;
  canal: string;
  destinatarios_ids: string[];
  destinatarios_count: number;
  estado: string;
  enviada_at: string | null;
  created_by: string;
  created_at: string;
}

type Tab = "mensajes" | "leads" | "contactos" | "metricas" | "campanas";
type ChannelFilter = "all" | "whatsapp" | "instagram" | "facebook";

// ── Constants ─────────────────────────────────────────────────────────────────
const CHANNEL_CONFIG = {
  whatsapp: { label: "WhatsApp", color: "#25D366", bg: "#dcfce7", text: "#166534" },
  instagram: { label: "Instagram", color: "#C13584", bg: "#fce7f3", text: "#9d174d" },
  facebook: { label: "Facebook", color: "#1877F2", bg: "#dbeafe", text: "#1d4ed8" },
  presencial: { label: "Presencial", color: "#6b7280", bg: "#f3f4f6", text: "#374151" },
};

const ETAPAS = ["nuevo", "contactado", "calificado", "propuesta", "negociacion", "ganado", "perdido"];

const ETAPA_LABELS: Record<string, string> = {
  nuevo: "NUEVO", contactado: "CONTACTADO", calificado: "CALIFICADO",
  propuesta: "PROPUESTA", negociacion: "NEGOCIACIÓN", ganado: "GANADO", perdido: "PERDIDO"
};

const ETAPA_COLORS: Record<string, string> = {
  nuevo: "#6366f1", contactado: "#3b82f6", calificado: "#06b6d4",
  propuesta: "#f59e0b", negociacion: "#f97316", ganado: "#22c55e", perdido: "#ef4444"
};

const CALIFICACION_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  frio: { label: "❄️ Frío", color: "#3b82f6", bg: "#dbeafe" },
  tibio: { label: "🌤 Tibio", color: "#f59e0b", bg: "#fef9c3" },
  caliente: { label: "🔥 Caliente", color: "#ef4444", bg: "#fee2e2" },
};

type LeadCategory = "pendiente_vendedor" | "contactados" | "cerrados";

const LEAD_CATEGORIES: { id: LeadCategory; label: string; color: string; icon: string }[] = [
  { id: "pendiente_vendedor", label: "Pendiente Vendedor", color: "#ef4444", icon: "🔴" },
  { id: "contactados", label: "Contactados", color: "#22c55e", icon: "🟢" },
  { id: "cerrados", label: "Cerrados", color: "#6b7280", icon: "⬛" },
];

const NON_NAME_TOKENS = new Set([
  "andaba","busca","quiero","comprar","necesito","consulta","consultar",
  "informacion","información","precio","credito","crédito","financiamiento",
  "auto","autos","vehiculo","vehículo","vehiculos","vehículos","hola","buenas",
  "buenos","dias","días","tardes","noches","cliente","de","del","la","el","y",
  "para","por","con","mi","me","soy","llamo","nombre","es","numero","número",
  "telefono","teléfono","fono","celular","contacto","whatsapp","instagram",
  "facebook","messenger",
]);

function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function looksLikeSentence(name: string): boolean {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.length > 4) return true;
  const bad = tokens.filter(t => NON_NAME_TOKENS.has(stripDiacritics(t))).length;
  return bad >= 1 && bad / tokens.length >= 0.34;
}

function titleCase(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function normalizeLeadName(name: string, fallback?: string): string {
  const raw = (name || "").trim();
  const useFallback = !raw || looksLikeSentence(raw);
  const source = useFallback ? (fallback || "").trim() : raw;
  if (!source) return raw || (fallback || "").trim();

  // Split, dedupe consecutive equal tokens (case/diacritic insensitive)
  const parts = source.split(/\s+/).filter(Boolean);
  const deduped: string[] = [];
  for (const p of parts) {
    const key = stripDiacritics(p);
    if (deduped.length && stripDiacritics(deduped[deduped.length - 1]) === key) continue;
    deduped.push(p);
  }

  if (deduped.length === 0) return source;
  if (deduped.length === 1) return titleCase(deduped[0]);

  // First name + first apellido (skip middle names if any)
  const first = titleCase(deduped[0]);
  const lastIdx = deduped.length === 2 ? 1 : Math.min(2, deduped.length - 1);
  return `${first} ${titleCase(deduped[lastIdx])}`;
}

function normalizeLeadRecord<T extends { nombre: string; contact_name?: string | null }>(lead: T): T {
  return { ...lead, nombre: normalizeLeadName(lead.nombre || "", lead.contact_name || "") };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getChannelConfig(channel: string) {
  return CHANNEL_CONFIG[channel as keyof typeof CHANNEL_CONFIG] || CHANNEL_CONFIG.whatsapp;
}

function getMetricsChannelMeta(channel: string) {
  const normalizedChannel = channel === "manychat" ? "whatsapp" : channel === "messenger" ? "facebook" : channel || "sin_origen";

  if (normalizedChannel === "sin_origen") {
    return {
      key: normalizedChannel,
      label: "Sin origen",
      color: "hsl(var(--muted-foreground))",
    };
  }

  const config = getChannelConfig(normalizedChannel);
  return {
    key: normalizedChannel,
    label: config.label,
    color: config.color,
  };
}

function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  if (channel === "instagram") return <Instagram size={size} />;
  if (channel === "facebook") return <Facebook size={size} />;
  if (channel === "presencial") return <UserIcon size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const cfg = getChannelConfig(channel);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: cfg.bg, color: cfg.text }}>
      <ChannelIcon channel={channel} size={11} />
      {cfg.label}
    </span>
  );
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["#0f5132", "#1d4ed8", "#7e22ce", "#c2410c", "#0e7490", "#1e3a5f"];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div className="flex-shrink-0 flex items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: colors[idx], fontSize: size * 0.35 }}>
      {initials || "?"}
    </div>
  );
}

function fmtTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "ahora";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return `hace ${Math.floor(diff / 86400000)}d`;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

function fmtFullTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function fmtResponseTime(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 71 ? "#22c55e" : score >= 41 ? "#f59e0b" : "#ef4444";
  const bg = score >= 71 ? "#dcfce7" : score >= 41 ? "#fef9c3" : "#fee2e2";
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>
      {score}
    </span>
  );
}

function UrgenciaDot({ urgencia }: { urgencia: string }) {
  const color = urgencia === "alta" ? "#ef4444" : urgencia === "media" ? "#f59e0b" : "#9ca3af";
  return <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />;
}

// ── PESTAÑA MENSAJES ──────────────────────────────────────────────────────────
function TabMensajes() {
  const { usuarioActual } = useApp();
  const isVendedor = usuarioActual?.rol === "vendedor";
  const vendedorName = usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : "";
  const vendedorFirstName = usuarioActual?.nombre || "";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [realtime, setRealtime] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendReply = async () => {
    if (!replyText.trim() || sending || !selectedConvId) return;
    const conv = conversations.find((c) => c.id === selectedConvId);
    if (!conv) return;
    const msgText = replyText.trim();
    setReplyText("");

    // Optimistic: add message to UI immediately
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conv.id,
      contact_id: conv.contact_id,
      direction: "outbound",
      content: msgText,
      channel: conv.channel,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    // Update conversation list optimistically
    setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, last_message: msgText, last_message_at: new Date().toISOString() } : c));

    // Send in background - no loading state needed
    try {
      const { data, error } = await supabase.functions.invoke("manychat-send-message", {
        body: { conversation_id: conv.id, contact_id: conv.contact_id, message: msgText, channel: conv.channel },
      });
      if (error || !data?.success) {
        toast.error(`Error al enviar: ${data?.error || error?.message || 'Error desconocido'}`, { duration: 10000 });
      }
    } catch (e: any) {
      toast.error(e.message || "Error al enviar mensaje");
    }
  };

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    let query = supabase.from("conversations").select("*, contact:contacts(*)").order("last_message_at", { ascending: false }).limit(200);
    if (isVendedor && vendedorName) {
      // Match full name or first name only (agent may assign with just first name)
      if (vendedorFirstName && vendedorFirstName !== vendedorName) {
        query = query.or(`assigned_to.eq.${vendedorName},assigned_to.eq.${vendedorFirstName}`);
      } else {
        query = query.eq("assigned_to", vendedorName);
      }
    }
    const { data, error } = await query;
    if (!error && data) setConversations(data as Conversation[]);
    if (!silent) setLoading(false);
  }, [isVendedor, vendedorName, vendedorFirstName]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (convId: string, contactId?: string | null, channel?: string) => {
    setMessagesLoading(true);
    let query = supabase.from("messages").select("*").order("sent_at", { ascending: true }).limit(500);

    if (contactId) {
      query = query.eq("contact_id", contactId);
      if (channel) query = query.eq("channel", channel);
    } else {
      query = query.eq("conversation_id", convId);
    }

    const { data, error } = await query;
    if (!error && data) setMessages(data as Message[]);
    setMessagesLoading(false);
  }, []);

  const selectedConvRef = useRef<string | null>(null);
  selectedConvRef.current = selectedConvId;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  useEffect(() => {
    if (selectedConvId) {
      const selected = conversations.find((c) => c.id === selectedConvId);
      loadMessages(selectedConvId, selected?.contact_id, selected?.channel);
    }
    else setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvId, loadMessages]);

  const markRead = async (convId: string) => {
    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", convId);
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, unread_count: 0 } : c));
  };

  useEffect(() => {
    if (!realtime) return;
    const convChannel = supabase.channel("conv-rt").on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, async () => { await loadConversations(true); }).subscribe();
    const msgChannel = supabase.channel("msg-rt").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const newMsg = payload.new as Message;
      const curSelected = selectedConvRef.current;
      const selected = conversationsRef.current.find((c) => c.id === curSelected);
      if (!selected) return;

      const sameConversation = newMsg.conversation_id === curSelected;
      const sameContact = newMsg.contact_id && selected.contact_id && newMsg.contact_id === selected.contact_id;
      const sameChannel = !selected.channel || newMsg.channel === selected.channel;

      if ((sameConversation || sameContact) && sameChannel) {
        setMessages((prev) => {
          // Skip if already exists (including optimistic temp messages with same content)
          if (prev.find((m) => m.id === newMsg.id)) return prev;
          // Remove optimistic temp message with same content
          const filtered = prev.filter((m) => !(m.id.startsWith('temp-') && m.content === newMsg.content && m.direction === newMsg.direction));
          const ordered = [...filtered, newMsg].sort((a, b) => {
            const aTs = new Date(a.sent_at || a.created_at).getTime();
            const bTs = new Date(b.sent_at || b.created_at).getTime();
            return aTs - bTs;
          });
          return ordered;
        });
      }
    }).subscribe();
    return () => { supabase.removeChannel(convChannel); supabase.removeChannel(msgChannel); };
  }, [realtime, loadConversations]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const filtered = conversations.filter((c) => {
    const matchChannel = channelFilter === "all" || c.channel === channelFilter;
    const matchSearch = !search || normalizeLeadName(c.contact?.name || "").toLowerCase().includes(search.toLowerCase());
    return matchChannel && matchSearch;
  });

  const selectedConv = conversations.find((c) => c.id === selectedConvId);
  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const activeCount = conversations.filter((c) => c.status === "active").length;
  const CHANNELS: ChannelFilter[] = ["all", "whatsapp", "instagram", "facebook"];

  return (
    <div className="flex" style={{ height: "calc(100vh - 140px)" }}>
      {/* Sidebar */}
      <div className="flex flex-col w-80 flex-shrink-0 border-r" style={{ borderColor: "hsl(var(--border))", background: "hsl(220 25% 10%)" }}>
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="relative flex-1 mr-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contacto..." className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </div>
          <button onClick={() => setRealtime(!realtime)} className="flex items-center gap-1 px-2 py-2 rounded-lg text-xs border transition-all" style={{ borderColor: realtime ? "hsl(var(--primary)/0.5)" : "rgba(255,255,255,0.2)", background: realtime ? "hsl(var(--primary)/0.15)" : "transparent", color: realtime ? "hsl(var(--primary))" : "rgba(255,255,255,0.45)" }}>
            {realtime ? <Wifi size={13} /> : <WifiOff size={13} />}
          </button>
        </div>
        <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {CHANNELS.map((ch) => {
            const cfg = ch !== "all" ? getChannelConfig(ch) : null;
            const isActive = channelFilter === ch;
            const chCount = ch === "all" ? conversations.length : conversations.filter((c) => c.channel === ch).length;
            return (
              <button key={ch} onClick={() => setChannelFilter(ch)} className="flex-1 py-2 text-xs font-medium transition-all flex flex-col items-center gap-0.5"
                style={{ color: isActive ? (cfg?.color || "hsl(var(--primary))") : "rgba(255,255,255,0.45)", borderBottom: isActive ? `2px solid ${cfg?.color || "hsl(var(--primary))"}` : "2px solid transparent" }}>
                {ch !== "all" && <ChannelIcon channel={ch} size={12} />}
                <span>{ch === "all" ? `Todo (${chCount})` : chCount}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="w-10 h-10 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                <div className="flex-1 space-y-2"><div className="h-3 rounded" style={{ background: "rgba(255,255,255,0.1)", width: "60%" }} /><div className="h-2 rounded" style={{ background: "rgba(255,255,255,0.07)", width: "80%" }} /></div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageSquare size={32} className="mb-3 opacity-20" style={{ color: "white" }} />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>{search ? "Sin resultados" : "No hay conversaciones"}</p>
            </div>
          ) : (
            filtered.map((conv) => {
              const isActive = selectedConvId === conv.id;
              const cfg = getChannelConfig(conv.channel);
              const contactName = normalizeLeadName(conv.contact?.name || "") || "Desconocido";
              return (
                <button key={conv.id} onClick={() => { setSelectedConvId(conv.id); markRead(conv.id); }} className="w-full text-left px-3 py-3 flex items-center gap-3 transition-all relative"
                  style={{ background: isActive ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: isActive ? `3px solid ${cfg.color}` : "3px solid transparent" }}>
                  <div className="relative">
                    <Avatar name={contactName} size={40} />
                    <div className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5 flex items-center justify-center" style={{ background: "hsl(220 25% 10%)", color: cfg.color, width: 17, height: 17 }}>
                      <ChannelIcon channel={conv.channel} size={9} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.92)" }}>{contactName}</span>
                      <span className="text-xs ml-2 flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>{fmtTime(conv.last_message_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{conv.last_message || "Sin mensajes"}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {conv.escalated && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: "#f97316", color: "white", fontSize: 9 }}>VENDEDOR</span>
                        )}
                        {conv.unread_count > 0 && <span className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{ background: cfg.color, fontSize: 10 }}>{conv.unread_count > 9 ? "9+" : conv.unread_count}</span>}
                      </div>
                    </div>
                    {conv.assigned_to && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>👤 {conv.assigned_to}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="px-3 py-2 border-t text-xs" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>
          {activeCount} activas{totalUnread > 0 && <span className="ml-1 font-semibold" style={{ color: "hsl(var(--primary))" }}>· {totalUnread} sin leer</span>}
        </div>
      </div>

      {/* Chat panel */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "hsl(var(--background))" }}>
          <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
            <div className="flex items-center gap-3">
              <Avatar name={normalizeLeadName(selectedConv.contact?.name || "") || "?"} size={36} />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{normalizeLeadName(selectedConv.contact?.name || "") || "Desconocido"}</p>
                  <ChannelBadge channel={selectedConv.channel} />
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: selectedConv.status === "active" ? "#dcfce7" : "hsl(var(--muted))", color: selectedConv.status === "active" ? "#166534" : "hsl(var(--muted-foreground))" }}>
                    {selectedConv.status === "active" ? "● Activa" : "Cerrada"}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {selectedConv.contact?.phone || ""}{selectedConv.contact?.phone && selectedConv.contact?.email ? " · " : ""}{selectedConv.contact?.email || ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedConv.contact?.phone && (
                <a href={`https://wa.me/${selectedConv.contact.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: "#25D366", color: "#25D366", background: "#f0fdf4" }}>
                  <Phone size={12} />WhatsApp
                </a>
              )}
              <button onClick={async () => {
                const newStatus = selectedConv.status === "active" ? "closed" : "active";
                await supabase.from("conversations").update({ status: newStatus }).eq("id", selectedConv.id);
                setConversations((prev) => prev.map((c) => c.id === selectedConv.id ? { ...c, status: newStatus } : c));
              }} className="px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))", background: "hsl(var(--muted)/0.5)" }}>
                {selectedConv.status === "active" ? "Cerrar chat" : "Reabrir chat"}
              </button>
            </div>
          </div>

          {/* Escalated banner */}
          {selectedConv.escalated && (
            <div className="px-5 py-2.5 flex items-center justify-between flex-shrink-0" style={{ background: "#fef3c7", borderBottom: "1px solid #fcd34d" }}>
              <div className="flex items-center gap-2 text-sm" style={{ color: "#92400e" }}>
                <AlertCircle size={16} />
                <span className="font-medium">⚠️ Conversación escalada a vendedor — El agente IA no responde.</span>
                {selectedConv.assigned_to && <span>Asignado a: <strong>{selectedConv.assigned_to}</strong></span>}
              </div>
              <button
                onClick={async () => {
                  await supabase.from("conversations").update({ escalated: false, escalated_at: null }).eq("id", selectedConv.id);
                  setConversations((prev) => prev.map((c) => c.id === selectedConv.id ? { ...c, escalated: false, escalated_at: null } : c));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ borderColor: "#92400e", color: "#92400e", background: "rgba(255,255,255,0.6)" }}
              >
                <RefreshCw size={12} />Reactivar bot
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ background: "hsl(220 20% 97%)" }}>
            {messagesLoading ? (
              <div className="flex items-center justify-center h-full" style={{ color: "hsl(var(--muted-foreground))" }}>
                <Clock size={28} className="mx-auto mb-2 opacity-30 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full" style={{ color: "hsl(var(--muted-foreground))" }}>
                <div className="text-center"><MessageSquare size={40} className="mx-auto mb-3 opacity-20" /><p className="text-sm">No hay mensajes</p></div>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isInbound = msg.direction === "inbound";
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const showDateSep = !prevMsg || new Date(msg.sent_at).toDateString() !== new Date(prevMsg.sent_at).toDateString();
                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="flex items-center justify-center my-3">
                        <span className="text-xs px-3 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.07)", color: "hsl(var(--muted-foreground))" }}>
                          {new Date(msg.sent_at).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
                        </span>
                      </div>
                    )}
                    <div className={`flex items-end gap-2 ${isInbound ? "justify-start" : "justify-end"}`}>
                      {isInbound && <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5" style={{ background: "hsl(var(--primary)/0.15)" }}><UserIcon size={14} style={{ color: "hsl(var(--primary))" }} /></div>}
                      <div className={`max-w-sm lg:max-w-lg ${isInbound ? "" : "items-end"} flex flex-col`}>
                        <div className="px-4 py-2.5 text-sm shadow-sm" style={{ background: isInbound ? "white" : "hsl(var(--primary))", color: isInbound ? "hsl(var(--foreground))" : "white", borderRadius: isInbound ? "0px 16px 16px 16px" : "16px 0px 16px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>{msg.content}</div>
                        <div className={`flex items-center gap-1 mt-1 text-xs ${isInbound ? "justify-start" : "justify-end"}`} style={{ color: "hsl(var(--muted-foreground))" }}>
                          {!isInbound && <Bot size={9} />}
                          <span>{fmtFullTime(msg.sent_at)}</span>
                          {!isInbound && <CheckCheck size={10} style={{ color: "#3b82f6" }} />}
                        </div>
                      </div>
                      {!isInbound && <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5" style={{ background: "hsl(var(--primary))" }}><Bot size={14} className="text-white" /></div>}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {(selectedConv.escalated || (selectedConv.assigned_to && selectedConv.assigned_to.trim() !== "")) ? (
            <div className="px-4 py-3 border-t flex items-center gap-2 flex-shrink-0" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && replyText.trim()) { e.preventDefault(); handleSendReply(); } }}
                placeholder="Escribe una respuesta al cliente..."
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border"
                style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: !replyText.trim() ? "hsl(var(--muted))" : "hsl(var(--primary))",
                  color: !replyText.trim() ? "hsl(var(--muted-foreground))" : "white",
                  cursor: !replyText.trim() ? "not-allowed" : "pointer",
                  opacity: !replyText.trim() ? 0.6 : 1,
                }}
              >
                <Send size={14} />
                Enviar
              </button>
            </div>
          ) : (
            <div className="px-5 py-2 border-t flex items-center gap-3 text-xs flex-shrink-0" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))" }}>
              <Bot size={12} /><span>Respondido automáticamente por Agente IA Egaña</span><span>·</span><span>{messages.length} mensajes</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "hsl(220 20% 97%)" }}>
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "hsl(var(--primary)/0.1)" }}>
              <MessageSquare size={28} style={{ color: "hsl(var(--primary))" }} />
            </div>
            <h3 className="text-base font-semibold mb-1">Selecciona una conversación</h3>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Los mensajes de WhatsApp, Instagram y Facebook aparecen aquí en tiempo real</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PESTAÑA LEADS ─────────────────────────────────────────────────────────────
function TabLeads() {
  const { usuarioActual } = useApp();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [actividades, setActividades] = useState<LeadActividad[]>([]);
  const [newNota, setNewNota] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "lista" | "categorias">("categorias");
  const [filterVendedor, setFilterVendedor] = useState("all");
  const [filterCanal, setFilterCanal] = useState("all");
  const [searchLeads, setSearchLeads] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);
  const [dragOverEtapa, setDragOverEtapa] = useState<string | null>(null);
  const [newLead, setNewLead] = useState({ nombre: "", telefono: "", email: "", canal: "whatsapp", interes: "", presupuesto: "", urgencia: "media", vendedor_asignado: "", notas: "", calificacion: "frio" });
  const [editLead, setEditLead] = useState<Partial<Lead>>({});
  const [savingLead, setSavingLead] = useState(false);
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({});

  const isVendedor = usuarioActual?.rol === "vendedor";
  const vendedorName = usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : "";
  const vendedorFirstName = usuarioActual?.nombre || "";

  const loadData = useCallback(async () => {
    setLoading(true);
    let leadsQuery = supabase.from("leads").select("*").order("created_at", { ascending: false });
    // Vendedores only see their assigned leads
    if (isVendedor && vendedorName) {
      if (vendedorFirstName && vendedorFirstName !== vendedorName) {
        leadsQuery = leadsQuery.or(`vendedor_asignado.eq.${vendedorName},vendedor_asignado.eq.${vendedorFirstName}`);
      } else {
        leadsQuery = leadsQuery.eq("vendedor_asignado", vendedorName);
      }
    }
    const [leadsRes, vendRes] = await Promise.all([
      leadsQuery,
      supabase.from("vendedores").select("*").eq("activo", true).eq("rol", "vendedor")
    ]);
    if (leadsRes.data) {
      // Fetch contact names so we can fall back when the lead nombre is a sentence/empty
      const rawLeads = leadsRes.data as Lead[];
      const contactIds = Array.from(new Set(rawLeads.map(l => l.contact_id).filter(Boolean) as string[]));
      const contactNameMap: Record<string, string> = {};
      if (contactIds.length > 0) {
        const { data: contactsData } = await supabase
          .from("contacts")
          .select("id, name")
          .in("id", contactIds);
        (contactsData || []).forEach((c: { id: string; name: string }) => {
          contactNameMap[c.id] = c.name || "";
        });
      }
      const normalizedLeads = rawLeads.map(l =>
        normalizeLeadRecord({ ...l, contact_name: l.contact_id ? contactNameMap[l.contact_id] : "" })
      );
      setLeads(normalizedLeads);
      const convIds = normalizedLeads.filter(l => l.conversation_id).map(l => l.conversation_id!);
      if (convIds.length > 0) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, sent_at")
          .in("conversation_id", convIds)
          .eq("direction", "inbound")
          .order("sent_at", { ascending: false });
        if (msgs) {
          const map: Record<string, string> = {};
          msgs.forEach((m: any) => {
            if (!map[m.conversation_id]) map[m.conversation_id] = m.sent_at;
          });
          setLastMessages(map);
        }
      }
    }
    if (vendRes.data) setVendedores(vendRes.data as Vendedor[]);
    setLoading(false);
  }, [isVendedor, vendedorName, vendedorFirstName]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const ch = supabase.channel("leads-rt").on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
      loadData();
      if (payload.eventType === "INSERT") {
        const newLead = normalizeLeadRecord(payload.new as Lead);
        toast(`Nuevo lead: ${newLead.nombre} vía ${newLead.canal || "web"}`, {
          description: newLead.interes ? `Interés: ${newLead.interes}` : "Lead recién ingresado",
          duration: 10000,
          closeButton: true,
          action: {
            label: "Ver",
            onClick: () => openLead(newLead),
          },
        });
      }
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadData]);

  useEffect(() => {
    if (!selectedLead) return;
    supabase.from("lead_actividades").select("*").eq("lead_id", selectedLead.id).order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setActividades(data as LeadActividad[]);
    });
  }, [selectedLead]);

  const filteredLeads = leads.filter(l => {
    if (filterVendedor !== "all" && l.vendedor_asignado !== filterVendedor) return false;
    if (filterCanal !== "all" && l.canal !== filterCanal) return false;
    if (searchLeads && !l.nombre.toLowerCase().includes(searchLeads.toLowerCase())) return false;
    return true;
  });

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData("leadId", leadId);
  };

  const handleDrop = async (e: React.DragEvent, etapa: string) => {
    e.preventDefault();
    setDragOverEtapa(null);
    const leadId = e.dataTransfer.getData("leadId");
    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.etapa === etapa) return;
    const prevEtapa = lead.etapa;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, etapa } : l));
    await supabase.from("leads").update({ etapa }).eq("id", leadId);
    await supabase.from("lead_actividades").insert({ lead_id: leadId, tipo: "estado_cambio", descripcion: `Movido de ${ETAPA_LABELS[prevEtapa] || prevEtapa} a ${ETAPA_LABELS[etapa] || etapa}`, usuario: "Sistema" });
  };

  const handleSaveLead = async () => {
    if (!selectedLead) return;
    setSavingLead(true);
    const payload: Partial<Lead> = {
      ...editLead,
      ...(editLead.nombre ? { nombre: normalizeLeadName(editLead.nombre) } : {}),
    };
    await supabase.from("leads").update(payload).eq("id", selectedLead.id);

    // If a vendedor is assigned, escalate the conversation so the seller can chat directly
    const nuevoVendedor = (editLead.vendedor_asignado || "").trim();
    if (nuevoVendedor && selectedLead.conversation_id) {
      await supabase
        .from("conversations")
        .update({
          assigned_to: nuevoVendedor,
          escalated: true,
          escalated_at: new Date().toISOString(),
          escalated_to: nuevoVendedor,
        })
        .eq("id", selectedLead.conversation_id);
    } else if (nuevoVendedor && selectedLead.contact_id) {
      // Fallback: locate the conversation by contact_id
      await supabase
        .from("conversations")
        .update({
          assigned_to: nuevoVendedor,
          escalated: true,
          escalated_at: new Date().toISOString(),
          escalated_to: nuevoVendedor,
        })
        .eq("contact_id", selectedLead.contact_id);
    }

    setLeads(prev => prev.map(l => l.id === selectedLead.id ? normalizeLeadRecord({ ...l, ...payload }) : l));
    setSelectedLead(prev => prev ? normalizeLeadRecord({ ...prev, ...payload }) : null);
    setSavingLead(false);
  };

  const handleAddNota = async () => {
    if (!newNota.trim() || !selectedLead) return;
    const { data } = await supabase.from("lead_actividades").insert({ lead_id: selectedLead.id, tipo: "nota", descripcion: newNota, usuario: "Usuario" }).select().single();
    if (data) setActividades(prev => [data as LeadActividad, ...prev]);
    setNewNota("");
  };

  const handleCreateLead = async () => {
    if (!newLead.nombre.trim()) return;
    const payload = { ...newLead, nombre: normalizeLeadName(newLead.nombre) };
    const { data } = await supabase.from("leads").insert(payload).select().single();
    if (data) { setLeads(prev => [normalizeLeadRecord(data as Lead), ...prev]); setShowNewLead(false); setNewLead({ nombre: "", telefono: "", email: "", canal: "whatsapp", interes: "", presupuesto: "", urgencia: "media", vendedor_asignado: "", notas: "", calificacion: "frio" }); }
  };

  const openLead = async (lead: Lead) => {
    const normalizedLead = normalizeLeadRecord(lead);
    setSelectedLead(normalizedLead);
    setEditLead({ nombre: normalizedLead.nombre, telefono: normalizedLead.telefono, email: normalizedLead.email, interes: normalizedLead.interes, presupuesto: normalizedLead.presupuesto, urgencia: normalizedLead.urgencia, etapa: normalizedLead.etapa, vendedor_asignado: normalizedLead.vendedor_asignado, score: normalizedLead.score, notas: normalizedLead.notas, calificacion: normalizedLead.calificacion || 'frio', observaciones_vendedor: normalizedLead.observaciones_vendedor || '', estado_cierre: normalizedLead.estado_cierre || '', detalle_cierre: normalizedLead.detalle_cierre || '' });
    // Track first vendor open for response time metric
    if (!normalizedLead.primer_apertura_at) {
      const now = new Date().toISOString();
      await supabase.from("leads").update({ primer_apertura_at: now }).eq("id", normalizedLead.id);
      setLeads(prev => prev.map(l => l.id === normalizedLead.id ? { ...l, primer_apertura_at: now } : l));
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Cargando leads...</div></div>;

  return (
    <div className="flex flex-col h-full">
      {/* Filters bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
          <input value={searchLeads} onChange={e => setSearchLeads(e.target.value)} placeholder="Buscar lead..." className="w-full pl-8 pr-3 py-2 rounded-lg text-sm border bg-background" style={{ borderColor: "hsl(var(--border))" }} />
        </div>
        <select value={filterVendedor} onChange={e => setFilterVendedor(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-background" style={{ borderColor: "hsl(var(--border))" }}>
          <option value="all">Todos los vendedores</option>
          {vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
        </select>
        <select value={filterCanal} onChange={e => setFilterCanal(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-background" style={{ borderColor: "hsl(var(--border))" }}>
          <option value="all">Todos los canales</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="presencial">Presencial</option>
        </select>
        <div className="flex border rounded-lg overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
          <button onClick={() => setViewMode("categorias")} className="px-3 py-2 text-xs font-medium transition-colors" style={{ background: viewMode === "categorias" ? "hsl(var(--primary))" : "hsl(var(--background))", color: viewMode === "categorias" ? "white" : "hsl(var(--foreground))" }}>Panel</button>
          <button onClick={() => setViewMode("kanban")} className="px-3 py-2 text-xs font-medium transition-colors" style={{ background: viewMode === "kanban" ? "hsl(var(--primary))" : "hsl(var(--background))", color: viewMode === "kanban" ? "white" : "hsl(var(--foreground))" }}>Kanban</button>
          <button onClick={() => setViewMode("lista")} className="px-3 py-2 text-xs font-medium transition-colors" style={{ background: viewMode === "lista" ? "hsl(var(--primary))" : "hsl(var(--background))", color: viewMode === "lista" ? "white" : "hsl(var(--foreground))" }}>Lista</button>
        </div>
        <button onClick={() => setShowNewLead(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
          <Plus size={15} />Nuevo Lead
        </button>
      </div>

      {/* Kanban */}
      {viewMode === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "500px" }}>
          {ETAPAS.map(etapa => {
            const etapaLeads = filteredLeads.filter(l => l.etapa === etapa);
            const presupuestoTotal = etapaLeads.reduce((acc, l) => acc + (parseFloat(l.presupuesto.replace(/\D/g, "")) || 0), 0);
            const isOver = dragOverEtapa === etapa;
            return (
              <div key={etapa} className="flex-shrink-0 w-64 flex flex-col rounded-xl overflow-hidden" style={{ background: isOver ? "rgba(255,255,255,0.12)" : "hsl(220 25% 10%)", border: isOver ? `2px solid ${ETAPA_COLORS[etapa]}` : "2px solid transparent", transition: "all 0.15s" }}
                onDragOver={e => { e.preventDefault(); setDragOverEtapa(etapa); }}
                onDragLeave={() => setDragOverEtapa(null)}
                onDrop={e => handleDrop(e, etapa)}>
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `2px solid ${ETAPA_COLORS[etapa]}20` }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: ETAPA_COLORS[etapa] }} />
                    <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>{ETAPA_LABELS[etapa]}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: ETAPA_COLORS[etapa] + "33", color: ETAPA_COLORS[etapa] }}>{etapaLeads.length}</span>
                  </div>
                </div>
                {presupuestoTotal > 0 && (
                  <div className="px-3 py-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                    ${presupuestoTotal.toLocaleString("es-CL")}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {etapaLeads.map(lead => (
                    <div key={lead.id} draggable onDragStart={e => handleDragStart(e, lead.id)} onClick={() => openLead(lead)}
                      className="rounded-xl p-3 cursor-pointer hover:scale-[1.01] transition-all"
                      style={{ background: !lead.primer_apertura_at && lead.etapa === "contactado" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.07)", border: !lead.primer_apertura_at && lead.etapa === "contactado" ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.92)" }}>{normalizeLeadName(lead.nombre)}</span>
                          {!lead.primer_apertura_at && lead.etapa === "contactado" && (
                            <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-bold animate-pulse" style={{ background: "#ef4444", color: "white", fontSize: 9 }}>NUEVO</span>
                          )}
                        </div>
                        <UrgenciaDot urgencia={lead.urgencia} />
                      </div>
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        <ChannelBadge channel={lead.canal} />
                        <ScoreBadge score={lead.score} />
                        {lead.calificacion && CALIFICACION_BADGE[lead.calificacion] && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: CALIFICACION_BADGE[lead.calificacion].bg, color: CALIFICACION_BADGE[lead.calificacion].color }}>
                            {CALIFICACION_BADGE[lead.calificacion].label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{fmtTime(lead.created_at)}</span>
                        {lead.vendedor_asignado && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "hsl(var(--primary))" }}>
                            {lead.vendedor_asignado[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Categorias panel */}
      {viewMode === "categorias" && (() => {
        // Categorize leads
        const closedStatuses = ["venta_realizada", "no_contesta", "sin_interes", "compro_otro_lugar", "no_cumple_credito", "precio_alto", "spam"];
        const pendienteVendedor = filteredLeads.filter(l => !l.estado_cierre && !l.primer_apertura_at);
        const contactados = filteredLeads.filter(l => !l.estado_cierre && l.primer_apertura_at);
        const cerrados = filteredLeads.filter(l => l.estado_cierre && closedStatuses.includes(l.estado_cierre));

        const categories = [
          { ...LEAD_CATEGORIES[0], leads: pendienteVendedor },
          { ...LEAD_CATEGORIES[1], leads: contactados },
          { ...LEAD_CATEGORIES[2], leads: cerrados },
        ];

        return (
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "500px" }}>
            {categories.map(cat => (
              <div key={cat.id} className="flex-shrink-0 w-80 flex flex-col rounded-xl overflow-hidden" style={{ background: "hsl(220 25% 10%)" }}>
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `2px solid ${cat.color}30` }}>
                  <div className="flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>{cat.label}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: cat.color + "33", color: cat.color }}>{cat.leads.length}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {cat.leads.map(lead => {
                    const lastClientMsg = lead.conversation_id ? lastMessages[lead.conversation_id] : null;
                    const calif = CALIFICACION_BADGE[lead.calificacion] || CALIFICACION_BADGE.frio;
                    return (
                      <div key={lead.id} onClick={() => openLead(lead)} className="rounded-xl p-3 cursor-pointer hover:scale-[1.01] transition-all"
                        style={{ background: cat.id === "pendiente_vendedor" ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.07)", border: cat.id === "pendiente_vendedor" ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.08)" }}>
                        <div className="flex items-start justify-between mb-1.5">
                          <span className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.92)" }}>{normalizeLeadName(lead.nombre)}</span>
                          <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1" style={{ background: cat.id === "pendiente_vendedor" ? "#ef4444" : cat.id === "contactados" ? "#22c55e" : "#6b7280" }} />
                        </div>
                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                          <ChannelBadge channel={lead.canal} />
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: calif.bg, color: calif.color }}>{calif.label}</span>
                        </div>
                        {lastClientMsg && (
                          <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                            ⏱ Último msg cliente: {fmtTime(lastClientMsg)}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{fmtTime(lead.created_at)}</span>
                          {lead.vendedor_asignado && (
                            <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>👤 {lead.vendedor_asignado}</span>
                          )}
                        </div>
                        {cat.id === "cerrados" && lead.estado_cierre && (
                          <div className="mt-1.5 text-xs px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
                            {lead.estado_cierre === "venta_realizada" ? "✅ Venta realizada" : lead.estado_cierre === "no_contesta" ? "📵 No contesta" : lead.estado_cierre === "sin_interes" ? "❌ Sin interés" : lead.estado_cierre === "compro_otro_lugar" ? "🏪 Compró en otro lugar" : lead.estado_cierre === "no_cumple_credito" ? "🚫 No cumple crédito" : lead.estado_cierre === "spam" ? "🚯 Spam" : "💰 Precio alto"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cat.leads.length === 0 && <div className="text-center py-8 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Sin leads</div>}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {viewMode === "lista" && (
        <div className="border rounded-xl overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "hsl(var(--muted)/0.5)" }}>
              <tr>
                {["Nombre", "Canal", "Calificación", "Estado", "Etapa", "Vendedor", "Fecha", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLeads.slice(0, 20).map(lead => {
                const calif = CALIFICACION_BADGE[lead.calificacion] || CALIFICACION_BADGE.frio;
                const statusColor = lead.estado_cierre ? "#6b7280" : lead.primer_apertura_at ? "#22c55e" : "#ef4444";
                const statusLabel = lead.estado_cierre ? "Cerrado" : lead.primer_apertura_at ? "Contactado" : "Pendiente";
                return (
                <tr key={lead.id} className="border-t hover:bg-muted/30 cursor-pointer" style={{ borderColor: "hsl(var(--border))" }} onClick={() => openLead(lead)}>
                  <td className="px-4 py-3 font-medium">{normalizeLeadName(lead.nombre)}</td>
                  <td className="px-4 py-3"><ChannelBadge channel={lead.canal} /></td>
                  <td className="px-4 py-3"><span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: calif.bg, color: calif.color }}>{calif.label}</span></td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs font-semibold"><span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />{statusLabel}</span></td>
                  <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: ETAPA_COLORS[lead.etapa] + "20", color: ETAPA_COLORS[lead.etapa] }}>{ETAPA_LABELS[lead.etapa] || lead.etapa}</span></td>
                  <td className="px-4 py-3 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{lead.vendedor_asignado || "-"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{new Date(lead.created_at).toLocaleDateString("es-CL")}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{new Date(lead.created_at).toLocaleDateString("es-CL")}</td>
                  <td className="px-4 py-3">
                    <button onClick={async (e) => { e.stopPropagation(); if (confirm("¿Eliminar lead?")) { await supabase.from("leads").delete().eq("id", lead.id); setLeads(prev => prev.filter(l => l.id !== lead.id)); } }} className="text-xs px-2 py-1 rounded hover:bg-red-50" style={{ color: "#ef4444" }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredLeads.length === 0 && (
            <div className="text-center py-12" style={{ color: "hsl(var(--muted-foreground))" }}>
              <Target size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay leads</p>
            </div>
          )}
        </div>
      )}

      {/* Drawer lead */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelectedLead(null)}>
          <div className="flex-1" />
          <div className="w-96 h-full overflow-y-auto border-l flex flex-col" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
              <div>
                <h3 className="font-bold text-base">{normalizeLeadName(selectedLead.nombre)}</h3>
                <div className="flex items-center gap-2 mt-1"><ChannelBadge channel={selectedLead.canal} /><ScoreBadge score={selectedLead.score} /></div>
              </div>
              <button onClick={() => setSelectedLead(null)}><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-3 flex-1">
              {/* Response time metric */}
              <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: "hsl(var(--muted)/0.5)" }}>
                <p className="font-semibold mb-1">⏱ Tiempo de respuesta</p>
                <div className="flex justify-between">
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>Último mensaje del cliente</span>
                  <span className="font-medium">
                    {selectedLead.conversation_id && lastMessages[selectedLead.conversation_id]
                      ? new Date(lastMessages[selectedLead.conversation_id]).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                      : new Date(selectedLead.created_at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>Respuesta del vendedor</span>
                  <span className="font-medium" style={{ color: selectedLead.primer_apertura_at ? "#22c55e" : "#ef4444" }}>
                    {selectedLead.primer_apertura_at
                      ? fmtResponseTime(
                          selectedLead.conversation_id && lastMessages[selectedLead.conversation_id] ? lastMessages[selectedLead.conversation_id] : selectedLead.created_at,
                          selectedLead.primer_apertura_at
                        )
                      : "🔴 Pendiente"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>Estado</span>
                  <span className="font-semibold" style={{ color: selectedLead.primer_apertura_at ? "#22c55e" : "#ef4444" }}>
                    {selectedLead.estado_cierre ? "⬛ Cerrado" : selectedLead.primer_apertura_at ? "🟢 Contactado" : "🔴 Pendiente"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium block mb-1">Nombre</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={editLead.nombre || ""} onChange={e => setEditLead(p => ({ ...p, nombre: e.target.value }))} /></div>
                <div><label className="text-xs font-medium block mb-1">Teléfono</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={editLead.telefono || ""} onChange={e => setEditLead(p => ({ ...p, telefono: e.target.value }))} /></div>
                <div><label className="text-xs font-medium block mb-1">Email</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={editLead.email || ""} onChange={e => setEditLead(p => ({ ...p, email: e.target.value }))} /></div>
                <div><label className="text-xs font-medium block mb-1">Interés</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={editLead.interes || ""} onChange={e => setEditLead(p => ({ ...p, interes: e.target.value }))} /></div>
                <div><label className="text-xs font-medium block mb-1">Presupuesto</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={editLead.presupuesto || ""} onChange={e => setEditLead(p => ({ ...p, presupuesto: e.target.value }))} /></div>
                <div><label className="text-xs font-medium block mb-1">Urgencia</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={editLead.urgencia || "media"} onChange={e => setEditLead(p => ({ ...p, urgencia: e.target.value }))}>
                    <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                  </select>
                </div>
              </div>

              <div><label className="text-xs font-medium block mb-1">Etapa</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={editLead.etapa || "nuevo"} onChange={e => setEditLead(p => ({ ...p, etapa: e.target.value }))}>
                  {ETAPAS.map(e => <option key={e} value={e}>{ETAPA_LABELS[e]}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Vendedor asignado</label>
                <div className="w-full border rounded-lg px-3 py-2 text-sm bg-muted/40 flex items-center justify-between" style={{ borderColor: "hsl(var(--border))" }}>
                  <span>{editLead.vendedor_asignado || "Sin asignar"}</span>
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>🤖 Asigna el Agente IA</span>
                </div>
                <p className="text-[10px] mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Solo el Agente IA puede asignar clientes a vendedores según la rotación configurada.</p>
              </div>

              <div><label className="text-xs font-medium block mb-1">Calificación</label>
                <div className="flex gap-2">
                  {[{ val: "frio", label: "❄️ Frío", color: "#3b82f6" }, { val: "tibio", label: "🌤 Tibio", color: "#f59e0b" }, { val: "caliente", label: "🔥 Caliente", color: "#ef4444" }].map(opt => (
                    <button key={opt.val} onClick={() => setEditLead(p => ({ ...p, calificacion: opt.val }))} className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all" style={{ borderColor: editLead.calificacion === opt.val ? opt.color : "hsl(var(--border))", background: editLead.calificacion === opt.val ? `${opt.color}20` : "transparent", color: editLead.calificacion === opt.val ? opt.color : "hsl(var(--muted-foreground))" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div><label className="text-xs font-medium block mb-1">Observaciones del vendedor</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }} rows={2} placeholder='Ej: "Cliente interesado en camioneta XX, evaluando crédito."' value={editLead.observaciones_vendedor || ""} onChange={e => setEditLead(p => ({ ...p, observaciones_vendedor: e.target.value }))} />
              </div>

              <div><label className="text-xs font-medium block mb-1">Estado de cierre</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={editLead.estado_cierre || ""} onChange={e => setEditLead(p => ({ ...p, estado_cierre: e.target.value }))}>
                  <option value="">Sin cerrar</option>
                  <option value="venta_realizada">✅ Venta realizada</option>
                  <option value="no_contesta">📵 No contesta</option>
                  <option value="sin_interes">❌ Sin interés</option>
                  <option value="compro_otro_lugar">🏪 Compró en otro lugar</option>
                  <option value="no_cumple_credito">🚫 No cumple requisitos de crédito</option>
                   <option value="precio_alto">💰 Precio alto</option>
                   <option value="spam">🚯 Spam</option>
                 </select>
              </div>

              {editLead.estado_cierre && (
                <div><label className="text-xs font-medium block mb-1">Detalle adicional</label>
                  <textarea className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }} rows={2} placeholder="Describe el motivo con más detalle..." value={editLead.detalle_cierre || ""} onChange={e => setEditLead(p => ({ ...p, detalle_cierre: e.target.value }))} />
                </div>
              )}

              <div><label className="text-xs font-medium block mb-1">Notas</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }} rows={3} value={editLead.notas || ""} onChange={e => setEditLead(p => ({ ...p, notas: e.target.value }))} />
              </div>

              <button onClick={handleSaveLead} disabled={savingLead} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>
                {savingLead ? "Guardando..." : "Guardar cambios"}
              </button>

              <hr style={{ borderColor: "hsl(var(--border))" }} />

              <div>
                <p className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>Actividades</p>
                <div className="flex gap-2 mb-3">
                  <input value={newNota} onChange={e => setNewNota(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddNota()} placeholder="Agregar nota..." className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} />
                  <button onClick={handleAddNota} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}><Send size={14} /></button>
                </div>
                <div className="space-y-2">
                  {actividades.map(act => (
                    <div key={act.id} className="flex gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: act.tipo === "estado_cambio" ? "#6366f1" : "hsl(var(--primary))" }} />
                      <div>
                        <p>{act.descripcion}</p>
                        <p style={{ color: "hsl(var(--muted-foreground))" }}>{fmtTime(act.created_at)} · {act.usuario}</p>
                      </div>
                    </div>
                  ))}
                  {actividades.length === 0 && <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Sin actividades</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo lead */}
      {showNewLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNewLead(false)}>
          <div className="w-full max-w-md rounded-2xl p-6 border" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base">Nuevo Lead</h3>
              <button onClick={() => setShowNewLead(false)}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs font-medium block mb-1">Nombre *</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="Nombre del lead" value={newLead.nombre} onChange={e => setNewLead(p => ({ ...p, nombre: e.target.value }))} /></div>
              <div><label className="text-xs font-medium block mb-1">Teléfono</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={newLead.telefono} onChange={e => setNewLead(p => ({ ...p, telefono: e.target.value }))} /></div>
              <div><label className="text-xs font-medium block mb-1">Email</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} /></div>
              <div><label className="text-xs font-medium block mb-1">Canal</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={newLead.canal} onChange={e => setNewLead(p => ({ ...p, canal: e.target.value }))}>
                  <option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="presencial">Presencial</option>
                </select>
              </div>
              <div><label className="text-xs font-medium block mb-1">Urgencia</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={newLead.urgencia} onChange={e => setNewLead(p => ({ ...p, urgencia: e.target.value }))}>
                  <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                </select>
              </div>
              <div><label className="text-xs font-medium block mb-1">Interés</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="¿Qué busca?" value={newLead.interes} onChange={e => setNewLead(p => ({ ...p, interes: e.target.value }))} /></div>
              <div><label className="text-xs font-medium block mb-1">Presupuesto</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="$ Estimado" value={newLead.presupuesto} onChange={e => setNewLead(p => ({ ...p, presupuesto: e.target.value }))} /></div>
              <div className="col-span-2">
                <label className="text-xs font-medium block mb-1">Vendedor asignado</label>
                <div className="w-full border rounded-lg px-3 py-2 text-sm bg-muted/40 flex items-center justify-between" style={{ borderColor: "hsl(var(--border))" }}>
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>Sin asignar</span>
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>🤖 Lo asigna el Agente IA</span>
                </div>
              </div>
              <div className="col-span-2"><label className="text-xs font-medium block mb-1">Calificación</label>
                <div className="flex gap-2">
                  {[{ val: "frio", label: "❄️ Frío" }, { val: "tibio", label: "🌤 Tibio" }, { val: "caliente", label: "🔥 Caliente" }].map(opt => (
                    <button key={opt.val} type="button" onClick={() => setNewLead(p => ({ ...p, calificacion: opt.val }))} className="flex-1 py-2 rounded-lg text-xs font-semibold border" style={{ borderColor: newLead.calificacion === opt.val ? "hsl(var(--primary))" : "hsl(var(--border))", background: newLead.calificacion === opt.val ? "hsl(var(--primary)/0.1)" : "transparent" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2"><label className="text-xs font-medium block mb-1">Notas</label><textarea className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }} rows={2} value={newLead.notas} onChange={e => setNewLead(p => ({ ...p, notas: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewLead(false)} className="flex-1 py-2.5 border rounded-lg text-sm" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={handleCreateLead} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>Crear Lead</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PESTAÑA CONTACTOS ─────────────────────────────────────────────────────────
function TabContactos() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterChannel, setFilterChannel] = useState("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactConvs, setContactConvs] = useState<Conversation[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setLoading(true);
    supabase.from("contacts").select("*").order("last_seen", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1).then(({ data }) => {
      if (data) setContacts(data as Contact[]);
      setLoading(false);
    });
  }, [page]);

  useEffect(() => {
    if (!selectedContact) return;
    supabase.from("conversations").select("*").eq("contact_id", selectedContact.id).order("last_message_at", { ascending: false }).then(({ data }) => {
      if (data) setContactConvs(data as Conversation[]);
    });
  }, [selectedContact]);

  const filtered = contacts.filter(c => {
    if (filterChannel !== "all" && c.channel !== filterChannel) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.phone || "").includes(search)) return false;
    return true;
  });

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o teléfono..." className="w-full pl-8 pr-3 py-2 rounded-lg text-sm border bg-background" style={{ borderColor: "hsl(var(--border))" }} />
          </div>
          <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-background" style={{ borderColor: "hsl(var(--border))" }}>
            <option value="all">Todos los canales</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
        </div>

        <div className="border rounded-xl overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "hsl(var(--muted)/0.5)" }}>
              <tr>
                {["Contacto", "Teléfono", "Email", "Canal", "Última actividad", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-t animate-pulse" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-muted" /><div className="h-3 bg-muted rounded w-24" /></div></td>
                    {[...Array(4)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-muted rounded w-20" /></td>)}
                    <td className="px-4 py-3" />
                  </tr>
                ))
              ) : filtered.map(contact => (
                <tr key={contact.id} className="border-t hover:bg-muted/30 cursor-pointer" style={{ borderColor: "hsl(var(--border))" }} onClick={() => setSelectedContact(contact)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={normalizeLeadName(contact.name)} size={32} />
                      <span className="font-medium">{normalizeLeadName(contact.name)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{contact.phone || "-"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{contact.email || "-"}</td>
                  <td className="px-4 py-3"><ChannelBadge channel={contact.channel || "whatsapp"} /></td>
                  <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{contact.last_seen ? fmtTime(contact.last_seen) : "-"}</td>
                  <td className="px-4 py-3"><ChevronRight size={14} style={{ color: "hsl(var(--muted-foreground))" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: "hsl(var(--muted-foreground))" }}>
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay contactos</p>
            </div>
          )}
        </div>
        <div className="flex justify-between items-center mt-3 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          <span>{filtered.length} contactos</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40" style={{ borderColor: "hsl(var(--border))" }}>← Ant.</button>
            <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded" style={{ borderColor: "hsl(var(--border))" }}>Sig. →</button>
          </div>
        </div>
      </div>

      {/* Drawer contacto */}
      {selectedContact && (
        <div className="w-80 flex-shrink-0 border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Detalle</h3>
            <button onClick={() => setSelectedContact(null)}><X size={16} /></button>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={normalizeLeadName(selectedContact.name)} size={48} />
            <div>
              <p className="font-semibold">{normalizeLeadName(selectedContact.name)}</p>
              <ChannelBadge channel={selectedContact.channel || "whatsapp"} />
            </div>
          </div>
          <div className="space-y-2 text-sm mb-4">
            {selectedContact.phone && <div className="flex gap-2"><span style={{ color: "hsl(var(--muted-foreground))" }}>Tel:</span><span>{selectedContact.phone}</span></div>}
            {selectedContact.email && <div className="flex gap-2"><span style={{ color: "hsl(var(--muted-foreground))" }}>Email:</span><span>{selectedContact.email}</span></div>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>Conversaciones</p>
            <div className="space-y-2">
              {contactConvs.map(cv => (
                <div key={cv.id} className="text-xs p-2 rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="flex items-center justify-between mb-1">
                    <ChannelBadge channel={cv.channel || "whatsapp"} />
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>{fmtTime(cv.last_message_at)}</span>
                  </div>
                  <p className="truncate" style={{ color: "hsl(var(--muted-foreground))" }}>{cv.last_message || "Sin mensajes"}</p>
                </div>
              ))}
              {contactConvs.length === 0 && <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Sin conversaciones</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PESTAÑA MÉTRICAS ──────────────────────────────────────────────────────────
function TabMetricas() {
  const { usuarioActual } = useApp();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [filtroVendedor, setFiltroVendedor] = useState("todos");

  const isVendedor = usuarioActual?.rol === "vendedor";
  const vendedorName = usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : "";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const desde = new Date(fechaDesde + "T00:00:00");
      const hasta = new Date(fechaHasta + "T23:59:59");

      let query = supabase.from("leads").select("*").gte("created_at", desde.toISOString()).lte("created_at", hasta.toISOString()).order("created_at", { ascending: false });
      if (isVendedor && vendedorName) query = query.eq("vendedor_asignado", vendedorName);

      const [leadsRes, vendRes] = await Promise.all([
        query,
        supabase.from("vendedores").select("*").eq("activo", true).eq("rol", "vendedor"),
      ]);
      setLeads(((leadsRes.data || []) as Lead[]).map(normalizeLeadRecord));
      setVendedores((vendRes.data || []) as Vendedor[]);
      setLoading(false);
    };
    load();
  }, [fechaDesde, fechaHasta, isVendedor, vendedorName]);

  const filteredLeads = filtroVendedor === "todos" ? leads : leads.filter(l => l.vendedor_asignado === filtroVendedor);
  const calificados = filteredLeads.filter((l) => ["frio", "tibio", "caliente"].includes((l.calificacion || "").toLowerCase()));

  const tipoCalificacionData = [
    { name: "Frío", value: calificados.filter((l) => l.calificacion === "frio").length, fill: "hsl(210 90% 56%)" },
    { name: "Tibio", value: calificados.filter((l) => l.calificacion === "tibio").length, fill: "hsl(42 96% 56%)" },
    { name: "Caliente", value: calificados.filter((l) => l.calificacion === "caliente").length, fill: "hsl(2 84% 60%)" },
  ];

  const origenData = Object.values(
    calificados.reduce((acc, lead) => {
      const meta = getMetricsChannelMeta(lead.canal);
      if (!acc[meta.key]) acc[meta.key] = { name: meta.label, value: 0, fill: meta.color };
      acc[meta.key].value += 1;
      return acc;
    }, {} as Record<string, { name: string; value: number; fill: string }>)
  ).sort((a, b) => b.value - a.value);

  // Vendedor: asignados vs respondidos
  const vendedorData = Object.values(
    filteredLeads.reduce((acc, lead) => {
      const vendedor = lead.vendedor_asignado?.trim() || "Sin asignar";
      if (!acc[vendedor]) acc[vendedor] = { vendedor, asignados: 0, respondidos: 0, noRespondidos: 0 };
      acc[vendedor].asignados += 1;
      if (lead.primer_apertura_at) acc[vendedor].respondidos += 1;
      else acc[vendedor].noRespondidos += 1;
      return acc;
    }, {} as Record<string, { vendedor: string; asignados: number; respondidos: number; noRespondidos: number }>)
  ).sort((a, b) => b.asignados - a.asignados);

  // Tiempo promedio de respuesta por vendedor (minutos)
  const tiempoRespuestaData = Object.values(
    filteredLeads.reduce((acc, lead) => {
      const vendedor = lead.vendedor_asignado?.trim();
      if (!vendedor || !lead.primer_apertura_at) return acc;
      const creado = new Date(lead.created_at).getTime();
      const apertura = new Date(lead.primer_apertura_at).getTime();
      const diffMinutes = Math.max(0, (apertura - creado) / 60000);
      if (!acc[vendedor]) acc[vendedor] = { vendedor, totalMinutos: 0, count: 0, promedio: 0 };
      acc[vendedor].totalMinutos += diffMinutes;
      acc[vendedor].count += 1;
      acc[vendedor].promedio = Math.round(acc[vendedor].totalMinutos / acc[vendedor].count);
      return acc;
    }, {} as Record<string, { vendedor: string; totalMinutos: number; count: number; promedio: number }>)
  ).sort((a, b) => a.promedio - b.promedio);

  // No respondidos por vendedor
  const noRespondidosData = vendedorData.filter(v => v.vendedor !== "Sin asignar" && v.noRespondidos > 0);

  // Evolución diaria de leads (últimos 30 días)
  const dailyLeadsData = (() => {
    const days: { date: string; label: string; leads: number }[] = [];
    const map: Record<string, number> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
      days.push({ date: key, label, leads: 0 });
      map[key] = 0;
    }
    filteredLeads.forEach((l) => {
      if (!l.created_at) return;
      const key = String(l.created_at).slice(0, 10);
      if (key in map) map[key]++;
    });
    return days.map((d) => ({ ...d, leads: map[d.date] }));
  })();

  const leadsRecientes = calificados.slice(0, 8);
  const totalRespondidos = vendedorData.reduce((s, v) => s + v.respondidos, 0);
  const totalNoRespondidos = vendedorData.reduce((s, v) => s + v.noRespondidos, 0);
  const origenPrincipal = origenData[0]?.name || "Sin origen";
  const promedioGeneral = tiempoRespuestaData.length > 0
    ? Math.round(tiempoRespuestaData.reduce((s, v) => s + v.promedio, 0) / tiempoRespuestaData.length * 10) / 10
    : 0;

  const KPIS = [
    { label: "Clientes calificados", value: calificados.length, icon: Target, color: "hsl(var(--primary))" },
    { label: "Fríos", value: tipoCalificacionData[0].value, icon: Users, color: "hsl(210 90% 56%)" },
    { label: "Tibios", value: tipoCalificacionData[1].value, icon: TrendingUp, color: "hsl(42 96% 56%)" },
    { label: "Calientes", value: tipoCalificacionData[2].value, icon: Zap, color: "hsl(2 84% 60%)" },
    { label: "Respondidos", value: totalRespondidos, icon: CheckCheck, color: "hsl(var(--success))" },
    { label: "Sin responder", value: totalNoRespondidos, icon: AlertCircle, color: "hsl(var(--destructive))" },
    { label: "Promedio respuesta", value: `${promedioGeneral}h`, icon: Clock, color: "hsl(var(--warning))" },
    { label: "Origen principal", value: origenPrincipal, icon: BarChart3, color: "hsl(var(--muted-foreground))" },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-sm animate-pulse" style={{ color: "hsl(var(--muted-foreground))" }}>Cargando métricas...</div></div>;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 border rounded-xl p-4" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-background" style={{ borderColor: "hsl(var(--border))" }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-background" style={{ borderColor: "hsl(var(--border))" }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>Vendedor</label>
          <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-background" style={{ borderColor: "hsl(var(--border))" }}>
            <option value="todos">Todos</option>
            {vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {KPIS.map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="border rounded-xl p-4" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: kpi.color + "20" }}>
                  <Icon size={16} style={{ color: kpi.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Evolución diaria de leads (últimos 30 días) */}
      <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        <h3 className="text-sm font-bold mb-4">Evolución de Leads — Últimos 30 días</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={dailyLeadsData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="leads"
              name="Leads"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Origen */}
        <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <h3 className="text-sm font-bold mb-4">Clientes calificados por origen</h3>
          {origenData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={origenData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {origenData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="flex items-center justify-center h-60 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Sin clientes calificados en el período</div>}
        </div>

        {/* Tipo de calificación */}
        <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <h3 className="text-sm font-bold mb-4">Tipo de calificación</h3>
          {tipoCalificacionData.some((item) => item.value > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={tipoCalificacionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={11}>
                  {tipoCalificacionData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="flex items-center justify-center h-60 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Sin clientes calificados en el período</div>}
        </div>
      </div>

      {/* Vendedores: direccionados vs respondidos */}
      <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        <h3 className="text-sm font-bold mb-4">Clientes direccionados por vendedor vs respondidos</h3>
        {vendedorData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(280, vendedorData.length * 56)}>
            <BarChart data={vendedorData} layout="vertical" margin={{ left: 32, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="vendedor" width={140} tick={{ fontSize: 11 }} tickFormatter={(v) => v.length > 18 ? `${v.slice(0, 18)}…` : v} />
              <Tooltip />
              <Legend />
              <Bar dataKey="asignados" name="Direccionados" fill="hsl(var(--primary))" radius={[0, 8, 8, 0]} />
              <Bar dataKey="respondidos" name="Respondidos" fill="hsl(var(--success))" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="flex items-center justify-center h-60 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No hay vendedores con leads asignados</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tiempo promedio de respuesta por vendedor */}
        <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <h3 className="text-sm font-bold mb-4">Tiempo promedio de respuesta por vendedor (minutos)</h3>
          {tiempoRespuestaData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(240, tiempoRespuestaData.length * 48)}>
              <BarChart data={tiempoRespuestaData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} unit="min" />
                <YAxis type="category" dataKey="vendedor" width={140} tick={{ fontSize: 11 }} tickFormatter={(v) => v.length > 18 ? `${v.slice(0, 18)}…` : v} />
                <Tooltip formatter={(value: number) => [`${value} min`, "Promedio"]} />
                <Bar dataKey="promedio" name="Promedio (min)" fill="hsl(42 96% 56%)" radius={[0, 8, 8, 0]}>
                  {tiempoRespuestaData.map((entry, i) => (
                    <Cell key={i} fill={entry.promedio > 30 ? "hsl(2 84% 60%)" : entry.promedio > 15 ? "hsl(42 96% 56%)" : "hsl(var(--success))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="flex items-center justify-center h-60 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No hay datos de respuesta aún</div>}
        </div>

        {/* Clientes no respondidos por vendedor */}
        <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <h3 className="text-sm font-bold mb-4">Clientes direccionados sin respuesta del vendedor</h3>
          {noRespondidosData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(240, noRespondidosData.length * 48)}>
              <BarChart data={noRespondidosData} layout="vertical" margin={{ left: 32, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="vendedor" width={140} tick={{ fontSize: 11 }} tickFormatter={(v) => v.length > 18 ? `${v.slice(0, 18)}…` : v} />
                <Tooltip />
                <Bar dataKey="noRespondidos" name="Sin responder" fill="hsl(var(--destructive))" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="flex items-center justify-center h-60 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Todos los leads han sido respondidos 🎉</div>}
        </div>
      </div>

      {/* Tabla últimos calificados */}
      <div className="border rounded-xl overflow-hidden" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
          <h3 className="text-sm font-bold">Últimos clientes calificados</h3>
        </div>
        {leadsRecientes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "hsl(var(--muted)/0.45)" }}>
                <tr>
                  {['Nombre', 'Origen', 'Calificación', 'Vendedor', 'Estado'].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leadsRecientes.map((lead) => {
                  const calif = CALIFICACION_BADGE[lead.calificacion] || CALIFICACION_BADGE.frio;
                  return (
                    <tr key={lead.id} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                      <td className="px-4 py-3 font-medium">{normalizeLeadName(lead.nombre)}</td>
                      <td className="px-4 py-3"><ChannelBadge channel={getMetricsChannelMeta(lead.canal).key === 'sin_origen' ? 'whatsapp' : getMetricsChannelMeta(lead.canal).key} /></td>
                      <td className="px-4 py-3"><span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: calif.bg, color: calif.color }}>{calif.label}</span></td>
                      <td className="px-4 py-3" style={{ color: "hsl(var(--muted-foreground))" }}>{lead.vendedor_asignado || 'Sin asignar'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: lead.primer_apertura_at ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: lead.primer_apertura_at ? "hsl(var(--success))" : "hsl(var(--destructive))" }} />
                          {lead.primer_apertura_at ? 'Respondido' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="flex items-center justify-center h-40 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No hay clientes calificados aún</div>}
      </div>
    </div>
  );
}

// ── PESTAÑA CAMPAÑAS ──────────────────────────────────────────────────────────
function TabCampanas() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedCampana, setSelectedCampana] = useState<Campana | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nombre: "", mensaje: "", canal: "whatsapp", destinatarios_ids: [] as string[], estado: "borrador" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("campanas").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, name, channel, manychat_subscriber_id").limit(500)
    ]).then(([campRes, ctRes]) => {
      if (campRes.data) setCampanas(campRes.data as Campana[]);
      if (ctRes.data) setContacts(ctRes.data as Contact[]);
      setLoading(false);
    });
  }, []);

  const handleSave = async (estado: string) => {
    if (!form.nombre || !form.mensaje) return;
    const payload = { ...form, destinatarios_count: form.destinatarios_ids.length, estado };
    if (isNew) {
      const { data } = await supabase.from("campanas").insert(payload).select().single();
      if (data) { setCampanas(prev => [data as Campana, ...prev]); setSelectedCampana(data as Campana); setIsNew(false); }
    } else if (selectedCampana) {
      await supabase.from("campanas").update(payload).eq("id", selectedCampana.id);
      setCampanas(prev => prev.map(c => c.id === selectedCampana.id ? { ...c, ...payload } : c));
    }
  };

  const handleSend = async () => {
    if (!selectedCampana) return;
    setSending(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/manychat-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": anonKey },
        body: JSON.stringify({ campana_id: selectedCampana.id }),
      });
      const result = await res.json();
      alert(`Enviado: ${result.enviados}/${result.total} mensajes`);
      setCampanas(prev => prev.map(c => c.id === selectedCampana.id ? { ...c, estado: "enviada" } : c));
    } catch {
      alert("Error al enviar la campaña");
    }
    setSending(false);
  };

  const openNew = () => { setIsNew(true); setSelectedCampana(null); setForm({ nombre: "", mensaje: "", canal: "whatsapp", destinatarios_ids: [], estado: "borrador" }); };
  const openCampana = (c: Campana) => { setSelectedCampana(c); setIsNew(false); setForm({ nombre: c.nombre, mensaje: c.mensaje, canal: c.canal, destinatarios_ids: c.destinatarios_ids || [], estado: c.estado }); };

  const toggleDestinatario = (id: string) => {
    setForm(p => ({ ...p, destinatarios_ids: p.destinatarios_ids.includes(id) ? p.destinatarios_ids.filter(x => x !== id) : [...p.destinatarios_ids, id] }));
  };

  return (
    <div className="flex gap-4">
      {/* Lista campañas */}
      <div className="w-64 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">Campañas</h3>
          <button onClick={openNew} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg font-medium text-white" style={{ background: "hsl(var(--primary))" }}><Plus size={13} />Nueva</button>
        </div>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "hsl(var(--muted))" }} />)}</div>
        ) : (
          <div className="space-y-2">
            {campanas.map(c => (
              <button key={c.id} onClick={() => openCampana(c)} className="w-full text-left p-3 rounded-xl border transition-all" style={{ borderColor: selectedCampana?.id === c.id ? "hsl(var(--primary))" : "hsl(var(--border))", background: selectedCampana?.id === c.id ? "hsl(var(--primary)/0.05)" : "hsl(var(--card))" }}>
                <p className="text-sm font-medium truncate">{c.nombre}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{c.destinatarios_count} destinatarios</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: c.estado === "enviada" ? "#dcfce7" : "hsl(var(--muted))", color: c.estado === "enviada" ? "#166534" : "hsl(var(--muted-foreground))" }}>{c.estado}</span>
                </div>
              </button>
            ))}
            {campanas.length === 0 && <div className="text-center py-8 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Sin campañas</div>}
          </div>
        )}
      </div>

      {/* Editor campaña */}
      {(isNew || selectedCampana) ? (
        <div className="flex-1 border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <h3 className="font-bold mb-4">{isNew ? "Nueva Campaña" : selectedCampana?.nombre}</h3>
          <div className="space-y-4 max-w-2xl">
            <div><label className="text-xs font-medium block mb-1">Nombre de la campaña</label><input className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} /></div>
            <div><label className="text-xs font-medium block mb-1">Canal de envío</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={form.canal} onChange={e => setForm(p => ({ ...p, canal: e.target.value }))}>
                <option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="facebook">Facebook Messenger</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Mensaje</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }} rows={4} placeholder="Usa {{nombre}} para personalizar el mensaje..." value={form.mensaje} onChange={e => setForm(p => ({ ...p, mensaje: e.target.value }))} />
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{form.mensaje.length} caracteres · Variables disponibles: <code>{"{{nombre}}"}</code></p>
            </div>
            <div>
              <label className="text-xs font-medium block mb-2">Destinatarios <span className="font-bold" style={{ color: "hsl(var(--primary))" }}>({form.destinatarios_ids.length} seleccionados)</span></label>
              <div className="border rounded-xl overflow-hidden max-h-48 overflow-y-auto" style={{ borderColor: "hsl(var(--border))" }}>
                <div className="p-2 border-b flex gap-2" style={{ borderColor: "hsl(var(--border))" }}>
                  <button onClick={() => setForm(p => ({ ...p, destinatarios_ids: contacts.map(c => c.id) }))} className="text-xs px-2 py-1 rounded font-medium" style={{ background: "hsl(var(--primary)/0.1)", color: "hsl(var(--primary))" }}>Todos</button>
                  <button onClick={() => setForm(p => ({ ...p, destinatarios_ids: [] }))} className="text-xs px-2 py-1 rounded font-medium" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>Ninguno</button>
                </div>
                {contacts.filter(c => c.channel === form.canal || !c.channel).map(c => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer">
                    <input type="checkbox" checked={form.destinatarios_ids.includes(c.id)} onChange={() => toggleDestinatario(c.id)} className="rounded" />
                    <Avatar name={c.name} size={24} />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleSave("borrador")} className="px-4 py-2.5 border rounded-lg text-sm font-medium" style={{ borderColor: "hsl(var(--border))" }}>Guardar borrador</button>
              {selectedCampana && selectedCampana.estado !== "enviada" && (
                <button onClick={handleSend} disabled={sending || form.destinatarios_ids.length === 0} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#22c55e" }}>
                  <Send size={14} />{sending ? "Enviando..." : `Enviar a ${form.destinatarios_ids.length} contactos`}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border rounded-xl" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
          <div className="text-center">
            <Megaphone size={40} className="mx-auto mb-3 opacity-30" style={{ color: "hsl(var(--primary))" }} />
            <p className="font-medium text-sm">Selecciona o crea una campaña</p>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Envía mensajes masivos a tus contactos vía ManyChat</p>
            <button onClick={openNew} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white mx-auto" style={{ background: "hsl(var(--primary))" }}>
              <Plus size={14} />Nueva campaña
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN CRM ──────────────────────────────────────────────────────────────────
export default function Conversaciones() {
  const [activeTab, setActiveTab] = useState<Tab>("mensajes");

  const TABS = [
    { id: "mensajes" as Tab, label: "Mensajes", icon: MessageSquare },
    { id: "leads" as Tab, label: "Leads", icon: Target },
    { id: "contactos" as Tab, label: "Contactos", icon: Users },
    { id: "metricas" as Tab, label: "Métricas", icon: BarChart3 },
    { id: "campanas" as Tab, label: "Campañas", icon: Megaphone },
  ];

  const [agenteActivo, setAgenteActivo] = useState(true);
  const [loadingAgente, setLoadingAgente] = useState(false);

  useEffect(() => {
    supabase
      .from("configuracion_sistema")
      .select("valor")
      .eq("clave", "AGENTE_ACTIVO")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAgenteActivo(data.valor === "true");
      });
  }, []);

  const toggleAgente = async () => {
    const clave = prompt("Ingresa la clave de Admin Master para confirmar:");
    if (clave !== "123cuatro") {
      toast.error("Clave incorrecta");
      return;
    }
    setLoadingAgente(true);
    const nuevoValor = !agenteActivo;
    const { data: existing } = await supabase
      .from("configuracion_sistema")
      .select("id")
      .eq("clave", "AGENTE_ACTIVO")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("configuracion_sistema")
        .update({ valor: String(nuevoValor) })
        .eq("clave", "AGENTE_ACTIVO");
    } else {
      await supabase
        .from("configuracion_sistema")
        .insert({ clave: "AGENTE_ACTIVO", valor: String(nuevoValor) });
    }
    setAgenteActivo(nuevoValor);
    setLoadingAgente(false);
    toast.success(nuevoValor ? "Agente IA activado" : "Agente IA desactivado");
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
            <Target size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold">Egaña CRM</h1>
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Gestión de clientes y conversaciones</p>
          </div>
        </div>
        <button
          onClick={toggleAgente}
          disabled={loadingAgente}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95"
          style={{
            background: agenteActivo ? "hsl(142 71% 45% / 0.15)" : "hsl(0 84% 60% / 0.15)",
            color: agenteActivo ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)",
            border: `1px solid ${agenteActivo ? "hsl(142 71% 45% / 0.3)" : "hsl(0 84% 60% / 0.3)"}`,
          }}
        >
          <Bot size={14} />
          {loadingAgente ? "..." : agenteActivo ? "Agente IA Activo" : "Agente IA Apagado"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b flex-shrink-0 px-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative"
              style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", borderBottom: isActive ? "2px solid hsl(var(--primary))" : "2px solid transparent", marginBottom: "-1px" }}>
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "mensajes" && <TabMensajes />}
        {activeTab !== "mensajes" && (
          <div className="p-5 h-full overflow-y-auto">
            {activeTab === "leads" && <TabLeads />}
            {activeTab === "contactos" && <TabContactos />}
            {activeTab === "metricas" && <TabMetricas />}
            {activeTab === "campanas" && <TabCampanas />}
          </div>
        )}
      </div>
    </div>
  );
}
