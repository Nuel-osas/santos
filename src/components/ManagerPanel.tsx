import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { findUserPredictManagers, type ManagerSummary } from "../lib/sui";
import { buildCreateManager } from "../lib/ptb";

export function ManagerPanel({
  selectedManagerId,
  onSelectManager,
}: {
  selectedManagerId: string | null;
  onSelectManager: (id: string | null) => void;
}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [managers, setManagers] = useState<ManagerSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!account) {
      setManagers([]);
      onSelectManager(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    findUserPredictManagers(account.address)
      .then((list) => {
        if (cancelled) return;
        setManagers(list);
        if (list.length > 0 && !selectedManagerId) {
          onSelectManager(list[0].id);
        }
        if (selectedManagerId && !list.some((m) => m.id === selectedManagerId)) {
          onSelectManager(list[0]?.id ?? null);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, reloadKey]);

  const handleCreate = () => {
    setError(null);
    signAndExecute(
      { transaction: buildCreateManager() },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest });
          setReloadKey((k) => k + 1);
        },
        onError: (err: Error) => setError(err.message),
      },
    );
  };

  if (!account) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="kicker mb-2">Manager</div>
        <p className="m-0 text-xs text-text-faint">
          Connect a wallet to use Predict.
        </p>
      </div>
    );
  }

  const active = managers.find((m) => m.id === selectedManagerId) ?? managers[0];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="kicker">Your manager</div>
        {!loading && managers.length === 0 && (
          <button
            onClick={handleCreate}
            disabled={isPending}
            className="rounded-md border border-accent-2 px-2.5 py-1 text-[11px] text-accent-2 transition hover:bg-bg-soft disabled:opacity-50"
          >
            {isPending ? "creating…" : "+ create"}
          </button>
        )}
      </div>

      {loading && (
        <div className="font-mono text-xs text-text-faint">loading…</div>
      )}

      {!loading && managers.length === 0 && (
        <p className="m-0 text-xs text-text-dim">
          You don't have a PredictManager yet. Creating one is free (just gas).
        </p>
      )}

      {active && (
        <>
          <div className="rounded-lg bg-bg-soft p-3">
            <div className="font-mono text-xs text-text break-all">
              {active.id.slice(0, 14)}…{active.id.slice(-6)}
            </div>
            <div className="mt-1 flex gap-3 font-mono text-[10px] text-text-faint">
              <span>{active.positionCount} positions</span>
              <span>·</span>
              <span>{active.rangeCount} ranges</span>
            </div>
          </div>

          {managers.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {managers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onSelectManager(m.id)}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition ${
                    m.id === selectedManagerId
                      ? "border-accent-2 text-accent-2"
                      : "border-border text-text-dim hover:border-accent"
                  }`}
                >
                  {m.id.slice(0, 8)}…
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
