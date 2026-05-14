import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PositionsList } from "../components/PositionsList";
import { PnlChart } from "../components/PnlChart";
import {
  getManagerSummary,
  getManagerPnl,
  getManagersByOwner,
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

function isLikelySuiAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(s.trim());
}

export function PortfolioView({
  managerId: ownManagerId,
  userDusdc,
  userPlp,
  plpNav,
  positionsRefreshKey,
  onMutate,
}: Props) {
  const account = useCurrentAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryManager = searchParams.get("manager");
  const queryWallet = searchParams.get("wallet");

  // Resolve which manager we're actually viewing.
  // Precedence: ?manager= > resolved ?wallet= > own selected manager.
  const [resolvedFromWallet, setResolvedFromWallet] = useState<string | null>(
    null,
  );
  const [walletResolveError, setWalletResolveError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!queryWallet) {
      setResolvedFromWallet(null);
      setWalletResolveError(null);
      return;
    }
    let cancelled = false;
    setWalletResolveError(null);
    getManagersByOwner(queryWallet)
      .then((list) => {
        if (cancelled) return;
        if (list.length === 0) {
          setResolvedFromWallet(null);
          setWalletResolveError(
            "No PredictManager found for that wallet address.",
          );
        } else {
          // Most recently created first (server already returns desc).
          setResolvedFromWallet(list[0].managerId);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setWalletResolveError(e.message ?? "wallet lookup failed");
      });
    return () => {
      cancelled = true;
    };
  }, [queryWallet]);

  const effectiveManagerId =
    queryManager ?? resolvedFromWallet ?? ownManagerId;

  const isViewingOther =
    effectiveManagerId != null && effectiveManagerId !== ownManagerId;

  // Search bar state
  const [searchInput, setSearchInput] = useState("");
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed) {
      // Clear
      setSearchParams({});
      setSearchInput("");
      return;
    }
    if (!isLikelySuiAddress(trimmed)) {
      setWalletResolveError("Doesn't look like a Sui address (expect 0x + hex).");
      return;
    }
    setSearchParams({ wallet: trimmed });
  };
  const handleClear = () => {
    setSearchParams({});
    setSearchInput("");
    setWalletResolveError(null);
  };

  // ── Data fetching (driven by effectiveManagerId) ──
  const [summary, setSummary] = useState<ManagerSummary | null>(null);
  const [pnl, setPnl] = useState<PnlSeries | null>(null);
  const [pnlRange, setPnlRange] = useState<PnlRange>("ALL");
  const [pnlLoading, setPnlLoading] = useState(false);

  useEffect(() => {
    if (!effectiveManagerId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getManagerSummary(effectiveManagerId);
        if (!cancelled) setSummary(s);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [effectiveManagerId, positionsRefreshKey]);

  useEffect(() => {
    if (!effectiveManagerId) {
      setPnl(null);
      return;
    }
    let cancelled = false;
    setPnlLoading(true);
    getManagerPnl(effectiveManagerId, pnlRange)
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
  }, [effectiveManagerId, pnlRange, positionsRefreshKey]);

  if (!account && !queryWallet && !queryManager) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-12 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-faint">
          Portfolio
        </p>
        <p className="mt-3 font-mono text-sm text-text-dim">
          Connect a wallet or search for any address below.
        </p>
        <SearchBar
          input={searchInput}
          setInput={setSearchInput}
          onSubmit={handleSearchSubmit}
          error={walletResolveError}
        />
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
            Portfolio {isViewingOther && "(read-only)"}
          </p>
          <h1 className="mt-1 font-mono text-lg font-medium tracking-tight text-text">
            {isViewingOther
              ? "Viewing another manager"
              : "Your manager · positions · history"}
          </h1>
        </div>
        {effectiveManagerId ? (
          <a
            href={`https://suiscan.xyz/testnet/object/${effectiveManagerId}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-text-faint hover:text-text underline-offset-2 hover:underline"
            title={effectiveManagerId}
          >
            manager · {effectiveManagerId.slice(0, 10)}…
            {effectiveManagerId.slice(-6)}
          </a>
        ) : (
          <span className="font-mono text-[10px] text-text-faint">
            no manager
          </span>
        )}
      </div>

      {/* Search bar */}
      <SearchBar
        input={searchInput}
        setInput={setSearchInput}
        onSubmit={handleSearchSubmit}
        error={walletResolveError}
      />

      {/* "Viewing other" banner */}
      {isViewingOther && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-2">
          <div className="min-w-0 font-mono text-[11px] text-text">
            <span className="text-text-faint">viewing</span>{" "}
            {queryWallet ? (
              <>
                <span className="text-accent">
                  {queryWallet.slice(0, 10)}…{queryWallet.slice(-6)}
                </span>
                <span className="text-text-faint"> · resolved to manager </span>
                <span className="tabular">
                  {effectiveManagerId?.slice(0, 8)}…
                </span>
              </>
            ) : (
              <span className="text-accent tabular">
                manager {effectiveManagerId?.slice(0, 10)}…
                {effectiveManagerId?.slice(-6)}
              </span>
            )}
          </div>
          <button
            onClick={handleClear}
            className="rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-text-dim hover:border-accent hover:text-text"
          >
            back to my wallet
          </button>
        </div>
      )}

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
          label={isViewingOther ? "Owner" : "Wallet dUSDC"}
          value={
            isViewingOther
              ? summary
                ? `${summary.owner.slice(0, 6)}…${summary.owner.slice(-4)}`
                : "—"
              : `$${userDusdc.toFixed(2)}`
          }
          hint={isViewingOther ? "address" : "available to deposit"}
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

      {/* PLP holdings — only when viewing OWN portfolio and user has supplied */}
      {!isViewingOther && userPlp > 0 && (
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

      {/* Positions + history (viewing-other gets the same component but read-only) */}
      <PositionsList
        managerId={effectiveManagerId}
        refreshKey={positionsRefreshKey}
        onMutate={onMutate}
        readOnly={isViewingOther}
      />
    </div>
  );
}

function SearchBar({
  input,
  setInput,
  onSubmit,
  error,
}: {
  input: string;
  setInput: (s: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: string | null;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <span className="kicker shrink-0">Search wallet</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x… paste a wallet address to view that portfolio"
          className="flex-1 rounded-md border border-border bg-bg-soft px-3 py-1.5 font-mono text-xs text-text placeholder:text-text-faint focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-accent hover:border-accent hover:bg-accent/15"
        >
          View
        </button>
      </div>
      {error && (
        <div className="font-mono text-[10px] text-danger">{error}</div>
      )}
    </form>
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
