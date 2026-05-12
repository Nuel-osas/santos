import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { DUSDC_TYPE, PLP_TYPE } from "../lib/sui";
import { buildSupply, buildWithdraw } from "../lib/ptb";

type Mode = "supply" | "withdraw";

export function LPForm({
  userDusdc,
  userPlp,
  plpNav,
}: {
  userDusdc: number;
  userPlp: number;
  plpNav: number;
}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [mode, setMode] = useState<Mode>("supply");
  const [amountStr, setAmountStr] = useState<string>("10");
  const [error, setError] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  const amount = parseFloat(amountStr);
  const validAmount = !isNaN(amount) && amount > 0;
  const disabled = !account || !validAmount || isPending;

  const userBalance = mode === "supply" ? userDusdc : userPlp;
  const overBalance = validAmount && amount > userBalance;

  // Estimated outputs.
  const estSharesOut = mode === "supply" && plpNav > 0 ? amount / plpNav : 0;
  const estQuoteOut = mode === "withdraw" ? amount * plpNav : 0;

  const handleSubmit = async () => {
    setError(null);
    setLastDigest(null);
    if (!account || !validAmount) return;

    try {
      if (mode === "supply") {
        // Need a dUSDC coin to split from. Grab the user's largest coin.
        const coins = await suiClient.getCoins({
          owner: account.address,
          coinType: DUSDC_TYPE,
        });
        if (coins.data.length === 0) {
          setError("No dUSDC coins in wallet. Get test dUSDC from DeepBook Discord first.");
          return;
        }
        const coin = coins.data.sort((a, b) =>
          Number(BigInt(b.balance) - BigInt(a.balance)),
        )[0];

        const tx = buildSupply({
          sender: account.address,
          coinObjectId: coin.coinObjectId,
          amountQuote: BigInt(Math.round(amount * 1_000_000)), // 6 decimals
          quoteAssetType: DUSDC_TYPE,
        });

        signAndExecute(
          { transaction: tx },
          {
            onSuccess: async (r) => {
              await suiClient.waitForTransaction({ digest: r.digest });
              setLastDigest(r.digest);
            },
            onError: (e: Error) => setError(e.message),
          },
        );
      } else {
        // Withdraw: need a PLP coin.
        const coins = await suiClient.getCoins({
          owner: account.address,
          coinType: PLP_TYPE,
        });
        if (coins.data.length === 0) {
          setError("No PLP coins in wallet. Supply first to receive PLP shares.");
          return;
        }
        const coin = coins.data.sort((a, b) =>
          Number(BigInt(b.balance) - BigInt(a.balance)),
        )[0];

        const tx = buildWithdraw({
          sender: account.address,
          plpCoinObjectId: coin.coinObjectId,
          amountPlp: BigInt(Math.round(amount * 1_000_000)), // PLP is 6 decimals
          quoteAssetType: DUSDC_TYPE,
        });

        signAndExecute(
          { transaction: tx },
          {
            onSuccess: async (r) => {
              await suiClient.waitForTransaction({ digest: r.digest });
              setLastDigest(r.digest);
            },
            onError: (e: Error) => setError(e.message),
          },
        );
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="kicker">Liquidity</div>
        <div className="inline-flex rounded-lg bg-bg-soft p-1">
          <ModeTab
            active={mode === "supply"}
            onClick={() => {
              setMode("supply");
              setError(null);
              setLastDigest(null);
            }}
            label="Supply"
          />
          <ModeTab
            active={mode === "withdraw"}
            onClick={() => {
              setMode("withdraw");
              setError(null);
              setLastDigest(null);
            }}
            label="Withdraw"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <Label>{mode === "supply" ? "dUSDC amount" : "PLP to burn"}</Label>
            <button
              onClick={() => setAmountStr(userBalance.toFixed(2))}
              className="font-mono text-[10px] text-text-faint hover:text-accent-2"
              type="button"
            >
              max:{" "}
              {userBalance.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </button>
          </div>
          <input
            type="number"
            value={amountStr}
            step={1}
            min={0}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-soft px-3 py-2 font-mono text-sm text-text focus:border-accent-2"
          />
          {overBalance && (
            <div className="mt-1 font-mono text-[10px] text-danger">
              exceeds your balance
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-bg-soft p-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-text-faint">You receive</span>
            <span className="font-mono tabular-nums text-text">
              {mode === "supply"
                ? `${estSharesOut.toFixed(4)} PLP`
                : `$${estQuoteOut.toFixed(2)} dUSDC`}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-xs">
            <span className="text-text-faint">At NAV</span>
            <span className="font-mono tabular-nums text-text-faint">
              ${plpNav.toFixed(4)}
            </span>
          </div>
          {mode === "withdraw" && (
            <div className="mt-2 border-t border-border pt-2 font-mono text-[10px] text-text-faint">
              capped at vault.available = balance − total_max_payout
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={disabled || overBalance}
          className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? mode === "supply"
              ? "supplying…"
              : "withdrawing…"
            : mode === "supply"
              ? "supply dUSDC → mint PLP"
              : "burn PLP → withdraw dUSDC"}
        </button>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger break-all">
            {error}
          </div>
        )}

        {lastDigest && (
          <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 font-mono text-[11px] text-success break-all">
            ✓ {mode === "supply" ? "supplied" : "withdrawn"} · tx:{" "}
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
      </div>
    </div>
  );
}

function ModeTab({
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
      className={`rounded-md px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition ${
        active ? "bg-card text-text" : "text-text-dim hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-widest text-text-faint">
      {children}
    </span>
  );
}
