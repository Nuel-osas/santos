import { useEffect, useRef, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  getUserPositions,
  getUserRangePositions,
  getPositionHistory,
  getRangePositionHistory,
  DUSDC_TYPE,
  type Position,
  type RangePosition,
  type PositionHistoryEntry,
  type RangePositionHistoryEntry,
} from "../lib/sui";
import { buildRedeemBinary, buildRedeemRange } from "../lib/ptb";

type HistoryRow =
  | ({ kind: "binary" } & PositionHistoryEntry)
  | ({ kind: "range" } & RangePositionHistoryEntry);

type Tab = "open" | "history";

export function PositionsList({
  managerId,
  refreshKey,
  onMutate,
}: {
  managerId: string | null;
  refreshKey: number;
  onMutate: () => void;
}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [tab, setTab] = useState<Tab>("open");
  const [positions, setPositions] = useState<Position[]>([]);
  const [ranges, setRanges] = useState<RangePosition[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  // Initialize to true if a manager is present so the auto-tab effect can
  // tell "haven't loaded yet" apart from "loaded and empty".
  const [loadingOpen, setLoadingOpen] = useState(!!managerId);
  const [loadingHistory, setLoadingHistory] = useState(!!managerId);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Auto-default tab once per manager: if there are 0 open positions but
  // history exists, land on History. Tracked by ref so it only fires once
  // and never overrides the user after they've picked a tab manually.
  const didAutoTab = useRef(false);
  useEffect(() => {
    didAutoTab.current = false;
    setTab("open");
    // Force loading flags true so the auto-tab effect waits for THIS
    // manager's fetches to finish, not whatever state was left over.
    if (managerId) {
      setLoadingOpen(true);
      setLoadingHistory(true);
    }
  }, [managerId]);
  useEffect(() => {
    if (didAutoTab.current) return;
    if (loadingOpen || loadingHistory) return;
    didAutoTab.current = true;
    if (positions.length === 0 && ranges.length === 0 && history.length > 0) {
      setTab("history");
    }
  }, [loadingOpen, loadingHistory, positions.length, ranges.length, history.length]);

  // Open positions — binary + range, fetched whenever manager or refreshKey changes.
  useEffect(() => {
    if (!managerId) {
      setPositions([]);
      setRanges([]);
      setLoadingOpen(false);
      return;
    }
    let cancelled = false;
    setLoadingOpen(true);
    Promise.allSettled([
      getUserPositions(managerId),
      getUserRangePositions(managerId),
    ])
      .then(([binSettled, rangeSettled]) => {
        if (cancelled) return;
        if (binSettled.status === "fulfilled") setPositions(binSettled.value);
        else setError((binSettled.reason as Error).message);
        if (rangeSettled.status === "fulfilled") setRanges(rangeSettled.value);
        else console.warn("range positions load failed:", rangeSettled.reason);
      })
      .finally(() => {
        if (!cancelled) setLoadingOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managerId, refreshKey]);

  // History — binary + range merged into one time-sorted list.
  useEffect(() => {
    if (!managerId) {
      setHistory([]);
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    Promise.allSettled([
      getPositionHistory(managerId),
      getRangePositionHistory(managerId),
    ])
      .then(([binRes, rangeRes]) => {
        if (cancelled) return;
        const rows: HistoryRow[] = [];
        if (binRes.status === "fulfilled") {
          for (const r of binRes.value) rows.push({ kind: "binary", ...r });
        } else {
          console.warn("binary history load failed:", binRes.reason);
        }
        if (rangeRes.status === "fulfilled") {
          for (const r of rangeRes.value) rows.push({ kind: "range", ...r });
        } else {
          console.warn("range history load failed:", rangeRes.reason);
        }
        rows.sort((a, b) => b.timestampMs - a.timestampMs);
        setHistory(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managerId, refreshKey]);

  if (!account || !managerId) return null;

  const handleRedeem = (p: Position) => {
    setError(null);
    const key = `bin:${p.oracleId}:${p.strike}:${p.isUp}`;
    setBusyKey(key);
    const tx = buildRedeemBinary({
      managerId,
      oracleId: p.oracleId,
      expiry: BigInt(p.expiry),
      strike: BigInt(Math.round(p.strike * 1_000_000_000)),
      isUp: p.isUp,
      quantity: BigInt(Math.round(p.quantity * 1_000_000)),
      quoteAssetType: DUSDC_TYPE,
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (r) => {
          await suiClient.waitForTransaction({ digest: r.digest });
          setBusyKey(null);
          onMutate();
        },
        onError: (e: Error) => {
          setError(e.message);
          setBusyKey(null);
        },
      },
    );
  };

  const handleRedeemRange = (r: RangePosition) => {
    setError(null);
    const key = `range:${r.oracleId}:${r.lowerStrike}:${r.higherStrike}`;
    setBusyKey(key);
    const tx = buildRedeemRange({
      managerId,
      oracleId: r.oracleId,
      expiry: BigInt(r.expiry),
      lowerStrike: BigInt(Math.round(r.lowerStrike * 1_000_000_000)),
      higherStrike: BigInt(Math.round(r.higherStrike * 1_000_000_000)),
      quantity: BigInt(Math.round(r.quantity * 1_000_000)),
      quoteAssetType: DUSDC_TYPE,
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (res) => {
          await suiClient.waitForTransaction({ digest: res.digest });
          setBusyKey(null);
          onMutate();
        },
        onError: (e: Error) => {
          setError(e.message);
          setBusyKey(null);
        },
      },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <TabBtn
            label="Open"
            active={tab === "open"}
            onClick={() => setTab("open")}
            count={positions.length + ranges.length}
          />
          <TabBtn
            label="History"
            active={tab === "history"}
            onClick={() => setTab("history")}
            count={history.length}
          />
        </div>
        <span className="font-mono text-[10px] text-text-faint">
          {tab === "open"
            ? loadingOpen
              ? "loading…"
              : `${positions.length} binary · ${ranges.length} range`
            : loadingHistory
              ? "loading…"
              : `${history.length} entries`}
        </span>
      </div>

      {tab === "open" ? (
        <OpenList
          positions={positions}
          ranges={ranges}
          loading={loadingOpen}
          busyKey={busyKey}
          isPending={isPending}
          onRedeem={handleRedeem}
          onRedeemRange={handleRedeemRange}
        />
      ) : (
        <HistoryList history={history} loading={loadingHistory} />
      )}

      {error && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger break-all">
          {error}
        </div>
      )}
    </div>
  );
}

function OpenList({
  positions,
  ranges,
  loading,
  busyKey,
  isPending,
  onRedeem,
  onRedeemRange,
}: {
  positions: Position[];
  ranges: RangePosition[];
  loading: boolean;
  busyKey: string | null;
  isPending: boolean;
  onRedeem: (p: Position) => void;
  onRedeemRange: (r: RangePosition) => void;
}) {
  if (loading && positions.length === 0 && ranges.length === 0) {
    return <div className="font-mono text-xs text-text-faint">loading…</div>;
  }
  if (positions.length === 0 && ranges.length === 0) {
    return (
      <div className="text-xs text-text-dim">
        No open positions. Mint one in the trade form.
      </div>
    );
  }

  return (
    <>
      {positions.map((p) => {
        const key = `bin:${p.oracleId}:${p.strike}:${p.isUp}`;
        const minutesToExpiry = Math.round((p.expiry - Date.now()) / 60000);
        const expiryDate = new Date(p.expiry);
        const expiryStr = expiryDate.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const expired = minutesToExpiry <= 0;
        const dirColor = p.isUp ? "text-success" : "text-danger";
        const dirGlyph = p.isUp ? "↑ UP" : "↓ DOWN";
        const busy = isPending && busyKey === key;

        return (
          <div
            key={key}
            className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border bg-bg-soft p-3 last:mb-0"
          >
            <div className={`font-mono text-xs font-semibold ${dirColor}`}>
              {dirGlyph}
            </div>
            <div className="min-w-0">
              <div className="font-mono text-xs text-text tabular-nums">
                ${p.strike.toLocaleString()} · ${p.quantity.toFixed(2)} payout
              </div>
              <div className="font-mono text-[10px] text-text-faint">
                {expiryStr} ·{" "}
                {expired
                  ? "expired — awaiting settlement"
                  : minutesToExpiry < 60
                    ? `${minutesToExpiry}m left`
                    : minutesToExpiry < 60 * 24
                      ? `${Math.round(minutesToExpiry / 60)}h left`
                      : `${Math.round(minutesToExpiry / 60 / 24)}d left`}
              </div>
            </div>
            <button
              onClick={() => onRedeem(p)}
              disabled={busy}
              title={
                expired
                  ? "Claim settled payout once oracle settles"
                  : "Sell position back at the current live bid (early exit)"
              }
              className="rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-[11px] text-text-dim transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (expired ? "redeeming…" : "closing…") : expired ? "redeem" : "close"}
            </button>
          </div>
        );
      })}

      {ranges.map((r) => {
        const key = `range:${r.oracleId}:${r.lowerStrike}:${r.higherStrike}`;
        const minutesToExpiry = Math.round((r.expiry - Date.now()) / 60000);
        const expiryDate = new Date(r.expiry);
        const expiryStr = expiryDate.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const expired = minutesToExpiry <= 0;
        const busy = isPending && busyKey === key;

        return (
          <div
            key={key}
            className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border bg-bg-soft p-3 last:mb-0"
          >
            <div className="font-mono text-xs font-semibold text-accent">
              ↔ RANGE
            </div>
            <div className="min-w-0">
              <div className="font-mono text-xs text-text tabular-nums">
                ${r.lowerStrike.toLocaleString()}–${r.higherStrike.toLocaleString()}{" "}
                · ${r.quantity.toFixed(2)} payout
              </div>
              <div className="font-mono text-[10px] text-text-faint">
                {expiryStr} ·{" "}
                {expired
                  ? "expired — awaiting settlement"
                  : minutesToExpiry < 60
                    ? `${minutesToExpiry}m left`
                    : minutesToExpiry < 60 * 24
                      ? `${Math.round(minutesToExpiry / 60)}h left`
                      : `${Math.round(minutesToExpiry / 60 / 24)}d left`}
              </div>
            </div>
            <button
              onClick={() => onRedeemRange(r)}
              disabled={busy}
              title={
                expired
                  ? "Claim settled payout once oracle settles"
                  : "Sell range back at the current live bid (early exit)"
              }
              className="rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-[11px] text-text-dim transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (expired ? "redeeming…" : "closing…") : expired ? "redeem" : "close"}
            </button>
          </div>
        );
      })}
    </>
  );
}

function HistoryList({
  history,
  loading,
}: {
  history: HistoryRow[];
  loading: boolean;
}) {
  if (loading && history.length === 0) {
    return <div className="font-mono text-xs text-text-faint">loading…</div>;
  }
  if (history.length === 0) {
    return (
      <div className="text-xs text-text-dim">
        No redeems yet. Once you close or settle a position, it'll show here.
      </div>
    );
  }

  return (
    <>
      {history.map((h, i) => {
        const when = new Date(h.timestampMs).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const exitLabel = h.isSettled ? "settled" : "closed early";
        const pnl = h.pnl;
        const pnlColor =
          pnl == null
            ? "text-text-faint"
            : pnl > 0
              ? "text-success"
              : pnl < 0
                ? "text-danger"
                : "text-text-dim";
        const pnlText =
          pnl == null
            ? "P&L —"
            : `${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}`;

        // Kind-specific glyph + strike label
        const glyph =
          h.kind === "binary"
            ? h.isUp
              ? "↑ UP"
              : "↓ DOWN"
            : "↔ RANGE";
        const glyphColor =
          h.kind === "binary"
            ? h.isUp
              ? "text-success"
              : "text-danger"
            : "text-accent";
        const strikeLabel =
          h.kind === "binary"
            ? `$${h.strike.toLocaleString()}`
            : `$${h.lowerStrike.toLocaleString()}–$${h.higherStrike.toLocaleString()}`;

        return (
          <div
            key={`${h.kind}-${h.txDigest}-${i}`}
            className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border bg-bg-soft p-3 last:mb-0"
          >
            <div className={`font-mono text-xs font-semibold ${glyphColor}`}>
              {glyph}
            </div>
            <div className="min-w-0">
              <div className="font-mono text-xs text-text tabular-nums">
                {strikeLabel} · qty ${h.quantity.toFixed(2)}
              </div>
              <div className="font-mono text-[10px] text-text-faint">
                {when} · {exitLabel} · entry{" "}
                {h.entryAskPrice != null
                  ? `${(h.entryAskPrice * 100).toFixed(0)}¢`
                  : "—"}{" "}
                → exit {(h.bidPrice * 100).toFixed(0)}¢
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span
                className={`font-mono text-xs font-semibold tabular-nums ${pnlColor}`}
                title={
                  h.entryAskPrice != null
                    ? `payout $${h.payout.toFixed(2)} − cost $${(h.quantity * h.entryAskPrice).toFixed(2)}`
                    : "No matching mint event found in the recent window"
                }
              >
                {pnlText}
              </span>
              <a
                href={`https://suiscan.xyz/testnet/tx/${h.txDigest}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] text-text-faint underline-offset-2 hover:text-text hover:underline"
              >
                ${h.payout.toFixed(2)} · {h.txDigest.slice(0, 6)}…
              </a>
            </div>
          </div>
        );
      })}
    </>
  );
}

function TabBtn({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
        active
          ? "bg-bg-soft text-text"
          : "text-text-dim hover:bg-card-hover hover:text-text"
      }`}
    >
      {label}
      <span
        className={`rounded-sm px-1 text-[9px] tabular-nums ${
          active ? "bg-accent/15 text-accent" : "text-text-faint"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
