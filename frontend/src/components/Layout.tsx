import { NavLink, Outlet, Link } from "react-router-dom";
import { useCurrentAthlete } from "../lib/athlete";

const NAV = [
  { to: "/", label: "Home", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { to: "/log", label: "Log", icon: "M12 5v14M5 12h14" },
  { to: "/history", label: "History", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" },
  { to: "/progress", label: "Progress", icon: "M4 19V5M4 19h16M8 15l4-4 3 3 5-6" },
  { to: "/recovery", label: "Recovery", icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
];

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Layout() {
  const { athlete } = useCurrentAthlete();
  const initials = athlete.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white/70 px-4 py-6 backdrop-blur md:flex">
        <div className="mb-8 px-2 text-[15px] font-semibold tracking-tight">
          <span className="text-sage-600">●</span> Powerlifting Coach
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? "bg-sage-50 text-sage-700" : "text-ink-soft hover:bg-line/50"}`}>
              <Icon d={n.icon} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/profile" className="mt-auto flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-line/50">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-blush-100 text-xs font-semibold text-blush-600">{initials}</span>
          <span className="min-w-0 text-sm">
            <span className="block truncate font-medium">{athlete.name}</span>
            <span className="block text-xs text-ink-muted">Profile & goals</span>
          </span>
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        {athlete.is_demo && (
          <div className="sticky top-0 z-30 bg-blush-500 px-4 py-1.5 text-center text-xs font-semibold text-white">
            Viewing SIMULATED demo data. None of these numbers are real. <Link to="/profile" className="underline">Switch athlete</Link>
          </div>
        )}
        {/* Mobile top bar */}
        <div className="flex items-center justify-between px-4 pt-4 md:hidden">
          <span className="text-[15px] font-semibold tracking-tight"><span className="text-sage-600">●</span> Powerlifting Coach</span>
          <Link to="/profile" aria-label="Profile and goals" className="grid h-9 w-9 place-items-center rounded-full bg-blush-100 text-xs font-semibold text-blush-600">
            {initials}
          </Link>
        </div>
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? "text-sage-700" : "text-ink-muted"}`}>
              {n.to === "/log" ? (
                <span className="-mt-1 grid h-9 w-9 place-items-center rounded-full bg-ink text-white"><Icon d={n.icon} /></span>
              ) : (
                <Icon d={n.icon} />
              )}
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
