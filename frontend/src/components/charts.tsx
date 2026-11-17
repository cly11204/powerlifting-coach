import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Unit, VolumeWeek, WeekPoint } from "../api/types";
import { fmtDay } from "../lib/dates";
import { LIFT_COLORS, LIFT_LABEL } from "../lib/lifts";
import { fmtEst, fmtWeight, kgToUnit } from "../lib/units";

const AXIS = { fontSize: 11, fill: "#8A8E8C" };
const GRID = "#ECEAE4";
// Legend labels use text ink; the colored swatch carries identity.
const legendText = (v: string) => <span style={{ color: "#55595A" }}>{v}</span>;

function TooltipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">{children}</div>;
}

/** Weekly best e1RM (solid) + 4-week rolling average (dashed). One unit, one axis. */
export function E1rmChart({ weeks, unit, color }: { weeks: WeekPoint[]; unit: Unit; color: string }) {
  const data = weeks
    .filter((w) => w.best_e1rm_kg !== null)
    .map((w) => ({
      ...w,
      best: Math.round(kgToUnit(w.best_e1rm_kg!, unit) * 10) / 10,
      avg: w.rolling_avg_e1rm_kg === null ? null : Math.round(kgToUnit(w.rolling_avg_e1rm_kg, unit) * 10) / 10,
    }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="week_start" tickFormatter={(d) => fmtDay(d)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis domain={["auto", "auto"]} tick={AXIS} axisLine={false} tickLine={false} width={48} unit="" />
        <Tooltip
          cursor={{ stroke: "#55595A", strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as WeekPoint & { best: number };
            return (
              <TooltipBox>
                <p className="font-semibold text-ink">Week of {fmtDay(p.week_start, { month: "short", day: "numeric", year: "numeric" })}</p>
                <p className="mt-1 text-ink">Best e1RM: <strong>{fmtEst(p.best_e1rm_kg, unit)}</strong></p>
                <p className="text-ink-soft">from {fmtWeight(p.best_set_weight_kg, unit)} × {p.best_set_reps} ({p.best_set_precision} precision)</p>
                {p.rolling_avg_e1rm_kg !== null && <p className="text-ink-soft">4-wk avg: {fmtEst(p.rolling_avg_e1rm_kg, unit)}</p>}
                {p.change_vs_prev_kg !== null && (
                  <p className="text-ink-soft">vs prev: {p.change_vs_prev_kg >= 0 ? "+" : ""}{fmtEst(p.change_vs_prev_kg, unit)} ({p.change_vs_prev_pct}%)</p>
                )}
              </TooltipBox>
            );
          }}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
        <Line name={`Weekly best e1RM (${unit})`} dataKey="best" stroke={color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6 }} />
        <Line name="4-week rolling average" dataKey="avg" stroke="#55595A" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Weekly tonnage for a single exercise. */
export function VolumeBars({ weeks, unit, color, height = 180 }: { weeks: WeekPoint[]; unit: Unit; color: string; height?: number }) {
  const data = weeks.map((w) => ({ ...w, vol: Math.round(kgToUnit(w.volume_kg, unit)) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }} barCategoryGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="week_start" tickFormatter={(d) => fmtDay(d)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          cursor={{ fill: "rgba(35,37,36,0.04)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as WeekPoint & { vol: number };
            return (
              <TooltipBox>
                <p className="font-semibold text-ink">Week of {fmtDay(p.week_start)}</p>
                <p className="mt-1 text-ink">{p.vol.toLocaleString()} {unit} · {p.working_sets} sets</p>
              </TooltipBox>
            );
          }}
        />
        <Bar dataKey="vol" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Weekly tonnage stacked by lift category (identity = fixed categorical palette). */
export function VolumeByLiftChart({ weeks, unit, height = 220 }: { weeks: VolumeWeek[]; unit: Unit; height?: number }) {
  const cats = ["squat", "bench", "deadlift", "accessory"] as const;
  const data = weeks.map((w) => Object.fromEntries([["week_start", w.week_start], ["total_sets", w.total_sets], ...cats.map((c) => [c, Math.round(kgToUnit(w[`${c}_kg`], unit))])]));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="week_start" tickFormatter={(d) => fmtDay(d)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          cursor={{ fill: "rgba(35,37,36,0.04)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Record<string, number | string>;
            const total = cats.reduce((s, c) => s + (p[c] as number), 0);
            return (
              <TooltipBox>
                <p className="font-semibold text-ink">Week of {fmtDay(p.week_start as string)}</p>
                {cats.map((c) => (
                  <p key={c} className="mt-0.5 flex items-center gap-2 text-ink">
                    <span className="h-2 w-2 rounded-sm" style={{ background: LIFT_COLORS[c] }} />
                    {LIFT_LABEL[c]}: {(p[c] as number).toLocaleString()} {unit}
                  </p>
                ))}
                <p className="mt-1 text-ink-soft">Total {total.toLocaleString()} {unit} · {p.total_sets} sets</p>
              </TooltipBox>
            );
          }}
        />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
        {cats.map((c, i) => (
          <Bar key={c} dataKey={c} name={LIFT_LABEL[c]} stackId="v" fill={LIFT_COLORS[c]} stroke="#fff" strokeWidth={2}
               radius={i === cats.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={32} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Simple single-series trend line for daily metrics. */
export function MetricLine({ data, dataKey, color, label, unitLabel }: {
  data: Record<string, unknown>[]; dataKey: string; color: string; label: string; unitLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => fmtDay(d)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis domain={["auto", "auto"]} tick={AXIS} axisLine={false} tickLine={false} width={48} />
        <Tooltip
          cursor={{ stroke: "#55595A", strokeDasharray: "3 3" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox>
                <p className="font-semibold text-ink">{fmtDay(payload[0].payload.date as string, { weekday: "short", month: "short", day: "numeric" })}</p>
                <p className="mt-1 text-ink">{label}: {String(payload[0].value)} {unitLabel}</p>
              </TooltipBox>
            ) : null
          }
        />
        <Line dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
