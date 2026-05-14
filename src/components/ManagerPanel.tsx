import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  findUserPredictManagers,
  getManagerQuoteBalance,
  getUserDusdcBalance,
  type ManagerSummary,
  DUSDC_TYPE,
} from "../lib/sui";
import {
  buildCreateManager,
  buildDepositToManager,
  buildWithdrawFromManager,
} from "../lib/ptb";

type FundMode = "deposit" | "withdraw";

export function ManagerPanel({
  selectedManagerId,
  onSelectManager,
  onMutate,
}: {
  selectedManagerId: string | null;
  onSelectManager: (id: string | null) => void;
  onMutate?: () => void;
}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [managers, setManagers] = useState<ManagerSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [managerDusdc, setManagerDusdc] = useState(0);
  const [walletDusdc, setWalletDusdc] = useState(0);
  const [fundMode, setFundMode] = useState<FundMode>("deposit");
  const [fundAmount, setFundAmount] = useState("100");
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  // Load list of managers when wallet connects / reloadKey bumps
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

  // Poll manager + wallet dUSDC balances
  useEffect(() => {
    if (!account || !selectedManagerId) return;
    let cancelled = false;
    const tick = async () => {
      const [m, w] = await Promise.allSettled([
        getManagerQuoteBalance(selectedManagerId, DUSDC_TYPE),
        getUserDusdcBalance(account.address),
      ]);
      if (cancelled) return;
      if (m.status === "fulfilled") setManagerDusdc(m.value);
      if (w.status === "fulfilled") setWalletDusdc(w.value);
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [account, selectedManagerId, reloadKey]);

  const handleCreate = () => {
    setError(null);
    signAndExecute(
      { transaction: buildCreateManager() },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest });
          setReloadKey((k) => k + 1);
          onMutate?.();
        },
        onError: (err: Error) => setError(err.message),
      },
    );
  };

  const handleFund = async () => {
    setError(null);
    setLastDigest(null);
    if (!account || !selectedManagerId) return;
    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("amount must be > 0");
      return;
    }
    const amountRaw = BigInt(Math.round(amount * 1_000_000));

    try {
      if (fundMode === "deposit") {
        const coins = await suiClient.getCoins({
          owner: account.address,
          coinType: DUSDC_TYPE,
        });
        if (coins.data.length === 0) {
          setError("no dUSDC in wallet");
          return;
        }
        const coin = coins.data.sort((a, b) =>
          Number(BigInt(b.balance) - BigInt(a.balance)),
        )[0];

        const tx = buildDepositToManager({
          managerId: selectedManagerId,
          coinObjectId: coin.coinObjectId,
          amountQuote: amountRaw,
          quoteAssetType: DUSDC_TYPE,
        });
        signAndExecute(
          { transaction: tx },
          {
            onSuccess: async (r) => {
              await suiClient.waitForTransaction({ digest: r.digest });
              setLastDigest(r.digest);
              setReloadKey((k) => k + 1);
          onMutate?.();
            },
            onError: (e: Error) => setError(e.message),
          },
        );
      } else {
        const tx = buildWithdrawFromManager({
          sender: account.address,
          managerId: selectedManagerId,
          amountQuote: amountRaw,
          quoteAssetType: DUSDC_TYPE,
        });
        signAndExecute(
          { transaction: tx },
          {
            onSuccess: async (r) => {
              await suiClient.waitForTransaction({ digest: r.digest });
              setLastDigest(r.digest);
              setReloadKey((k) => k + 1);
          onMutate?.();
            },
            onError: (e: Error) => setError(e.message),
          },
        );
      }
    } catch (e: any) {
      setError(e.message);
    }
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
  const sourceBalance = fundMode === "deposit" ? walletDusdc : managerDusdc;
  const overBalance = parseFloat(fundAmount) > sourceBalance;

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

          {/* Balance summary */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-bg-soft p-2.5">
              <div className="text-[10px] uppercase tracking-widest text-text-faint">
                Manager dUSDC
              </div>
              <div className="mt-0.5 font-mono text-sm tabular-nums text-text">
                ${managerDusdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="font-mono text-[10px] text-text-faint">
                spent on mints
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-soft p-2.5">
              <div className="text-[10px] uppercase tracking-widest text-text-faint">
                Wallet dUSDC
              </div>
              <div className="mt-0.5 font-mono text-sm tabular-nums text-text">
                ${walletDusdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="font-mono text-[10px] text-text-faint">
                free / for LP
              </div>
            </div>
          </div>

          {/* Deposit / withdraw form */}
          <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-text-faint">
                Fund manager
              </span>
              <div className="inline-flex rounded-md bg-card p-0.5">
                <FundTab
                  active={fundMode === "deposit"}
                  onClick={() => {
                    setFundMode("deposit");
                    setError(null);
                  }}
                  label="Deposit"
                />
                <FundTab
                  active={fundMode === "withdraw"}
                  onClick={() => {
                    setFundMode("withdraw");
                    setError(null);
                  }}
                  label="Withdraw"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                value={fundAmount}
                step={10}
                min={0}
                onChange={(e) => setFundAmount(e.target.value)}
                className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text focus:border-accent-2"
              />
              <button
                onClick={handleFund}
                disabled={isPending || overBalance || !fundAmount}
                className="rounded-md bg-gradient-to-r from-accent to-accent-2 px-3 py-1.5 text-[11px] font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending
                  ? fundMode === "deposit" ? "depositing…" : "withdrawing…"
                  : fundMode === "deposit" ? "deposit" : "withdraw"}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-text-faint">
              <span>
                {fundMode === "deposit" ? "from wallet" : "from manager"} →{" "}
                {fundMode === "deposit" ? "into manager" : "into wallet"}
              </span>
              <button
                type="button"
                onClick={() => setFundAmount(sourceBalance.toFixed(2))}
                className="cursor-pointer rounded border border-accent/40 bg-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent transition-colors hover:border-accent hover:bg-accent/15 hover:text-accent-hover active:scale-[0.97]"
              >
                MAX · ${sourceBalance.toFixed(2)}
              </button>
            </div>
            {overBalance && (
              <div className="mt-1 font-mono text-[10px] text-danger">
                exceeds source balance
              </div>
            )}
          </div>

          {lastDigest && (
            <div className="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 font-mono text-[10px] text-success break-all">
              ✓ tx:{" "}
              <a
                href={`https://suiscan.xyz/testnet/tx/${lastDigest}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {lastDigest.slice(0, 16)}…
              </a>
            </div>
          )}

          {/* Multi-manager switcher lives in AppHeader. */}
        </>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger break-all">
          {error}
        </div>
      )}
    </div>
  );
}

function FundTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition ${
        active ? "bg-bg-soft text-text" : "text-text-dim hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}
