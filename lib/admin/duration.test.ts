import { describe, expect, it } from "vitest";

import {
  formatDurationSeconds,
  pickDurationUnit,
  secondsToUnitAmount,
  unitAmountToSeconds,
} from "./duration";

describe("duration helpers", () => {
  it("picks the largest whole unit", () => {
    expect(pickDurationUnit(45)).toBe("seconds");
    expect(pickDurationUnit(180)).toBe("minutes");
    expect(pickDurationUnit(7200)).toBe("hours");
    expect(pickDurationUnit(5400)).toBe("minutes");
  });

  it("converts unit amounts to whole seconds", () => {
    expect(unitAmountToSeconds("10", "seconds")).toBe(10);
    expect(unitAmountToSeconds("15", "minutes")).toBe(900);
    expect(unitAmountToSeconds("2", "hours")).toBe(7200);
    expect(unitAmountToSeconds("1.5", "hours")).toBe(5400);
    expect(unitAmountToSeconds("", "minutes")).toBeNull();
    expect(unitAmountToSeconds("abc", "minutes")).toBeNull();
    expect(unitAmountToSeconds("-1", "minutes")).toBeNull();
  });

  it("shows seconds in a unit", () => {
    expect(secondsToUnitAmount(5400, "hours")).toBe("1.5");
    expect(secondsToUnitAmount(900, "minutes")).toBe("15");
  });

  it("formats durations for display", () => {
    expect(formatDurationSeconds(18)).toBe("18s");
    expect(formatDurationSeconds(90)).toBe("1m 30s");
    expect(formatDurationSeconds(3600)).toBe("1h");
    expect(formatDurationSeconds(5400)).toBe("1h 30m");
    expect(formatDurationSeconds(90_005)).toBe("1d 1h 5s");
    expect(formatDurationSeconds(0)).toBe("0s");
  });
});
