import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { Exercise, LiftCategory } from "../api/types";
import { LIFT_COLORS, LIFT_LABEL } from "../lib/lifts";

/** Bottom sheet (mobile) / dialog (desktop) for choosing or creating an exercise. */
export default function ExercisePicker({ exercises, onPick, onClose, onCreated }: {
  exercises: Exercise[];
  onPick: (e: Exercise) => void;
  onClose: () => void;
  onCreated: (e: Exercise) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<LiftCategory>("accessory");
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? exercises.filter((e) => e.name.toLowerCase().includes(s)) : exercises;
  }, [q, exercises]);
  const exact = exercises.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  async function create() {
    setError(null);
    try {
      const ex = await api.createExercise({ name: q.trim(), category: cat, is_competition_lift: false });
      onCreated(ex);
      onPick(ex);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Choose exercise" className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-card bg-white p-4 shadow-card sm:rounded-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <input autoFocus className="input" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        <ul className="-mx-1 flex-1 overflow-y-auto">
          {filtered.map((e) => (
            <li key={e.id}>
              <button className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-canvas" onClick={() => onPick(e)}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: LIFT_COLORS[e.category] }} />
                  {e.name}
                </span>
                <span className="text-xs text-ink-muted">{e.is_competition_lift ? "Competition" : LIFT_LABEL[e.category]}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-4 text-sm text-ink-muted">No match.</li>}
        </ul>
        {q.trim() && !exact && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="label mb-2">Create "{q.trim()}"</p>
            <div className="flex gap-2">
              <select className="input" value={cat} onChange={(e) => setCat(e.target.value as LiftCategory)} aria-label="Category">
                {(["squat", "bench", "deadlift", "accessory"] as const).map((c) => <option key={c} value={c}>{c === "accessory" ? "Accessory" : `${LIFT_LABEL[c]} variation`}</option>)}
              </select>
              <button className="btn-primary shrink-0" onClick={create}>Create</button>
            </div>
            {error && <p className="mt-2 text-sm text-blush-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
