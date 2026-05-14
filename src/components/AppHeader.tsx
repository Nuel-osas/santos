import { useEffect, useRef, useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { NavLink } from "react-router-dom";
import type { ManagerSummary } from "../lib/sui";

const NAV = [
  { to: "/trade", label: "Trade" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/vault", label: "Vault" },
];

type Props = {
  managers: ManagerSummary[];
  selectedManagerId: string | null;
  onSelectManager: (id: string | null) => void;
};

export function AppHeader({ managers, selectedManagerId, onSelectManager }: Props) {
  const account = useCurrentAccount();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/95 px-5 backdrop-blur">
      <div className="flex items-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-accent/15 font-mono text-[11px] font-bold tracking-tighter text-accent">
            SA
          </div>
          <span className="font-mono text-sm font-medium uppercase tracking-widest text-text">
            santos
          </span>
          <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-text-faint">
            testnet
          </span>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors ${
                  isActive
                    ? "bg-card text-text"
                    : "text-text-dim hover:bg-card-hover hover:text-text"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {account && managers.length > 0 && (
          <ManagerPicker
            managers={managers}
            selectedManagerId={selectedManagerId}
            onSelectManager={onSelectManager}
          />
        )}
        {account && (
          <div className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 sm:flex">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="tabular font-mono text-[11px] text-text-dim">
              {account.address.slice(0, 6)}…{account.address.slice(-4)}
            </span>
          </div>
        )}
        <ConnectButton />
      </div>
    </header>
  );
}

function ManagerPicker({
  managers,
  selectedManagerId,
  onSelectManager,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const active = managers.find((m) => m.id === selectedManagerId) ?? managers[0];
  const label = active
    ? `${active.id.slice(0, 6)}…${active.id.slice(-4)}`
    : "no manager";

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-[11px] text-text-dim transition-colors hover:bg-card-hover hover:text-text"
      >
        <span className="text-text-faint">mgr</span>
        <span className="tabular text-text">{label}</span>
        <span className="text-text-faint">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-64 overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {managers.map((m) => {
            const isActive = m.id === selectedManagerId;
            return (
              <button
                key={m.id}
                onClick={() => {
                  onSelectManager(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono text-[11px] transition-colors ${
                  isActive
                    ? "bg-bg-soft text-text"
                    : "text-text-dim hover:bg-card-hover hover:text-text"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="tabular truncate">
                    {m.id.slice(0, 10)}…{m.id.slice(-6)}
                  </div>
                  <div className="text-[10px] text-text-faint">
                    {m.positionCount} pos · {m.rangeCount} range
                  </div>
                </div>
                {isActive && (
                  <span className="size-1.5 shrink-0 rounded-full bg-success" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
