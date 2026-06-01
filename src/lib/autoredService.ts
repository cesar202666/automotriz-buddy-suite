/**
 * AutoRed Analytics — Servicio de integración API
 *
 * Arquitectura: el frontend llama a una edge function (autored-proxy) en
 * Supabase. La edge function tiene el token JWT guardado como secret
 * (AUTORED_TOKEN) y reenvía la request a AutoRed con el Origin correcto.
 *
 * Ventajas:
 * - El token nunca está expuesto en el navegador
 * - Si el token expira, basta actualizar el secret una sola vez en Supabase
 * - Resuelve el problema de CORS (la API de AutoRed no permite browsers directos)
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Tipos ─────────────────────────────────────────────────────

export interface AutoRedModel {
  id: number;
  name: string;
}

export interface AutoRedBrand {
  id: number;
  name: string;
  Models: AutoRedModel[];
}

export interface SearchParams {
  license_plate?: string;
  brand_id: number;
  model_id: number;
  version_id?: string | number;
  region_id: number;
  year: number;
  km: number;
}

export interface TaxationEntry {
  circulation_permit: number;
  model_id: number;
  taxation: number;
  version_name: string;
  year: number;
}

export interface PriceMetric {
  price: number | null;
  range?: number;
  priority?: number;
  warnings?: unknown;
  rules_applied?: unknown;
  response_type?: string;
  new_range?: number;
}

export interface ListPriceEntry {
  vehicle_year: number;
  price: number;
  discounted_price?: number;
  source?: string;
  source_link?: string;
  version_id: number;
  version_name: string;
  vehicle_version?: string;
}

export interface PriceSearchResponse {
  vpd: unknown[];
  wvs: unknown[];
  sp: unknown[];
  list_prices: ListPriceEntry[];
  list_taxations: TaxationEntry[];
  pm_retake: PriceMetric;
  pm_publication: PriceMetric;
  pm_sale: PriceMetric;
  pm_business: PriceMetric & { meta?: unknown };
  price_report_ticket?: unknown;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: "no_token" | "expired" | "network" | "server" | "unknown";
}

// ─── HTTP via Supabase edge function (autored-proxy) ───────────

async function callProxy<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke("autored-proxy", {
      body: { path, method, body },
    });

    if (error) {
      const msg = error.message || String(error);
      return { ok: false, error: msg, errorCode: "network" };
    }

    // La edge function devuelve el payload de AutoRed directamente.
    // Si AutoRed devolvió error (401, 500, etc), 'data' contiene { error: "..." } o similar.
    if (data && typeof data === "object" && "error" in data && Object.keys(data).length <= 3) {
      const errObj = data as { error?: string; status?: number };
      const errStr = errObj.error || "Error desconocido";
      const isAuth = /token|unauthor|expired|401|403/i.test(errStr);
      return {
        ok: false,
        error: errStr,
        errorCode: isAuth ? "expired" : "server",
      };
    }

    return { ok: true, data: data as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Error de conexión: ${msg}`, errorCode: "network" };
  }
}

// ─── API pública ───────────────────────────────────────────────

export async function fetchBrands(): Promise<ApiResult<AutoRedBrand[]>> {
  return callProxy<AutoRedBrand[]>("/brands");
}

export async function searchPrices(params: SearchParams): Promise<ApiResult<PriceSearchResponse>> {
  return callProxy<PriceSearchResponse>("/prices/search", "POST", { search_data: params });
}

// ─── Datos estáticos auxiliares ────────────────────────────────

/** 16 regiones de Chile con su numeración oficial (CUT). */
export const CHILE_REGIONS: { id: number; name: string }[] = [
  { id: 15, name: "Arica y Parinacota" },
  { id: 1, name: "Tarapacá" },
  { id: 2, name: "Antofagasta" },
  { id: 3, name: "Atacama" },
  { id: 4, name: "Coquimbo" },
  { id: 5, name: "Valparaíso" },
  { id: 13, name: "Metropolitana" },
  { id: 6, name: "O'Higgins" },
  { id: 7, name: "Maule" },
  { id: 16, name: "Ñuble" },
  { id: 8, name: "Biobío" },
  { id: 9, name: "Araucanía" },
  { id: 14, name: "Los Ríos" },
  { id: 10, name: "Los Lagos" },
  { id: 11, name: "Aysén" },
  { id: 12, name: "Magallanes" },
];

export function generateYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear + 1; y >= 1990; y--) years.push(y);
  return years;
}

export function formatCLP(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return "$" + amount.toLocaleString("es-CL");
}
