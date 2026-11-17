"""API tests: athletes, goals, sessions, sets, metrics, analytics, demo data."""
from app.demo.simulate import DEMO_NAME
from tests.conftest import PROFILE


# ---------------- Athletes ----------------
def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_starts_empty(client):
    assert client.get("/api/athletes").json() == []


def test_create_and_update_athlete(client, athlete):
    assert athlete["is_demo"] is False
    assert athlete["weight_class_kg"] == 60
    r = client.patch(f"/api/athletes/{athlete['id']}", json={"weight_class_kg": 67.5, "preferred_unit": "lb"})
    assert r.status_code == 200
    assert r.json()["weight_class_kg"] == 67.5 and r.json()["preferred_unit"] == "lb"


def test_athlete_validation(client):
    assert client.post("/api/athletes", json={**PROFILE, "equipment": "rocket"}).status_code == 422
    assert client.post("/api/athletes", json={**PROFILE, "weight_class_kg": -1}).status_code == 422
    assert client.get("/api/athletes/999").status_code == 404


def test_patch_cannot_null_required_field(client, athlete):
    assert client.patch(f"/api/athletes/{athlete['id']}", json={"name": None}).status_code == 422


# ---------------- Goal / qualification standard ----------------
def test_goal_defaults_to_none(client, athlete):
    assert client.get(f"/api/athletes/{athlete['id']}/goal").json() is None


def test_verified_standard_requires_source(client, athlete):
    url = f"/api/athletes/{athlete['id']}/goal"
    r = client.put(url, json={"qualifying_total_kg": 300, "verification_status": "verified"})
    assert r.status_code == 422
    r = client.put(url, json={"qualifying_total_kg": 300, "qualifying_source": "USAPL site", "verification_status": "verified"})
    assert r.status_code == 200
    assert r.json()["verified_at"] is not None
    r = client.put(url, json={"qualifying_total_kg": 300, "verification_status": "unverified"})
    assert r.json()["verified_at"] is None


# ---------------- Sessions & sets ----------------
def _session(client, athlete_id, ex, started="2026-11-16T18:30:00-08:00", sets=None):
    sets = sets if sets is not None else [
        {"exercise_id": ex["Competition Squat"], "weight_kg": 60, "reps": 5, "set_type": "warmup"},
        {"exercise_id": ex["Competition Squat"], "weight_kg": 100, "reps": 5, "rpe": 8},
    ]
    r = client.post(f"/api/athletes/{athlete_id}/sessions", json={"started_at": started, "sets": sets})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_session_with_sets(client, athlete, exercise_ids):
    s = _session(client, athlete["id"], exercise_ids)
    assert s["set_count"] == 2
    assert s["exercise_names"] == ["Competition Squat"]
    assert s["volume_kg"] == 500  # warm-up excluded
    assert s["sets"][0]["e1rm_kg"] is None  # warm-up
    assert s["sets"][1]["e1rm_kg"] == 116.7
    # stored in UTC
    assert s["started_at"].startswith("2026-11-17T02:30:00")


def test_session_requires_timezone(client, athlete):
    r = client.post(f"/api/athletes/{athlete['id']}/sessions", json={"started_at": "2026-11-16T18:30:00"})
    assert r.status_code == 422


def test_local_date_used_for_weeks(client, athlete, exercise_ids):
    # Sunday 8 pm Pacific is Monday in UTC, but should count in the Sunday's week.
    _session(client, athlete["id"], exercise_ids, started="2026-11-15T20:00:00-08:00")
    ex = client.get(f"/api/athletes/{athlete['id']}/analytics/exercises/{exercise_ids['Competition Squat']}").json()
    assert ex["weeks"][0]["week_start"] == "2026-11-09"


def test_add_update_delete_set(client, athlete, exercise_ids):
    s = _session(client, athlete["id"], exercise_ids, sets=[])
    sid = s["id"]
    r = client.post(f"/api/sessions/{sid}/sets", json={"exercise_id": exercise_ids["Competition Bench Press"], "weight_kg": 50, "reps": 5, "rpe": 7.5})
    assert r.status_code == 201
    new = r.json()
    assert new["set_order"] == 0
    r2 = client.post(f"/api/sessions/{sid}/sets", json={"exercise_id": exercise_ids["Competition Bench Press"], "weight_kg": 52.5, "reps": 5})
    assert r2.json()["set_order"] == 1

    r = client.patch(f"/api/sets/{new['id']}", json={"reps": 3, "rpe": 9})
    assert r.json()["reps"] == 3 and r.json()["rpe"] == 9
    assert client.delete(f"/api/sets/{new['id']}").status_code == 204
    assert client.get(f"/api/sessions/{sid}").json()["set_count"] == 1


def test_set_validation(client, athlete, exercise_ids):
    sid = _session(client, athlete["id"], exercise_ids, sets=[])["id"]
    base = {"exercise_id": exercise_ids["Competition Squat"], "weight_kg": 100, "reps": 5}
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "rpe": 7.3}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "rpe": 11}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "weight_kg": -5}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "exercise_id": 9999}).status_code == 422
    assert client.post("/api/sessions/9999/sets", json=base).status_code == 404


def test_update_and_delete_session(client, athlete, exercise_ids):
    s = _session(client, athlete["id"], exercise_ids)
    r = client.patch(f"/api/sessions/{s['id']}", json={"notes": "felt fast", "duration_minutes": 75})
    assert r.json()["notes"] == "felt fast"
    assert client.delete(f"/api/sessions/{s['id']}").status_code == 204
    assert client.get(f"/api/sessions/{s['id']}").status_code == 404


