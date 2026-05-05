import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mobile-only notifications for the CRM.
 * - Asks for browser Notification permission.
 * - Subscribes to new inbound messages (from clients) on Supabase realtime.
 * - Shows a WhatsApp-like notification via the registered Service Worker.
 *
 * Mounted only inside /crm-movil — does not affect desktop.
 */
export default function MobileNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [enabled, setEnabled] = useState<boolean>(() => {
    return localStorage.getItem("crmMovil.notify") !== "0";
  });
  const lastShownRef = useRef<Set<string>>(new Set());
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    localStorage.setItem("crmMovil.notify", enabled ? "1" : "0");
  }, [enabled]);

  // Ensure SW is registered (the index already registers it, but be safe)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) {
          navigator.serviceWorker.register("/service-worker.js").catch(() => {});
        }
      });
    }
  }, []);

  const askPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") setEnabled(true);
    } catch {/* ignore */}
  };

  // Subscribe to new inbound messages
  useEffect(() => {
    if (!enabled || permission !== "granted") return;

    const showNotification = async (title: string, body: string, url = "/#/crm-movil") => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg && "showNotification" in reg) {
          await reg.showNotification(title, {
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: "crm-msg",
            data: { url },
            // @ts-expect-error vibrate is supported on Android
            vibrate: [120, 60, 120],
          });
        } else if (typeof Notification !== "undefined") {
          new Notification(title, { body, icon: "/icon-192.png" });
        }
      } catch {/* ignore */}
    };

    const channel = supabase
      .channel("crm-movil-notify")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as {
            id: string;
            direction: string;
            content: string;
            conversation_id: string;
            contact_id: string | null;
            sent_at: string;
            created_at: string;
          };
          if (!m || m.direction !== "inbound") return;
          // Avoid notifying for historical rows received on initial sync
          const ts = new Date(m.created_at || m.sent_at).getTime();
          if (ts < mountedAtRef.current - 5000) return;
          if (lastShownRef.current.has(m.id)) return;
          lastShownRef.current.add(m.id);

          // If the page is focused and visible, skip the OS notification
          if (document.visibilityState === "visible" && document.hasFocus()) return;

          let nombre = "Nuevo mensaje";
          if (m.contact_id) {
            const { data } = await supabase
              .from("contacts")
              .select("name")
              .eq("id", m.contact_id)
              .maybeSingle();
            if (data?.name) nombre = data.name;
          }
          const body = (m.content || "").slice(0, 140) || "Mensaje recibido";
          await showNotification(nombre, body);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, permission]);

  // UI: small toggle pill — only visible if permission not yet granted, or to toggle
  if (permission === "granted" && enabled) {
    return (
      <button
        onClick={() => setEnabled(false)}
        className="fixed bottom-3 right-3 z-50 flex items-center gap-1 rounded-full px-3 py-1.5 shadow-lg text-[11px] font-semibold"
        style={{ background: "hsl(var(--primary))", color: "white" }}
        aria-label="Notificaciones activas"
      >
        <Bell size={13} /> Notif. ON
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        if (permission !== "granted") askPermission();
        else setEnabled(true);
      }}
      className="fixed bottom-3 right-3 z-50 flex items-center gap-1 rounded-full px-3 py-1.5 shadow-lg text-[11px] font-semibold border"
      style={{ background: "hsl(var(--card))", color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" }}
      aria-label="Activar notificaciones"
    >
      <BellOff size={13} /> Activar notificaciones
    </button>
  );
}
