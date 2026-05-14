// GMX oracle keeper — public unauth'd candle + 24h price feed.
// Endpoints discovered from gmx-interface/sdk/src/configs/oracleKeeper.ts +
// gmx-interface/src/lib/oracleKeeperFetcher/oracleKeeperFetcher.ts.

const BASE = "https://arbitrum-api.gmxinfra.io";

export type Period = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
};

type CandlesResponse = {
  period: Period;
  candles: [number, number, number, number, number][];
};

export type DayPrice = {
  tokenSymbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export async function fetchCandles(
  tokenSymbol: string,
  period: Period,
  limit: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const url = `${BASE}/prices/candles?tokenSymbol=${encodeURIComponent(tokenSymbol)}&period=${period}&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`candles ${res.status}`);
  const json: CandlesResponse = await res.json();
  return json.candles.map(([t, o, h, l, c]) => ({ time: t, open: o, high: h, low: l, close: c }));
}

export async function fetch24h(signal?: AbortSignal): Promise<DayPrice[]> {
  const res = await fetch(`${BASE}/prices/24h`, { signal });
  if (!res.ok) throw new Error(`24h ${res.status}`);
  return await res.json();
}

export async function fetch24hForSymbol(
  tokenSymbol: string,
  signal?: AbortSignal,
): Promise<DayPrice | null> {
  const all = await fetch24h(signal);
  return all.find((r) => r.tokenSymbol === tokenSymbol) ?? null;
}
