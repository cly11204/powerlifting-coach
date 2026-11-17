# Powerlifting Coach

A mobile-first training companion for a raw USAPL lifter. It covers **Phase 1** (workout tracker, nutrition and recovery log,
athlete profile) and **basic Phase 2 analytics** (e1RM, weekly trends, volume, PRs).

Every number in the app comes from what you log. The database starts empty. Demo data exists only as a separate
athlete with "SIMULATED" in its name, and the app shows a banner whenever you view it.

## Project structure

```
powerlifting-coach/
├── backend/                     FastAPI + SQLAlchemy + Alembic (Python)
│   ├── app/
│   │   ├── main.py              App entry: CORS, error handling, runs migrations at startup
│   │   ├── config.py            Settings from env vars / .env
│   │   ├── database.py          Engine + session; documents unit & time conventions
│   │   ├── models.py            Database tables (SQLAlchemy ORM)
│   │   ├── schemas.py           Request/response validation (Pydantic)
│   │   ├── crud.py              Shared DB helpers + serialisation
│   │   ├── seed_catalog.py      Default exercise list (reference data)
│   │   ├── services/strength.py Pure maths: Epley e1RM, weekly trends, PRs, volume
│   │   ├── routers/             athletes · workouts · metrics · analytics · demo
│   │   └── demo/simulate.py     SIMULATED demo-data generator (fixed seed)
│   ├── alembic/versions/        Database migrations
│   └── tests/                   pytest: maths, API, migrations
└── frontend/                    React + TypeScript + Tailwind + Recharts (Vite)
    └── src/
        ├── api/                 Typed API client + types (mirror backend schemas)
        ├── lib/                 units (kg/lb), dates, athlete context, hooks
        ├── components/          Layout, charts, form + UI primitives
        └── pages/               Dashboard, Log, Logger, History, Progress, Recovery, Profile
```

## Run it locally

You need **Python 3.11–3.14** and **Node 20+**.

**Quickest (one terminal, macOS/Linux):** `./start.sh` from the project folder. Ctrl+C stops both servers.

Or run each part in its own terminal:

**Backend** (http://localhost:8000, interactive API docs at http://localhost:8000/docs):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # optional
uvicorn app.main:app --reload
```

On first start the API creates `powerlifting.db` (SQLite), applies migrations and seeds the exercise list.

**Frontend** (http://localhost:5173):

```bash
cd frontend
npm install
npm run dev
```

In development Vite forwards `/api` to the backend, so there's nothing to configure. To deploy the frontend separately,
set `VITE_API_URL` to the backend URL and add your frontend origin to `CORS_ORIGINS`.

## Tests

```bash
cd backend && .venv/bin/pytest            # 41 tests: e1RM maths, API, validation, migrations
cd frontend && npm test                    # unit-conversion + date helpers
cd frontend && npm run build               # type-check + production build
```

## Key conventions & decisions

| Topic | Decision | Why |
|---|---|---|
| Units | DB and API are **kilograms only** (`*_kg` columns). Frontend converts for display. | One source of truth; no mixed-unit bugs. |
| Time | Timestamps stored **UTC**. Each session also stores its **local calendar day** (`session_date`). | An 8 pm workout shouldn't land in "tomorrow's" week. |
| e1RM | Epley `w × (1 + reps/30)`; a single = the weight itself. Only completed, non-warm-up sets of 1–10 reps. 6–10 reps are flagged "rougher". | High-rep estimates are imprecise, so they're excluded rather than shown as false precision. |
| Current strength | Best e1RM of the **competition** lift in the last 6 weeks. | Variations (pause squat…) and old PRs would mislead. |
| Qualifying total | Entered manually with a **source** and **verified/unverified** status. The DB refuses "verified" without both. | The app never invents a USAPL standard. |
| Probability | Not shown. The dashboard compares your estimate with the standard (gap, %). | No calibrated model exists yet. |
| Unticked sets | Saved, but left out of analytics. | You can pre-fill planned sets, then tick them as you lift. |

## API overview

| Method & path | Purpose |
|---|---|
| `GET/POST /api/athletes`, `GET/PATCH/DELETE /api/athletes/{id}` | Athlete profile |
| `GET/PUT /api/athletes/{id}/goal` | Targets + qualifying standard (source, verification) |
| `GET/POST /api/exercises` | Exercise catalogue (add custom variations) |
| `GET/POST /api/athletes/{id}/sessions` | Workout history / create (optionally with sets) |
| `GET/PATCH/DELETE /api/sessions/{id}` | One workout |
| `POST /api/sessions/{id}/sets`, `PATCH/DELETE /api/sets/{id}` | Sets |
| `GET /api/athletes/{id}/exercises/{ex}/previous` | "Last time" for an exercise |
| `GET/PUT/DELETE /api/athletes/{id}/metrics/{date}`, `GET …/metrics` | Daily nutrition & recovery |
| `GET /api/athletes/{id}/analytics/dashboard` · `/exercises` · `/exercises/{ex}` · `/volume` | Analytics |
| `POST/DELETE /api/demo` | Load / remove the SIMULATED demo athlete |

## Changing the database

1. Edit `backend/app/models.py`.
2. Generate a migration: `cd backend && .venv/bin/alembic revision --autogenerate -m "what changed"`.
3. Review the file in `alembic/versions/`. It is applied automatically on the next start, or by running `alembic upgrade head`.

`tests/test_migrations.py` fails if the migrations and models drift apart. Moving to PostgreSQL/Supabase means setting `DATABASE_URL`
and installing a driver (`psycopg`). Constraints are standard SQL CHECKs.

## Known limitations

- Single user, no login. Anyone who can reach the API can edit the data.
- e1RM ignores RPE. A set at RPE 6 and one at RPE 10 with the same load and reps give the same estimate (RPE-aware estimates come later).
- "Current strength" is a recent best, not a forecast. The `strength_predictions` table exists, but nothing fills it yet (Phase 3).
- The app is light-theme only, and the chart palette is validated for light backgrounds only.
- No offline mode. Logging needs the backend to be reachable.

## Next: Phase 3 forecasting plan

1. `services/forecast.py`: weekly best e1RM series → robust trend fit (Theil–Sen slope, so one bad week can't swing it).
2. Data-sufficiency rules (e.g. under 6 weeks of data → "insufficient", no number; 6–12 weeks → "limited").
3. Cap how far the trend can be extrapolated, e.g. a maximum weekly gain rate.
4. Walk-forward (time-based) back-testing to measure error *before* showing any range.
5. Conservative / expected / optimistic values only once that error is measured, then persisted to `strength_predictions`.
