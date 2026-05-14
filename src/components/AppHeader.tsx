import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/trade", label: "Trade" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/vault", label: "Vault" },
];

export function AppHeader() {
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
