export function formatCurrency(value: string | number) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

/** Coerce API money values (string, number, or Decimal-like JSON) into a numeric string. */
export function coerceMoneyAmount(value: unknown, fallback = "0"): string {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }
    return Number.isFinite(Number(trimmed)) ? trimmed : fallback;
  }

  if (typeof value === "object") {
    const record = value as {
      toString?: () => string;
      toFixed?: (digits: number) => string;
    };

    if (typeof record.toFixed === "function") {
      try {
        const fixed = record.toFixed(2);
        if (Number.isFinite(Number(fixed))) {
          return fixed;
        }
      } catch {
        // Fall through.
      }
    }

    if (typeof record.toString === "function") {
      const asString = record.toString();
      if (asString && asString !== "[object Object]" && Number.isFinite(Number(asString))) {
        return asString;
      }
    }
  }

  return fallback;
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-ET", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-ET", {
    dateStyle: "medium",
  }).format(date);
}
