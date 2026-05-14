// Typed client for the public Predict indexer:
//   https://predict-server.testnet.mystenlabs.com
//
// This is the integration path Mysten recommends in
// `deepbookv3/packages/predict/README.md` over direct chain scans.
//
// Returns values are normalized to santos's existing types so the
// migration is a drop-in import swap, not a refactor wave.

import { resolveUnderlying, type OracleSummary, type Position, type VaultState } from "./sui";

const BASE = "https://predict-server.testnet.mystenlabs.com";

export const DEFAULT_PREDICT_ID =
  "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";

// Server scales — matching the chain conventions.
const PRICE_SCALE = 1e9; // strikes, spot, forward, ask/bid price, settlement_price
const QTY_SCALE = 1e6; // quantities, costs, payouts, balances (dUSDC has 6 decimals)

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`predict-server ${res.status} ${path}`);
  return (await res.json()) as T;
}

// ─── Oracles ──────────────────────────────────────────────────────────────

type ServerOracle = {
  predict_id: string;
  oracle_id: string;
  oracle_cap_id: string;
  underlying_asset: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  status: "active" | "pending" | "settled" | "inactive";
  activated_at: number | null;
  settlement_price: number | null;
  settled_at: number | null;
  created_checkpoint: number;
};

function mapOracle(o: ServerOracle): OracleSummary {
  const settlement_price =
    o.settlement_price != null ? o.settlement_price / PRICE_SCALE : null;
  // Map string status → santos's integer code so existing UI logic works.
  const statusCode =
    o.status === "settled"
      ? 3
      : o.status === "pending"
        ? 2
        : o.status === "active"
          ? 1
          : 0;
  return {
    id: o.oracle_id,
    underlying: resolveUnderlying(o.underlying_asset),
    expiry: o.expiry,
    timestamp: o.activated_at ?? 0,
    active: o.status === "active" || o.status === "pending",
    status: statusCode,
    settlement_price,
  };
}

/// Replaces `sui.listLiveOracles()`. One round trip vs N event scans.
export async function getOracleList(
  predictId: string = DEFAULT_PREDICT_ID,
  signal?: AbortSignal,
): Promise<OracleSummary[]> {
  const raw = await get<ServerOracle[]>(`/predicts/${predictId}/oracles`, signal);
  return raw.map(mapOracle);
}

// ─── Manager (positions + PnL) ────────────────────────────────────────────

type ServerManagerSummary = {
  manager_id: string;
  owner: string;
  balances: { quote_asset: string; balance: number }[];
  trading_balance: number;
  open_exposure: number;
  redeemable_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  account_value: number;
  open_positions: number;
  awaiting_settlement_positions: number;
};

export type ManagerSummary = {
  managerId: string;
  owner: string;
  tradingBalance: number; // dUSDC available + locked in trades
  openExposure: number; // sum of open position quantities (max payout at risk)
  realizedPnl: number; // sum across all redeemed positions
  unrealizedPnl: number; // mark-to-market on open positions
  accountValue: number; // tradingBalance + redeemableValue
  openPositions: number;
  awaitingSettlement: number;
};

export async function getManagerSummary(
  managerId: string,
  signal?: AbortSignal,
): Promise<ManagerSummary> {
  const r = await get<ServerManagerSummary>(`/managers/${managerId}/summary`, signal);
  return {
    managerId: r.manager_id,
    owner: r.owner,
    tradingBalance: r.trading_balance / QTY_SCALE,
    openExposure: r.open_exposure / QTY_SCALE,
    realizedPnl: r.realized_pnl / QTY_SCALE,
    unrealizedPnl: r.unrealized_pnl / QTY_SCALE,
    accountValue: r.account_value / QTY_SCALE,
    openPositions: r.open_positions,
    awaitingSettlement: r.awaiting_settlement_positions,
  };
}

type ServerPositionsEntry = {
  predict_id: string;
  manager_id: string;
  quote_asset: string;
  oracle_id: string;
  underlying_asset: string;
  expiry: number;
  strike: number;
  is_up: boolean;
  minted_quantity: number;
  redeemed_quantity: number;
  open_quantity: number;
  total_cost: number;
  total_payout: number;
  realized_pnl: number;
  unrealized_pnl: number;
  open_cost_basis: number;
  average_entry_price: number;
  average_exit_price: number;
  mark_price: number | null;
  mark_value: number | null;
  status: "redeemed" | "open" | "awaiting_settlement";
  first_minted_at: number;
  last_activity_at: number;
};

