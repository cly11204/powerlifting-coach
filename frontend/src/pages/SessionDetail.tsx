import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { ExerciseSet } from "../api/types";
import { Card, ErrorBanner, Loading } from "../components/ui";
import { useCurrentAthlete } from "../lib/athlete";
import { fmtDateTime, fmtDuration } from "../lib/dates";
import { SET_TYPE_NAME } from "../lib/lifts";
import { fmtEst, fmtVolume, fmtWeight } from "../lib/units";
import { useAsync } from "../lib/useAsync";

export default function SessionDetail() {
  const { sessionId } = useParams();
  const { unit } = useCurrentAthlete();
  const s = useAsync(() => api.getSession(Number(sessionId)), [sessionId]);
  if (s.loading) return <Loading />;
  if (s.error || !s.data) return <ErrorBanner message={s.error ?? "Not found"} onRetry={s.reload} />;
  const w = s.data;

  const groups = new Map<string, ExerciseSet[]>();
  for (const x of [...w.sets].sort((a, b) => a.set_order - b.set_order)) groups.set(x.exercise_name, [...(groups.get(x.exercise_name) ?? []), x]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/history" className="text-sm text-ink-muted">← History</Link>
      <div className="mb-5 mt-2 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{w.title || "Workout"}</h1>
          <p className="text-sm text-ink-soft">{fmtDateTime(w.started_at)}{w.duration_minutes ? ` · ${w.duration_minutes} min` : ""} · {fmtVolume(w.volume_kg, unit)} {unit}</p>
        </div>
        <Link to={`/log/${w.id}`} className="btn-outline">Edit</Link>
      </div>
      {w.notes && <Card className="mb-4 text-sm text-ink-soft">{w.notes}</Card>}
      <div className="space-y-4">
        {[...groups.entries()].map(([name, sets]) => (
          <Card key={name} className="p-4">
            <h3 className="mb-2 font-semibold">{name}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left"><th className="label pb-1 font-medium">Set</th><th className="label pb-1">Weight × reps</th><th className="label pb-1">RPE</th><th className="label pb-1 text-right">e1RM</th></tr>
              </thead>
              <tbody>
                {sets.map((x, i) => (
                  <tr key={x.id} className={`border-t border-line ${x.completed ? "" : "text-ink-muted line-through"}`}>
                    <td className="py-1.5 text-ink-soft">{x.set_type === "working" ? i + 1 : SET_TYPE_NAME[x.set_type]}</td>
                    <td className="py-1.5 font-medium">{fmtWeight(x.weight_kg, unit)} × {x.reps}{x.rest_seconds ? <span className="ml-2 text-xs font-normal text-ink-muted">rest {fmtDuration(x.rest_seconds)}</span> : null}</td>
                    <td className="py-1.5">{x.rpe ?? "–"}</td>
                    <td className="py-1.5 text-right">{x.e1rm_kg ? fmtEst(x.e1rm_kg, unit, false) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
        {w.sets.length === 0 && <p className="text-sm text-ink-muted">No sets logged in this workout.</p>}
      </div>
      <p className="mt-4 text-xs text-ink-muted">e1RM uses the Epley formula on completed, non-warm-up sets of 1–10 reps. Struck-through sets weren't marked done.</p>
    </div>
  );
}
