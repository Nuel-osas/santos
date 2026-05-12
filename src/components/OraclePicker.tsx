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
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="kicker mb-2">Markets</div>
        <div className="flex items-center gap-2 text-xs text-text-faint">
          <span className="size-2 animate-pulse rounded-full bg-accent-2" />
          loading active markets…
        </div>
      </div>
    );
  }

  if (oracles.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="kicker mb-2">Markets</div>
        <div className="text-xs text-text-faint">No active markets found.</div>
      </div>
    );
  }

  // Group by (underlying symbol, status). Order respects sort already applied
  // upstream: active first, pending next, settled last.
  const groups = new Map<string, { symbol: string; status: number; oracles: OracleSummary[] }>();
  for (const o of oracles) {
    const key = `${o.underlying.symbol}::${o.status}`;
    if (!groups.has(key)) {
      groups.set(key, { symbol: o.underlying.symbol, status: o.status, oracles: [] });
    }
    groups.get(key)!.oracles.push(o);
  }

  const counts = oracles.reduce<Record<number, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="kicker">Markets</div>
        <div className="flex gap-3 font-mono text-[10px] text-text-faint">
          {[1, 2, 3].map((s) =>
            counts[s] ? (
              <span key={s} className="flex items-center gap-1">
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
  selected,
  onClick,
}: {
  oracle: OracleSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const minutesToExpiry = Math.round((oracle.expiry - Date.now()) / 60000);
  const expiryLabel =
    oracle.status === 3
      ? "settled"
      : oracle.status === 2
        ? "expired"
        : minutesToExpiry < 60
          ? `${minutesToExpiry}m`
          : minutesToExpiry < 60 * 24
            ? `${Math.round(minutesToExpiry / 60)}h`
            : `${Math.round(minutesToExpiry / 60 / 24)}d`;

  // Soon-to-expire warning (< 30 min, active only)
  const isSoon = oracle.status === 1 && minutesToExpiry < 30 && minutesToExpiry >= 0;

  const baseClass = selected
    ? "border-accent-2 bg-bg-soft text-text"
    : "border-border text-text-dim hover:border-accent hover:text-text";
  const disabled = oracle.status === 3; // settled, no useful trades

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${baseClass} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className={`size-1.5 rounded-full ${STATUS_DOT[oracle.status]}`} />
      <span className="font-mono">
        {oracle.id.slice(0, 8)}…{oracle.id.slice(-4)}
      </span>
      <span
        className={`font-mono text-[10px] ${isSoon ? "text-hot" : "text-text-faint"}`}
      >
        {expiryLabel}
      </span>
    </button>
  );
}
