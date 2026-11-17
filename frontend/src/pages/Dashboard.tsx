import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CurrentLift, Dashboard as D } from "../api/types";
import { VolumeByLiftChart } from "../components/charts";
import { Badge, Card, CardTitle, EmptyState, ErrorBanner, Loading, ProgressBar } from "../components/ui";
import { useCurrentAthlete } from "../lib/athlete";
import { fmtDateTime, fmtDay, localISODate } from "../lib/dates";
import { LIFT_COLORS, LIFT_LABEL } from "../lib/lifts";
import { fmtEst, fmtVolume, fmtWeight } from "../lib/units";
import { useAsync } from "../lib/useAsync";

export default function Dashboard() {
  const { athlete, unit } = useCurrentAthlete();
  const today = localISODate();
  const dash = useAsync(() => api.dashboard(athlete.id, today), [athlete.id, today]);
  const recent = useAsync(() => api.listSessions(athlete.id, 3), [athlete.id]);

  if (dash.loading && !dash.data) return <Loading />;
  if (dash.error || !dash.data) return <ErrorBanner message={dash.error ?? "No data"} onRetry={dash.reload} />;
  const d = dash.data;

  return (
    <div className="space-y-5">
      <Countdown d={d} name={athlete.name} />

      {d.total_sessions === 0 && (
        <EmptyState title="No workouts yet" action={<Link to="/log" className="btn-primary">Log your first workout</Link>}>
          Log competition squat, bench press and deadlift sets to see your estimated strength here.
        </EmptyState>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {d.lifts.map((l) => <LiftCard key={l.lift} l={l} unit={unit} />)}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TotalCard d={d} unit={unit} />
        <QualificationCard d={d} unit={unit} />
      </div>

      <Card>
        <CardTitle>Meet-day forecast</CardTitle>
        <p className="text-sm text-ink-soft">{d.forecast.reason}</p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle action={<Link to="/progress" className="text-xs font-semibold text-sage-600">Details</Link>}>Weekly volume by lift ({unit})</CardTitle>
          {d.weekly_volume.length ? <VolumeByLiftChart weeks={d.weekly_volume} unit={unit} /> : <p className="py-8 text-center text-sm text-ink-muted">No training volume logged yet.</p>}
        </Card>
        <Card>
          <CardTitle>This week</CardTitle>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">Sessions (7 days)</dt><dd className="font-semibold">{d.sessions_last_7_days}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">All-time sessions</dt><dd className="font-semibold">{d.total_sessions}</dd></div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Body weight</dt>
              <dd className="text-right font-semibold">
                {fmtWeight(d.latest_body_weight_kg, unit)}
                {d.latest_body_weight_date && <span className="block text-xs font-normal text-ink-muted">{fmtDay(d.latest_body_weight_date)}</span>}
              </dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-line pt-3">
            <p className="label mb-2">Recent workouts</p>
            {recent.data?.length ? (
              <ul className="space-y-2">
                {recent.data.map((s) => (
                  <li key={s.id}>
                    <Link to={`/history/${s.id}`} className="block rounded-lg px-1 py-1 text-sm hover:bg-canvas">
                      <span className="font-medium">{s.title || "Workout"}</span>
                      <span className="block text-xs text-ink-muted">{fmtDateTime(s.started_at)} · {fmtVolume(s.volume_kg, unit)} {unit}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-muted">None yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Countdown({ d, name }: { d: D; name: string }) {
  const first = name.split(" ")[0];
  return (
    <div className="overflow-hidden rounded-card bg-ink p-6 text-white shadow-card">
      <p className="text-sm text-white/60">Hi {first}</p>
      {d.days_to_meet !== null ? (
        <>
          <p className="mt-3 text-5xl font-semibold tracking-tight">{d.days_to_meet >= 0 ? d.days_to_meet : 0}<span className="ml-2 text-lg font-normal text-white/60">days</span></p>
          <p className="mt-1 text-sm text-white/70">
            until {d.meet_name || "meet day"} · {d.meet_date && fmtDay(d.meet_date, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
            {d.days_to_meet >= 0 && <> · {Math.floor(d.days_to_meet / 7)} weeks</>}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-white/70">Add a meet date in <Link className="underline" to="/profile">Profile</Link> to start the countdown.</p>
      )}
    </div>
  );
}

function LiftCard({ l, unit }: { l: CurrentLift; unit: "kg" | "lb" }) {
  const pct = l.e1rm_kg && l.target_kg ? (100 * l.e1rm_kg) / l.target_kg : null;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: LIFT_COLORS[l.lift] }} />{LIFT_LABEL[l.lift]}
        </p>
        {l.precision === "lower" && <Badge tone="neutral">±</Badge>}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{l.e1rm_kg ? fmtEst(l.e1rm_kg, unit, false) : "—"}<span className="ml-1 text-sm font-normal text-ink-muted">{unit} e1RM</span></p>
      <p className="mt-1 text-xs text-ink-muted">
        {l.e1rm_kg
          ? <>Best recent: {fmtWeight(l.weight_kg, unit)} × {l.reps} on {fmtDay(l.performed_on!)}{l.precision === "lower" && " (6+ reps: rougher estimate)"}</>
          : "No competition-lift sets in the last 6 weeks"}
      </p>
      {l.target_kg && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-ink-soft"><span>Target {fmtWeight(l.target_kg, unit)}</span>{pct !== null && <span>{Math.round(pct)}%</span>}</div>
          <ProgressBar value={pct ?? 0} label={`${LIFT_LABEL[l.lift]} progress to target`} />
        </div>
      )}
    </Card>
  );
}

function TotalCard({ d, unit }: { d: D; unit: "kg" | "lb" }) {
  const pct = d.estimated_total_kg && d.target_total_kg ? (100 * d.estimated_total_kg) / d.target_total_kg : null;
  return (
    <Card>
      <CardTitle>Estimated current total</CardTitle>
      <p className="text-4xl font-semibold tracking-tight">{d.estimated_total_kg ? fmtEst(d.estimated_total_kg, unit, false) : "—"}<span className="ml-1 text-base font-normal text-ink-muted">{unit}</span></p>
      <p className="mt-1 text-xs text-ink-muted">
        Sum of best e1RMs from the last {d.current_window_days / 7} weeks of training (an estimate, not a meet result).
        {!d.estimated_total_kg && " Needs all three competition lifts."}
      </p>
      {d.target_total_kg && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-ink-soft"><span>Target total {fmtWeight(d.target_total_kg, unit)}</span>{pct !== null && <span>{Math.round(pct)}%</span>}</div>
          <ProgressBar value={pct ?? 0} label="Total progress to target" color="bg-blush-500" />
        </div>
      )}
    </Card>
  );
}

function QualificationCard({ d, unit }: { d: D; unit: "kg" | "lb" }) {
  const q = d.qualification;
  return (
    <Card>
      <CardTitle action={q.threshold_kg !== null && <Badge tone={q.verification_status === "verified" ? "sage" : "blush"}>{q.verification_status === "verified" ? "Verified standard" : "Unverified standard"}</Badge>}>
        Nationals qualifying standard
      </CardTitle>
      {q.threshold_kg === null ? (
        <>
          <p className="text-sm text-ink-soft">{q.note}</p>
          <Link to="/profile" className="btn-outline mt-3">Enter qualifying standard</Link>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-semibold tracking-tight">{fmtWeight(q.threshold_kg, unit, false)}</p>
            <span className="text-ink-muted">{unit} required</span>
          </div>
          {q.percent_of_threshold !== null && q.gap_kg !== null && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-ink-soft">
                <span>{q.gap_kg > 0 ? `${fmtEst(q.gap_kg, unit)} to go` : `${fmtEst(-q.gap_kg, unit)} above standard`}</span>
                <span>{q.percent_of_threshold}%</span>
              </div>
              <ProgressBar value={q.percent_of_threshold} label="Estimated total as percent of qualifying standard" />
            </div>
          )}
          <p className="mt-3 text-xs text-ink-muted">{q.note}</p>
          {q.source && <p className="mt-1 break-words text-xs text-ink-muted">Source: {q.source}</p>}
        </>
      )}
    </Card>
  );
}
