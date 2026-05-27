import { useEffect, useMemo, useState } from "react";
import {
  Search,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
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
  CHILE_REGIONS,
  generateYears,
  formatCLP,
  type AutoRedBrand,
  type AutoRedModel,
  type SearchParams,
  type PriceSearchResponse,
} from "@/lib/autoredService";

export default function AutoRed() {
  // ── Estado de marcas/modelos ────────────────────────────────────
  const [brands, setBrands] = useState<AutoRedBrand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [brandsError, setBrandsError] = useState("");

  // ── Formulario ──────────────────────────────────────────────────
  const [selectedBrandId, setSelectedBrandId] = useState<number | "">("");
  const [selectedModelId, setSelectedModelId] = useState<number | "">("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [km, setKm] = useState<number>(0);
  const [regionId, setRegionId] = useState<number>(13); // Metropolitana
  const [licensePlate, setLicensePlate] = useState("");
  const [versionId, setVersionId] = useState<string>("");

  // ── Búsqueda ────────────────────────────────────────────────────
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<PriceSearchResponse | null>(null);
  const [searchError, setSearchError] = useState("");

  // ── Cargar marcas al montar ─────────────────────────────────────
  const loadBrands = async () => {
    setLoadingBrands(true);
    setBrandsError("");
    const res = await fetchBrands();
    if (!res.ok || !res.data || !Array.isArray(res.data)) {
      setBrandsError(res.error || "No se pudieron cargar las marcas");
    } else {
      const sorted = [...res.data].sort((a, b) => a.name.localeCompare(b.name));
      setBrands(sorted);
    }
    setLoadingBrands(false);
  };

  useEffect(() => {
    loadBrands();
  }, []);

  // ── Modelos disponibles para la marca seleccionada ──────────────
  const availableModels: AutoRedModel[] = useMemo(() => {
    if (!selectedBrandId) return [];
    const brand = brands.find((b) => b.id === selectedBrandId);
    if (!brand || !brand.Models) return [];
    return [...brand.Models].sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedBrandId, brands]);

  // ── Versiones detectadas desde la última respuesta ──────────────
  const availableVersions = useMemo(() => {
    if (!result?.list_taxations) return [];
    return result.list_taxations.map((t) => ({
      id: `${t.year}-${t.version_name}`,
      label: `${t.version_name} (${t.year})`,
      year: t.year,
    }));
  }, [result]);

  // ── Handler de búsqueda ────────────────────────────────────────
  const handleSearch = async () => {
    if (!selectedBrandId || !selectedModelId) {
      setSearchError("Selecciona Marca y Modelo");
      return;
    }
    if (!year || year < 1990 || year > new Date().getFullYear() + 1) {
      setSearchError("Año inválido");
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
    } else {
      setResult(res.data);
    }
    setSearching(false);
  };

  // ── Helper para cards de precios ────────────────────────────────
  // Si no hay precio real de AutoRed, calculamos uno estimado basado en la
  // tasación fiscal SII (referencia aproximada del mercado chileno).
  const PriceCard = ({
    icon,
    label,
    value,
    accent,
    estimatedFromSII,
  }: {
    icon: React.ReactNode;
    label: string;
    value: number | null | undefined;
    accent: string;
    estimatedFromSII?: number | null;
  }) => {
    const isReal = value !== null && value !== undefined && value > 0;
    const showValue = isReal ? value : estimatedFromSII;
    return (
      <div
        className="border rounded-xl p-4 flex items-start gap-3"
        style={{
          borderColor: isReal ? accent + "40" : "hsl(var(--border))",
          background: "hsl(var(--card))",
          opacity: isReal ? 1 : 0.85,
        }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accent + "20", color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            {label}
            {!isReal && estimatedFromSII && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: "#fef3c7", color: "#92400e" }}
                title="Valor estimado basado en la tasación SII porque AutoRed no tiene datos de mercado para esta combinación"
              >
                est.
              </span>
            )}
          </p>
          <p className="text-xl font-bold mt-0.5">{formatCLP(showValue)}</p>
        </div>
      </div>
    );
  };

  // ── Calcular estimados desde la tasación SII ─────────────────────
  // Coeficientes empíricos del mercado chileno (referencia aproximada).
  // SII < Retoma < Venta ≈ Publicación < Negocio
  const sii = useMemo(() => {
    if (!result?.list_taxations || result.list_taxations.length === 0) return null;
    // Si hay versión seleccionada, usar esa tasación; si no, promedio o máxima
    const taxs = result.list_taxations.map((t) => t.taxation).filter((n) => n > 0);
    if (taxs.length === 0) return null;
    // Tomamos el mayor (versión más equipada) para que el estimado no quede bajo
    return Math.max(...taxs);
  }, [result]);

  const est = useMemo(() => {
    if (!sii) return null;
    return {
      retoma: Math.round((sii * 1.25) / 1000) * 1000,
      publicacion: Math.round((sii * 1.7) / 1000) * 1000,
      venta: Math.round((sii * 1.5) / 1000) * 1000,
      negocio: Math.round((sii * 1.35) / 1000) * 1000,
    };
  }, [sii]);

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
        <button
          onClick={loadBrands}
          disabled={loadingBrands}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted"
          style={{ borderColor: "hsl(var(--border))" }}
          title="Recargar lista de marcas"
        >
          <RefreshCw size={13} className={loadingBrands ? "animate-spin" : ""} />
          Recargar marcas
        </button>
      </div>

      {/* Aviso si hay error cargando marcas */}
      {brandsError && (
        <div
          className="border rounded-lg px-4 py-3 text-xs flex items-start gap-2"
          style={{ borderColor: "hsl(var(--destructive))", background: "hsl(var(--destructive)/0.08)", color: "hsl(var(--destructive))" }}
        >
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error cargando marcas</p>
            <p className="opacity-90">{brandsError}</p>
            <p className="opacity-75 mt-1">
              Si el problema persiste, contacta al administrador para actualizar el token de AutoRed
              en Supabase secrets.
            </p>
          </div>
        </div>
      )}

      {/* Formulario */}
      <div
        className="border rounded-xl p-5 space-y-4"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Marca */}
          <div>
            <label className="block text-xs font-medium mb-1">
              Marca {brands.length > 0 && <span className="font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>({brands.length})</span>}
            </label>
            <select
              value={selectedBrandId}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : "";
                setSelectedBrandId(v);
                setSelectedModelId("");
                setVersionId("");
                setResult(null);
              }}
              disabled={loadingBrands || brands.length === 0}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <option value="">
                {loadingBrands ? "Cargando..." : brands.length === 0 ? "Sin marcas disponibles" : "Selecciona marca"}
              </option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.Models?.length ?? 0})
                </option>
              ))}
            </select>
          </div>

          {/* Modelo */}
          <div>
            <label className="block text-xs font-medium mb-1">
              Modelo {availableModels.length > 0 && <span className="font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>({availableModels.length})</span>}
            </label>
            <select
              value={selectedModelId}
              onChange={(e) => {
                setSelectedModelId(e.target.value ? Number(e.target.value) : "");
                setVersionId("");
                setResult(null);
              }}
              disabled={!selectedBrandId || availableModels.length === 0}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <option value="">
                {selectedBrandId ? "Selecciona modelo" : "Selecciona marca primero"}
              </option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
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
                <option key={y} value={y}>
                  {y}
                </option>
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
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
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

          {/* Versión (aparece después de la primera búsqueda) */}
          {availableVersions.length > 0 && (
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium mb-1">
                Versión (opcional, refina la búsqueda)
              </label>
              <select
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                <option value="">Todas las versiones</option>
                {availableVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
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
          {searchError && (
            <p className="text-xs" style={{ color: "hsl(var(--destructive))" }}>{searchError}</p>
          )}
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
              estimatedFromSII={est?.retoma ?? null}
              accent="#16a34a"
            />
            <PriceCard
              icon={<Tag size={18} />}
              label="Precio Publicación"
              value={result.pm_publication?.price ?? null}
              estimatedFromSII={est?.publicacion ?? null}
              accent="#2563eb"
            />
            <PriceCard
              icon={<Banknote size={18} />}
              label="Precio Venta"
              value={result.pm_sale?.price ?? null}
              estimatedFromSII={est?.venta ?? null}
              accent="#d97706"
            />
            <PriceCard
              icon={<Briefcase size={18} />}
              label="Precio Negocio"
              value={result.pm_business?.price ?? null}
              estimatedFromSII={est?.negocio ?? null}
              accent="#7c3aed"
            />
          </div>

          {/* Aviso si los precios son estimados (no de AutoRed) */}
          {!result.pm_retake?.price && !result.pm_sale?.price && est && (
            <div
              className="border rounded-lg px-4 py-3 text-xs flex items-start gap-2"
              style={{ borderColor: "#d97706", background: "#fef3c7", color: "#92400e" }}
            >
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Precios estimados — referencia</p>
                <p className="opacity-90">
                  AutoRed no tiene precios de mercado para este modelo (probablemente por volumen
                  bajo de ventas). Los valores mostrados son <strong>estimaciones</strong> calculadas
                  a partir de la tasación fiscal SII × coeficientes promedio del mercado chileno
                  (Retoma 1.25x · Negocio 1.35x · Venta 1.5x · Publicación 1.7x). Úsalos como
                  referencia, no como precio definitivo.
                </p>
              </div>
            </div>
          )}

          {/* Tasaciones */}
          {result.list_taxations && result.list_taxations.length > 0 && (
            <div
              className="border rounded-xl p-5"
              style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
            >
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

          {/* Aviso si no hay NADA: ni precios ni tasación */}
          {!result.pm_retake?.price && !result.pm_sale?.price && !result.pm_publication?.price && !sii && (
            <div
              className="border rounded-lg px-4 py-3 text-xs flex items-center gap-2"
              style={{
                borderColor: "hsl(var(--border))",
                background: "hsl(var(--muted)/0.3)",
              }}
            >
              <AlertTriangle size={16} style={{ color: "#d97706" }} />
              <span>
                AutoRed no encontró información para esta combinación. Verifica que la marca/modelo
                exista realmente con el año seleccionado. Algunas combinaciones (marcas
                descontinuadas, modelos muy nuevos o muy antiguos) no tienen datos disponibles.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
