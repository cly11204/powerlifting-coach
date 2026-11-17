import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Exercise, ExerciseSet, PreviousPerformance, SetInput, SetType, WorkoutSession } from "../api/types";
import ExercisePicker from "../components/ExercisePicker";
import { ErrorBanner, Loading } from "../components/ui";
import { activeSession } from "../lib/activeSession";
import { useCurrentAthlete } from "../lib/athlete";
import { fmtDateTime, fmtDuration, localISODateTime } from "../lib/dates";
import { LIFT_COLORS, SET_TYPE_LABEL, SET_TYPE_NAME } from "../lib/lifts";
import { displayWeight, fmtEst, fmtWeight, unitToKg } from "../lib/units";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function SessionLogger() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const nav = useNavigate();
  const { athlete, unit } = useCurrentAthlete();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [previous, setPrevious] = useState<Record<number, PreviousPerformance>>({});
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [restStart, setRestStart] = useState<number | null>(() => activeSession.restStart(id));
  const isLive = activeSession.get(athlete.id) === id;
  const now = useNow();

  const loadPrevious = useCallback(async (exerciseId: number) => {
    try {
      const p = await api.previous(athlete.id, exerciseId, id);
      setPrevious((m) => ({ ...m, [exerciseId]: p }));
      return p;
    } catch {
      return null; // "last time" is a nice-to-have; don't block logging
    }
  }, [athlete.id, id]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.getSession(id), api.listExercises()])
      .then(([s, ex]) => {
        if (!alive) return;
        if (s.athlete_id !== athlete.id) throw new Error("This workout belongs to a different athlete.");
        setSession(s);
        setExercises(ex);
        new Set(s.sets.map((x) => x.exercise_id)).forEach((eid) => void loadPrevious(eid));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, athlete.id, loadPrevious]);

  // Group sets by exercise, in order of first appearance.
  const blocks = useMemo(() => {
    const m = new Map<number, ExerciseSet[]>();
    for (const s of [...(session?.sets ?? [])].sort((a, b) => a.set_order - b.set_order)) {
      m.set(s.exercise_id, [...(m.get(s.exercise_id) ?? []), s]);
    }
    return [...m.entries()];
  }, [session]);
  const exById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);
  const nextOrder = () => Math.max(-1, ...(session?.sets.map((s) => s.set_order) ?? [])) + 1;

  const replaceSet = (s: ExerciseSet) => setSession((p) => p && { ...p, sets: p.sets.map((x) => (x.id === s.id ? s : x)) });

  /** Runs an API call, surfacing any error in the banner. `ok` is false if it failed. */
  async function guard<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    setError(null);
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      setError((e as Error).message);
      return { ok: false };
    }
  }

  async function addSet(input: SetInput) {
    const res = await guard(() => api.addSet(id, { ...input, set_order: nextOrder() }));
    if (res.ok) setSession((p) => p && { ...p, sets: [...p.sets, res.value] });
  }

  async function pickExercise(ex: Exercise) {
    setPicking(false);
    const prev = await loadPrevious(ex.id);
    const ref = prev?.sets.find((s) => s.set_type !== "warmup") ?? prev?.sets[0];
    await addSet({ exercise_id: ex.id, weight_kg: ref?.weight_kg ?? 0, reps: ref?.reps ?? 5, set_type: "working", completed: false });
  }

  async function copyLastTime(exerciseId: number) {
    const prev = previous[exerciseId];
    if (!prev) return;
    let order = nextOrder();
    const created: ExerciseSet[] = [];
    for (const s of prev.sets) {
      const res = await guard(() => api.addSet(id, { exercise_id: exerciseId, weight_kg: s.weight_kg, reps: s.reps, set_type: s.set_type, completed: false, set_order: order++ }));
      if (!res.ok) break;
      created.push(res.value);
    }
    setSession((p) => p && { ...p, sets: [...p.sets, ...created] });
  }

  async function updateSet(s: ExerciseSet, patch: Partial<SetInput>) {
    const res = await guard(() => api.updateSet(s.id, patch));
    replaceSet(res.ok ? res.value : { ...s }); // on failure, re-render to revert local edits
  }

  async function toggleComplete(s: ExerciseSet) {
    const completing = !s.completed;
    const patch: Partial<SetInput> = { completed: completing };
    if (completing && isLive) {
      const t = Date.now();
      if (restStart && s.rest_seconds === null) {
        const secs = Math.round((t - restStart) / 1000);
        if (secs <= 3600) patch.rest_seconds = secs;
      }
      setRestStart(t);
      activeSession.setRestStart(id, t);
    }
    await updateSet(s, patch);
  }

  async function removeSet(s: ExerciseSet) {
    const res = await guard(() => api.deleteSet(s.id));
    if (res.ok) setSession((p) => p && { ...p, sets: p.sets.filter((x) => x.id !== s.id) });
  }

  async function saveMeta(patch: Parameters<typeof api.updateSession>[1]) {
    const res = await guard(() => api.updateSession(id, patch));
    if (res.ok) setSession(res.value);
  }

  async function finish() {
    if (!session) return;
    if (isLive) {
      const mins = Math.min(600, Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000));
      const res = await guard(() => api.updateSession(id, { duration_minutes: session.duration_minutes ?? mins }));
      if (!res.ok) return;
      activeSession.clear(athlete.id);
      activeSession.setRestStart(id, null);
    }
    nav(`/history/${id}`);
  }

  async function discard() {
    if (!confirm("Delete this workout and all its sets? This can't be undone.")) return;
    const res = await guard(() => api.deleteSession(id));
    if (!res.ok) return;
    if (isLive) activeSession.clear(athlete.id);
    activeSession.setRestStart(id, null);
    nav("/history");
  }

  if (!session) return error ? <ErrorBanner message={error} /> : <Loading />;
  const elapsed = (now - new Date(session.started_at).getTime()) / 1000;
  const incomplete = session.sets.filter((s) => !s.completed).length;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Sticky session header */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:rounded-card md:border">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <input className="w-full truncate bg-transparent text-lg font-semibold outline-none" defaultValue={session.title ?? ""} placeholder="Workout"
                   aria-label="Workout title" onBlur={(e) => e.target.value !== (session.title ?? "") && saveMeta({ title: e.target.value.trim() || null })} />
            <p className="text-xs text-ink-muted">
              {fmtDateTime(session.started_at)}
              {isLive && <> · <span className="font-medium text-ink-soft">{fmtDuration(elapsed)}</span></>}
            </p>
          </div>
          <button className="btn-sage shrink-0" onClick={finish}>{isLive ? "Finish" : "Done"}</button>
        </div>
        {isLive && restStart && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-white px-3 py-1.5 text-sm">
            <span className="text-ink-soft">Rest</span>
            <span className="font-semibold tabular-nums">{fmtDuration((now - restStart) / 1000)}</span>
          </div>
        )}
      </div>

      <ErrorBanner message={error} />

      <div className="space-y-4">
        {blocks.map(([exerciseId, sets]) => (
          <ExerciseBlock
            key={exerciseId}
            exercise={exById[exerciseId]}
            name={sets[0].exercise_name}
            sets={sets}
            prev={previous[exerciseId]}
            unit={unit}
            onAdd={() => {
              const last = sets[sets.length - 1];
              void addSet({ exercise_id: exerciseId, weight_kg: last.weight_kg, reps: last.reps, set_type: last.set_type === "warmup" ? "working" : last.set_type === "top" ? "backoff" : last.set_type, completed: false });
            }}
            onCopyLast={() => copyLastTime(exerciseId)}
            onUpdate={updateSet}
            onToggle={toggleComplete}
            onRemove={removeSet}
          />
        ))}
      </div>

      <button className="btn-outline mt-4 w-full border-dashed py-3" onClick={() => setPicking(true)}>+ Add exercise</button>

      <div className="card mt-6 space-y-3">
        <label className="block">
          <span className="label">Session notes</span>
          <textarea className="input mt-1.5 min-h-[72px]" defaultValue={session.notes ?? ""} placeholder="How did it feel? Anything to remember?"
                    onBlur={(e) => e.target.value !== (session.notes ?? "") && saveMeta({ notes: e.target.value.trim() || null })} />
        </label>
        {!isLive && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Date & time</span>
              <input className="input mt-1.5" type="datetime-local" defaultValue={localISODateTime(new Date(session.started_at)).slice(0, 16)}
                     onBlur={(e) => e.target.value && saveMeta({ started_at: localISODateTime(new Date(e.target.value)) })} />
            </label>
            <label className="block">
              <span className="label">Duration (min)</span>
              <input className="input mt-1.5" type="number" inputMode="numeric" min={0} max={600} defaultValue={session.duration_minutes ?? ""}
                     onBlur={(e) => saveMeta({ duration_minutes: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>
          </div>
        )}
        <div className="flex items-center justify-between pt-1 text-xs text-ink-muted">
          <span>{session.sets.length} sets{incomplete > 0 && ` · ${incomplete} not ticked (excluded from analytics)`}</span>
          <button className="btn-danger px-2 py-1 text-xs" onClick={discard}>Delete workout</button>
        </div>
      </div>

      {picking && (
        <ExercisePicker exercises={exercises} onPick={pickExercise} onClose={() => setPicking(false)}
                        onCreated={(e) => setExercises((xs) => [...xs, e])} />
      )}
    </div>
  );
}

