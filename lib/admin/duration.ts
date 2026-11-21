export type DurationUnit = "seconds" | "minutes" | "hours";

export const DURATION_UNIT_SECONDS: Record<DurationUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
  seconds: "Seconds",
  minutes: "Minutes",
  hours: "Hours",
};

export const DURATION_UNITS: DurationUnit[] = ["seconds", "minutes", "hours"];

/** Registration duration floor; mirrors the backend DTO minimum. */
export const REGISTRATION_DURATION_MIN_SECONDS = 10;
/** Postgres INTEGER ceiling — the only upper limit the backend enforces. */
export const REGISTRATION_DURATION_MAX_SECONDS = 2_147_483_647;

/** Largest unit that represents [totalSeconds] as a whole number. */
export function pickDurationUnit(totalSeconds: number): DurationUnit {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "seconds";
  }
  if (totalSeconds % 3600 === 0) {
    return "hours";
  }
  if (totalSeconds % 60 === 0) {
    return "minutes";
  }
  return "seconds";
}

/** Shows [totalSeconds] in [unit], trimming trailing decimals (e.g. 5400s → "1.5" hours). */
export function secondsToUnitAmount(
  totalSeconds: number,
  unit: DurationUnit,
): string {
  const amount = totalSeconds / DURATION_UNIT_SECONDS[unit];
  return String(Number(amount.toFixed(4)));
}

/**
 * Converts an amount typed in [unit] to whole seconds. Returns null when the
 * input is empty or not a non-negative number. Fractions are allowed
 * (1.5 hours → 5400) and rounded to the nearest second.
 */
export function unitAmountToSeconds(
  amountText: string,
  unit: DurationUnit,
): number | null {
  const trimmed = amountText.trim();
  if (trimmed === "") {
    return null;
  }
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return Math.round(amount * DURATION_UNIT_SECONDS[unit]);
}

/** Human-readable duration: 18 → "18s", 90 → "1m 30s", 5400 → "1h 30m", 90000 → "1d 1h". */
export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0s";
  }

  const whole = Math.floor(totalSeconds);
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}