/// Server-aggregated position view. One row per (oracle, strike, is_up)
/// across the manager's lifetime — has both the open portion and the
/// historical activity rolled up.
export type ServerPosition = {
  oracleId: string;
  underlyingSymbol: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  mintedQty: number;
  redeemedQty: number;
  openQty: number;
  totalCost: number;
  totalPayout: number;
  realizedPnl: number;
  unrealizedPnl: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  markPrice: number | null;
  markValue: number | null;
  status: "redeemed" | "open" | "awaiting_settlement";
  firstMintedAt: number;
  lastActivityAt: number;
};

export async function getManagerPositions(
  managerId: string,
  signal?: AbortSignal,
): Promise<ServerPosition[]> {
  const raw = await get<ServerPositionsEntry[]>(
    `/managers/${managerId}/positions/summary`,
    signal,
  );
  return raw.map((p) => ({
    oracleId: p.oracle_id,
    underlyingSymbol: p.underlying_asset,
    expiry: p.expiry,
    strike: p.strike / PRICE_SCALE,
    isUp: p.is_up,
    mintedQty: p.minted_quantity / QTY_SCALE,
    redeemedQty: p.redeemed_quantity / QTY_SCALE,
    openQty: p.open_quantity / QTY_SCALE,
    totalCost: p.total_cost / QTY_SCALE,
    totalPayout: p.total_payout / QTY_SCALE,
    realizedPnl: p.realized_pnl / QTY_SCALE,
    unrealizedPnl: p.unrealized_pnl / QTY_SCALE,
    avgEntryPrice: p.average_entry_price / PRICE_SCALE,
    avgExitPrice: p.average_exit_price / PRICE_SCALE,
    markPrice: p.mark_price != null ? p.mark_price / PRICE_SCALE : null,
    markValue: p.mark_value != null ? p.mark_value / QTY_SCALE : null,
    status: p.status,
    firstMintedAt: p.first_minted_at,
    lastActivityAt: p.last_activity_at,
  }));
}

/// Convenience: derive santos's open-positions shape from the server view
/// (filter to positions with open_quantity > 0). Drop-in for getUserPositions.
export async function getOpenPositions(
  managerId: string,
  signal?: AbortSignal,
): Promise<Position[]> {
  const all = await getManagerPositions(managerId, signal);
  return all
    .filter((p) => p.openQty > 0)
    .map((p) => ({
      oracleId: p.oracleId,
      expiry: p.expiry,
      strike: p.strike,
      isUp: p.isUp,
      quantity: p.openQty,
    }))
    .sort((a, b) => a.expiry - b.expiry);
}

// ─── PnL time series ──────────────────────────────────────────────────────

type ServerPnlResponse = {
  manager_id: string;
  range: string;
  series_type: "realized_pnl";
  points: {
    timestamp_ms: number;
    realized_pnl: number;
    cumulative_realized_pnl: number;
  }[];
  current_unrealized_pnl: number;
  current_total_pnl: number;
};

export type PnlPoint = {
  timestampMs: number;
  realizedPnl: number; // P&L of this single redeem event
  cumulativeRealizedPnl: number; // running total at this point
};

export type PnlSeries = {
  range: string;
  points: PnlPoint[];
  currentUnrealizedPnl: number;
  currentTotalPnl: number;
};

export type PnlRange = "1D" | "1W" | "1M" | "3M" | "ALL";

export async function getManagerPnl(
  managerId: string,
  range: PnlRange = "ALL",
  signal?: AbortSignal,
): Promise<PnlSeries> {
  const r = await get<ServerPnlResponse>(
    `/managers/${managerId}/pnl?range=${range}`,
    signal,
  );
  return {
    range: r.range,
    points: r.points.map((p) => ({
      timestampMs: p.timestamp_ms,
      realizedPnl: p.realized_pnl / QTY_SCALE,
      cumulativeRealizedPnl: p.cumulative_realized_pnl / QTY_SCALE,
    })),
    currentUnrealizedPnl: r.current_unrealized_pnl / QTY_SCALE,
    currentTotalPnl: r.current_total_pnl / QTY_SCALE,
  };
}

// ─── Trade tape (per-oracle mint+redeem feed) ─────────────────────────────

type ServerTradeBase = {
  type: "mint" | "redeem";
  digest: string;
  checkpoint_timestamp_ms: number;
  manager_id: string;
  trader?: string; // present on mint
  owner?: string; // present on redeem
  oracle_id: string;
  expiry: number;
  quantity: number;
  quote_asset: string;
};

