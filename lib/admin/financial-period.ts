export type FinancialPeriodMode = "daily" | "monthly" | "range";

export type FinancialSettlementAccountFilter =
  | "all"
  | "telebirr_1"
  | "telebirr_2"
  | "cbe";

/** Local YYYY-MM-DD (avoids UTC shift from toISOString). */
export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getTodayDateKey(): string {
  return formatLocalDateKey(new Date());
}

export function getCurrentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const date = parseLocalDateKey(dayKey);
  date.setDate(date.getDate() + deltaDays);
  return formatLocalDateKey(date);
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isDayAtOrAfterToday(dayKey: string): boolean {
  return dayKey >= getTodayDateKey();
}

export function isMonthAtOrAfterCurrent(monthKey: string): boolean {
  return monthKey >= getCurrentMonthKey();
}

export function monthKeyToRange(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const fromDate = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const todayKey = getTodayDateKey();
  const monthEndKey = formatLocalDateKey(lastDay);
  return {
    from: formatLocalDateKey(fromDate),
    to: monthEndKey > todayKey ? todayKey : monthEndKey,
  };
}

export function formatDayLabel(dayKey: string): string {
  return parseLocalDateKey(dayKey).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
}

export function deriveFinancialRange(params: {
  mode: FinancialPeriodMode;
  dayKey: string;
  monthKey: string;
  rangeFrom: string;
  rangeTo: string;
}): { from: string; to: string } {
  if (params.mode === "daily") {
    return { from: params.dayKey, to: params.dayKey };
  }
  if (params.mode === "monthly") {
    return monthKeyToRange(params.monthKey);
  }
  return {
    from: params.rangeFrom || getTodayDateKey(),
    to: params.rangeTo || getTodayDateKey(),
  };
}
