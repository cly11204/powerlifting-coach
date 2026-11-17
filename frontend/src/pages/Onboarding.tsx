import { useState } from "react";
import { api } from "../api/client";
import AthleteForm, { DEFAULT_PROFILE } from "../components/AthleteForm";
import { Card, ErrorBanner } from "../components/ui";
import { useAthlete } from "../lib/athlete";

/** Shown when the database has no athletes yet. */
export default function Onboarding() {
  const { refresh, select } = useAthlete();
  const [error, setError] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  async function loadDemo() {
    setLoadingDemo(true);
    setError(null);
    try {
      const demo = await api.loadDemo();
      select(demo.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setLoadingDemo(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-semibold text-sage-600">● Powerlifting Coach</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Let's set up your profile</h1>
      <p className="mt-2 text-ink-soft">Your training history starts empty. Every number in this app comes from what you log.</p>
      <ErrorBanner message={error} />
      <Card className="mt-6">
        <AthleteForm
          initial={DEFAULT_PROFILE}
          submitLabel="Create profile"
          onSubmit={async (a) => {
            const created = await api.createAthlete(a);
            select(created.id);
            await refresh();
          }}
        />
      </Card>
      <div className="mt-6 rounded-card border border-dashed border-line p-5 text-sm">
        <p className="font-medium">Just exploring?</p>
        <p className="mt-1 text-ink-soft">
          Load a separate <strong>simulated</strong> demo athlete with 12 weeks of made-up training data. It is clearly labelled
          and can be removed at any time from Profile.
        </p>
        <button className="btn-outline mt-3" onClick={loadDemo} disabled={loadingDemo}>
          {loadingDemo ? "Generating…" : "Load simulated demo data"}
        </button>
      </div>
    </div>
  );
}
