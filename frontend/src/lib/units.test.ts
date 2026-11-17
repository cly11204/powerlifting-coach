import { describe, expect, it } from "vitest";
import { displayWeight, fmtWeight, kgToUnit, unitToKg } from "./units";
import { addDays, fmtDuration, localISODate, localISODateTime } from "./dates";

describe("units", () => {
  it("round-trips kg <-> lb", () => {
    expect(unitToKg(kgToUnit(100, "lb"), "lb")).toBeCloseTo(100, 9);
    expect(kgToUnit(100, "lb")).toBeCloseTo(220.462, 3);
  });
  it("rounds display to plate-friendly steps", () => {
    expect(displayWeight(102.3, "kg")).toBe(102.5);
    expect(displayWeight(102.058, "lb")).toBe(225);
  });
  it("formats missing values", () => {
    expect(fmtWeight(null, "kg")).toBe("—");
    expect(fmtWeight(60, "kg")).toBe("60 kg");
  });
});

describe("dates", () => {
  it("formats local date and offset timestamp", () => {
    const d = new Date(2026, 10, 17, 18, 5, 9);
    expect(localISODate(d)).toBe("2026-11-17");
    expect(localISODateTime(d)).toMatch(/^2026-11-17T18:05:09[+-]\d\d:\d\d$/);
  });
  it("adds days across month boundary", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
  it("formats durations", () => {
    expect(fmtDuration(95)).toBe("1:35");
    expect(fmtDuration(3725)).toBe("1:02:05");
  });
});
