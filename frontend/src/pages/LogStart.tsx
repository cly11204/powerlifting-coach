import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Card, ErrorBanner, Field, Loading, PageHeader } from "../components/ui";
import { activeSession } from "../lib/activeSession";
import { useCurrentAthlete } from "../lib/athlete";
import { fmtDateTime, localISODateTime } from "../lib/dates";
import { useAsync } from "../lib/useAsync";

export default function LogStart() {
  const { athlete } = useCurrentAthlete();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [past, setPast] = useState(false);
  const [when, setWhen] = useState(localISODateTime().slice(0, 16));

  const activeId = activeSession.get(athlete.id);
  const active = useAsync(
    () => (activeId ? api.getSession(activeId).catch(() => (activeSession.clear(athlete.id), null)) : Promise.resolve(null)),
    [athlete.id, activeId],
  );

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const startedAt = past ? localISODateTime(new Date(when)) : localISODateTime();
      const s = await api.createSession(athlete.id, { started_at: startedAt, title: title.trim() || null });
      if (!past) activeSession.set(athlete.id, s.id);
      nav(`/log/${s.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (active.loading) return <Loading />;
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Log workout" />
      <ErrorBanner message={error} />
      {active.data && (
        <Card className="mb-4 border-sage-300 bg-sage-50">
          <p className="text-sm font-semibold text-sage-700">Workout in progress</p>
          <p className="mt-1 text-sm text-ink-soft">{active.data.title || "Workout"} · started {fmtDateTime(active.data.started_at)} · {active.data.set_count} sets</p>
          <button className="btn-sage mt-3 w-full" onClick={() => nav(`/log/${active.data!.id}`)}>Resume</button>
        </Card>
      )}
      <Card>
        <div className="space-y-4">
          <Field label="Title (optional)">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Heavy squat day" maxLength={100} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-sage-600" checked={past} onChange={(e) => setPast(e.target.checked)} />
            Log a past workout
          </label>
          {past && (
            <Field label="Date & time">
              <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
          )}
          <button className="btn-primary w-full py-3 text-base" onClick={start} disabled={busy || (past && !when)}>
            {busy ? "Starting…" : past ? "Create past workout" : "Start workout now"}
          </button>
        </div>
      </Card>
    </div>
  );
}
