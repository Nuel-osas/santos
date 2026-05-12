import { motion } from "motion/react";
import type { Oracle } from "../lib/sui";
import { STATUS_LABEL } from "../lib/sui";
import { sampleSmile } from "../lib/svi";

const W = 880;
const H = 320;
const PAD_X = 56;
const PAD_Y = 28;
const N_SAMPLES = 64;

const K_MIN = -0.5;
const K_MAX = 0.5;

const STATUS_COLOR: Record<number, string> = {
  0: "bg-text-faint",
  1: "bg-success",
  2: "bg-hot",
  3: "bg-text-dim",
};

function projX(k: number): number {
  return PAD_X + ((k - K_MIN) / (K_MAX - K_MIN)) * (W - PAD_X * 2);
}

function makeProjY(ivMin: number, ivMax: number) {
  return (iv: number) =>
    PAD_Y + (1 - (iv - ivMin) / (ivMax - ivMin)) * (H - PAD_Y * 2);
}

function pathFromSmile(points: { k: number; iv: number }[], projY: (iv: number) => number) {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${projX(p.k).toFixed(2)},${projY(p.iv).toFixed(2)}`)
    .join(" ");
}

function areaFromSmile(points: { k: number; iv: number }[], projY: (iv: number) => number) {
  const line = pathFromSmile(points, projY);
  const last = points[points.length - 1];
  const first = points[0];
  const baseY = (H - PAD_Y).toFixed(2);
  return `${line} L ${projX(last.k).toFixed(2)},${baseY} L ${projX(first.k).toFixed(2)},${baseY} Z`;
}

function niceTicks(min: number, max: number, count: number): number[] {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export function VolSurfaceChart({
  oracle,
  T,
  refreshMs,
}: {
  oracle: Oracle;
  T: number;
  refreshMs: number;
}) {
  const smile = sampleSmile(oracle.svi, T, N_SAMPLES, K_MIN, K_MAX);
  const ivs = smile.map((p) => p.iv);
  const minIv = Math.max(0, Math.min(...ivs));
  const maxIv = Math.max(...ivs);
  const range = maxIv - minIv;
  const padIv = Math.max(range * 0.15, 0.01);
  const ivMin = Math.max(0, minIv - padIv);
  const ivMax = maxIv + padIv;

  const projY = makeProjY(ivMin, ivMax);
  const line = pathFromSmile(smile, projY);
  const area = areaFromSmile(smile, projY);

  const atm = smile.reduce((best, p) => (Math.abs(p.k) < Math.abs(best.k) ? p : best));

  const yTicks = niceTicks(ivMin, ivMax, 4);
  const xTicks = [-0.4, -0.2, 0, 0.2, 0.4];

  const minutesToExpiry = Math.max(0, Math.round((oracle.expiry - Date.now()) / 60000));
  const expiryLabel =
    minutesToExpiry < 60
      ? `${minutesToExpiry}m`
      : minutesToExpiry < 60 * 24
        ? `${Math.floor(minutesToExpiry / 60)}h ${minutesToExpiry % 60}m`
        : `${Math.floor(minutesToExpiry / 60 / 24)}d ${Math.floor((minutesToExpiry % (60 * 24)) / 60)}h`;
  const ageSec = Math.max(0, Math.round((Date.now() - oracle.timestamp) / 1000));

  return (
    <div className="rounded-2xl border border-border bg-card">
      {/* Hero header — big numbers, editorial spacing */}
      <div className="grid grid-cols-2 gap-6 border-b border-border p-6 sm:grid-cols-4">
        <Hero
          kicker={oracle.underlying.symbol}
          value={`$${oracle.spot.toLocaleString(undefined, { maximumFractionDigits: oracle.underlying.priceDecimals })}`}
          hint={`fwd $${oracle.forward.toLocaleString(undefined, { maximumFractionDigits: oracle.underlying.priceDecimals })}`}
        />
        <Hero
          kicker="ATM iv"
          value={`${(atm.iv * 100).toFixed(1)}%`}
          hint={`${(ivMin * 100).toFixed(0)}–${(ivMax * 100).toFixed(0)}% range`}
        />
        <Hero
          kicker="Expires in"
          value={expiryLabel}
          hint={`${new Date(oracle.expiry).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
        />
        <Hero
          kicker="Status"
          value={
            <span className="inline-flex items-baseline gap-2">
              <span className={`size-2 rounded-full ${STATUS_COLOR[oracle.status]} self-center`} />
              <span>{STATUS_LABEL[oracle.status]}</span>
            </span>
          }
          hint={`updated ${ageSec}s ago`}
        />
      </div>

      <div className="p-6">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="none"
          style={{ height: H }}
        >
          <defs>
            <linearGradient id="smile-fill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(127, 164, 212)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="rgb(127, 164, 212)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((iv) => (
            <g key={iv}>
              <line
                x1={PAD_X}
                y1={projY(iv)}
                x2={W - PAD_X}
                y2={projY(iv)}
                stroke="var(--color-border)"
                strokeWidth={0.5}
                strokeDasharray="2 4"
              />
              <text
                x={PAD_X - 8}
                y={projY(iv) + 3}
                textAnchor="end"
                fontFamily='"JetBrains Mono", monospace'
                fontSize="10"
                fill="var(--color-text-faint)"
              >
                {(iv * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {xTicks.map((k) => (
            <g key={k}>
              <line
                x1={projX(k)}
                y1={H - PAD_Y}
                x2={projX(k)}
                y2={H - PAD_Y + 4}
                stroke="var(--color-border)"
              />
              <text
                x={projX(k)}
                y={H - PAD_Y + 16}
                textAnchor="middle"
                fontFamily='"JetBrains Mono", monospace'
                fontSize="10"
                fill="var(--color-text-faint)"
              >
                {k === 0 ? "ATM" : `${k > 0 ? "+" : ""}${(k * 100).toFixed(0)}%`}
              </text>
            </g>
          ))}

          <line
            x1={projX(0)}
            y1={PAD_Y}
            x2={projX(0)}
            y2={H - PAD_Y}
            stroke="var(--color-border)"
            strokeWidth={0.5}
            strokeDasharray="2 4"
          />

          <motion.path d={area} fill="url(#smile-fill)" animate={{ d: area }} transition={{ duration: 0.5, ease: "linear" }} />
          <motion.path
            d={line}
            fill="none"
            stroke="var(--color-accent-2)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ d: line }}
            transition={{ duration: 0.5, ease: "linear" }}
          />
          <motion.circle
            cx={projX(atm.k)}
            cy={projY(atm.iv)}
            r={4.5}
            fill="var(--color-accent-2)"
            animate={{ cx: projX(atm.k), cy: projY(atm.iv) }}
            transition={{ duration: 0.5, ease: "linear" }}
          />
        </svg>
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-text-faint">
          <span>SVI smile · log-moneyness × implied vol</span>
          <span>poll {refreshMs}ms · oracle {oracle.id.slice(0, 8)}…{oracle.id.slice(-4)}</span>
        </div>
      </div>
    </div>
  );
}

function Hero({
  kicker,
  value,
  hint,
}: {
  kicker: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-text-faint">
        {kicker}
      </div>
      <div className="mt-1 font-mono text-2xl tabular-nums text-text">
        {value}
      </div>
      {hint && (
        <div className="mt-1 font-mono text-[10px] text-text-faint">{hint}</div>
      )}
    </div>
  );
}
