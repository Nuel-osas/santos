import { useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PositionsList } from "../components/PositionsList";
import { PnlChart } from "../components/PnlChart";
import {
  getManagerSummary,
  getManagerPnl,
  type ManagerSummary,
  type PnlSeries,
  type PnlRange,
} from "../lib/predictServer";

const POLL_MS = 8000;

const RANGES: PnlRange[] = ["1D", "1W", "1M", "3M", "ALL"];

type Props = {
  managerId: string | null;
  userDusdc: number;
  userPlp: number;
  plpNav: number;
  positionsRefreshKey: number;
  onMutate: () => void;
};

export function PortfolioView({
  managerId,
  userDusdc,
  userPlp,
  plpNav,
  positionsRefreshKey,
  onMutate,
}: Props) {
  const account = useCurrentAccount();
  const [summary, setSummary] = useState<ManagerSummary | null>(null);
  const [pnl, setPnl] = useState<PnlSeries | null>(null);
  const [pnlRange, setPnlRange] = useState<PnlRange>("ALL");
  const [pnlLoading, setPnlLoading] = useState(false);

  // Manager summary — poll while page is open (server lag is fine here).
  useEffect(() => {
    if (!managerId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getManagerSummary(managerId);
        if (!cancelled) setSummary(s);
      } catch {
        /* ignore — keep last */
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [managerId, positionsRefreshKey]);

  // P&L time series — refetched on manager / range / refresh.
  useEffect(() => {
    if (!managerId) {
      setPnl(null);
      return;
    }
    let cancelled = false;
    setPnlLoading(true);
    getManagerPnl(managerId, pnlRange)
      .then((p) => {
        if (!cancelled) setPnl(p);
      })
      .catch(() => {
        /* leave previous */
      })
      .finally(() => {
        if (!cancelled) setPnlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managerId, pnlRange, positionsRefreshKey]);

  if (!account) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-12 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-faint">
          Portfolio
        </p>
        <p className="mt-3 font-mono text-sm text-text-dim">
          Connect a wallet to see your manager, positions, and history.
        </p>
      </div>
    );
  }

  const totalPnl =
    pnl != null
      ? pnl.currentTotalPnl
      : summary != null
        ? summary.realizedPnl + summary.unrealizedPnl
        : 0;
  const totalPnlKnown = pnl != null || summary != null;
  const plpValue = userPlp * plpNav;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6">
      {/* Page header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-faint">
            Portfolio
          </p>
          <h1 className="mt-1 font-mono text-lg font-medium tracking-tight text-text">
            Your manager · positions · history
          </h1>
        </div>
        {managerId ? (
          <a
            href={`https://suiscan.xyz/testnet/object/${managerId}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-text-faint hover:text-text underline-offset-2 hover:underline"
            title={managerId}
          >
            manager · {managerId.slice(0, 10)}…{managerId.slice(-6)}
          </a>
        ) : (
          <span className="font-mono text-[10px] text-text-faint">
            no manager yet — create one from the Trade page
          </span>
        )}
      </div>

      {/* Stat strip — server-aggregated */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <Stat
          label="Manager dUSDC"
          value={
            summary != null ? `$${summary.tradingBalance.toFixed(2)}` : "—"
          }
          hint="server-indexed"
        />
        <Stat
          label="Wallet dUSDC"
          value={`$${userDusdc.toFixed(2)}`}
          hint="available to deposit"
        />
        <Stat
          label="Open exposure"
          value={
            summary != null ? `$${summary.openExposure.toFixed(2)}` : "—"
          }
          hint={
            summary != null
              ? `${summary.openPositions} live${summary.awaitingSettlement ? ` · ${summary.awaitingSettlement} settling` : ""}`
              : undefined
          }
        />
        <Stat
          label="Total P&L"
          value={
            totalPnlKnown
              ? `${totalPnl >= 0 ? "+" : "−"}$${Math.abs(totalPnl).toFixed(2)}`
              : "—"
          }
          hint={
            summary != null
              ? `realized ${summary.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(summary.realizedPnl).toFixed(2)} · open ${summary.unrealizedPnl >= 0 ? "+" : "−"}$${Math.abs(summary.unrealizedPnl).toFixed(2)}`
              : undefined
          }
          tone={
            totalPnlKnown && totalPnl !== 0
              ? totalPnl > 0
                ? "ok"
                : "danger"
              : undefined
          }
        />
      </div>

      {/* P&L chart */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-2">
          <span className="kicker">Cumulative realized P&L</span>
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setPnlRange(r)}
                className={`rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  pnlRange === r
                    ? "bg-bg-soft text-text"
                    : "text-text-dim hover:bg-card-hover hover:text-text"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[260px] p-2">
          {pnl != null && pnl.points.length > 0 ? (
            <PnlChart points={pnl.points} />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-faint">
              {pnlLoading
                ? "loading P&L…"
                : "no redeems in this window yet"}
            </div>
          )}
        </div>
      </div>

      {/* PLP holdings — only when user has supplied */}
      {userPlp > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
          <div>
            <div className="kicker mb-1">PLP holdings</div>
            <div className="font-mono text-sm text-text tabular-nums">
              {userPlp.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
              <span className="text-[10px] text-text-faint">PLP</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-text-faint">
              Value @ NAV ${plpNav.toFixed(4)}
            </div>
            <div className="mt-0.5 font-mono text-sm tabular-nums text-accent">
              ${plpValue.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Positions + history */}
      <PositionsList
        managerId={managerId}
        refreshKey={positionsRefreshKey}
        onMutate={onMutate}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "danger";
}) {
  const valueColor =
    tone === "ok"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : "text-text";
  return (
    <div className="bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-text-faint whitespace-nowrap">
        {label}
      </div>
      <div className={`mt-1 font-mono text-base tabular-nums ${valueColor}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 font-mono text-[10px] text-text-faint whitespace-nowrap overflow-hidden text-ellipsis">
          {hint}
        </div>
      )}
    </div>
  );
}
