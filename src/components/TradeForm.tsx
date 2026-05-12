import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import type { Oracle } from "../lib/sui";
import { DUSDC_TYPE } from "../lib/sui";
import { buildMintBinary } from "../lib/ptb";

export function TradeForm({
  oracle,
  managerId,
}: {
  oracle: Oracle;
  managerId: string | null;
}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  // Default strike near spot, snapped to the underlying's strike step.
  const step = oracle.underlying.strikeStep;
  const defaultStrike = Math.round(oracle.spot / step) * step;
  const [strikeUsd, setStrikeUsd] = useState<number>(defaultStrike);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [qtyUsd, setQtyUsd] = useState<string>("10");
  const [error, setError] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    setLastDigest(null);
    if (!managerId) {
      setError("Create a PredictManager first.");
      return;
    }
    const qty = parseFloat(qtyUsd);
    if (isNaN(qty) || qty <= 0) {
      setError("Quantity must be > 0");
      return;
    }
    const strikeScaled = BigInt(Math.round(strikeUsd * 1_000_000_000));
    // Quantity is in dUSDC raw units. dUSDC has 6 decimals.
    const qtyScaled = BigInt(Math.round(qty * 1_000_000));

    const tx = buildMintBinary({
      managerId,
      oracleId: oracle.id,
      expiry: BigInt(oracle.expiry),
      strike: strikeScaled,
      isUp: direction === "up",
      quantity: qtyScaled,
      quoteAssetType: DUSDC_TYPE,
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest });
          setLastDigest(result.digest);
        },
        onError: (err: Error) => {
          setError(err.message);
        },
      },
    );
  };

  // Estimate cost from strike vs spot — very rough, just for UI feel.
  // Real ask comes from get_trade_amounts on-chain.
  const moneyness = (strikeUsd - oracle.spot) / oracle.spot;
  const naivePay =
    direction === "up"
      ? Math.max(0.05, 0.5 - moneyness * 1.5)
      : Math.max(0.05, 0.5 + moneyness * 1.5);
  const naiveCost = parseFloat(qtyUsd) * Math.min(naivePay, 0.95);

  const disabled = !account || !managerId || isPending;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="kicker">Mint binary position</div>
        <span className="font-mono text-[10px] text-text-faint">
          {oracle.underlying.symbol} · {oracle.id.slice(0, 8)}…
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Direction</Label>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-bg-soft p-1">
            <button
              onClick={() => setDirection("up")}
              className={`rounded-md py-2 font-mono text-xs uppercase tracking-wider transition ${
                direction === "up"
                  ? "bg-success/20 text-success shadow-[0_0_0_1px_var(--color-success)_inset]"
                  : "text-text-dim hover:text-text"
              }`}
            >
              ↑ UP
            </button>
            <button
              onClick={() => setDirection("down")}
              className={`rounded-md py-2 font-mono text-xs uppercase tracking-wider transition ${
                direction === "down"
                  ? "bg-danger/20 text-danger shadow-[0_0_0_1px_var(--color-danger)_inset]"
                  : "text-text-dim hover:text-text"
              }`}
            >
              ↓ DOWN
            </button>
          </div>
        </div>

        <div>
          <Label>Strike (USD)</Label>
          <input
            type="number"
            value={strikeUsd}
            step={step / 2}
            onChange={(e) => setStrikeUsd(parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-border bg-bg-soft px-3 py-2 font-mono text-sm text-text focus:border-accent-2"
          />
          <div className="mt-1 font-mono text-[10px] text-text-faint">
            spot ${oracle.spot.toFixed(oracle.underlying.priceDecimals)} ·{" "}
            <span
              className={moneyness < 0 ? "text-success" : "text-danger"}
            >
              {moneyness > 0 ? "+" : ""}
              {(moneyness * 100).toFixed(2)}% from spot
            </span>
          </div>
        </div>

        <div>
          <Label>Quantity (dUSDC)</Label>
          <input
            type="number"
            value={qtyUsd}
            step={1}
            min={1}
            onChange={(e) => setQtyUsd(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-soft px-3 py-2 font-mono text-sm text-text focus:border-accent-2"
          />
          <div className="mt-1 font-mono text-[10px] text-text-faint">
            payout if correct = ${qtyUsd}
          </div>
        </div>

        <div>
          <Label>Estimated cost</Label>
          <div className="rounded-lg border border-border bg-bg-soft px-3 py-2 font-mono text-sm tabular-nums text-text">
            ~${naiveCost.toFixed(2)}{" "}
            <span className="text-[10px] text-text-faint">
              ({(naivePay * 100).toFixed(0)}¢ per $1)
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-text-faint">
            real ask = oracle + spread + util² (computed on-chain)
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] text-text-faint">
          {!account
            ? "connect wallet to mint"
            : !managerId
              ? "create a PredictManager first"
              : "ready to mint — needs dUSDC in your manager"}
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "minting…" : "mint position"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger break-all">
          {error}
        </div>
      )}

      {lastDigest && (
        <div className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 font-mono text-[11px] text-success break-all">
          ✓ minted · tx:{" "}
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
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] uppercase tracking-widest text-text-faint">
      {children}
    </div>
  );
}
