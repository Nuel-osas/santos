import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAllManagers,
  getManagerSummary,
  type ManagerSummary,
} from "../lib/predictServer";

type Row = ManagerSummary & {
  createdAtMs: number;
};

type SortKey = "realizedPnl" | "accountValue" | "openExposure";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "realizedPnl", label: "Realized P&L" },
  { key: "accountValue", label: "Account value" },
  { key: "openExposure", label: "Open exposure" },
];

export function LeaderboardView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [sortKey, setSortKey] = useState<SortKey>("realizedPnl");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const managers = await getAllManagers();
        if (cancelled) return;
        setProgress({ done: 0, total: managers.length });

        // Fetch summary for each in parallel. Server has 52ish managers
        // today — that's 52 fetches, fine to do all at once. As the
        // dataset grows, we'd want to batch or paginate.
        const summaries = await Promise.allSettled(
          managers.map(async (m) => {
            const s = await getManagerSummary(m.managerId);
            if (!cancelled) {
              setProgress((p) => ({ done: p.done + 1, total: p.total }));
            }
            return { ...s, createdAtMs: m.createdAtMs };
          }),
        );

        if (cancelled) return;
        const collected: Row[] = [];
        for (const r of summaries) {
          if (r.status === "fulfilled") collected.push(r.value);
        }
        setRows(collected);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-faint">
            Leaderboard
          </p>
          <h1 className="mt-1 font-mono text-lg font-medium tracking-tight text-text">
            Top managers · ranked by realized P&L
          </h1>
        </div>
        <div className="flex items-center gap-1">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setSortKey(o.key)}
              className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                sortKey === o.key
                  ? "bg-card text-text"
                  : "text-text-dim hover:bg-card-hover hover:text-text"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-border bg-card p-6 text-center font-mono text-[11px] text-text-faint">
          loading {progress.done} / {progress.total} managers…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 font-mono text-xs text-danger">
          {error}
        </div>
      )}

      {!loading && !error && sorted.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[40px_1fr_120px_120px_120px_120px] gap-3 border-b border-border bg-bg-soft px-4 py-2 font-mono text-[9px] uppercase tracking-widest text-text-faint">
            <span>#</span>
            <span>Manager · owner</span>
            <span className="text-right">Realized P&L</span>
            <span className="text-right">Unrealized</span>
            <span className="text-right">Open exposure</span>
            <span className="text-right">Account value</span>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {sorted.map((r, i) => (
              <LeaderboardRow key={r.managerId} row={r} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ row, rank }: { row: Row; rank: number }) {
  const rankColor =
    rank === 1
      ? "text-warn"
      : rank <= 3
        ? "text-accent"
        : "text-text-faint";

  const pnlColor =
    row.realizedPnl > 0
      ? "text-success"
      : row.realizedPnl < 0
        ? "text-danger"
        : "text-text-dim";

  const unrealColor =
    row.unrealizedPnl > 0
      ? "text-success"
      : row.unrealizedPnl < 0
        ? "text-danger"
        : "text-text-faint";

  return (
    <Link
      to={`/portfolio?wallet=${encodeURIComponent(row.owner)}`}
      className="grid grid-cols-[40px_1fr_120px_120px_120px_120px] gap-3 border-b border-border/40 px-4 py-2.5 font-mono text-[11px] tabular-nums transition-colors last:border-b-0 hover:bg-card-hover"
      title={`Click to view this manager's portfolio`}
    >
      <span className={`font-semibold ${rankColor}`}>{rank}</span>
      <div className="min-w-0">
        <div className="truncate text-text">
          {row.managerId.slice(0, 10)}…{row.managerId.slice(-6)}
        </div>
        <div className="truncate text-[10px] text-text-faint">
          {row.owner.slice(0, 10)}…{row.owner.slice(-6)} ·{" "}
          {row.openPositions} pos
          {row.awaitingSettlement > 0 ? ` · ${row.awaitingSettlement} settling` : ""}
        </div>
      </div>
      <span className={`text-right ${pnlColor}`}>
        {row.realizedPnl >= 0 ? "+" : "−"}$
        {Math.abs(row.realizedPnl).toFixed(2)}
      </span>
      <span className={`text-right ${unrealColor}`}>
        {row.unrealizedPnl >= 0 ? "+" : "−"}$
        {Math.abs(row.unrealizedPnl).toFixed(2)}
      </span>
      <span className="text-right text-text-dim">
        ${row.openExposure.toFixed(2)}
      </span>
      <span className="text-right text-text">
        ${row.accountValue.toFixed(2)}
      </span>
    </Link>
  );
}
