import type {
  Athlete, AthleteInput, DailyMetric, Dashboard, Exercise, ExerciseAnalytics, ExerciseSet, Goal, GoalInput,
  MetricInput, PerformedExercise, PreviousPerformance, SessionSummary, SetInput, VolumeWeek, WorkoutSession,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Turn FastAPI's error payloads (string or list of validation errors) into one readable message. */
function describeError(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: (string | number)[]; msg?: string }) => {
        const field = d.loc?.filter((x) => x !== "body").join(".");
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join("; ");
  }
  return `Request failed (${status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Is the backend running on port 8000?");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, describeError(body, res.status));
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  // athletes & goal
  listAthletes: () => request<Athlete[]>("/api/athletes"),
  createAthlete: (a: AthleteInput) => request<Athlete>("/api/athletes", json("POST", a)),
  updateAthlete: (id: number, a: Partial<AthleteInput>) => request<Athlete>(`/api/athletes/${id}`, json("PATCH", a)),
  getGoal: (id: number) => request<Goal | null>(`/api/athletes/${id}/goal`),
  saveGoal: (id: number, g: GoalInput) => request<Goal>(`/api/athletes/${id}/goal`, json("PUT", g)),

  // exercises
  listExercises: () => request<Exercise[]>("/api/exercises"),
  createExercise: (e: Omit<Exercise, "id">) => request<Exercise>("/api/exercises", json("POST", e)),

  // sessions & sets
  listSessions: (athleteId: number, limit = 50, offset = 0) =>
    request<SessionSummary[]>(`/api/athletes/${athleteId}/sessions?limit=${limit}&offset=${offset}`),
  createSession: (athleteId: number, s: { started_at: string; title?: string | null; sets?: SetInput[] }) =>
    request<WorkoutSession>(`/api/athletes/${athleteId}/sessions`, json("POST", s)),
  getSession: (id: number) => request<WorkoutSession>(`/api/sessions/${id}`),
  updateSession: (id: number, s: Partial<{ title: string | null; started_at: string; duration_minutes: number | null; notes: string | null }>) =>
    request<WorkoutSession>(`/api/sessions/${id}`, json("PATCH", s)),
  deleteSession: (id: number) => request<void>(`/api/sessions/${id}`, json("DELETE")),
  addSet: (sessionId: number, s: SetInput) => request<ExerciseSet>(`/api/sessions/${sessionId}/sets`, json("POST", s)),
  updateSet: (id: number, s: Partial<SetInput>) => request<ExerciseSet>(`/api/sets/${id}`, json("PATCH", s)),
  deleteSet: (id: number) => request<void>(`/api/sets/${id}`, json("DELETE")),
  previous: (athleteId: number, exerciseId: number, excludeSession?: number) =>
    request<PreviousPerformance>(
      `/api/athletes/${athleteId}/exercises/${exerciseId}/previous` + (excludeSession ? `?before_session_id=${excludeSession}` : ""),
    ),

  // daily metrics
  listMetrics: (athleteId: number, start?: string) =>
    request<DailyMetric[]>(`/api/athletes/${athleteId}/metrics` + (start ? `?start=${start}` : "")),
  getMetric: (athleteId: number, day: string) => request<DailyMetric | null>(`/api/athletes/${athleteId}/metrics/${day}`),
  saveMetric: (athleteId: number, day: string, m: MetricInput) =>
    request<DailyMetric>(`/api/athletes/${athleteId}/metrics/${day}`, json("PUT", m)),
  deleteMetric: (athleteId: number, day: string) => request<void>(`/api/athletes/${athleteId}/metrics/${day}`, json("DELETE")),

  // analytics
  dashboard: (athleteId: number, asOf: string) =>
    request<Dashboard>(`/api/athletes/${athleteId}/analytics/dashboard?as_of=${asOf}`),
  performedExercises: (athleteId: number) => request<PerformedExercise[]>(`/api/athletes/${athleteId}/analytics/exercises`),
  exerciseAnalytics: (athleteId: number, exerciseId: number) =>
    request<ExerciseAnalytics>(`/api/athletes/${athleteId}/analytics/exercises/${exerciseId}`),
  volume: (athleteId: number) => request<VolumeWeek[]>(`/api/athletes/${athleteId}/analytics/volume`),

  // demo
  loadDemo: () => request<Athlete>("/api/demo", json("POST")),
  removeDemo: () => request<{ removed_demo_athletes: number }>("/api/demo", json("DELETE")),
};
