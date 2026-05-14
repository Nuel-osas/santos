import { useEffect, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import type { Oracle } from "../lib/sui";
import { DUSDC_TYPE, getManagerQuoteBalance } from "../lib/sui";
import { buildMintBinary } from "../lib/ptb";
import { binaryFairPrice } from "../lib/svi";

// On-chain check: ask price must be in (0.05, 0.95). We use slightly tighter
// bounds client-side so a noisy fair-price calc doesn't push past the gate.
const FAIR_PRICE_MIN = 0.07;
const FAIR_PRICE_MAX = 0.93;

// Manager dUSDC must cover the ask + a buffer for spread + util adjustments
// the contract adds on top of fair. Empirically 15% covers it on testnet.
const MANAGER_BALANCE_BUFFER = 1.15;

const MANAGER_BAL_REFRESH_MS = 4000;

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

  const step = oracle.underlying.strikeStep;
  const defaultStrike = Math.round(oracle.spot / step) * step;
  const [strikeUsd, setStrikeUsd] = useState<number>(defaultStrike);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [qtyUsd, setQtyUsd] = useState<string>("10");
  const [error, setError] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  // Manager dUSDC — poll while form is open so we know if the user funds mid-flow.
  const [managerDusdc, setManagerDusdc] = useState<number | null>(null);
  useEffect(() => {
    if (!managerId) {
      setManagerDusdc(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const bal = await getManagerQuoteBalance(managerId, DUSDC_TYPE);
        if (!cancelled) setManagerDusdc(bal);
      } catch {
        // ignore — keep last value
      }
    };
    tick();
    const id = setInterval(tick, MANAGER_BAL_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [managerId]);

  // Time to expiry in years (Black-Scholes T).
  const T = Math.max(
    (oracle.expiry - Date.now()) / (1000 * 60 * 60 * 24 * 365.25),
    1 / (365.25 * 1440), // floor at ~1 minute to avoid div-by-zero
  );

  // Fair price using SVI smile vol at this strike.
  const fairPrice = binaryFairPrice(
    oracle.forward,
    strikeUsd,
    T,
    oracle.svi,
    direction === "up",
  );

  const qty = parseFloat(qtyUsd);
  const qtyValid = !isNaN(qty) && qty > 0;
  const estimatedCost = qtyValid ? qty * fairPrice : 0;
  const moneyness = (strikeUsd - oracle.spot) / oracle.spot;

  // Validation gates — each gives a specific reason the button is disabled.
  const reasons: string[] = [];
  if (!account) reasons.push("Connect wallet");
  if (!managerId) reasons.push("Create a PredictManager first");
  if (!qtyValid) reasons.push("Quantity must be > 0");
  if (strikeUsd <= 0) reasons.push("Strike must be > 0");
  if (managerId && managerDusdc != null && managerDusdc === 0)
    reasons.push("Manager has no dUSDC — fund it first");
  if (
    managerId &&
    managerDusdc != null &&
    managerDusdc > 0 &&
    qtyValid &&
    managerDusdc < estimatedCost * MANAGER_BALANCE_BUFFER
  )
    reasons.push(
      `Insufficient manager dUSDC — need ~$${(estimatedCost * MANAGER_BALANCE_BUFFER).toFixed(2)}, have $${managerDusdc.toFixed(2)}`,
    );
  if (fairPrice < FAIR_PRICE_MIN || fairPrice > FAIR_PRICE_MAX)
    reasons.push(
      `Strike too far from spot — fair price ${(fairPrice * 100).toFixed(1)}¢ is outside ${(FAIR_PRICE_MIN * 100).toFixed(0)}–${(FAIR_PRICE_MAX * 100).toFixed(0)}¢ band`,
    );

  const blocked = reasons.length > 0;
  const disabled = blocked || isPending;

  const handleSubmit = () => {
    if (blocked || !managerId) return;
    setError(null);
    setLastDigest(null);
    const strikeScaled = BigInt(Math.round(strikeUsd * 1_000_000_000));
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
            <span className={moneyness < 0 ? "text-success" : "text-danger"}>
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
            ~${estimatedCost.toFixed(2)}{" "}
            <span className="text-[10px] text-text-faint">
              ({(fairPrice * 100).toFixed(0)}¢ per $1)
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-text-faint">
            fair from SVI smile · contract adds spread + util²
          </div>
        </div>
      </div>

      {/* ─ Validation summary + submit ─ */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 font-mono text-[10px] text-text-faint">
          {blocked ? (
            <span className="text-warn">{reasons[0]}</span>
          ) : (
            <>
              ready · manager has $
              {managerDusdc?.toFixed(2) ?? "…"} · need ~$
              {(estimatedCost * MANAGER_BALANCE_BUFFER).toFixed(2)}
            </>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-accent-hover px-5 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
