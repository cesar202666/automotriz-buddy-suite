/**
 * AutoRed Analytics — Servicio de integración API
 *
 * Endpoints utilizados (descubiertos vía pruebas):
 * - GET  /api/brands             → marcas + modelos anidados (Brands[].Models[])
 * - GET  /api/models?id={id}     → modelo específico
 * - POST /api/prices/search      → búsqueda de precios y tasaciones
 *
 * Token JWT:
 * - Se guarda en localStorage bajo "autored_token"
 * - Si expira (HTTP 401) → se notifica al usuario para que lo renueve
 */

const API_BASE = "https://analytics.autored.cl/api";
const TOKEN_KEY = "autored_token";

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

export interface PriceSearchResponse {
  vpd: unknown[];
  wvs: unknown[];
  sp: unknown[];
  list_prices: unknown[];
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

// ─── Token management ──────────────────────────────────────────

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch (e) {
    console.error("[autored] Error guardando token:", e);
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Decodifica el JWT para extraer la fecha de expiración (sin verificar firma). */
export function getTokenExpiry(token?: string | null): Date | null {
  const t = token ?? getToken();
  if (!t) return null;
  try {
    const parts = t.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp === "number") return new Date(payload.exp * 1000);
    return null;
  } catch {
    return null;
  }
}

export function isTokenExpired(): boolean {
  const exp = getTokenExpiry();
  if (!exp) return false;
  return exp.getTime() <= Date.now();
}

// ─── HTTP helpers ──────────────────────────────────────────────

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number> } = {},
): Promise<ApiResult<T>> {
  const token = getToken();
  if (!token) {
    return { ok: false, error: "Token no configurado. Ve a Configuración → AutoRed Analytics.", errorCode: "no_token" };
  }

  let url = `${API_BASE}${path}`;
  if (options.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) qs.append(k, String(v));
    url += "?" + qs.toString();
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "Token expirado o inválido. Renueva el token en Configuración → AutoRed.",
        errorCode: "expired",
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
        errorCode: "server",
      };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return { ok: false, error: "Tiempo de espera agotado (20s). Verifica tu conexión.", errorCode: "network" };
    }
    return { ok: false, error: `Error de red: ${msg}`, errorCode: "network" };
  }
}

// ─── API pública ───────────────────────────────────────────────

export async function fetchBrands(): Promise<ApiResult<AutoRedBrand[]>> {
  return request<AutoRedBrand[]>("/brands");
}

export async function searchPrices(params: SearchParams): Promise<ApiResult<PriceSearchResponse>> {
  return request<PriceSearchResponse>("/prices/search", {
    method: "POST",
    body: { search_data: params },
  });
}

// ─── Datos estáticos auxiliares (no devueltos por la API) ──────

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

/** Rango de años razonable para vehículos. */
export function generateYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear + 1; y >= 1990; y--) years.push(y);
  return years;
}

/** Helper para formatear pesos chilenos. */
export function formatCLP(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return "$" + amount.toLocaleString("es-CL");
}
