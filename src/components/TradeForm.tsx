import { useEffect, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import type { Oracle } from "../lib/sui";
import { DUSDC_TYPE, getManagerQuoteBalance } from "../lib/sui";
import { buildMintBinary, buildMintRange } from "../lib/ptb";
import { binaryFairPrice, rangeFairPrice } from "../lib/svi";

// On-chain check: ask price must be in (0.05, 0.95). Tighter client-side
// bounds so a noisy fair-price calc doesn't push past the gate.
const FAIR_PRICE_MIN = 0.07;
const FAIR_PRICE_MAX = 0.93;
const MANAGER_BALANCE_BUFFER = 1.15;
const MANAGER_BAL_REFRESH_MS = 4000;

type Mode = "binary" | "range";

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

  const [mode, setMode] = useState<Mode>("binary");
  const [strikeUsd, setStrikeUsd] = useState<number>(defaultStrike);
  const [direction, setDirection] = useState<"up" | "down">("up");
  // Range strikes default to ±5 steps around spot.
  const [lowerStrike, setLowerStrike] = useState<number>(defaultStrike - 5 * step);
  const [upperStrike, setUpperStrike] = useState<number>(defaultStrike + 5 * step);
  const [qtyUsd, setQtyUsd] = useState<string>("10");
  const [error, setError] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  // Manager dUSDC — poll while form is open.
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
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, MANAGER_BAL_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [managerId]);

  // Time-to-expiry in years (Black-Scholes T).
  const T = Math.max(
    (oracle.expiry - Date.now()) / (1000 * 60 * 60 * 24 * 365.25),
    1 / (365.25 * 1440),
  );

  // Fair price differs by mode.
  const fairPrice =
    mode === "binary"
      ? binaryFairPrice(oracle.forward, strikeUsd, T, oracle.svi, direction === "up")
      : rangeFairPrice(oracle.forward, lowerStrike, upperStrike, T, oracle.svi);

  const qty = parseFloat(qtyUsd);
  const qtyValid = !isNaN(qty) && qty > 0;
  const estimatedCost = qtyValid ? qty * fairPrice : 0;
  const moneyness = (strikeUsd - oracle.spot) / oracle.spot;

  // Validation
  const reasons: string[] = [];
  if (oracle.status === 3)
    reasons.push("Market has settled — read-only. Pick a live expiry to trade.");
  else if (oracle.status === 2)
    reasons.push("Market expired, awaiting settlement — can't mint here.");
  if (!account) reasons.push("Connect wallet");
  if (!managerId) reasons.push("Create a PredictManager first");
  if (!qtyValid) reasons.push("Quantity must be > 0");

  if (mode === "binary") {
    if (strikeUsd <= 0) reasons.push("Strike must be > 0");
  } else {
    if (lowerStrike <= 0) reasons.push("Lower strike must be > 0");
    if (upperStrike <= 0) reasons.push("Upper strike must be > 0");
    if (lowerStrike >= upperStrike)
      reasons.push("Lower strike must be below upper strike");
  }

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
      mode === "binary"
        ? `Strike too far from spot — fair ${(fairPrice * 100).toFixed(1)}¢ outside ${(FAIR_PRICE_MIN * 100).toFixed(0)}–${(FAIR_PRICE_MAX * 100).toFixed(0)}¢ band`
        : `Range too ${fairPrice < FAIR_PRICE_MIN ? "narrow / far from spot" : "wide"} — fair ${(fairPrice * 100).toFixed(1)}¢ outside ${(FAIR_PRICE_MIN * 100).toFixed(0)}–${(FAIR_PRICE_MAX * 100).toFixed(0)}¢ band`,
    );

  const blocked = reasons.length > 0;
  const disabled = blocked || isPending;

  const handleSubmit = () => {
    if (blocked || !managerId) return;
    setError(null);
    setLastDigest(null);
    const qtyScaled = BigInt(Math.round(qty * 1_000_000));

    const tx =
      mode === "binary"
        ? buildMintBinary({
            managerId,
            oracleId: oracle.id,
            expiry: BigInt(oracle.expiry),
            strike: BigInt(Math.round(strikeUsd * 1_000_000_000)),
            isUp: direction === "up",
            quantity: qtyScaled,
            quoteAssetType: DUSDC_TYPE,
          })
        : buildMintRange({
            managerId,
            oracleId: oracle.id,
            expiry: BigInt(oracle.expiry),
            lowerStrike: BigInt(Math.round(lowerStrike * 1_000_000_000)),
            higherStrike: BigInt(Math.round(upperStrike * 1_000_000_000)),
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
        <div className="kicker">
          Mint {mode === "binary" ? "binary" : "range"} position
        </div>
        <span className="font-mono text-[10px] text-text-faint">
          {oracle.underlying.symbol} · {oracle.id.slice(0, 8)}…
        </span>
      </div>

      {/* ─ Mode toggle ─ */}
      <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-lg bg-bg-soft p-1">
        <ModeBtn
          label="Binary (↑↓)"
          active={mode === "binary"}
          onClick={() => setMode("binary")}
        />
        <ModeBtn
          label="Range (lo–hi)"
          active={mode === "range"}
          onClick={() => setMode("range")}
        />
      </div>

      {mode === "binary" ? (
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

          <Qty qtyUsd={qtyUsd} setQtyUsd={setQtyUsd} />
          <CostCell estimatedCost={estimatedCost} fairPrice={fairPrice} mode={mode} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Lower strike (USD)</Label>
            <input
              type="number"
              value={lowerStrike}
              step={step / 2}
              onChange={(e) => setLowerStrike(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-border bg-bg-soft px-3 py-2 font-mono text-sm text-text focus:border-accent-2"
            />
            <div className="mt-1 font-mono text-[10px] text-text-faint">
              {((lowerStrike - oracle.spot) / oracle.spot * 100).toFixed(2)}% vs spot
            </div>
          </div>
          <div>
            <Label>Upper strike (USD)</Label>
            <input
              type="number"
              value={upperStrike}
              step={step / 2}
              onChange={(e) => setUpperStrike(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-border bg-bg-soft px-3 py-2 font-mono text-sm text-text focus:border-accent-2"
            />
            <div className="mt-1 font-mono text-[10px] text-text-faint">
              {((upperStrike - oracle.spot) / oracle.spot * 100).toFixed(2)}% vs spot
            </div>
          </div>

          <Qty qtyUsd={qtyUsd} setQtyUsd={setQtyUsd} />
          <CostCell
            estimatedCost={estimatedCost}
            fairPrice={fairPrice}
            mode={mode}
          />
        </div>
      )}

      {/* ─ Validation + submit ─ */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 font-mono text-[10px] text-text-faint">
          {blocked ? (
            <span className="text-warn">{reasons[0]}</span>
          ) : (
            <>
              ready · pays $
              {qtyValid ? qty.toFixed(2) : "—"} if{" "}
              {mode === "binary"
                ? direction === "up"
                  ? "above strike"
                  : "below strike"
                : "in range"}
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

function ModeBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
        active
          ? "bg-card text-text shadow-[0_0_0_1px_var(--color-border)_inset]"
          : "text-text-dim hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

function Qty({
  qtyUsd,
  setQtyUsd,
}: {
  qtyUsd: string;
  setQtyUsd: (v: string) => void;
}) {
  return (
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
        max payout = ${qtyUsd}
      </div>
    </div>
  );
}

function CostCell({
  estimatedCost,
  fairPrice,
  mode,
}: {
  estimatedCost: number;
  fairPrice: number;
  mode: Mode;
}) {
  return (
    <div>
      <Label>Estimated cost</Label>
      <div className="flex items-baseline justify-between gap-2 rounded-lg border border-border bg-bg-soft px-3 py-2 font-mono">
        <span className="text-sm tabular-nums text-text">
          ~${estimatedCost.toFixed(2)}
        </span>
        <span className="whitespace-nowrap text-[10px] text-text-faint">
          {(fairPrice * 100).toFixed(0)}¢/$1
        </span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-text-faint">
        {mode === "binary"
          ? "fair from SVI smile · contract adds spread"
          : "P(spot in range) from SVI · contract adds spread"}
      </div>
    </div>
  );
}
