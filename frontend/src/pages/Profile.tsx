import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { GoalInput } from "../api/types";
import AthleteForm from "../components/AthleteForm";
import { Badge, Card, CardTitle, ErrorBanner, Field, Loading, PageHeader, numOrNull } from "../components/ui";
import { useCurrentAthlete } from "../lib/athlete";
import { displayWeight, unitToKg } from "../lib/units";
import { useAsync } from "../lib/useAsync";

const EMPTY_GOAL: GoalInput = {
  competition_name: null, competition_date: null, target_squat_kg: null, target_bench_kg: null,
  target_deadlift_kg: null, target_total_kg: null, qualifying_total_kg: null, qualifying_source: null,
  verification_status: "unverified", notes: null,
};

export default function Profile() {
  const { athlete, athletes, select, refresh, unit } = useCurrentAthlete();
  const goal = useAsync(() => api.getGoal(athlete.id), [athlete.id]);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const hasDemo = athletes.some((a) => a.is_demo);

  async function toggleDemo() {
    setDemoBusy(true);
    setDemoError(null);
    try {
      if (hasDemo) {
        await api.removeDemo();
        const list = await refresh();
        const real = list.find((a) => !a.is_demo);
        if (real) select(real.id);
      } else {
        const d = await api.loadDemo();
        await refresh();
        select(d.id);
      }
    } catch (e) {
      setDemoError((e as Error).message);
    } finally {
      setDemoBusy(false);
    }
  }

  async function createRealProfile() {
    const created = await api.createAthlete({
      name: "My profile", sex: "F", federation: "USAPL", division: "Open", equipment: "raw",
      weight_class_kg: 60, meet_name: null, meet_date: "2027-02-07", preferred_unit: "kg",
    });
    await refresh();
    select(created.id);
  }

  return (
    <div>
      <PageHeader title="Profile & goals" subtitle={athlete.is_demo ? "Simulated demo athlete" : undefined} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Athlete</CardTitle>
          <AthleteForm
            key={athlete.id}
            initial={athlete}
            submitLabel="Save profile"
            onSubmit={async (a) => {
              await api.updateAthlete(athlete.id, a);
              await refresh();
            }}
          />
        </Card>

        <Card>
          <CardTitle>Competition goal & qualifying standard</CardTitle>
          {goal.loading ? <Loading /> : goal.error ? <ErrorBanner message={goal.error} onRetry={goal.reload} /> : (
            <GoalForm key={athlete.id} athleteId={athlete.id} unit={unit} initial={goal.data ?? EMPTY_GOAL} onSaved={goal.reload} />
          )}
        </Card>

        <Card>
          <CardTitle>Athletes</CardTitle>
          <ul className="divide-y divide-line">
            {athletes.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  {a.name} {a.is_demo && <Badge tone="blush">Simulated</Badge>}
                </span>
                {a.id === athlete.id ? <Badge tone="sage">Selected</Badge> : (
                  <button className="btn-ghost py-1" onClick={() => select(a.id)}>Switch</button>
                )}
              </li>
            ))}
          </ul>
          {!athletes.some((a) => !a.is_demo) && (
            <button className="btn-outline mt-3" onClick={createRealProfile}>Create my real profile</button>
          )}
        </Card>

        <Card>
          <CardTitle>Demo data</CardTitle>
          <p className="text-sm text-ink-soft">
            The demo athlete is fully <strong>simulated</strong> (generated from a fixed random seed). It is kept separate from your
            real data and never changes it.
          </p>
          <ErrorBanner message={demoError} />
          <button className={hasDemo ? "btn-danger mt-3 px-0" : "btn-outline mt-3"} onClick={toggleDemo} disabled={demoBusy}>
            {demoBusy ? "Working…" : hasDemo ? "Remove simulated demo athlete" : "Load simulated demo athlete"}
          </button>
        </Card>
      </div>
    </div>
  );
}

function GoalForm({ athleteId, unit, initial, onSaved }: { athleteId: number; unit: "kg" | "lb"; initial: GoalInput; onSaved: () => void }) {
  const toDisp = (kg: number | null) => (kg === null ? "" : String(displayWeight(kg, unit)));
  const [f, setF] = useState({
    competition_name: initial.competition_name ?? "",
    competition_date: initial.competition_date ?? "",
    squat: toDisp(initial.target_squat_kg),
    bench: toDisp(initial.target_bench_kg),
    deadlift: toDisp(initial.target_deadlift_kg),
    total: toDisp(initial.target_total_kg),
    qualifying: toDisp(initial.qualifying_total_kg),
    source: initial.qualifying_source ?? "",
    verified: initial.verification_status === "verified",
    notes: initial.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setMsg(null), [f]);
  const upd = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const kg = (v: string) => {
    const n = numOrNull(v);
    return n === null ? null : Math.round(unitToKg(n, unit) * 100) / 100;
  };
  const sumTargets = [f.squat, f.bench, f.deadlift].map(numOrNull);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveGoal(athleteId, {
        competition_name: f.competition_name.trim() || null,
        competition_date: f.competition_date || null,
        target_squat_kg: kg(f.squat),
        target_bench_kg: kg(f.bench),
        target_deadlift_kg: kg(f.deadlift),
        target_total_kg: kg(f.total),
        qualifying_total_kg: kg(f.qualifying),
        qualifying_source: f.source.trim() || null,
        verification_status: f.verified ? "verified" : "unverified",
        notes: f.notes.trim() || null,
      });
      setMsg({ ok: true, text: "Saved" });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Competition"><input className="input" value={f.competition_name} onChange={(e) => upd("competition_name", e.target.value)} placeholder="Defaults to profile meet" /></Field>
        <Field label="Date"><input className="input" type="date" value={f.competition_date} onChange={(e) => upd("competition_date", e.target.value)} /></Field>
        {(["squat", "bench", "deadlift", "total"] as const).map((k) => (
          <Field key={k} label={`Target ${k} (${unit})`}
                 hint={k === "total" && sumTargets.every((x) => x !== null) ? `Sum of lift targets: ${sumTargets.reduce((a, b) => a! + b!, 0)}` : undefined}>
            <input className="input" type="number" inputMode="decimal" step="0.5" min={0} value={f[k]} onChange={(e) => upd(k, e.target.value)} />
          </Field>
        ))}
      </div>

      <div className="rounded-xl bg-canvas p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Nationals qualifying total</p>
          <Badge tone={f.verified ? "sage" : "blush"}>{f.verified ? "Verified" : "Unverified"}</Badge>
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          The app never assumes a standard. Look up the current official USAPL qualifying total for your division, class and
          equipment, then enter it here with where you found it.
        </p>
        <div className="mt-3 grid gap-3">
          <Field label={`Qualifying total (${unit})`}>
            <input className="input" type="number" inputMode="decimal" step="0.5" min={0} value={f.qualifying} onChange={(e) => upd("qualifying", e.target.value)} />
          </Field>
          <Field label="Source" hint="e.g. link to the official USAPL qualifying-totals document and the date you checked it">
            <textarea className="input min-h-[64px]" value={f.source} onChange={(e) => upd("source", e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-sage-600" checked={f.verified} onChange={(e) => upd("verified", e.target.checked)} />
            <span>I checked this number against an official USAPL source.</span>
          </label>
        </div>
      </div>

      <Field label="Notes"><textarea className="input min-h-[56px]" value={f.notes} onChange={(e) => upd("notes", e.target.value)} /></Field>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save goal"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-sage-600" : "text-blush-600"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
