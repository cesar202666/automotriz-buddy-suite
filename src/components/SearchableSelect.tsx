/**
 * SearchableSelect — Selector con búsqueda incorporada.
 *
 * Uso:
 *   <SearchableSelect
 *     value={form.clienteId}
 *     onChange={(v) => selectCliente(v)}
 *     options={clientes.map(c => ({
 *       value: c.id,
 *       label: `${c.nombres} ${c.apellidos}`,
 *       hint: c.telefono ? `Tel: ${c.telefono}` : "",
 *       search: `${c.nombres} ${c.apellidos} ${c.telefono} ${c.rut}`,
 *     }))}
 *     placeholder="Selecciona o escribe para buscar..."
 *   />
 *
 * Características:
 *  - Click o focus abre el dropdown
 *  - Type-ahead: filtra por nombre, hint o `search` (accent-insensitive)
 *  - Flechas ↑/↓ navegan, Enter selecciona, Esc cierra
 *  - Click fuera cierra
 *  - Botón × para limpiar selección
 *  - Resalta el match en cada opción
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  /** Línea adicional informativa bajo el label (ej: teléfono, año, etc.). */
  hint?: string;
  /** Texto adicional para buscar (no se muestra). */
  search?: string;
  /** Si true, la opción aparece deshabilitada (no seleccionable). */
  disabled?: boolean;
}

interface Props {
  value: string;
  onChange: (newValue: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  className?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Si true, muestra el botón × para limpiar. Default true. */
  clearable?: boolean;
  /** Muestra esa cantidad de resultados como max (default 100). */
  maxResults?: number;
  /** Estilo inline (border etc) si necesitas matchear inputs custom. */
  style?: React.CSSProperties;
}

const normalize = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Selecciona o escribe para buscar...",
  className = "",
  emptyMessage = "Sin resultados",
  disabled = false,
  clearable = true,
  maxResults = 100,
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Opción seleccionada
  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  // Filtro
  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options.slice(0, maxResults);
    const matches = options.filter((o) => {
      if (o.disabled) return false;
      const haystack = normalize(`${o.label} ${o.hint ?? ""} ${o.search ?? ""}`);
      return haystack.includes(q);
    });
    return matches.slice(0, maxResults);
  }, [options, query, maxResults]);

  // Reset highlight cuando cambia el query
  useEffect(() => {
    setHighlightIdx(0);
  }, [query, open]);

  // Auto-scroll a la opción resaltada
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-idx="${highlightIdx}"]`,
    ) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  // Click fuera cierra
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (opt: SearchableOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlightIdx];
      if (opt) handleSelect(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  // Texto visible cuando no está abierto
  const displayText = selected?.label ?? "";

  return (
    <div
      ref={containerRef}
      className={`relative ${disabled ? "opacity-60 pointer-events-none" : ""}`}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={`w-full border rounded-lg px-3 py-2 text-sm bg-background flex items-center gap-2 text-left ${className}`}
        style={style}
      >
        <span
          className="flex-1 truncate"
          style={{
            color: displayText
              ? "hsl(var(--foreground))"
              : "hsl(var(--muted-foreground))",
          }}
        >
          {displayText || placeholder}
        </span>
        {clearable && value && (
          <X
            size={14}
            className="opacity-60 hover:opacity-100 cursor-pointer flex-shrink-0"
            onClick={handleClear}
          />
        )}
        <ChevronDown
          size={14}
          className="opacity-60 flex-shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "" }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 border rounded-lg bg-popover shadow-lg overflow-hidden"
          style={{
            borderColor: "hsl(var(--border))",
            background: "hsl(var(--background))",
            maxHeight: 320,
          }}
        >
          {/* Search input */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: "hsl(var(--border))" }}
          >
            <Search
              size={13}
              style={{ color: "hsl(var(--muted-foreground))" }}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe para filtrar..."
              className="flex-1 bg-transparent outline-none text-sm"
              autoComplete="off"
            />
            <span
              className="text-[10px]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              {filtered.length}
            </span>
          </div>

          {/* Lista de opciones */}
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filtered.length === 0 ? (
              <div
                className="px-3 py-6 text-xs text-center"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                {emptyMessage}
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightIdx;
                return (
                  <div
                    key={opt.value}
                    data-idx={idx}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => handleSelect(opt)}
                    className="px-3 py-2 cursor-pointer flex items-start gap-2"
                    style={{
                      background: isHighlighted
                        ? "hsl(var(--muted))"
                        : isSelected
                          ? "hsl(var(--primary) / 0.08)"
                          : "transparent",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm truncate"
                        style={{
                          fontWeight: isSelected ? 600 : 400,
                          color: isSelected
                            ? "hsl(var(--primary))"
                            : "hsl(var(--foreground))",
                        }}
                      >
                        {opt.label}
                      </div>
                      {opt.hint && (
                        <div
                          className="text-[11px] truncate"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          {opt.hint}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check
                        size={14}
                        style={{ color: "hsl(var(--primary))", marginTop: 2 }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {filtered.length >= maxResults && (
            <div
              className="px-3 py-1.5 text-[10px] border-t text-center"
              style={{
                color: "hsl(var(--muted-foreground))",
                borderColor: "hsl(var(--border))",
              }}
            >
              Mostrando los primeros {maxResults} resultados. Escribe para
              filtrar más.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
