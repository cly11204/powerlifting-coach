// Mirrors backend/app/schemas.py and routers/analytics.py. All weights are kilograms.
export type Sex = "F" | "M" | "Mx";
export type Equipment = "raw" | "wraps" | "single_ply" | "multi_ply";
export type Unit = "kg" | "lb";
export type LiftCategory = "squat" | "bench" | "deadlift" | "accessory";
export type SetType = "warmup" | "working" | "top" | "backoff" | "amrap";
export type Precision = "higher" | "lower";

export interface AthleteInput {
  name: string;
  sex: Sex;
  federation: string;
  division: string;
  equipment: Equipment;
  weight_class_kg: number;
  meet_name: string | null;
  meet_date: string | null;
  preferred_unit: Unit;
}
export interface Athlete extends AthleteInput {
  id: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface GoalInput {
  competition_name: string | null;
  competition_date: string | null;
  target_squat_kg: number | null;
  target_bench_kg: number | null;
  target_deadlift_kg: number | null;
  target_total_kg: number | null;
  qualifying_total_kg: number | null;
  qualifying_source: string | null;
  verification_status: "unverified" | "verified";
  notes: string | null;
}
export interface Goal extends GoalInput {
  id: number;
  athlete_id: number;
  verified_at: string | null;
  updated_at: string;
}

export interface Exercise {
  id: number;
  name: string;
  category: LiftCategory;
  is_competition_lift: boolean;
}

export interface SetInput {
  exercise_id: number;
  weight_kg: number;
  reps: number;
  rpe?: number | null;
  set_type?: SetType;
  completed?: boolean;
  rest_seconds?: number | null;
  notes?: string | null;
  set_order?: number | null;
}
export interface ExerciseSet {
  id: number;
  session_id: number;
  exercise_id: number;
  exercise_name: string;
  set_order: number;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  set_type: SetType;
  completed: boolean;
  rest_seconds: number | null;
  notes: string | null;
  e1rm_kg: number | null;
}

export interface SessionSummary {
  id: number;
  athlete_id: number;
  title: string | null;
  started_at: string;
  duration_minutes: number | null;
  notes: string | null;
  set_count: number;
  exercise_names: string[];
  volume_kg: number;
}
export interface WorkoutSession extends SessionSummary {
  sets: ExerciseSet[];
}
export interface PreviousPerformance {
  exercise_id: number;
  session_id: number | null;
  started_at: string | null;
  sets: ExerciseSet[];
}

export interface MetricInput {
  body_weight_kg: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sleep_hours: number | null;
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  notes: string | null;
}
export interface DailyMetric extends MetricInput {
  id: number;
  athlete_id: number;
  date: string;
}

export interface CurrentLift {
  lift: "squat" | "bench" | "deadlift";
  e1rm_kg: number | null;
  weight_kg: number | null;
  reps: number | null;
  precision: Precision | null;
  performed_on: string | null;
  target_kg: number | null;
  weeks_of_data: number;
}
export interface VolumeWeek {
  week_start: string;
  squat_kg: number;
  bench_kg: number;
  deadlift_kg: number;
  accessory_kg: number;
  total_sets: number;
}
export interface Dashboard {
  as_of: string;
  meet_name: string | null;
  meet_date: string | null;
  days_to_meet: number | null;
  current_window_days: number;
  lifts: CurrentLift[];
  estimated_total_kg: number | null;
  target_total_kg: number | null;
  qualification: {
    threshold_kg: number | null;
    source: string | null;
    verification_status: "unverified" | "verified";
    current_total_kg: number | null;
    gap_kg: number | null;
    percent_of_threshold: number | null;
    note: string;
  };
  forecast: { available: boolean; reason: string };
  sessions_last_7_days: number;
  total_sessions: number;
  weekly_volume: VolumeWeek[];
  latest_body_weight_kg: number | null;
  latest_body_weight_date: string | null;
}
export interface WeekPoint {
  week_start: string;
  best_e1rm_kg: number | null;
  best_set_weight_kg: number | null;
  best_set_reps: number | null;
  best_set_precision: Precision | null;
  volume_kg: number;
  working_sets: number;
  rolling_avg_e1rm_kg: number | null;
  change_vs_prev_kg: number | null;
  change_vs_prev_pct: number | null;
}
export interface RecordEntry {
  value_kg: number;
  weight_kg: number;
  reps: number;
  performed_on: string;
}
export interface ExerciseAnalytics {
  exercise_id: number;
  exercise_name: string;
  category: LiftCategory;
  total_sets: number;
  weeks: WeekPoint[];
  personal_records: {
    best_e1rm: RecordEntry | null;
    heaviest_single_set: RecordEntry | null;
    rep_maxes: Record<string, RecordEntry>;
  };
  e1rm_max_reps: number;
}
export interface PerformedExercise {
  exercise_id: number;
  exercise_name: string;
  category: LiftCategory;
  is_competition_lift: boolean;
  set_count: number;
  last_performed: string;
  best_e1rm_kg: number | null;
}
