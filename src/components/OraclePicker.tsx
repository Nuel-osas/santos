import { useEffect, useState } from "react";
import type { OracleSummary } from "../lib/sui";

const STATUS_DOT: Record<number, string> = {
  0: "bg-text-faint",
  1: "bg-success",
  2: "bg-hot",
  3: "bg-text-dim",
};

const STATUS_LABEL: Record<number, string> = {
  0: "inactive",
  1: "active",
  2: "pending",
  3: "settled",
};

/// Re-derive status from current time. The cached status on the summary
/// is computed at fetch time and can go stale if the page is open while
/// an expiry passes. settlement_price stays as-cached (only an on-chain
/// settlement push would change it).
function deriveStatusNow(o: OracleSummary, now: number): number {
  if (o.settlement_price != null) return 3; // settled
  if (!o.active) return 0;
  if (now < o.expiry) return 1; // active
  return 2; // pending
}

export function OraclePicker({
  oracles,
  selectedId,
  onSelect,
  loading,
}: {
  oracles: OracleSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  // Tick every 30s to re-evaluate "now vs expiry" so chips don't go stale.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="kicker mb-2">Expiries</div>
        <div className="flex items-center gap-2 text-xs text-text-faint">
          <span className="size-2 animate-pulse rounded-full bg-accent-2" />
          loading expiry windows…
        </div>
      </div>
    );
  }

  if (oracles.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="kicker mb-2">Expiries</div>
        <div className="text-xs text-text-faint">
          No active expiry windows found.
        </div>
      </div>
    );
  }

  // Re-derive status from `now` so chips reflect actual current state, not
  // the status that was true at fetch time.
  const oraclesWithCurrentStatus = oracles.map((o) => ({
    o,
    status: deriveStatusNow(o, now),
  }));

  // Group by (underlying symbol, status). Order respects sort already applied
  // upstream: active first, pending next, settled last.
  const groups = new Map<
    string,
    { symbol: string; status: number; oracles: OracleSummary[] }
  >();
  for (const { o, status } of oraclesWithCurrentStatus) {
    const key = `${o.underlying.symbol}::${status}`;
    if (!groups.has(key)) {
      groups.set(key, { symbol: o.underlying.symbol, status, oracles: [] });
    }
    groups.get(key)!.oracles.push(o);
  }

  const counts = oraclesWithCurrentStatus.reduce<Record<number, number>>(
    (acc, { status }) => {
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="kicker">Expiries</span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-text-faint">
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

      <div className="space-y-3">
        {Array.from(groups.values()).map((g) => (
          <div key={`${g.symbol}-${g.status}`}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-faint">
                {g.symbol} · {STATUS_LABEL[g.status]}
              </span>
              <span className="font-mono text-[10px] text-text-faint">
                ({g.oracles.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.oracles.map((o) => (
                <OracleChip
                  key={o.id}
                  oracle={o}
                  liveStatus={g.status}
                  selected={o.id === selectedId}
                  onClick={() => onSelect(o.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OracleChip({
  oracle,
  liveStatus,
  selected,
  onClick,
}: {
  oracle: OracleSummary;
  liveStatus: number;
  selected: boolean;
  onClick: () => void;
}) {
  const minutesToExpiry = Math.round((oracle.expiry - Date.now()) / 60000);
  const expiryDate = new Date(oracle.expiry);

  // Date/time pieces. "MAY 13 · 00:30" style.
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
    liveStatus === 3
      ? "settled"
      : liveStatus === 2
        ? "expired"
        : minutesToExpiry < 60
          ? `${minutesToExpiry}m`
          : minutesToExpiry < 60 * 24
            ? `${Math.round(minutesToExpiry / 60)}h`
            : `${Math.round(minutesToExpiry / 60 / 24)}d`;

  const isSoon =
    liveStatus === 1 && minutesToExpiry < 30 && minutesToExpiry >= 0;

  const baseClass = selected
    ? "border-accent-2 bg-bg-soft text-text"
    : "border-border text-text-dim hover:border-accent hover:text-text";
  const disabled = liveStatus === 3;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={`oracle ${oracle.id}`}
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${baseClass} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className={`size-1.5 rounded-full ${STATUS_DOT[liveStatus]}`} />
      <span className="font-mono uppercase tracking-wider">{dateStr}</span>
      <span className="font-mono text-text-faint">{timeStr}</span>
      <span
        className={`font-mono text-[10px] ${
          isSoon ? "text-hot" : "text-text-faint"
        }`}
      >
        · {countdown}
      </span>
    </button>
  );
}