type ServerTrade =
  | (ServerTradeBase & {
      // binary mint
      type: "mint";
      strike: number;
      is_up: boolean;
      cost: number;
      ask_price: number;
    })
  | (ServerTradeBase & {
      // binary redeem
      type: "redeem";
      strike: number;
      is_up: boolean;
      payout: number;
      bid_price: number;
      is_settled: boolean;
    })
  | (ServerTradeBase & {
      // range mint
      type: "mint";
      lower_strike: number;
      higher_strike: number;
      cost: number;
      ask_price: number;
    })
  | (ServerTradeBase & {
      // range redeem
      type: "redeem";
      lower_strike: number;
      higher_strike: number;
      payout: number;
      bid_price: number;
      is_settled: boolean;
    });

export type TradeTapeEntry = {
  kind: "binary" | "range";
  side: "mint" | "redeem";
  timestampMs: number;
  txDigest: string;
  trader: string;
  // Binary fields
  strike?: number;
  isUp?: boolean;
  // Range fields
  lowerStrike?: number;
  higherStrike?: number;
  // Common
  quantity: number;
  // Side-specific
  cost?: number; // mint
  askPrice?: number; // mint
  payout?: number; // redeem
  bidPrice?: number; // redeem
  isSettled?: boolean; // redeem
};

export async function getOracleTrades(
  oracleId: string,
  limit: number = 50,
  signal?: AbortSignal,
): Promise<TradeTapeEntry[]> {
  const raw = await get<ServerTrade[]>(
    `/trades/${oracleId}?limit=${limit}`,
    signal,
  );
  return raw.map((r) => {
    const isRange = "lower_strike" in r;
    const base = {
      kind: (isRange ? "range" : "binary") as "binary" | "range",
      side: r.type,
      timestampMs: r.checkpoint_timestamp_ms,
      txDigest: r.digest,
      trader: (r as any).trader ?? (r as any).owner ?? "",
      quantity: r.quantity / QTY_SCALE,
    };
    if (isRange) {
      const rr = r as any;
      return {
        ...base,
        lowerStrike: rr.lower_strike / PRICE_SCALE,
        higherStrike: rr.higher_strike / PRICE_SCALE,
        ...(r.type === "mint"
          ? {
              cost: rr.cost / QTY_SCALE,
              askPrice: rr.ask_price / PRICE_SCALE,
            }
          : {
              payout: rr.payout / QTY_SCALE,
              bidPrice: rr.bid_price / PRICE_SCALE,
              isSettled: rr.is_settled,
            }),
      };
    } else {
      const rr = r as any;
      return {
        ...base,
        strike: rr.strike / PRICE_SCALE,
        isUp: rr.is_up,
        ...(r.type === "mint"
          ? {
              cost: rr.cost / QTY_SCALE,
              askPrice: rr.ask_price / PRICE_SCALE,
            }
          : {
              payout: rr.payout / QTY_SCALE,
              bidPrice: rr.bid_price / PRICE_SCALE,
              isSettled: rr.is_settled,
            }),
      };
    }
  });
}

// ─── Vault summary ────────────────────────────────────────────────────────

type ServerVaultSummary = {
  predict_id: string;
  quote_assets: string[];
  vault_balance: number;
  vault_value: number;
  total_mtm: number;
  total_max_payout: number;
  available_liquidity: number;
  available_withdrawal: number;
  plp_total_supply: number;
  plp_share_price: number; // already a float, not scaled
  utilization: number; // 0..1 float
  max_payout_utilization: number;
  net_deposits: number;
  total_supplied: number;
  total_withdrawn: number;
};

export async function getVaultSummary(
  predictId: string = DEFAULT_PREDICT_ID,
  signal?: AbortSignal,
): Promise<VaultState> {
  const r = await get<ServerVaultSummary>(
    `/predicts/${predictId}/vault/summary`,
    signal,
  );
  return {
    balance: r.vault_balance / QTY_SCALE,
    totalMtm: r.total_mtm / QTY_SCALE,
    totalMaxPayout: r.total_max_payout / QTY_SCALE,
    available: r.available_withdrawal / QTY_SCALE,
    vaultValue: r.vault_value / QTY_SCALE,
    plpTotalSupply: r.plp_total_supply / QTY_SCALE,
    plpNav: r.plp_share_price,
  };
}
