"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCY_PREFIX, amountToInput, formatAmountInput, parseAmount } from "@/lib/format";
import type { Currency } from "@/lib/types";

export const controlClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-[16px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent/12 disabled:bg-sunken disabled:text-muted md:text-sm";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  aside,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  aside?: ReactNode;
}) {
  // El control principal del campo toma este id, así la etiqueta queda asociada (lectores de pantalla).
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
            {label}
          </label>
          {aside}
        </div>
      ) : null}
      <FieldIdContext value={label ? id : undefined}>{children}</FieldIdContext>
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const FieldIdContext = createContext<string | undefined>(undefined);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, id, ...props },
  ref,
) {
  const fieldId = useContext(FieldIdContext);
  return <input ref={ref} id={id ?? fieldId} className={cn(controlClass, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, id, ...props },
  ref,
) {
  const fieldId = useContext(FieldIdContext);
  return <textarea ref={ref} id={id ?? fieldId} rows={rows} className={cn(controlClass, "resize-none py-2.5 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, id, ...props },
  ref,
) {
  const fieldId = useContext(FieldIdContext);
  return (
    <div className="relative">
      <select ref={ref} id={id ?? fieldId} className={cn(controlClass, "h-11 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

/** Monto con separador de miles a la argentina y selector ARS / USD. */
export function MoneyInput({
  value,
  onChange,
  currency,
  onCurrencyChange,
  placeholder = "0",
  autoFocus,
  id,
  className,
  size = "md",
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  currency: Currency;
  onCurrencyChange?: (currency: Currency) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  size?: "md" | "lg";
}) {
  const fallbackId = useId();
  const fieldId = useContext(FieldIdContext);
  const inputId = id ?? fieldId ?? fallbackId;
  // Texto local para no perder estados intermedios ("1.500,") mientras se escribe.
  const [text, setText] = useState(() => amountToInput(value));
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value !== (text ? parseAmount(text) : null)) setText(amountToInput(value));
  }

  return (
    <div
      className={cn(
        "flex items-stretch overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/12",
        size === "lg" ? "h-14" : "h-11",
        className,
      )}
    >
      <label htmlFor={inputId} className="flex select-none items-center pl-3.5 pr-1 text-muted">
        <span className={cn("font-medium tabular-nums", size === "lg" ? "text-lg" : "text-sm")}>{CURRENCY_PREFIX[currency]}</span>
      </label>
      <input
        id={inputId}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const formatted = formatAmountInput(e.target.value);
          const next = formatted ? parseAmount(formatted) : null;
          setText(formatted);
          setSyncedValue(next);
          onChange(next);
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent pr-2 font-medium tabular-nums text-ink outline-none placeholder:text-faint",
          size === "lg" ? "text-2xl" : "text-[16px] md:text-sm",
        )}
      />
      {onCurrencyChange ? (
        <div className="flex items-center gap-0.5 p-1">
          {(["ARS", "USD"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCurrencyChange(c)}
              aria-pressed={currency === c}
              className={cn(
                "h-full rounded-lg px-2.5 text-xs font-semibold tracking-wide transition-colors duration-150",
                currency === c ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
