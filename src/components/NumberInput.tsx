/**
 * NumberInput — input numerico con formato chileno (separador miles con puntos).
 *
 * Resuelve 3 problemas comunes:
 *
 * 1. <input type="number"> no acepta puntos como separador de miles, asi que
 *    si el usuario escribe "10.500.000" el navegador lo trunca a "10" o "10500".
 *    Aca usamos type="text" + inputMode="numeric" para que el teclado del
 *    celular muestre numeros pero podamos formatear con puntos.
 *
 * 2. value={n || 0} muestra "0" cuando esta vacio y el usuario tiene que
 *    borrar el 0 antes de escribir. Aca: cuando value es 0 muestra string
 *    vacio + placeholder.
 *
 * 3. Limite invisible de digitos en algunos navegadores con type="number".
 *    Con type="text" no hay limite.
 *
 * Modos:
 * - currency: muestra prefijo "$" en el padding izquierdo cuando hay valor.
 * - default: solo numero (ej: kilometraje, año).
 *
 * Uso:
 *   <NumberInput
 *     value={form.precioVenta}
 *     onChange={(n) => setForm({...form, precioVenta: n})}
 *     currency
 *     placeholder="Precio venta..."
 *   />
 */

import { forwardRef } from "react";

interface Props
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  value: number;
  onChange: (n: number) => void;
  /** Muestra prefijo "$" arriba del padding izquierdo. */
  currency?: boolean;
  /** Maximo permitido (default sin tope). */
  max?: number;
}

const formatCL = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "";
  return Math.trunc(n).toLocaleString("es-CL");
};

const stripNonDigits = (s: string): string => s.replace(/\D/g, "");

export const NumberInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, currency, placeholder, className, style, max, ...rest }, ref) => {
    const display = formatCL(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = stripNonDigits(e.target.value);
      if (cleaned === "") {
        onChange(0);
        return;
      }
      let n = Number(cleaned);
      if (!Number.isFinite(n)) return;
      if (max !== undefined && n > max) n = max;
      onChange(n);
    };

    const baseClass =
      className ??
      "w-full border rounded px-3 py-2 text-sm bg-background";

    const baseStyle: React.CSSProperties = {
      ...(style ?? { borderColor: "hsl(var(--border))" }),
    };

    if (currency) {
      return (
        <div className="relative">
          {value > 0 && (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              $
            </span>
          )}
          <input
            ref={ref}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={display}
            onChange={handleChange}
            placeholder={placeholder ?? "0"}
            className={baseClass}
            style={{
              ...baseStyle,
              paddingLeft: value > 0 ? "1.75rem" : (baseStyle.paddingLeft as string),
            }}
            {...rest}
          />
        </div>
      );
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        placeholder={placeholder ?? "0"}
        className={baseClass}
        style={baseStyle}
        {...rest}
      />
    );
  },
);

NumberInput.displayName = "NumberInput";