function ExerciseBlock({ exercise, name, sets, prev, unit, onAdd, onCopyLast, onUpdate, onToggle, onRemove }: {
  exercise?: Exercise; name: string; sets: ExerciseSet[]; prev?: PreviousPerformance; unit: "kg" | "lb";
  onAdd: () => void; onCopyLast: () => void;
  onUpdate: (s: ExerciseSet, p: Partial<SetInput>) => void; onToggle: (s: ExerciseSet) => void; onRemove: (s: ExerciseSet) => void;
}) {
  const prevSummary = prev?.sets.length
    ? prev.sets.filter((s) => s.set_type !== "warmup").map((s) => `${fmtWeight(s.weight_kg, unit, false)}×${s.reps}${s.rpe ? ` @${s.rpe}` : ""}`).join(", ")
    : null;
  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: exercise ? LIFT_COLORS[exercise.category] : "#8A8E8C" }} />
        <h3 className="font-semibold">{name}</h3>
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        {prevSummary ? <>Last time ({prev!.started_at && new Date(prev!.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}): {prevSummary}</> : "First time logging this exercise"}
        {prev?.sets.length ? <button className="ml-2 font-semibold text-sage-600" onClick={onCopyLast}>Copy sets</button> : null}
      </p>
      <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2.5rem_1.5rem] items-center gap-x-2 gap-y-2 text-sm">
        <span className="label text-center">Set</span>
        <span className="label">{unit}</span>
        <span className="label">Reps</span>
        <span className="label">RPE</span>
        <span className="label text-center">✓</span>
        <span />
        {sets.map((s, i) => <SetRow key={s.id} s={s} index={i} unit={unit} onUpdate={onUpdate} onToggle={onToggle} onRemove={onRemove} />)}
      </div>
      <button className="btn-ghost mt-3 w-full bg-canvas py-2" onClick={onAdd}>+ Add set</button>
    </section>
  );
}

