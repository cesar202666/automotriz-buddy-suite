import { useEffect, useMemo, useState } from "react";
import {
  Search,
  TrendingUp,
  RefreshCw,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  FileText,
  ShoppingCart,
  Tag,
  Briefcase,
  Car,
} from "lucide-react";
import {
  fetchBrands,
  searchPrices,
  getToken,
  setToken as saveToken,
  clearToken,
  getTokenExpiry,
  isTokenExpired,
  CHILE_REGIONS,
  generateYears,
  formatCLP,
  type AutoRedBrand,
  type AutoRedModel,
  type SearchParams,
  type PriceSearchResponse,
} from "@/lib/autoredService";

// Token inicial proporcionado por el usuario (válido hasta ~27 may 2026)
const INITIAL_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJkYXRhIjp7InVzZXJfaWQiOjE1ODkwfSwiZXhwIjoxNzc5OTE0MDgwfQ.QtYL56SM8cTmOBYPmHwnNAyrIxnrgINCYFs5goUKsP4";

export default function AutoRed() {
  // Estado del formulario
  const [brands, setBrands] = useState<AutoRedBrand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [brandsError, setBrandsError] = useState("");

  const [selectedBrandId, setSelectedBrandId] = useState<number | "">("");
  const [selectedModelId, setSelectedModelId] = useState<number | "">("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [km, setKm] = useState<number>(0);
  const [regionId, setRegionId] = useState<number>(13); // Metropolitana por defecto
  const [licensePlate, setLicensePlate] = useState("");
  const [versionId, setVersionId] = useState<string>("");

  // Estado de búsqueda
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<PriceSearchResponse | null>(null);
  const [searchError, setSearchError] = useState("");

  // Estado del token
  const [tokenInput, setTokenInput] = useState("");
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null);

  // ── Cargar token inicial si no hay ─────────────────────────────
  useEffect(() => {
    if (!getToken()) {
      saveToken(INITIAL_TOKEN);
    }
    setTokenExpiry(getTokenExpiry());
  }, []);

  // ── Cargar marcas al montar ────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingBrands(true);
      setBrandsError("");
      const res = await fetchBrands();
      if (!res.ok || !res.data) {
        setBrandsError(res.error || "Error cargando marcas");
        if (res.errorCode === "expired" || res.errorCode === "no_token") {
          setShowTokenModal(true);
        }
      } else {
        // Ordenar marcas alfabéticamente
        const sorted = [...res.data].sort((a, b) => a.name.localeCompare(b.name));
        setBrands(sorted);
      }
      setLoadingBrands(false);
    };
    load();
  }, []);

  // ── Modelos disponibles para la marca seleccionada ─────────────
  const availableModels: AutoRedModel[] = useMemo(() => {
    if (!selectedBrandId) return [];
    const brand = brands.find((b) => b.id === selectedBrandId);
    if (!brand) return [];
    return [...brand.Models].sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedBrandId, brands]);

  // ── Versiones detectadas desde la última respuesta ─────────────
  const availableVersions = useMemo(() => {
    if (!result?.list_taxations) return [];
    return result.list_taxations.map((t) => ({
      id: `${t.year}-${t.version_name}`,
      label: `${t.version_name} (${t.year})`,
      year: t.year,
    }));
  }, [result]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!selectedBrandId || !selectedModelId) {
      setSearchError("Selecciona Marca y Modelo");
      return;
    }
    if (!year || year < 1990 || year > new Date().getFullYear() + 1) {
      setSearchError("Año inválido");
      return;
    }

    if (isTokenExpired()) {
      setShowTokenModal(true);
      setSearchError("Token expirado. Renueva en el botón arriba.");
      return;
    }

    setSearching(true);
    setSearchError("");
    setResult(null);

    const params: SearchParams = {
      license_plate: licensePlate.trim().toUpperCase(),
      brand_id: Number(selectedBrandId),
      model_id: Number(selectedModelId),
      version_id: versionId || "",
      region_id: regionId,
      year,
      km: Math.max(0, km),
    };

    const res = await searchPrices(params);
    if (!res.ok || !res.data) {
      setSearchError(res.error || "Error en la consulta");
      if (res.errorCode === "expired") setShowTokenModal(true);
    } else {
      setResult(res.data);
    }
    setSearching(false);
  };

  const handleSaveToken = () => {
    if (!tokenInput.trim()) return;
    saveToken(tokenInput.trim());
    setTokenExpiry(getTokenExpiry());
    setShowTokenModal(false);
    setTokenInput("");
    // Recargar marcas con el token nuevo
    setBrandsError("");
    fetchBrands().then((res) => {
      if (res.ok && res.data) {
        const sorted = [...res.data].sort((a, b) => a.name.localeCompare(b.name));
        setBrands(sorted);
      } else {
        setBrandsError(res.error || "Token inválido");
      }
    });
  };

  const handleClearToken = () => {
    clearToken();
    setTokenExpiry(null);
    setBrands([]);
    setShowTokenModal(true);
  };

  // ── Render helpers ─────────────────────────────────────────────
  const PriceCard = ({
    icon,
    label,
    value,
    accent,
  }: {
    icon: React.ReactNode;
    label: string;
    value: number | null | undefined;
    accent: string;
  }) => (
    <div
      className="border rounded-xl p-4 flex items-start gap-3"
      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: accent + "20", color: accent }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</p>
        <p className="text-xl font-bold mt-0.5">{formatCLP(value)}</p>
      </div>
    </div>
  );

  const tokenExpired = isTokenExpired();
  const tokenExpiringSoon = tokenExpiry && tokenExpiry.getTime() - Date.now() < 24 * 60 * 60 * 1000;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <TrendingUp size={22} style={{ color: "hsl(var(--primary))" }} />
            AutoRed Analytics
          </h1>
          <p className="page-subtitle">Consulta de precios y tasaciones de vehículos</p>
        </div>
        <div className="flex items-center gap-2">
          {tokenExpiry && !tokenExpired && (
            <span
              className="text-xs px-2 py-1 rounded-full font-semibold flex items-center gap-1"
              style={{
                background: tokenExpiringSoon ? "#fef3c7" : "#dcfce7",
                color: tokenExpiringSoon ? "#d97706" : "#16a34a",
              }}
              title={`Expira: ${tokenExpiry.toLocaleString("es-CL")}`}
            >
              <CheckCircle2 size={12} />
              Token vigente
            </span>
          )}
          {tokenExpired && (
            <span
              className="text-xs px-2 py-1 rounded-full font-semibold flex items-center gap-1"
              style={{ background: "#fee2e2", color: "#dc2626" }}
            >
              <AlertTriangle size={12} />
              Token expirado
            </span>
          )}
          <button
            onClick={() => setShowTokenModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted"
            style={{ borderColor: "hsl(var(--border))" }}
          >
            <KeyRound size={13} /> Token
          </button>
        </div>
      </div>

      {/* Aviso si token expira pronto */}
      {tokenExpiringSoon && !tokenExpired && (
        <div
          className="border rounded-lg px-4 py-3 text-xs flex items-center gap-2"
          style={{ borderColor: "#d97706", background: "#fef3c7", color: "#92400e" }}
        >
          <AlertTriangle size={16} />
          <span>
            Tu token de AutoRed expira pronto ({tokenExpiry?.toLocaleString("es-CL")}). Renuévalo antes para evitar interrupciones.
          </span>
        </div>
      )}

      {/* Formulario */}
      <div className="border rounded-xl p-5 space-y-4" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Marca */}
          <div>
            <label className="block text-xs font-medium mb-1">Marca</label>
            <select
              value={selectedBrandId}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : "";
                setSelectedBrandId(v);
                setSelectedModelId("");
                setVersionId("");
              }}
              disabled={loadingBrands}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <option value="">{loadingBrands ? "Cargando marcas..." : "Selecciona marca"}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Modelo */}
          <div>
            <label className="block text-xs font-medium mb-1">Modelo</label>
            <select
              value={selectedModelId}
              onChange={(e) => {
                setSelectedModelId(e.target.value ? Number(e.target.value) : "");
                setVersionId("");
              }}
              disabled={!selectedBrandId || availableModels.length === 0}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <option value="">{selectedBrandId ? "Selecciona modelo" : "Selecciona marca primero"}</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Año */}
          <div>
            <label className="block text-xs font-medium mb-1">Año</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              {generateYears().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Kilometraje */}
          <div>
            <label className="block text-xs font-medium mb-1">Kilometraje</label>
            <input
              type="number"
              min="0"
              value={km}
              onChange={(e) => setKm(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            />
          </div>

          {/* Región */}
          <div>
            <label className="block text-xs font-medium mb-1">Región</label>
            <select
              value={regionId}
              onChange={(e) => setRegionId(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              {CHILE_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Patente */}
          <div>
            <label className="block text-xs font-medium mb-1">Patente (opcional)</label>
            <input
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
              placeholder="ABCD12"
              maxLength={8}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background uppercase"
              style={{ borderColor: "hsl(var(--border))" }}
            />
          </div>

          {/* Versión (si hay resultado previo, mostrar dropdown) */}
          {availableVersions.length > 0 && (
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium mb-1">Versión (opcional, refina la búsqueda)</label>
              <select
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                <option value="">Todas las versiones</option>
                {availableVersions.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Botón buscar */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSearch}
            disabled={searching || !selectedBrandId || !selectedModelId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "hsl(var(--primary))" }}
          >
            {searching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            {searching ? "Buscando..." : "Consultar precios"}
          </button>
          {searchError && <p className="text-xs" style={{ color: "hsl(var(--destructive))" }}>{searchError}</p>}
          {brandsError && <p className="text-xs" style={{ color: "hsl(var(--destructive))" }}>{brandsError}</p>}
        </div>
      </div>

      {/* Resultados */}
      {result && (
        <div className="space-y-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Car size={18} style={{ color: "hsl(var(--primary))" }} />
            Resultados
          </h2>

          {/* Precios de mercado */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PriceCard
              icon={<ShoppingCart size={18} />}
              label="Precio Retoma"
              value={result.pm_retake?.price ?? null}
              accent="#16a34a"
            />
            <PriceCard
              icon={<Tag size={18} />}
              label="Precio Publicación"
              value={result.pm_publication?.price ?? null}
              accent="#2563eb"
            />
            <PriceCard
              icon={<Banknote size={18} />}
              label="Precio Venta"
              value={result.pm_sale?.price ?? null}
              accent="#d97706"
            />
            <PriceCard
              icon={<Briefcase size={18} />}
              label="Precio Negocio"
              value={result.pm_business?.price ?? null}
              accent="#7c3aed"
            />
          </div>

          {/* Tasaciones */}
          {result.list_taxations && result.list_taxations.length > 0 && (
            <div className="border rounded-xl p-5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <FileText size={16} style={{ color: "hsl(var(--primary))" }} />
                Tasación Fiscal SII
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "hsl(var(--muted)/0.5)" }}>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Versión</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Año</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Tasación</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Permiso Circulación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.list_taxations.map((t, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                        <td className="px-3 py-2 font-medium">{t.version_name}</td>
                        <td className="px-3 py-2">{t.year}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCLP(t.taxation)}</td>
                        <td className="px-3 py-2 text-right">{formatCLP(t.circulation_permit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Warnings */}
          {(result.pm_retake?.warnings || result.pm_sale?.warnings) && (
            <div className="border rounded-lg p-4 text-xs" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
              <p className="font-semibold mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>Notas del análisis</p>
              <pre className="whitespace-pre-wrap break-words" style={{ color: "hsl(var(--muted-foreground))" }}>
                {JSON.stringify({
                  retake: result.pm_retake?.warnings,
                  sale: result.pm_sale?.warnings,
                }, null, 2)}
              </pre>
            </div>
          )}

          {/* Aviso si no hay precios */}
          {!result.pm_retake?.price && !result.pm_sale?.price && !result.pm_publication?.price && (
            <div
              className="border rounded-lg px-4 py-3 text-xs flex items-center gap-2"
              style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}
            >
              <AlertTriangle size={16} style={{ color: "#d97706" }} />
              <span>
                AutoRed no devolvió precios de mercado para esta combinación. Esto puede ocurrir si el modelo es muy reciente,
                muy antiguo, o no hay suficientes ventas en la región seleccionada. Solo se muestra la tasación fiscal.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Modal de token */}
      {showTokenModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-card rounded-xl shadow-2xl p-6 w-full max-w-lg border" style={{ borderColor: "hsl(var(--border))" }}>
            <h3 className="text-base font-bold mb-2 flex items-center gap-2">
              <KeyRound size={16} style={{ color: "hsl(var(--primary))" }} />
              Token de AutoRed Analytics
            </h3>
            <p className="text-xs mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
              Pega el JWT token obtenido desde <a href="https://analytics.autored.cl" target="_blank" rel="noreferrer" className="underline">analytics.autored.cl</a>.
              Para obtenerlo: login en AutoRed → DevTools (F12) → Network → cualquier request → Authorization header → copiar token después de "Bearer ".
            </p>
            <textarea
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="eyJhbGciOi..."
              className="w-full border rounded-lg px-3 py-2 text-xs bg-background font-mono"
              style={{ borderColor: "hsl(var(--border))", minHeight: 100 }}
            />
            {tokenExpiry && (
              <p className="text-xs mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                Token actual expira: <strong>{tokenExpiry.toLocaleString("es-CL")}</strong>
              </p>
            )}
            <div className="flex gap-2 justify-between items-center mt-4">
              <button
                onClick={handleClearToken}
                className="text-xs px-3 py-1.5 rounded border hover:bg-muted"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--destructive))" }}
              >
                Borrar token guardado
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTokenModal(false)}
                  className="px-3 py-1.5 rounded border text-sm hover:bg-muted"
                  style={{ borderColor: "hsl(var(--border))" }}
                >Cancelar</button>
                <button
                  onClick={handleSaveToken}
                  disabled={!tokenInput.trim()}
                  className="px-4 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "hsl(var(--primary))" }}
                >Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
