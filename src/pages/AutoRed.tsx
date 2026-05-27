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
  CheckCircle2,
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
import { supabase } from "@/integrations/supabase/client";

// Normaliza una patente: elimina espacios/guiones y pasa a mayúsculas
function normalizePlate(s: string): string {
  return s.replace(/[\s-]/g, "").toUpperCase();
}

// Quita acentos/diacríticos y pasa a mayúsculas para comparar marcas/modelos
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

export default function AutoRed() {
  // ── Estado de marcas/modelos ────────────────────────────────────
  const [brands, setBrands] = useState<AutoRedBrand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [brandsError, setBrandsError] = useState("");

  // ── Formulario ──────────────────────────────────────────────────
  const [licensePlate, setLicensePlate] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<number | "">("");
  const [selectedModelId, setSelectedModelId] = useState<number | "">("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [km, setKm] = useState<number>(0);
  const [regionId, setRegionId] = useState<number>(13); // Metropolitana
  const [versionId, setVersionId] = useState<string>("");

  // ── Búsqueda por patente en DB ──────────────────────────────────
  const [searchingPlate, setSearchingPlate] = useState(false);
  const [plateLookupMsg, setPlateLookupMsg] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);

  // ── Búsqueda de precios ────────────────────────────────────────
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

  // ── Búsqueda por patente en inventario local ────────────────────
  const lookupByPlate = async () => {
    const plate = normalizePlate(licensePlate);
    if (!plate) {
      setPlateLookupMsg({ type: "warning", text: "Ingresa una patente para buscar" });
      return;
    }
    setSearchingPlate(true);
    setPlateLookupMsg(null);

    try {
      const { data, error } = await supabase
        .from("vehiculos")
        .select("patente, marca, modelo, anio, kilometraje")
        .ilike("patente", plate)
        .limit(1)
        .maybeSingle();

      if (error) {
        setPlateLookupMsg({ type: "error", text: `Error: ${error.message}` });
        return;
      }
      if (!data) {
        setPlateLookupMsg({
          type: "warning",
          text: `Patente "${plate}" no encontrada en el inventario. Ingresa los datos manualmente.`,
        });
        return;
      }

      // Mapear marca → brand_id
      const marcaNorm = normalizeName(String(data.marca || ""));
      const matchedBrand = brands.find((b) => {
        const bNorm = normalizeName(b.name);
        return bNorm === marcaNorm || bNorm.includes(marcaNorm) || marcaNorm.includes(bNorm);
      });

      if (!matchedBrand) {
        setPlateLookupMsg({
          type: "warning",
          text: `Vehículo encontrado (${data.marca} ${data.modelo}) pero la marca no existe en AutoRed.`,
        });
        return;
      }

      // Mapear modelo → model_id (busca primer modelo que coincida o contenga)
      const modeloNorm = normalizeName(String(data.modelo || ""));
      const primerToken = modeloNorm.split(/\s+/)[0]; // ej "NEW RANGER XLT 4X4" → "NEW"
      const matchedModel =
        matchedBrand.Models.find((m) => normalizeName(m.name) === modeloNorm) ||
        matchedBrand.Models.find((m) => modeloNorm.includes(normalizeName(m.name))) ||
        matchedBrand.Models.find((m) => normalizeName(m.name).includes(primerToken));

      setSelectedBrandId(matchedBrand.id);
      if (matchedModel) {
        setSelectedModelId(matchedModel.id);
      } else {
        setSelectedModelId("");
      }

      // Año
      const anioNum = parseInt(String(data.anio || ""), 10);
      if (anioNum && anioNum >= 1990 && anioNum <= new Date().getFullYear() + 1) {
        setYear(anioNum);
      }

      // Km
      const kmNum = Number(data.kilometraje) || 0;
      if (kmNum > 0) setKm(kmNum);

      // Limpiar resultados previos
      setResult(null);
      setVersionId("");

      setPlateLookupMsg({
        type: "success",
        text: matchedModel
          ? `✓ ${data.marca} ${data.modelo} ${data.anio} · ${kmNum.toLocaleString("es-CL")} km. Click "Consultar precios" para tasar.`
          : `✓ ${data.marca} encontrado, pero el modelo "${data.modelo}" no coincide exactamente con AutoRed. Selecciónalo manualmente.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlateLookupMsg({ type: "error", text: `Error: ${msg}` });
    } finally {
      setSearchingPlate(false);
    }
  };

  // ── Handler de búsqueda de precios ─────────────────────────────
  const handleSearch = async () => {
    if (!selectedBrandId || !selectedModelId) {
      setSearchError("Selecciona Marca y Modelo (o busca por patente)");
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
      license_plate: normalizePlate(licensePlate),
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
  const PriceCard = ({
    icon,
    label,
    value,
    accent,
    rangePercent,
    estimatedFromSII,
    showRange = false,
  }: {
    icon: React.ReactNode;
    label: string;
    value: number | null | undefined;
    accent: string;
    rangePercent?: number | null;
    estimatedFromSII?: number | null;
    showRange?: boolean;
  }) => {
    const isReal = value !== null && value !== undefined && value > 0;
    const showValue = isReal ? value : estimatedFromSII;
    const effectiveRange = isReal ? rangePercent : 10;
    const halfPct = effectiveRange && effectiveRange > 0 ? effectiveRange / 200 : 0;
    const low = showValue && halfPct ? Math.round((showValue * (1 - halfPct)) / 1000) * 1000 : null;
    const high = showValue && halfPct ? Math.round((showValue * (1 + halfPct)) / 1000) * 1000 : null;

    return (
      <div
        className="border rounded-xl p-4"
        style={{
          borderColor: isReal ? accent + "40" : "hsl(var(--border))",
          background: "hsl(var(--card))",
          opacity: isReal ? 1 : 0.9,
        }}
      >
        <div className="flex items-start gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: accent + "20", color: accent }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium flex items-center gap-1" style={{ color: "hsl(var(--muted-foreground))" }}>
              {label}
              {!isReal && estimatedFromSII && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: "#fef3c7", color: "#92400e" }}
                  title="Estimado basado en tasación SII"
                >
                  est.
                </span>
              )}
            </p>
            <p className="text-xl font-bold mt-0.5">{formatCLP(showValue)}</p>
          </div>
        </div>

        {showRange && showValue && low && high && (
          <div className="pt-2 mt-1 border-t" style={{ borderColor: "hsl(var(--border))" }}>
            <p
              className="text-[10px] font-semibold uppercase mb-1.5"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Rango de precios
            </p>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-semibold px-2 py-1 rounded-full border whitespace-nowrap"
                style={{ borderColor: accent + "60", color: accent, background: accent + "10" }}
              >
                {formatCLP(low)}
              </span>
              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>⟷</span>
              <span
                className="text-xs font-semibold px-2 py-1 rounded-full border whitespace-nowrap"
                style={{ borderColor: accent + "60", color: accent, background: accent + "10" }}
              >
                {formatCLP(high)}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Estimados desde tasación SII ─────────────────────────────────
  const sii = useMemo(() => {
    if (!result?.list_taxations || result.list_taxations.length === 0) return null;
    const taxs = result.list_taxations.map((t) => t.taxation).filter((n) => n > 0);
    if (taxs.length === 0) return null;
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

      {brandsError && (
        <div
          className="border rounded-lg px-4 py-3 text-xs flex items-start gap-2"
          style={{
            borderColor: "hsl(var(--destructive))",
            background: "hsl(var(--destructive)/0.08)",
            color: "hsl(var(--destructive))",
          }}
        >
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error cargando marcas</p>
            <p className="opacity-90">{brandsError}</p>
          </div>
        </div>
      )}

      {/* ── Búsqueda por patente (sección destacada arriba) ─────── */}
      <div
        className="border rounded-xl p-5"
        style={{ borderColor: "hsl(var(--primary)/0.3)", background: "hsl(var(--primary)/0.04)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Car size={18} style={{ color: "hsl(var(--primary))" }} />
          <h2 className="text-sm font-bold">Buscar por patente (recomendado)</h2>
        </div>
        <p className="text-xs mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
          Ingresa la patente de un vehículo de tu inventario y se autocompletan marca, modelo, año y kilometraje.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            value={licensePlate}
            onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && lookupByPlate()}
            placeholder="ABCD12"
            maxLength={8}
            className="flex-1 min-w-[140px] border rounded-lg px-3 py-2 text-sm bg-background uppercase font-mono tracking-wider"
            style={{ borderColor: "hsl(var(--border))" }}
          />
          <button
            onClick={lookupByPlate}
            disabled={searchingPlate || !licensePlate.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 whitespace-nowrap"
            style={{ background: "hsl(var(--primary))" }}
          >
            {searchingPlate ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar patente
          </button>
        </div>
        {plateLookupMsg && (
          <div
            className="mt-3 px-3 py-2 rounded-lg text-xs flex items-start gap-2"
            style={{
              background:
                plateLookupMsg.type === "success"
                  ? "#dcfce7"
                  : plateLookupMsg.type === "warning"
                  ? "#fef3c7"
                  : "#fee2e2",
              color:
                plateLookupMsg.type === "success"
                  ? "#16a34a"
                  : plateLookupMsg.type === "warning"
                  ? "#92400e"
                  : "#dc2626",
            }}
          >
            {plateLookupMsg.type === "success" ? (
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            )}
            <span>{plateLookupMsg.text}</span>
          </div>
        )}
      </div>

      {/* ── Formulario manual (datos del vehículo) ─────────────── */}
      <div
        className="border rounded-xl p-5 space-y-4"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <p className="text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
          O ingresa los datos manualmente:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Marca {brands.length > 0 && (
                <span className="font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>({brands.length})</span>
              )}
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
              <option value="">{loadingBrands ? "Cargando..." : "Selecciona marca"}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.Models?.length ?? 0})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Modelo {availableModels.length > 0 && (
                <span className="font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>({availableModels.length})</span>
              )}
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
              <option value="">{selectedBrandId ? "Selecciona modelo" : "Selecciona marca primero"}</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

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

          {availableVersions.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-1">Versión (opcional)</label>
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

      {result && (
        <div className="space-y-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Car size={18} style={{ color: "hsl(var(--primary))" }} />
            Resultados
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PriceCard
              icon={<ShoppingCart size={18} />}
              label="Precio Retoma"
              value={result.pm_retake?.price ?? null}
              estimatedFromSII={est?.retoma ?? null}
              rangePercent={result.pm_retake?.range ?? null}
              accent="#16a34a"
            />
            <PriceCard
              icon={<Tag size={18} />}
              label="Precio Publicación"
              value={result.pm_publication?.price ?? null}
              estimatedFromSII={est?.publicacion ?? null}
              rangePercent={result.pm_publication?.range ?? null}
              accent="#2563eb"
              showRange
            />
            <PriceCard
              icon={<Banknote size={18} />}
              label="Precio Venta"
              value={result.pm_sale?.price ?? null}
              estimatedFromSII={est?.venta ?? null}
              rangePercent={result.pm_sale?.range ?? null}
              accent="#d97706"
              showRange
            />
            <PriceCard
              icon={<Briefcase size={18} />}
              label="Precio Negocio"
              value={result.pm_business?.price ?? null}
              estimatedFromSII={est?.negocio ?? null}
              accent="#7c3aed"
            />
          </div>

          {!result.pm_retake?.price && !result.pm_sale?.price && est && (
            <div
              className="border rounded-lg px-4 py-3 text-xs flex items-start gap-2"
              style={{ borderColor: "#d97706", background: "#fef3c7", color: "#92400e" }}
            >
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Precios estimados — referencia</p>
                <p className="opacity-90">
                  AutoRed no tiene precios de mercado para este modelo. Los valores son <strong>estimaciones</strong> calculadas
                  desde la tasación SII × coeficientes promedio (Retoma 1.25x · Negocio 1.35x · Venta 1.5x · Publicación 1.7x).
                </p>
              </div>
            </div>
          )}

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

          {!result.pm_retake?.price &&
            !result.pm_sale?.price &&
            !result.pm_publication?.price &&
            !sii && (
              <div
                className="border rounded-lg px-4 py-3 text-xs flex items-center gap-2"
                style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}
              >
                <AlertTriangle size={16} style={{ color: "#d97706" }} />
                <span>
                  AutoRed no encontró información para esta combinación. Verifica marca/modelo/año.
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