def test_history_is_newest_first(client, athlete, exercise_ids):
    _session(client, athlete["id"], exercise_ids, started="2026-11-10T18:00:00Z")
    _session(client, athlete["id"], exercise_ids, started="2026-11-14T18:00:00Z")
    hist = client.get(f"/api/athletes/{athlete['id']}/sessions").json()
    assert [h["started_at"][:10] for h in hist] == ["2026-11-14", "2026-11-10"]


def test_previous_performance(client, athlete, exercise_ids):
    sq = exercise_ids["Competition Squat"]
    first = _session(client, athlete["id"], exercise_ids, started="2026-11-10T18:00:00Z")
    current = _session(client, athlete["id"], exercise_ids, started="2026-11-14T18:00:00Z", sets=[])
    prev = client.get(
        f"/api/athletes/{athlete['id']}/exercises/{sq}/previous", params={"before_session_id": current["id"]}
    ).json()
    assert prev["session_id"] == first["id"]
    assert len(prev["sets"]) == 2
    none = client.get(f"/api/athletes/{athlete['id']}/exercises/{exercise_ids['Pull-Up']}/previous").json()
    assert none["sets"] == [] and none["session_id"] is None


def test_custom_exercise(client):
    r = client.post("/api/exercises", json={"name": "SSB Squat", "category": "squat"})
    assert r.status_code == 201
    assert client.post("/api/exercises", json={"name": "ssb squat", "category": "squat"}).status_code == 409


# ---------------- Daily metrics ----------------
def test_metric_upsert_and_list(client, athlete):
    url = f"/api/athletes/{athlete['id']}/metrics"
    r = client.put(f"{url}/2026-11-16", json={"body_weight_kg": 60.4, "sleep_hours": 7.5, "fatigue": 4})
    assert r.status_code == 200
    r = client.put(f"{url}/2026-11-16", json={"body_weight_kg": 60.2})  # replaces
    assert r.json()["body_weight_kg"] == 60.2 and r.json()["fatigue"] is None
    assert len(client.get(url).json()) == 1
    assert client.put(f"{url}/2026-11-17", json={"fatigue": 11}).status_code == 422
    assert client.delete(f"{url}/2026-11-16").status_code == 204
    assert client.get(url).json() == []


# ---------------- Analytics ----------------
def test_dashboard_empty_state(client, athlete):
    d = client.get(f"/api/athletes/{athlete['id']}/analytics/dashboard", params={"as_of": "2026-11-17"}).json()
    assert d["days_to_meet"] == 82
    assert d["estimated_total_kg"] is None
    assert all(l["e1rm_kg"] is None for l in d["lifts"])
    assert d["qualification"]["threshold_kg"] is None
    assert d["forecast"]["available"] is False


def test_dashboard_total_and_qualification(client, athlete, exercise_ids):
    aid = athlete["id"]
    sets = [
        {"exercise_id": exercise_ids["Competition Squat"], "weight_kg": 100, "reps": 1},
        {"exercise_id": exercise_ids["Competition Bench Press"], "weight_kg": 55, "reps": 1},
        {"exercise_id": exercise_ids["Competition Deadlift"], "weight_kg": 125, "reps": 1},
        {"exercise_id": exercise_ids["Pause Squat"], "weight_kg": 200, "reps": 1},  # variation: not counted
    ]
    _session(client, aid, exercise_ids, started="2026-11-16T18:00:00Z", sets=sets)
    client.put(f"/api/athletes/{aid}/goal", json={"qualifying_total_kg": 300, "verification_status": "unverified"})
    d = client.get(f"/api/athletes/{aid}/analytics/dashboard", params={"as_of": "2026-11-17"}).json()
    assert d["estimated_total_kg"] == 280
    q = d["qualification"]
    assert q["gap_kg"] == 20 and q["percent_of_threshold"] == 93.3
    assert "NOT yet verified" in q["note"]
    assert "not a probability" in q["note"]


def test_exercise_analytics_and_list(client, athlete, exercise_ids):
    _session(client, athlete["id"], exercise_ids)
    lst = client.get(f"/api/athletes/{athlete['id']}/analytics/exercises").json()
    assert lst[0]["exercise_name"] == "Competition Squat" and lst[0]["best_e1rm_kg"] == 116.7
    ex = client.get(f"/api/athletes/{athlete['id']}/analytics/exercises/{exercise_ids['Competition Squat']}").json()
    assert ex["personal_records"]["best_e1rm"]["value_kg"] == 116.7
    assert ex["personal_records"]["rep_maxes"]["5"]["weight_kg"] == 100
    vol = client.get(f"/api/athletes/{athlete['id']}/analytics/volume").json()
    assert vol[0]["squat_kg"] == 500


# ---------------- Demo data ----------------
def test_demo_is_labelled_and_removable(client, athlete):
    r = client.post("/api/demo")
    assert r.status_code == 201
    demo = r.json()
    assert demo["is_demo"] is True
    assert demo["name"] == DEMO_NAME and "SIMULATED" in DEMO_NAME
    goal = client.get(f"/api/athletes/{demo['id']}/goal").json()
    assert goal["qualifying_total_kg"] is None  # never invented
    assert len(client.get(f"/api/athletes/{demo['id']}/sessions").json()) > 10
    # Reloading replaces instead of duplicating
    client.post("/api/demo")
    assert sum(a["is_demo"] for a in client.get("/api/athletes").json()) == 1
    assert client.delete("/api/demo").json() == {"removed_demo_athletes": 1}
    remaining = client.get("/api/athletes").json()
    assert [a["id"] for a in remaining] == [athlete["id"]]  # real athlete untouched
