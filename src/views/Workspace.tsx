import { NavLink, Outlet, Link } from "react-router-dom";
import {
  BookMarked,
  Boxes,
  Cpu,
  Library as LibraryIcon,
  Search,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { useApp } from "../state";
import { Badge } from "../components/ui";

const NAV = [
  { to: "/app", end: true, label: "Generate", icon: Sparkles },
  { to: "/app/library", end: false, label: "Library", icon: LibraryIcon },
  { to: "/app/search", end: false, label: "Find", icon: Search },
  { to: "/app/memory", end: false, label: "Memory", icon: Boxes },
  { to: "/app/settings", end: false, label: "Settings", icon: SettingsIcon },
];

export default function Workspace() {
  const { stats, model } = useApp();

  return (
    <div className="app-backdrop flex min-h-screen flex-col lg:flex-row">
      <aside className="lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 border-b border-white/[0.06] lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col p-4">
          <Link to="/" className="mb-6 flex items-center gap-2.5 px-2 pt-1">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-ember-500/15 text-ember-400">
              <BookMarked className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="font-display text-base leading-none text-paper-100">Cortex Book</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-paper-300/40">
                local engine
              </p>
            </div>
          </Link>

          <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive
                      ? "bg-ember-500/12 text-ember-400"
                      : "text-paper-300/70 hover:bg-white/[0.04] hover:text-paper-100"
                  }`
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto hidden pt-6 lg:block">
            <div className="rounded-xl border border-white/[0.06] bg-ink-900/60 p-3">
              <div className="flex items-center gap-2 text-[11px] text-paper-300/50">
                <Cpu className="h-3.5 w-3.5" /> local model
              </div>
              <p className="mt-1.5 truncate font-mono text-xs text-mint-400/90">
                {model?.model ?? "not set"}
              </p>
              {stats && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-paper-300/40">
                  <span>{stats.books} books</span>
                  <span>{stats.chunks.toLocaleString()} passages</span>
                  <span>{stats.projects} projects</span>
                  <span>{stats.memories} memories</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
          <Outlet />
        </div>
        <footer className="mx-auto max-w-5xl px-5 pb-8 sm:px-8">
          <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-5 text-[11px] text-paper-300/35">
            <Badge tone="mint">offline</Badge>
            <span>Nothing leaves this machine. Book content lives in a local SQLite index.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
