import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { E1rmChart, VolumeBars, VolumeByLiftChart } from "../components/charts";
import { Card, CardTitle, EmptyState, ErrorBanner, Loading, PageHeader } from "../components/ui";
import { useCurrentAthlete } from "../lib/athlete";
import { fmtDay } from "../lib/dates";
import { LIFT_COLORS } from "../lib/lifts";
import { fmtEst, fmtWeight } from "../lib/units";
import { useAsync } from "../lib/useAsync";

export default function Progress() {
  const { athlete, unit } = useCurrentAthlete();
  const list = useAsync(() => api.performedExercises(athlete.id), [athlete.id]);
  const volume = useAsync(() => api.volume(athlete.id), [athlete.id]);
  const [exId, setExId] = useState<number | null>(null);
  useEffect(() => {
    if (list.data?.length && (exId === null || !list.data.some((e) => e.exercise_id === exId))) setExId(list.data[0].exercise_id);
  }, [list.data, exId]);
  const detail = useAsync(() => (exId ? api.exerciseAnalytics(athlete.id, exId) : Promise.resolve(null)), [athlete.id, exId]);

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBanner message={list.error} onRetry={list.reload} />;
  if (!list.data?.length)
    return (
      <div>
        <PageHeader title="Progress" />
        <EmptyState title="Nothing to chart yet" action={<Link to="/log" className="btn-primary">Log a workout</Link>}>
          Charts appear once you've logged sets.
        </EmptyState>
      </div>
    );

  const d = detail.data;
  const color = d ? LIFT_COLORS[d.category] : "#55595A";
  const e1rmWeeks = d?.weeks.filter((w) => w.best_e1rm_kg !== null).length ?? 0;
  const prs = d?.personal_records;

  return (
    <div className="space-y-5">
      <PageHeader title="Progress" subtitle="Estimated 1RM, volume and personal records" />

      {/* Filter row: one control, above the charts */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {list.data.map((e) => (
          <button key={e.exercise_id} onClick={() => setExId(e.exercise_id)}
                  className={`chip shrink-0 border px-3 py-1.5 text-sm ${e.exercise_id === exId ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft"}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: LIFT_COLORS[e.category] }} />{e.exercise_name}
          </button>
        ))}
      </div>

      {detail.error && <ErrorBanner message={detail.error} onRetry={detail.reload} />}
      {detail.loading && !d ? <Loading /> : d && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Best e1RM" value={fmtEst(prs?.best_e1rm?.value_kg, unit)}
                  sub={prs?.best_e1rm ? `${fmtWeight(prs.best_e1rm.weight_kg, unit)} × ${prs.best_e1rm.reps} · ${fmtDay(prs.best_e1rm.performed_on)}` : `Needs a completed set of 1–${d.e1rm_max_reps} reps`} />
            <Stat label="Heaviest set" value={fmtWeight(prs?.heaviest_single_set?.weight_kg, unit)}
                  sub={prs?.heaviest_single_set ? `× ${prs.heaviest_single_set.reps} · ${fmtDay(prs.heaviest_single_set.performed_on)}` : ""} />
            <Stat label="Sets logged" value={String(d.total_sets)} sub={`${d.weeks.length} training weeks`} />
          </div>

          <Card>
            <CardTitle>Estimated 1RM by week · {d.exercise_name}</CardTitle>
            {e1rmWeeks === 0 ? (
              <p className="py-6 text-sm text-ink-muted">No sets suitable for an e1RM estimate yet (completed, not warm-up, 1–{d.e1rm_max_reps} reps).</p>
            ) : (
              <>
                <E1rmChart weeks={d.weeks} unit={unit} color={color} />
                {e1rmWeeks < 4 && <p className="mt-2 text-xs text-ink-muted">Only {e1rmWeeks} week{e1rmWeeks > 1 ? "s" : ""} of data. Trends become meaningful after several weeks.</p>}
              </>
            )}
            <p className="mt-2 text-xs text-ink-muted">Epley estimate from each week's best set. Sets of 6+ reps give rougher estimates.</p>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardTitle>Weekly volume · {d.exercise_name} ({unit})</CardTitle>
              <VolumeBars weeks={d.weeks} unit={unit} color={color} />
            </Card>
            <Card>
              <CardTitle>Rep maxes</CardTitle>
              {prs && Object.keys(prs.rep_maxes).length ? (
                <table className="w-full text-sm">
                  <thead><tr className="text-left"><th className="label pb-1">Reps</th><th className="label pb-1">Best weight</th><th className="label pb-1 text-right">Date</th></tr></thead>
                  <tbody>
                    {Object.entries(prs.rep_maxes).map(([reps, r]) => (
                      <tr key={reps} className="border-t border-line">
                        <td className="py-1.5 text-ink-soft">{reps}RM</td>
                        <td className="py-1.5 font-medium">{fmtWeight(r.weight_kg, unit)}</td>
                        <td className="py-1.5 text-right text-ink-muted">{fmtDay(r.performed_on, { month: "short", day: "numeric", year: "2-digit" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-ink-muted">No rep maxes yet.</p>}
            </Card>
          </div>

          <Card>
            <CardTitle>Weekly table</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="text-left"><th className="label pb-1">Week</th><th className="label pb-1">Best set</th><th className="label pb-1">e1RM</th><th className="label pb-1">Change</th><th className="label pb-1 text-right">Volume</th></tr></thead>
                <tbody>
                  {[...d.weeks].reverse().map((w) => (
                    <tr key={w.week_start} className="border-t border-line">
                      <td className="py-1.5 text-ink-soft">{fmtDay(w.week_start)}</td>
                      <td className="py-1.5">{w.best_set_weight_kg !== null ? `${fmtWeight(w.best_set_weight_kg, unit)} × ${w.best_set_reps}` : "–"}</td>
                      <td className="py-1.5 font-medium">{fmtEst(w.best_e1rm_kg, unit)}</td>
                      <td className="py-1.5 text-ink-soft">{w.change_vs_prev_pct !== null ? `${w.change_vs_prev_pct > 0 ? "+" : ""}${w.change_vs_prev_pct}%` : "–"}</td>
                      <td className="py-1.5 text-right">{fmtWeight(w.volume_kg, unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card>
        <CardTitle>All training volume by lift ({unit})</CardTitle>
        {volume.data?.length ? <VolumeByLiftChart weeks={volume.data} unit={unit} height={240} /> : <p className="text-sm text-ink-muted">No volume yet.</p>}
        <p className="mt-2 text-xs text-ink-muted">Tonnage = weight × reps of completed, non-warm-up sets. Variations count toward their parent lift.</p>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-4">
      <p className="label">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>
    </Card>
  );
}