const RPE_OPTIONS = ["", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10"];
const SET_TYPES: SetType[] = ["warmup", "working", "top", "backoff", "amrap"];

function SetRow({ s, index, unit, onUpdate, onToggle, onRemove }: {
  s: ExerciseSet; index: number; unit: "kg" | "lb";
  onUpdate: (s: ExerciseSet, p: Partial<SetInput>) => void; onToggle: (s: ExerciseSet) => void; onRemove: (s: ExerciseSet) => void;
}) {
  const [w, setW] = useState(String(displayWeight(s.weight_kg, unit)));
  const [r, setR] = useState(String(s.reps));
  // Re-sync local inputs when the server copy changes (e.g. after a failed save).
  useEffect(() => { setW(String(displayWeight(s.weight_kg, unit))); setR(String(s.reps)); }, [s, unit]);

  const commitWeight = () => {
    const v = Number(w);
    if (w === "" || isNaN(v) || v < 0) return setW(String(displayWeight(s.weight_kg, unit)));
    if (v !== displayWeight(s.weight_kg, unit)) onUpdate(s, { weight_kg: Math.round(unitToKg(v, unit) * 100) / 100 });
  };
  const commitReps = () => {
    const v = Number(r);
    if (r === "" || !Number.isInteger(v) || v < 0) return setR(String(s.reps));
    if (v !== s.reps) onUpdate(s, { reps: v });
  };
  const done = s.completed;
  const cell = `input px-2 py-2 text-center ${done ? "border-sage-100 bg-sage-50" : ""}`;
  return (
    <>
      {/* Short visible label; the transparent native select on top gives a proper picker on mobile. */}
      <span className="relative grid h-9 w-8 place-items-center rounded-lg bg-canvas text-xs font-semibold text-ink-soft" title={SET_TYPE_NAME[s.set_type]}>
        <span className={s.set_type === "warmup" ? "text-ink-muted" : s.set_type === "working" ? "" : "text-blush-600"}>
          {s.set_type === "working" ? index + 1 : SET_TYPE_LABEL[s.set_type]}
        </span>
        <select aria-label={`Set ${index + 1} type`} className="absolute inset-0 cursor-pointer opacity-0"
                value={s.set_type} onChange={(e) => onUpdate(s, { set_type: e.target.value as SetType })}>
          {SET_TYPES.map((t) => <option key={t} value={t}>{SET_TYPE_NAME[t]}</option>)}
        </select>
      </span>
      <input aria-label={`Set ${index + 1} weight`} className={cell} type="number" inputMode="decimal" step="any" min={0}
             value={w} onChange={(e) => setW(e.target.value)} onBlur={commitWeight} onFocus={(e) => e.target.select()} />
      <input aria-label={`Set ${index + 1} reps`} className={cell} type="number" inputMode="numeric" min={0} max={100}
             value={r} onChange={(e) => setR(e.target.value)} onBlur={commitReps} onFocus={(e) => e.target.select()} />
      <select aria-label={`Set ${index + 1} RPE`} className={`${cell} appearance-none`} value={s.rpe ?? ""}
              onChange={(e) => onUpdate(s, { rpe: e.target.value === "" ? null : Number(e.target.value) })}>
        {RPE_OPTIONS.map((o) => <option key={o} value={o}>{o || "–"}</option>)}
      </select>
      <button aria-label={done ? `Mark set ${index + 1} not done` : `Mark set ${index + 1} done`} aria-pressed={done}
              className={`mx-auto grid h-9 w-9 place-items-center rounded-lg text-base font-bold transition ${done ? "bg-sage-600 text-white" : "bg-canvas text-ink-muted hover:bg-line"}`}
              onClick={() => onToggle(s)}>✓</button>
      <button aria-label={`Delete set ${index + 1}`} className="text-lg leading-none text-ink-muted hover:text-blush-600" onClick={() => onRemove(s)}>×</button>
      {(done && s.e1rm_kg) || s.rest_seconds ? (
        <p className="col-span-6 -mt-1 pl-10 text-[11px] text-ink-muted">
          {done && s.e1rm_kg ? <>e1RM {fmtEst(s.e1rm_kg, unit)}{s.reps > 5 && " (rough: 6+ reps)"}</> : null}
          {done && s.e1rm_kg && s.rest_seconds ? " · " : null}
          {s.rest_seconds ? <>rested {fmtDuration(s.rest_seconds)}</> : null}
        </p>
      ) : null}
    </>
  );
}
