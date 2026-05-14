import { useEffect, useMemo, useState } from "react";
import { getOracleTrades, type TradeTapeEntry } from "../lib/predictServer";

const POLL_MS = 6000;

export function TradeTape({ oracleId }: { oracleId: string }) {
  const [trades, setTrades] = useState<TradeTapeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const list = await getOracleTrades(oracleId, 200, controller.signal);
        if (cancelled) return;
        setTrades(list);
        setError(null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [oracleId]);

  // Per-row P&L for redeems. Build a cost-basis map from every mint in the
  // tape keyed by (trader, position key), then for each redeem subtract the
  // weighted-avg cost from the payout. Same join math we use for the User's
  // History — just scoped to ONLY this oracle's tape, attributed per trader.
  const pnlByTradeId = useMemo(() => {
    type Facts = { totalCost: number; totalQty: number };
    const cost = new Map<string, Facts>();
    // We have the trader's mints/redeems mixed in `trades`. The server returns
    // them descending by checkpoint_timestamp, so we walk in reverse to add
    // mints to the basis BEFORE the redeems that reference them.
    const ordered = [...trades].sort((a, b) => a.timestampMs - b.timestampMs);

    const keyOf = (t: TradeTapeEntry) => {
      const market =
        t.kind === "binary"
          ? `bin:${t.strike}:${t.isUp}`
          : `rng:${t.lowerStrike}:${t.higherStrike}`;
      return `${t.trader}:${market}`;
    };

    const pnls = new Map<string, number | null>();
    for (const t of ordered) {
      const k = keyOf(t);
      if (t.side === "mint" && t.askPrice != null) {
        const prev = cost.get(k) ?? { totalCost: 0, totalQty: 0 };
        cost.set(k, {
          totalCost: prev.totalCost + (t.cost ?? 0),
          totalQty: prev.totalQty + t.quantity,
        });
      } else if (t.side === "redeem") {
        const facts = cost.get(k);
        if (facts && facts.totalQty > 0 && t.payout != null) {
          const avgAsk = facts.totalCost / facts.totalQty;
          pnls.set(t.txDigest, t.payout - t.quantity * avgAsk);
        } else {
          // mint older than tape window — can't compute
          pnls.set(t.txDigest, null);
        }
      }
    }
    return pnls;
  }, [trades]);

  if (loading && trades.length === 0) {
    return (
      <div className="py-4 text-center font-mono text-[11px] text-text-faint">
        loading trades…
      </div>
    );
  }
  if (error && trades.length === 0) {
    return (
      <div className="py-4 text-center font-mono text-[11px] text-danger">
        {error}
      </div>
    );
  }
  if (trades.length === 0) {
    return (
      <div className="py-4 text-center font-mono text-[11px] text-text-faint">
        no trades yet on this market
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {/* Header row */}
      <div className="grid grid-cols-[68px_56px_1fr_72px_64px_72px] gap-2 border-b border-border bg-bg-soft px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-text-faint">
        <span>Time</span>
        <span>Side</span>
        <span>Market</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Px</span>
        <span className="text-right">P&L</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {trades.map((t, i) => (
          <TradeRow
            key={`${t.txDigest}-${i}`}
            t={t}
            pnl={t.side === "redeem" ? pnlByTradeId.get(t.txDigest) ?? null : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function TradeRow({
  t,
  pnl,
}: {
  t: TradeTapeEntry;
  pnl: number | null | undefined; // undefined = mint (no P&L), null = redeem but cost unknown
}) {
  const time = new Date(t.timestampMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const sideColor =
    t.side === "mint"
      ? "text-accent"
      : t.payout && t.payout > 0
        ? "text-success"
        : "text-text-dim";

  const market =
    t.kind === "binary"
      ? `${t.isUp ? "↑" : "↓"} $${formatStrike(t.strike!)}`
      : `↔ $${formatStrike(t.lowerStrike!)}–${formatStrike(t.higherStrike!)}`;

  const marketColor =
    t.kind === "range"
      ? "text-accent"
      : t.isUp
        ? "text-success"
        : "text-danger";

  const price = t.side === "mint" ? t.askPrice : t.bidPrice;
  const priceCents = price != null ? `${(price * 100).toFixed(0)}¢` : "—";

  // P&L cell
  let pnlText: string;
  let pnlColor: string;
  if (pnl === undefined) {
    pnlText = "—";
    pnlColor = "text-text-faint";
  } else if (pnl === null) {
    pnlText = "—";
    pnlColor = "text-text-faint";
  } else if (pnl > 0) {
    pnlText = `+$${pnl.toFixed(2)}`;
    pnlColor = "text-success";
  } else if (pnl < 0) {
    pnlText = `−$${Math.abs(pnl).toFixed(2)}`;
    pnlColor = "text-danger";
  } else {
    pnlText = "$0.00";
    pnlColor = "text-text-dim";
  }

  return (
    <a
      href={`https://suiscan.xyz/testnet/tx/${t.txDigest}`}
      target="_blank"
      rel="noreferrer"
      className="grid grid-cols-[68px_56px_1fr_72px_64px_72px] gap-2 border-b border-border/40 px-3 py-1.5 font-mono text-[11px] tabular-nums transition-colors last:border-b-0 hover:bg-card-hover"
      title={`${t.side === "mint" ? "Minted" : "Redeemed"} by ${t.trader.slice(0, 10)}…`}
    >
      <span className="text-text-faint">{time}</span>
      <span className={`uppercase tracking-wider ${sideColor}`}>
        {t.side === "mint" ? "BUY" : "SELL"}
      </span>
      <span className={`truncate ${marketColor}`}>{market}</span>
      <span className="text-right text-text">${t.quantity.toFixed(2)}</span>
      <span className="text-right text-text-dim">{priceCents}</span>
      <span
        className={`text-right ${pnlColor}`}
        title={
          pnl === null
            ? "Matching mint older than the tape window — P&L unknown"
            : undefined
        }
      >
        {pnlText}
      </span>
    </a>
  );
}

function formatStrike(n: number): string {
  if (n >= 10_000)
    return n.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
  return n.toFixed(0);
}
