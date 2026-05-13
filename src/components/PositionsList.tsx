import { useEffect, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  getUserPositions,
  DUSDC_TYPE,
  type Position,
} from "../lib/sui";
import { buildRedeemBinary } from "../lib/ptb";

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
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!managerId) {
      setPositions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getUserPositions(managerId)
      .then((p) => {
        if (cancelled) return;
        setPositions(p);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
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
      <div className="mb-3 flex items-baseline justify-between">
        <span className="kicker">Your positions</span>
        <span className="font-mono text-[10px] text-text-faint">
          {positions.length} open
        </span>
      </div>

      {loading && positions.length === 0 && (
        <div className="font-mono text-xs text-text-faint">loading…</div>
      )}

      {!loading && positions.length === 0 && (
        <div className="text-xs text-text-dim">
          No open positions. Mint one in the trade form above.
        </div>
      )}

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
              onClick={() => handleRedeem(p)}
              disabled={isPending && busyKey === key}
              className="rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-[11px] text-text-dim transition hover:border-accent-2 hover:text-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && busyKey === key ? "redeeming…" : "redeem"}
            </button>
          </div>
        );
      })}

      {error && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger break-all">
          {error}
        </div>
      )}
    </div>
  );
}
