import { useEffect, useMemo, useState } from "react";
import type { OracleSummary } from "../lib/sui";

const STATUS_DOT: Record<number, string> = {
  0: "bg-text-faint",
  1: "bg-success",
  2: "bg-warn",
  3: "bg-text-dim",
};

const STATUS_LABEL: Record<number, string> = {
  0: "inactive",
  1: "active",
  2: "pending",
  3: "settled",
};

function deriveStatusNow(o: OracleSummary, now: number): number {
  if (o.settlement_price != null) return 3;
  if (!o.active) return 0;
  if (now < o.expiry) return 1;
  return 2;
}

type Props = {
  oracles: OracleSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
};

export function MarketStrip({ oracles, selectedId, onSelect, loading }: Props) {
  // 30s tick so countdowns / statuses don't go stale.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Symbols present in the oracle set, in insertion order.
  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const o of oracles) set.add(o.underlying.symbol);
    return Array.from(set);
  }, [oracles]);

  // Underlying picked = symbol of the selected oracle if any, else first symbol.
  const selected = oracles.find((o) => o.id === selectedId) ?? null;
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  useEffect(() => {
    if (selected) setActiveSymbol(selected.underlying.symbol);
    else if (symbols.length && !activeSymbol) setActiveSymbol(symbols[0]);
  }, [selected, symbols, activeSymbol]);

  const handleTab = (sym: string) => {
    setActiveSymbol(sym);
    // Auto-pick the soonest active oracle for that symbol so the chart follows.
    const candidates = oracles
      .filter((o) => o.underlying.symbol === sym)
      .map((o) => ({ o, status: deriveStatusNow(o, now) }))
      .sort((a, b) => a.o.expiry - b.o.expiry);
    const next =
      candidates.find((x) => x.status === 1) ??
      candidates.find((x) => x.status === 2) ??
      candidates[0];
    if (next) onSelect(next.o.id);
  };

  // Pills shown = all oracles of the active symbol.
  const pillsForActive = useMemo(() => {
    if (!activeSymbol) return [];
    return oracles
      .filter((o) => o.underlying.symbol === activeSymbol)
      .map((o) => ({ o, status: deriveStatusNow(o, now) }))
      .sort((a, b) => {
        // active first, then pending, then settled
        if (a.status !== b.status) return a.status - b.status;
        return a.o.expiry - b.o.expiry;
      });
  }, [oracles, activeSymbol, now]);

  // Global status counts (across all underlyings).
  const counts = useMemo(() => {
    return oracles.reduce<Record<number, number>>((acc, o) => {
      const s = deriveStatusNow(o, now);
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
  }, [oracles, now]);

  if (loading) {
    return (
      <div className="flex h-12 items-center border-b border-border bg-bg-soft px-5 font-mono text-[10px] text-text-faint">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" />
        <span className="ml-2">loading markets…</span>
      </div>
    );
  }

  if (oracles.length === 0) {
    return (
      <div className="flex h-12 items-center border-b border-border bg-bg-soft px-5 font-mono text-[10px] text-text-faint">
        no markets
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-bg-soft">
      {/* Row 1 — underlying tabs + global status counts */}
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-2">
        <div className="flex items-center gap-1">
          {symbols.map((sym) => (
            <button
              key={sym}
              onClick={() => handleTab(sym)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                activeSymbol === sym
                  ? "bg-card text-text"
                  : "text-text-dim hover:bg-card-hover hover:text-text"
              }`}
            >
              {sym}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-text-faint">
          {[1, 2, 3].map((s) =>
            counts[s] ? (
              <span key={s} className="flex items-center gap-1 whitespace-nowrap">
                <span className={`size-1.5 rounded-full ${STATUS_DOT[s]}`} />
                {counts[s]} {STATUS_LABEL[s]}
              </span>
            ) : null,
          )}
        </div>
      </div>

      {/* Row 2 — expiry pills, horizontal scroll */}
      <div className="overflow-x-auto px-5 py-2.5 [scrollbar-width:thin]">
        <div className="flex items-center gap-1.5">
          {pillsForActive.map(({ o, status }) => (
            <ExpiryPill
              key={o.id}
              oracle={o}
              status={status}
              selected={o.id === selectedId}
              onClick={() => onSelect(o.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpiryPill({
  oracle,
  status,
  selected,
  onClick,
}: {
  oracle: OracleSummary;
  status: number;
  selected: boolean;
  onClick: () => void;
}) {
  const minutesToExpiry = Math.round((oracle.expiry - Date.now()) / 60000);
  const expiryDate = new Date(oracle.expiry);
  const dateStr = expiryDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const timeStr = expiryDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const countdown =
    status === 3
      ? "settled"
      : status === 2
        ? "expired"
        : minutesToExpiry < 60
          ? `${minutesToExpiry}m`
          : minutesToExpiry < 60 * 24
            ? `${Math.round(minutesToExpiry / 60)}h`
            : `${Math.round(minutesToExpiry / 60 / 24)}d`;

  const isSoon = status === 1 && minutesToExpiry < 30 && minutesToExpiry >= 0;

  // Settled pills are visually dimmed but stay clickable so users can inspect
  // their tape / vol surface / past positions. Trading is gated downstream
  // by the TradeForm reading oracle.status.
  // Brightness tiering: active = full color, pending = warn-toned, settled =
  // muted. Selected overrides with the accent treatment.
  const baseClass = selected
    ? "border-accent bg-accent-soft text-text"
    : status === 1
      ? "border-border bg-card text-text hover:border-accent/60 hover:bg-card-hover"
      : status === 2
        ? "border-warn/30 bg-card text-warn/90 hover:border-warn/60"
        : "border-border/40 bg-bg/40 text-text-faint opacity-60"; // settled

  return (
    <button
      onClick={onClick}
      title={
        status === 3
          ? `settled oracle ${oracle.id} — read-only`
          : `oracle ${oracle.id}`
      }
      className={`flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] transition ${baseClass}`}
    >
      <span
        className={`size-1.5 rounded-full ${STATUS_DOT[status]} ${status === 3 ? "opacity-50" : ""}`}
      />
      <span className="uppercase tracking-wider">{dateStr}</span>
      <span
        className={status === 1 ? "text-text-dim" : "text-text-faint"}
      >
        {timeStr}
      </span>
      <span
        className={`text-[10px] ${
          isSoon ? "text-warn" : status === 1 ? "text-text-dim" : "text-text-faint"
        }`}
      >
        · {countdown}
      </span>
    </button>
  );
}
