import type { LiftCategory } from "../api/types";

/** Validated categorical palette (colorblind-safe, ≥3:1 contrast on white). Order is fixed. */
export const LIFT_COLORS: Record<LiftCategory, string> = {
  squat: "#3F8F5F",
  bench: "#3B6FB6",
  deadlift: "#C85A78",
  accessory: "#A87414",
};

export const LIFT_LABEL: Record<LiftCategory, string> = {
  squat: "Squat",
  bench: "Bench",
  deadlift: "Deadlift",
  accessory: "Accessory",
};

export const SET_TYPE_LABEL = { warmup: "W", working: "", top: "T", backoff: "B", amrap: "A" } as const;
export const SET_TYPE_NAME = { warmup: "Warm-up", working: "Working", top: "Top set", backoff: "Back-off", amrap: "AMRAP" } as const;
