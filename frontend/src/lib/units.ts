import type { Unit } from "../api/types";

/** Internal convention: the API always speaks kilograms. These helpers convert for display/input. */
export const KG_PER_LB = 0.45359237;

export const kgToUnit = (kg: number, unit: Unit) => (unit === "kg" ? kg : kg / KG_PER_LB);
export const unitToKg = (value: number, unit: Unit) => (unit === "kg" ? value : value * KG_PER_LB);

/** Round to a sensible display step: 0.5 kg / 1 lb. */
export function displayWeight(kg: number, unit: Unit): number {
  const v = kgToUnit(kg, unit);
  return unit === "kg" ? Math.round(v * 2) / 2 : Math.round(v);
}

export function fmtWeight(kg: number | null | undefined, unit: Unit, withUnit = true): string {
  if (kg === null || kg === undefined) return "—";
  const v = displayWeight(kg, unit);
  const s = Number.isInteger(v) ? v.toString() : v.toFixed(1);
  return withUnit ? `${s} ${unit}` : s;
}

/** Estimates (e1RM, totals, averages) are not plate loads: show 0.1 precision. */
export function fmtEst(kg: number | null | undefined, unit: Unit, withUnit = true): string {
  if (kg === null || kg === undefined) return "—";
  const v = Math.round(kgToUnit(kg, unit) * 10) / 10;
  const s = Number.isInteger(v) ? v.toString() : v.toFixed(1);
  return withUnit ? `${s} ${unit}` : s;
}

/** Compact: 12,345 kg -> "12.3k" */
export function fmtVolume(kg: number, unit: Unit): string {
  const v = kgToUnit(kg, unit);
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toLocaleString();
}
