import { useState, type FormEvent } from "react";
import type { AthleteInput } from "../api/types";
import { Field } from "./ui";

// USAPL women's / men's weight classes (kg). "Other" lets you type any value.
const CLASSES = { F: [47, 52, 57, 63, 69, 76, 84, 84.01], M: [59, 66, 74, 83, 93, 105, 120, 120.01], Mx: [] } as const;

export const DEFAULT_PROFILE: AthleteInput = {
  name: "",
  sex: "F",
  federation: "USAPL",
  division: "Open",
  equipment: "raw",
  weight_class_kg: 60,
  meet_name: null,
  meet_date: "2027-02-07",
  preferred_unit: "kg",
};

export default function AthleteForm({ initial, submitLabel, onSubmit }: {
  initial: AthleteInput;
  submitLabel: string;
  onSubmit: (a: AthleteInput) => Promise<void>;
}) {
  const [a, setA] = useState<AthleteInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof AthleteInput>(k: K, v: AthleteInput[K]) => {
    setA((p) => ({ ...p, [k]: v }));
    setSaved(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...a, name: a.name.trim(), meet_name: a.meet_name?.trim() || null, meet_date: a.meet_date || null });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const presets = CLASSES[a.sex];
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name">
        <input className="input" required maxLength={100} value={a.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Federation">
          <input className="input" required value={a.federation} onChange={(e) => set("federation", e.target.value)} />
        </Field>
        <Field label="Division">
          <input className="input" required value={a.division} onChange={(e) => set("division", e.target.value)} placeholder="Open" />
        </Field>
        <Field label="Sex category">
          <select className="input" value={a.sex} onChange={(e) => set("sex", e.target.value as AthleteInput["sex"])}>
            <option value="F">Women</option>
            <option value="M">Men</option>
            <option value="Mx">Mx</option>
          </select>
        </Field>
        <Field label="Equipment">
          <select className="input" value={a.equipment} onChange={(e) => set("equipment", e.target.value as AthleteInput["equipment"])}>
            <option value="raw">Raw (classic)</option>
            <option value="wraps">Raw with wraps</option>
            <option value="single_ply">Single-ply</option>
            <option value="multi_ply">Multi-ply</option>
          </select>
        </Field>
        <Field label="Weight class (kg)" hint={presets.length ? `Common USAPL classes: ${presets.filter((c) => Number.isInteger(c)).join(", ")}` : undefined}>
          <input className="input" type="number" inputMode="decimal" step="0.01" min={1} max={200} required
                 value={a.weight_class_kg} onChange={(e) => set("weight_class_kg", Number(e.target.value))} />
        </Field>
        <Field label="Display units">
          <select className="input" value={a.preferred_unit} onChange={(e) => set("preferred_unit", e.target.value as AthleteInput["preferred_unit"])}>
            <option value="kg">Kilograms</option>
            <option value="lb">Pounds</option>
          </select>
        </Field>
        <Field label="Meet name">
          <input className="input" value={a.meet_name ?? ""} onChange={(e) => set("meet_name", e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Meet date">
          <input className="input" type="date" value={a.meet_date ?? ""} onChange={(e) => set("meet_date", e.target.value || null)} />
        </Field>
      </div>
      {error && <p className="text-sm text-blush-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
        {saved && <span className="text-sm text-sage-600">Saved</span>}
      </div>
    </form>
  );
}
