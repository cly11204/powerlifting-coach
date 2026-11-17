/** Remembers the in-progress workout and rest-timer state across reloads (per browser). */
const activeKey = (athleteId: number) => `plc.activeSession.${athleteId}`;
const restKey = (sessionId: number) => `plc.restStart.${sessionId}`;

function get(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function put(k: string, v: string | null) {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ }
}

export const activeSession = {
  get: (athleteId: number) => { const v = get(activeKey(athleteId)); return v ? Number(v) : null; },
  set: (athleteId: number, sessionId: number) => put(activeKey(athleteId), String(sessionId)),
  clear: (athleteId: number) => put(activeKey(athleteId), null),
  restStart: (sessionId: number) => { const v = get(restKey(sessionId)); return v ? Number(v) : null; },
  setRestStart: (sessionId: number, ts: number | null) => put(restKey(sessionId), ts === null ? null : String(ts)),
};
