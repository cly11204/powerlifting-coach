import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { SessionSummary } from "../api/types";
import { EmptyState, ErrorBanner, Loading, PageHeader } from "../components/ui";
import { useCurrentAthlete } from "../lib/athlete";
import { fmtDateTime } from "../lib/dates";
import { fmtVolume } from "../lib/units";
import { useAsync } from "../lib/useAsync";

const PAGE = 30;

export default function History() {
  const { athlete, unit } = useCurrentAthlete();
  const first = useAsync(() => api.listSessions(athlete.id, PAGE), [athlete.id]);
  const [more, setMore] = useState<SessionSummary[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sessions = [...(first.data ?? []), ...more];

  async function loadMore() {
    setBusy(true);
    try {
      const next = await api.listSessions(athlete.id, PAGE, sessions.length);
      setMore((m) => [...m, ...next]);
      if (next.length < PAGE) setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (first.loading) return <Loading />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="History" subtitle={`${sessions.length}${!done && sessions.length >= PAGE ? "+" : ""} workouts`} />
      <ErrorBanner message={first.error ?? err} onRetry={first.reload} />
      {sessions.length === 0 ? (
        <EmptyState title="No workouts logged" action={<Link to="/log" className="btn-primary">Log a workout</Link>} />
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link to={`/history/${s.id}`} className="card block p-4 transition hover:border-sage-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.title || "Workout"}</p>
                    <p className="text-xs text-ink-muted">{fmtDateTime(s.started_at)}{s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">{fmtVolume(s.volume_kg, unit)} <span className="font-normal text-ink-muted">{unit}</span></p>
                    <p className="text-xs text-ink-muted">{s.set_count} sets</p>
                  </div>
                </div>
                <p className="mt-2 truncate text-sm text-ink-soft">{s.exercise_names.join(" · ") || "No exercises"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!done && sessions.length >= PAGE && (
        <button className="btn-outline mt-4 w-full" onClick={loadMore} disabled={busy}>{busy ? "Loading…" : "Load more"}</button>
      )}
    </div>
  );
}
