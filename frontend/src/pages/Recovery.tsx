import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { DailyMetric, MetricInput } from "../api/types";
import { MetricLine } from "../components/charts";
import { Card, CardTitle, ErrorBanner, Field, Loading, PageHeader, numOrNull } from "../components/ui";
import { useCurrentAthlete } from "../lib/athlete";
import { addDays, fmtDay, localISODate } from "../lib/dates";
import { fmtWeight, unitToKg } from "../lib/units";
import { useAsync } from "../lib/useAsync";

type FormState = Record<keyof MetricInput, string>;
const EMPTY: FormState = { body_weight_kg: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", sleep_hours: "", fatigue: "", soreness: "", stress: "", notes: "" };

export default function Recovery() {
  const { athlete, unit } = useCurrentAthlete();
  const [day, setDay] = useState(localISODate());
  const history = useAsync(() => api.listMetrics(athlete.id, addDays(localISODate(), -90)), [athlete.id]);
  const entry = useAsync(() => api.getMetric(athlete.id, day), [athlete.id, day]);
  const [f, setF] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const m = entry.data;
    if (!m) return setF(EMPTY);
    const s = (v: number | null) => (v === null ? "" : String(v));
    setF({
      body_weight_kg: m.body_weight_kg === null ? "" : String(Math.round((unit === "kg" ? m.body_weight_kg : m.body_weight_kg / 0.45359237) * 10) / 10),
      calories: s(m.calories), protein_g: s(m.protein_g), carbs_g: s(m.carbs_g), fat_g: s(m.fat_g),
      sleep_hours: s(m.sleep_hours), fatigue: s(m.fatigue), soreness: s(m.soreness), stress: s(m.stress), notes: m.notes ?? "",
    });
  }, [entry.data, unit]);

  useEffect(() => setMsg(null), [day]);
  const upd = (k: keyof FormState, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const bw = numOrNull(f.body_weight_kg);
    try {
      const saved = await api.saveMetric(athlete.id, day, {
        // Body weight is typed in display units at 0.1 precision; store kg.
        body_weight_kg: bw === null ? null : Math.round(unitToKg(bw, unit) * 100) / 100,
        calories: numOrNull(f.calories), protein_g: numOrNull(f.protein_g), carbs_g: numOrNull(f.carbs_g), fat_g: numOrNull(f.fat_g),
        sleep_hours: numOrNull(f.sleep_hours), fatigue: numOrNull(f.fatigue), soreness: numOrNull(f.soreness), stress: numOrNull(f.stress),
        notes: f.notes.trim() || null,
      });
      entry.setData(saved);
      history.reload();
      setMsg({ ok: true, text: "Saved" });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const rows = [...(history.data ?? [])].reverse();
  const bwData = rows.filter((r) => r.body_weight_kg !== null).map((r) => ({ date: r.date, bw: Math.round((unit === "kg" ? r.body_weight_kg! : r.body_weight_kg! / 0.45359237) * 10) / 10 }));
  const sleepData = rows.filter((r) => r.sleep_hours !== null).map((r) => ({ date: r.date, sleep: r.sleep_hours }));

  return (
    <div className="space-y-5">
      <PageHeader title="Nutrition & recovery" subtitle="One quick check-in per day" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-2">
            <button className="btn-ghost px-3" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>‹</button>
            <input type="date" className="input max-w-[11rem] text-center" value={day} max={localISODate()} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button className="btn-ghost px-3" aria-label="Next day" disabled={day >= localISODate()} onClick={() => setDay(addDays(day, 1))}>›</button>
          </div>
          {entry.loading ? <Loading /> : (
            <form onSubmit={submit} className="space-y-4">
              <ErrorBanner message={entry.error} onRetry={entry.reload} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Body weight (${unit})`}><Num v={f.body_weight_kg} on={(v) => upd("body_weight_kg", v)} step="0.1" /></Field>
                <Field label="Sleep (hours)"><Num v={f.sleep_hours} on={(v) => upd("sleep_hours", v)} step="0.25" max={24} /></Field>
              </div>
              <p className="label pt-1">Nutrition</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Calories"><Num v={f.calories} on={(v) => upd("calories", v)} step="1" /></Field>
                <Field label="Protein (g)"><Num v={f.protein_g} on={(v) => upd("protein_g", v)} /></Field>
                <Field label="Carbs (g)"><Num v={f.carbs_g} on={(v) => upd("carbs_g", v)} /></Field>
                <Field label="Fat (g)"><Num v={f.fat_g} on={(v) => upd("fat_g", v)} /></Field>
              </div>
              <p className="label pt-1">How do you feel? (1 = great, 10 = terrible)</p>
              {(["fatigue", "soreness", "stress"] as const).map((k) => (
                <Scale key={k} label={k[0].toUpperCase() + k.slice(1)} value={f[k]} onChange={(v) => upd(k, v)} />
              ))}
              <Field label="Notes"><textarea className="input min-h-[56px]" value={f.notes} onChange={(e) => upd("notes", e.target.value)} /></Field>
              <div className="flex items-center gap-3">
                <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : entry.data ? "Update day" : "Save day"}</button>
                {msg && <span className={`text-sm ${msg.ok ? "text-sage-600" : "text-blush-600"}`}>{msg.text}</span>}
              </div>
            </form>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle>Body weight ({unit}) · last 90 days</CardTitle>
            {bwData.length >= 2 ? <MetricLine data={bwData} dataKey="bw" color="#3F8F5F" label="Body weight" unitLabel={unit} /> : <p className="text-sm text-ink-muted">Log at least two days to see a trend.</p>}
            <p className="mt-1 text-xs text-ink-muted">Weight class: {athlete.weight_class_kg} kg</p>
          </Card>
          <Card>
            <CardTitle>Sleep (hours) · last 90 days</CardTitle>
            {sleepData.length >= 2 ? <MetricLine data={sleepData} dataKey="sleep" color="#3B6FB6" label="Sleep" unitLabel="h" /> : <p className="text-sm text-ink-muted">Log at least two days to see a trend.</p>}
          </Card>
        </div>
      </div>

      <Card>
        <CardTitle>Recent days</CardTitle>
        {history.loading ? <Loading /> : <RecentTable rows={history.data ?? []} unit={unit} onPick={setDay} />}
      </Card>
    </div>
  );
}

function Num({ v, on, step = "any", max }: { v: string; on: (v: string) => void; step?: string; max?: number }) {
  return <input className="input" type="number" inputMode="decimal" min={0} max={max} step={step} value={v} onChange={(e) => on(e.target.value)} />;
}

function Scale({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="text-ink-soft">{label}</span><span className="font-semibold">{value || "–"}</span></div>
      <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
          <button type="button" key={n} role="radio" aria-checked={value === n} onClick={() => onChange(value === n ? "" : n)}
                  className={`h-8 rounded-lg text-xs font-medium transition ${value === n ? "bg-ink text-white" : "bg-canvas text-ink-soft hover:bg-line"}`}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function RecentTable({ rows, unit, onPick }: { rows: DailyMetric[]; unit: "kg" | "lb"; onPick: (d: string) => void }) {
  if (!rows.length) return <p className="text-sm text-ink-muted">No check-ins yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="text-left">{["Date", "BW", "kcal", "P/C/F", "Sleep", "Fatigue", "Soreness", "Stress"].map((h) => <th key={h} className="label pb-1">{h}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 14).map((r) => (
            <tr key={r.id} className="cursor-pointer border-t border-line hover:bg-canvas" onClick={() => onPick(r.date)}>
              <td className="py-1.5 text-ink-soft">{fmtDay(r.date, { weekday: "short", month: "short", day: "numeric" })}</td>
              <td className="py-1.5">{fmtWeight(r.body_weight_kg, unit, false)}</td>
              <td className="py-1.5">{r.calories ?? "–"}</td>
              <td className="py-1.5">{[r.protein_g, r.carbs_g, r.fat_g].map((x) => x ?? "–").join("/")}</td>
              <td className="py-1.5">{r.sleep_hours ?? "–"}</td>
              <td className="py-1.5">{r.fatigue ?? "–"}</td>
              <td className="py-1.5">{r.soreness ?? "–"}</td>
              <td className="py-1.5">{r.stress ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
