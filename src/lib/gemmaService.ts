/**
 * Gemma.cl — Servicio cliente para la edge function gemma-proxy.
 *
 * La edge function mantiene cookies de sesión y las renueva automáticamente;
 * el frontend solo llama a action+params.
 */

import { supabase } from "@/integrations/supabase/client";

export interface EstadoSidebar {
  estado: string;
  cantidad: number;
  simulacion_estado: number;
}

export interface CasoAbierto {
  codigo: string;
  fecha: string;
  dias: number;
  estado: string;
  estado_consolidado: string;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_full: string;
  precio: number;
  pct_pie: number;
  saldo_precio: number;
  marca: string;
  modelo: string;
  anio: string;
  simulacion_id: string;
  cliente_rut: string;
  cliente_tipo: string;
  vendedor: string;
  cuota: string;
}

export interface GestionRow {
  simulacion_id: string;
  estado: string;
  codigo: string;
  fecha: string;
  tipo: string;
  distribuidor_id: string;
  distribuidor_nombre: string;
  ejecutivo: string;
  vendedor: string;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_materno: string;
  cliente_display: string;
  saldo_precio: number;
}

export interface DashboardResponse {
  ok: boolean;
  estados?: EstadoSidebar[];
  casos_abiertos?: CasoAbierto[];
  cursar?: GestionRow[];
  validar?: GestionRow[];
  totales?: {
    aprobadas: number;
    rechazadas: number;
    casos_abiertos: number;
    cursar: number;
    validar: number;
  };
  error?: string;
  sessionExpired?: boolean;
}

export interface EstadisticaVendedor {
  vendedor: string;
  solicitudes: number;
  aprobadas: number;
  pct_aprobacion: number;
  cursadas: number;
  pct_cierre: number;
  pct_eficiencia: number;
}

export interface EstadisticasResponse {
  ok: boolean;
  estadisticas?: EstadisticaVendedor[];
  error?: string;
  sessionExpired?: boolean;
}

export interface IngresadosRangoResponse {
  ok: boolean;
  desde?: string;
  hasta?: string;
  total?: number;
  serie?: { fecha: string; ingresados: number }[];
  error?: string;
  sessionExpired?: boolean;
}

export interface HealthResponse {
  ok: boolean;
  sessionExpired?: boolean;
  status?: number;
  cookies_set?: boolean;
  reason?: string;
}

// ── Vendedores conocidos en Gemma (con RUT) ──────────────────────
export const GEMMA_VENDEDORES = [
  { rut: "", nombre: "Todos" },
  { rut: "19120818-8", nombre: "ALLISON HINRICHSEN" },
  { rut: "21061171-1", nombre: "DANIEL STEFANOSWKY" },
  { rut: "27226889-4", nombre: "MARIA MARTINEZ" },
  { rut: "16911092-1", nombre: "NICOL DE LA PEÑA" },
  { rut: "16551812-8", nombre: "PAMELA VARGAS" },
];

export const GEMMA_SUCURSALES = [
  { id: "0", nombre: "Todas" },
  { id: "4", nombre: "EGAÑA 931" },
];

// ── Llamadas ─────────────────────────────────────────────────────

async function call<T>(
  action: "dashboard" | "estadisticas" | "ingresados_rango" | "health",
  params: Record<string, string> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gemma-proxy", {
    body: { action, params },
  });
  if (error) {
    return { ok: false, error: error.message || String(error) } as unknown as T;
  }
  return data as T;
}

export function checkGemmaHealth(): Promise<HealthResponse> {
  return call<HealthResponse>("health");
}

export function fetchGemmaDashboard(
  vendedorRut = "",
  sucursalId = "0",
): Promise<DashboardResponse> {
  return call<DashboardResponse>("dashboard", {
    vendedor_rut: vendedorRut,
    sucursal_id: sucursalId,
  });
}

export function fetchGemmaEstadisticas(
  vendedorRut = "",
): Promise<EstadisticasResponse> {
  return call<EstadisticasResponse>("estadisticas", {
    vendedor_rut: vendedorRut,
  });
}

/** Devuelve los ingresados día a día entre dos fechas (formato DD/MM/YYYY). */
export function fetchGemmaIngresadosRango(
  desde: string,
  hasta: string,
  vendedorRut = "",
  sucursalId = "0",
): Promise<IngresadosRangoResponse> {
  return call<IngresadosRangoResponse>("ingresados_rango", {
    desde,
    hasta,
    vendedor_rut: vendedorRut,
    sucursal_id: sucursalId,
  });
}

// ── Helpers ──────────────────────────────────────────────────────

export function formatCLP(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(1) + "%";
}

/** DD/MM/YYYY ← Date */
export function toGemmaDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Date ← DD/MM/YYYY  (devuelve null si no parsea) */
export function fromGemmaDate(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
