// SVI (Stochastic Volatility Inspired) parameterization.
// Total variance: w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2))
// where k = log-moneyness = log(strike / forward)
// Implied vol: iv(k) = sqrt(w(k) / T)

export type SviParams = {
  a: number; // overall variance level
  b: number; // wing slope
  rho: number; // skew (negative = puts more expensive)
  m: number; // horizontal shift
  sigma: number; // ATM curvature
};

const BASE_PARAMS: SviParams = {
  a: 0.04,
  b: 0.4,
  rho: -0.3,
  m: 0,
  sigma: 0.1,
};

export function totalVariance(k: number, p: SviParams): number {
  const dx = k - p.m;
  return p.a + p.b * (p.rho * dx + Math.sqrt(dx * dx + p.sigma * p.sigma));
}

export function impliedVol(k: number, p: SviParams, T: number): number {
  const w = Math.max(0, totalVariance(k, p));
  return Math.sqrt(w / T);
}

// Sample the smile across log-moneyness range.
export function sampleSmile(
  p: SviParams,
  T: number,
  n: number,
  kMin = -0.5,
  kMax = 0.5,
): { k: number; iv: number }[] {
  const out: { k: number; iv: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = kMin + ((kMax - kMin) * i) / (n - 1);
    out.push({ k, iv: impliedVol(k, p, T) });
  }
  return out;
}

// Step the params with a small random walk so each sample looks "alive."
// Bounded around BASE_PARAMS so the smile doesn't drift off the chart.
export function evolveParams(p: SviParams, drift: number = 1): SviParams {
  const j = (range: number) => (Math.random() - 0.5) * range * drift;
  const next: SviParams = {
    a: clamp(p.a + j(0.0008), 0.02, 0.08),
    b: clamp(p.b + j(0.01), 0.3, 0.55),
    rho: clamp(p.rho + j(0.015), -0.55, -0.05),
    m: clamp(p.m + j(0.008), -0.05, 0.05),
    sigma: clamp(p.sigma + j(0.005), 0.06, 0.16),
  };
  return next;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function initialParams(): SviParams {
  return { ...BASE_PARAMS };
}

// Standard-normal CDF via Abramowitz & Stegun approximation. ~1e-7 accurate.
function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

// Binary option fair price under Black-Scholes-with-SVI-smile.
// Pays $1 if (isUp && S_T > K) or (!isUp && S_T < K) at expiry.
// Uses log-moneyness k = ln(K / F) to pick sigma from the smile.
export function binaryFairPrice(
  forward: number,
  strike: number,
  T: number,
  svi: SviParams,
  isUp: boolean,
): number {
  if (forward <= 0 || strike <= 0 || T <= 0) return 0.5;
  const k = Math.log(strike / forward);
  const sigma = impliedVol(k, svi, T);
  if (!isFinite(sigma) || sigma <= 0) return 0.5;
  const sqrtT = Math.sqrt(T);
  const d2 = (-k - 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const probUp = normCdf(d2);
  return isUp ? probUp : 1 - probUp;
}

// Vertical range fair price: pays $1 if S_T ∈ (L, H] at expiry, else $0.
// Equals P(S_T > L) − P(S_T > H) = binaryFairPrice(F, L, T, svi, up=true)
// − binaryFairPrice(F, H, T, svi, up=true). Each leg uses sigma at its own
// strike from the smile (so the formula respects skew, not a flat IV).
export function rangeFairPrice(
  forward: number,
  lowerStrike: number,
  higherStrike: number,
  T: number,
  svi: SviParams,
): number {
  if (lowerStrike >= higherStrike) return 0;
  const lower = binaryFairPrice(forward, lowerStrike, T, svi, true);
  const upper = binaryFairPrice(forward, higherStrike, T, svi, true);
  return Math.max(0, lower - upper);
}
