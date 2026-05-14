import { useEffect, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  getUserPositions,
  getPositionHistory,
  DUSDC_TYPE,
  type Position,
  type PositionHistoryEntry,
} from "../lib/sui";
import { buildRedeemBinary } from "../lib/ptb";

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
  const [history, setHistory] = useState<PositionHistoryEntry[]>([]);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Open positions — fetched whenever manager or refreshKey changes.
  useEffect(() => {
    if (!managerId) {
      setPositions([]);
      return;
    }
    let cancelled = false;
    setLoadingOpen(true);
    getUserPositions(managerId)
      .then((p) => {
        if (!cancelled) setPositions(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managerId, refreshKey]);

  // History — same trigger. Fetched in parallel so the tab swap is instant.
  useEffect(() => {
    if (!managerId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    getPositionHistory(managerId)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((e) => {
        if (!cancelled) console.warn("history load failed:", e.message);
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
    const key = `${p.oracleId}:${p.strike}:${p.isUp}`;
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

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <TabBtn
            label="Open"
            active={tab === "open"}
            onClick={() => setTab("open")}
            count={positions.length}
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
              : `${positions.length} live`
            : loadingHistory
              ? "loading…"
              : `${history.length} entries`}
        </span>
      </div>

      {tab === "open" ? (
        <OpenList
          positions={positions}
          loading={loadingOpen}
          busyKey={busyKey}
          isPending={isPending}
          onRedeem={handleRedeem}
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
  loading,
  busyKey,
  isPending,
  onRedeem,
}: {
  positions: Position[];
  loading: boolean;
  busyKey: string | null;
  isPending: boolean;
  onRedeem: (p: Position) => void;
}) {
  if (loading && positions.length === 0) {
    return <div className="font-mono text-xs text-text-faint">loading…</div>;
  }
  if (positions.length === 0) {
    return (
      <div className="text-xs text-text-dim">
        No open positions. Mint one in the trade form.
      </div>
    );
  }

  return (
    <>
      {positions.map((p) => {
        const key = `${p.oracleId}:${p.strike}:${p.isUp}`;
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
    </>
  );
}

function HistoryList({
  history,
  loading,
}: {
  history: PositionHistoryEntry[];
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
        const dirColor = h.isUp ? "text-success" : "text-danger";
        const dirGlyph = h.isUp ? "↑ UP" : "↓ DOWN";
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

        return (
          <div
            key={`${h.txDigest}-${i}`}
            className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border bg-bg-soft p-3 last:mb-0"
          >
            <div className={`font-mono text-xs font-semibold ${dirColor}`}>
              {dirGlyph}
            </div>
            <div className="min-w-0">
              <div className="font-mono text-xs text-text tabular-nums">
                ${h.strike.toLocaleString()} · qty ${h.quantity.toFixed(2)}
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
