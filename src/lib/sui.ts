import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { SviParams } from "./svi";

export const PREDICT_PKG =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
export const PREDICT_OBJ =
  "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
export const REGISTRY_OBJ =
  "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64";

export const TESTNET_RPC = "https://fullnode.testnet.sui.io";

// Float scaling used across Predict (1e9). Implied vols, prices, spread params, strikes.
export const FLOAT_SCALING = 1_000_000_000n;
// dUSDC has 6 decimals; PLP also 6.
export const QUOTE_DECIMALS = 6n;
export const PLP_DECIMALS = 6;

export const DUSDC_TYPE =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";
export const PLP_TYPE = `${PREDICT_PKG}::plp::PLP`;

export const PREDICT_MANAGER_TYPE = `${PREDICT_PKG}::predict_manager::PredictManager`;

export const client = new SuiJsonRpcClient({ url: TESTNET_RPC, network: "testnet" });

// === Types ===

type RawI64 = { fields: { magnitude: string; is_negative: boolean } } | string;

/// Static facts about an underlying asset (BTC, ETH, etc.).
/// The strike step + decimals make trade UIs scale across underlyings without
/// hardcoding "round to $1000" everywhere.
export type Underlying = {
  symbol: string; // "BTC", "ETH", ...
  strikeStep: number; // typical strike grid spacing in USD
  priceDecimals: number; // display precision for spot/forward
  strikeDecimals: number; // display precision for strike inputs
};

const KNOWN_UNDERLYINGS: Record<string, Underlying> = {
  BTC: { symbol: "BTC", strikeStep: 1000, priceDecimals: 0, strikeDecimals: 0 },
  ETH: { symbol: "ETH", strikeStep: 50, priceDecimals: 2, strikeDecimals: 0 },
  SOL: { symbol: "SOL", strikeStep: 5, priceDecimals: 2, strikeDecimals: 2 },
  SUI: { symbol: "SUI", strikeStep: 0.1, priceDecimals: 3, strikeDecimals: 3 },
};

export function resolveUnderlying(symbol: string): Underlying {
  return (
    KNOWN_UNDERLYINGS[symbol] ?? {
      symbol,
      strikeStep: 1,
      priceDecimals: 2,
      strikeDecimals: 2,
    }
  );
}

/// One Predict oracle: an (underlying, expiry) state with SVI surface + spot/forward.
export type Oracle = {
  id: string;
  underlying: Underlying;
  expiry: number; // ms epoch
  active: boolean;
  status: number; // 0..3
  spot: number;
  forward: number;
  svi: SviParams;
  timestamp: number;
  settlement_price: number | null;
};

/// Picker entry — enough metadata to sort, label, and style without re-reading
/// the full object. Status is derived the same way as Oracle so the picker
/// and detail panel agree.
export type OracleSummary = {
  id: string;
  underlying: Underlying;
  expiry: number;
  timestamp: number;
  status: number; // 0=Inactive, 1=Active, 2=Pending, 3=Settled
  active: boolean;
  settlement_price: number | null;
};

/// Vault state for the LP panel.
export type VaultState = {
  balance: number; // total quote in vault (USD)
  totalMtm: number; // current liability
  vaultValue: number; // balance - totalMtm
  totalMaxPayout: number; // worst-case payout reservation
  available: number; // max LPs can withdraw = balance - totalMaxPayout
  plpTotalSupply: number; // outstanding PLP shares
  plpNav: number; // vaultValue / plpTotalSupply (1 by default at bootstrap)
};

export type ManagerSummary = {
  id: string;
  owner: string;
  positionCount: number;
  rangeCount: number;
};

// === Helpers ===

function f(scaled: string | number | bigint): number {
  return Number(BigInt(scaled.toString())) / Number(FLOAT_SCALING);
}

function readI64(v: RawI64): number {
  if (typeof v === "string") return Number(v) / Number(FLOAT_SCALING);
  const value = Number(BigInt(v.fields.magnitude)) / Number(FLOAT_SCALING);
  return v.fields.is_negative ? -value : value;
}

function fromQuoteUnits(raw: string | number | bigint): number {
  // Quote (dUSDC) uses 6 decimals — different from FLOAT_SCALING.
  return Number(BigInt(raw.toString())) / 1_000_000;
}

function deriveStatus(
  active: boolean,
  expiry: number,
  settlement: number | null,
): number {
  if (settlement != null) return 3;
  const now = Date.now();
  if (!active) return 0;
  if (now < expiry) return 1;
  return 2;
}

function parseOracle(id: string, fields: any): Oracle | null {
  if (!fields) return null;
  const prices = fields.prices?.fields ?? {};
  const svi = fields.svi?.fields ?? {};
  const settlementVec =
    fields.settlement_price?.fields?.vec ??
    fields.settlement_price ??
    null;
  const settlement =
    Array.isArray(settlementVec) && settlementVec.length > 0
      ? f(settlementVec[0])
      : null;

  return {
    id,
    underlying: resolveUnderlying(fields.underlying_asset ?? "?"),
    expiry: Number(fields.expiry ?? 0),
    active: !!fields.active,
    status: deriveStatus(!!fields.active, Number(fields.expiry ?? 0), settlement),
    spot: f(prices.spot ?? "0"),
    forward: f(prices.forward ?? "0"),
    svi: {
      a: f(svi.a ?? "0"),
      b: f(svi.b ?? "0"),
      rho: readI64(svi.rho ?? { fields: { magnitude: "0", is_negative: false } }),
      m: readI64(svi.m ?? { fields: { magnitude: "0", is_negative: false } }),
      sigma: f(svi.sigma ?? "0"),
    },
    timestamp: Number(fields.timestamp ?? 0),
    settlement_price: settlement,
  };
}

// === Reads ===

/// Discover currently-live oracles via OraclePricesUpdated events.
/// Block Scholes pushes ~1Hz per live oracle, so the last ~100 events catch
/// every active oracle. Returns summaries (id + underlying + expiry) for the picker.
export async function listLiveOracles(): Promise<OracleSummary[]> {
  const events = await client.queryEvents({
    query: { MoveEventType: `${PREDICT_PKG}::oracle::OraclePricesUpdated` },
    limit: 100,
    order: "descending",
  });

  const seen = new Map<string, number>();
  for (const e of events.data) {
    const j = e.parsedJson as { oracle_id: string; timestamp: string };
    const ts = Number(j.timestamp);
    if (!seen.has(j.oracle_id) || ts > seen.get(j.oracle_id)!) {
      seen.set(j.oracle_id, ts);
    }
  }

  const ids = Array.from(seen.keys());
  if (ids.length === 0) return [];

  const objects = await client.multiGetObjects({
    ids,
    options: { showContent: true },
  });

  const out: OracleSummary[] = [];
  for (const obj of objects) {
    const id = obj.data?.objectId;
    const fields = (obj.data?.content as any)?.fields;
    if (!id || !fields) continue;

    const expiry = Number(fields.expiry ?? 0);
    const active = !!fields.active;
    const settlementVec =
      fields.settlement_price?.fields?.vec ??
      fields.settlement_price ??
      null;
    const settlement =
      Array.isArray(settlementVec) && settlementVec.length > 0
        ? f(settlementVec[0])
        : null;
    const status = deriveStatus(active, expiry, settlement);

    out.push({
      id,
      underlying: resolveUnderlying(fields.underlying_asset ?? "?"),
      expiry,
      timestamp: seen.get(id) ?? 0,
      status,
      active,
      settlement_price: settlement,
    });
  }

  // Sort: Active first, then Pending, then Settled. Within each, soonest expiry first.
  // Inactive should never appear (we filter by OraclePricesUpdated which only fires on active).
  const statusRank: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
  out.sort((a, b) => {
    const rankDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return a.expiry - b.expiry;
  });
  return out;
}

/// Full state for one oracle (used by the smile chart + state panel).
export async function getOracle(id: string): Promise<Oracle | null> {
  const obj = await client.getObject({
    id,
    options: { showContent: true, showType: true },
  });
  return parseOracle(id, (obj.data?.content as any)?.fields);
}

/// Read the Predict shared object's vault state and derive PLP NAV.
/// PLP supply is read from the TreasuryCap field nested inside Predict —
/// the standard `getTotalSupply` RPC can't find it because the TreasuryCap
/// is owned by a shared object, not discoverable by the package-creation
/// lookup the RPC uses.
export async function getVaultState(): Promise<VaultState | null> {
  const predictObj = await client.getObject({
    id: PREDICT_OBJ,
    options: { showContent: true },
  });

  const predictFields = (predictObj.data?.content as any)?.fields;
  if (!predictFields) return null;

  const vault = predictFields.vault?.fields;
  if (!vault) return null;

  // PLP supply: treasury_cap.fields.total_supply.fields.value
  const supplyValue =
    predictFields.treasury_cap?.fields?.total_supply?.fields?.value ?? "0";

  const balance = fromQuoteUnits(vault.balance ?? "0");
  const totalMtm = fromQuoteUnits(vault.total_mtm ?? "0");
  const totalMaxPayout = fromQuoteUnits(vault.total_max_payout ?? "0");
  const vaultValue = Math.max(0, balance - totalMtm);
  const available = Math.max(0, balance - totalMaxPayout);
  const plpTotalSupply = Number(BigInt(supplyValue)) / 10 ** PLP_DECIMALS;
  const plpNav = plpTotalSupply > 0 ? vaultValue / plpTotalSupply : 1;

  return {
    balance,
    totalMtm,
    vaultValue,
    totalMaxPayout,
    available,
    plpTotalSupply,
    plpNav,
  };
}

/// User's PLP token balance.
export async function getUserPlpBalance(owner: string): Promise<number> {
  const r = await client.getBalance({ owner, coinType: PLP_TYPE });
  return Number(BigInt(r.totalBalance)) / 10 ** PLP_DECIMALS;
}

/// User's dUSDC balance (free, in the wallet — not the manager).
export async function getUserDusdcBalance(owner: string): Promise<number> {
  const r = await client.getBalance({ owner, coinType: DUSDC_TYPE });
  return Number(BigInt(r.totalBalance)) / 1_000_000;
}

/// Read a PredictManager's wrapped BalanceManager balance for a given quote
/// asset. dUSDC inside the manager is what predict::mint withdraws from —
/// not the user's wallet. So the trade flow requires this to be > cost.
export async function getManagerQuoteBalance(
  managerId: string,
  coinType: string = DUSDC_TYPE,
): Promise<number> {
  const mgrObj = await client.getObject({
    id: managerId,
    options: { showContent: true },
  });
  const bagId =
    (mgrObj.data?.content as any)?.fields?.balance_manager?.fields?.balances
      ?.fields?.id?.id;
  if (!bagId) return 0;

  const dfs = await client.getDynamicFields({ parentId: bagId });
  // The dynamic field's name encodes the coin type. Look for one matching.
  const stripped = coinType.replace(/^0x0*/, "0x");
  const match = dfs.data.find((df) => {
    const t = df.objectType ?? "";
    return t.includes(stripped) || t.includes(coinType);
  });
  if (!match) return 0;

  const fieldObj = await client.getObject({
    id: match.objectId,
    options: { showContent: true },
  });
  const fields = (fieldObj.data?.content as any)?.fields;
  // Dynamic field value is wrapped: fields.value.fields.value (Balance<T>.value)
  const raw =
    fields?.value?.fields?.value ?? fields?.value ?? fields?.balance ?? "0";
  return Number(BigInt(raw)) / 1_000_000;
}

export type Position = {
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: number;
};

export async function getUserPositions(managerId: string): Promise<Position[]> {
  const mgr = await client.getObject({
    id: managerId,
    options: { showContent: true },
  });
  const tableId = (mgr.data?.content as any)?.fields?.positions?.fields?.id?.id;
  if (!tableId) return [];

  const dfs = await client.getDynamicFields({ parentId: tableId });
  if (dfs.data.length === 0) return [];

  const fields = await client.multiGetObjects({
    ids: dfs.data.map((d) => d.objectId),
    options: { showContent: true },
  });

  const out: Position[] = [];
  for (const f of fields) {
    const c = (f.data?.content as any)?.fields;
    const key = c?.name?.fields;
    const qty = c?.value;
    if (!key || qty == null) continue;
    // Skip ghost entries: the contract leaves Table entries in place after
    // redeem-to-zero rather than removing them. qty=0 = no open position.
    if (BigInt(qty) === 0n) continue;
    out.push({
      oracleId: key.oracle_id,
      expiry: Number(key.expiry),
      strike: Number(BigInt(key.strike)) / 1e9,
      isUp: Number(key.direction) === 0,
      quantity: Number(BigInt(qty)) / 1e6,
    });
  }
  return out.sort((a, b) => a.expiry - b.expiry);
}

export type RangePosition = {
  oracleId: string;
  expiry: number;
  lowerStrike: number;
  higherStrike: number;
  quantity: number;
};

/// Walk the `range_positions` Table on the manager. Same shape as
/// getUserPositions but with two strikes and no direction.
export async function getUserRangePositions(
  managerId: string,
): Promise<RangePosition[]> {
  const mgr = await client.getObject({
    id: managerId,
    options: { showContent: true },
  });
  const tableId = (mgr.data?.content as any)?.fields?.range_positions?.fields?.id
    ?.id;
  if (!tableId) return [];

  const dfs = await client.getDynamicFields({ parentId: tableId });
  if (dfs.data.length === 0) return [];

  const fields = await client.multiGetObjects({
    ids: dfs.data.map((d) => d.objectId),
    options: { showContent: true },
  });

  const out: RangePosition[] = [];
  for (const f of fields) {
    const c = (f.data?.content as any)?.fields;
    const key = c?.name?.fields;
    const qty = c?.value;
    if (!key || qty == null) continue;
    if (BigInt(qty) === 0n) continue; // ghost entry
    out.push({
      oracleId: key.oracle_id,
      expiry: Number(key.expiry),
      lowerStrike: Number(BigInt(key.lower_strike)) / 1e9,
      higherStrike: Number(BigInt(key.higher_strike)) / 1e9,
      quantity: Number(BigInt(qty)) / 1e6,
    });
  }
  return out.sort((a, b) => a.expiry - b.expiry);
}

export type PositionHistoryEntry = {
  txDigest: string;
  timestampMs: number;
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: number;
  payout: number;
  bidPrice: number; // payout / qty, in (0,1)
  isSettled: boolean;
  // P&L joined from PositionMinted events. null when no matching mint is in
  // the queried window (e.g. older than `limit` mints back).
  entryAskPrice: number | null;
  pnl: number | null; // payout − qty × entryAskPrice
};

type MintFacts = { totalCost: number; totalQty: number };

/// Query PositionRedeemed + PositionMinted events for this manager and join
/// them by (oracle_id, strike, is_up) to compute realized P&L per redeem.
/// Cost basis uses the volume-weighted average ask across all mints of the
/// same position key.
export async function getPositionHistory(
  managerId: string,
  limit: number = 500,
): Promise<PositionHistoryEntry[]> {
  const [redeemEvents, mintEvents] = await Promise.all([
    client.queryEvents({
      query: { MoveEventType: `${PREDICT_PKG}::predict::PositionRedeemed` },
      limit,
      order: "descending",
    }),
    client.queryEvents({
      query: { MoveEventType: `${PREDICT_PKG}::predict::PositionMinted` },
      limit,
      order: "descending",
    }),
  ]);

  // Build a cost-basis map keyed by (oracle_id, strike, is_up). For each key
  // we accumulate total cost paid and total qty minted; ask = cost/qty.
  const costBasis = new Map<string, MintFacts>();
  for (const e of mintEvents.data) {
    const j = e.parsedJson as {
      manager_id: string;
      oracle_id: string;
      strike: string;
      is_up: boolean;
      quantity: string;
      cost: string;
    };
    if (!j || j.manager_id !== managerId) continue;
    const key = `${j.oracle_id}:${j.strike}:${j.is_up}`;
    const cost = Number(BigInt(j.cost)) / 1e6;
    const qty = Number(BigInt(j.quantity)) / 1e6;
    const prev = costBasis.get(key) ?? { totalCost: 0, totalQty: 0 };
    costBasis.set(key, {
      totalCost: prev.totalCost + cost,
      totalQty: prev.totalQty + qty,
    });
  }

  const out: PositionHistoryEntry[] = [];
  for (const e of redeemEvents.data) {
    const j = e.parsedJson as {
      manager_id: string;
      oracle_id: string;
      expiry: string;
      strike: string;
      is_up: boolean;
      quantity: string;
      payout: string;
      bid_price: string;
      is_settled: boolean;
    };
    if (!j || j.manager_id !== managerId) continue;
    const quantity = Number(BigInt(j.quantity)) / 1e6;
    const payout = Number(BigInt(j.payout)) / 1e6;
    const key = `${j.oracle_id}:${j.strike}:${j.is_up}`;
    const facts = costBasis.get(key);
    const entryAskPrice =
      facts && facts.totalQty > 0 ? facts.totalCost / facts.totalQty : null;
    const pnl =
      entryAskPrice != null ? payout - quantity * entryAskPrice : null;
    out.push({
      txDigest: e.id.txDigest,
      timestampMs: Number(e.timestampMs ?? 0),
      oracleId: j.oracle_id,
      expiry: Number(j.expiry),
      strike: Number(BigInt(j.strike)) / 1e9,
      isUp: j.is_up,
      quantity,
      payout,
      bidPrice: Number(BigInt(j.bid_price)) / 1e9,
      isSettled: j.is_settled,
      entryAskPrice,
      pnl,
    });
  }
  return out;
}

export type RangePositionHistoryEntry = {
  txDigest: string;
  timestampMs: number;
  oracleId: string;
  expiry: number;
  lowerStrike: number;
  higherStrike: number;
  quantity: number;
  payout: number;
  bidPrice: number; // payout / qty in (0,1)
  isSettled: boolean;
  entryAskPrice: number | null;
  pnl: number | null; // payout − qty × entryAskPrice
};

/// Mirrors getPositionHistory for ranges. Queries RangeRedeemed +
/// RangeMinted, joins by (oracle_id, lower_strike, higher_strike), and
/// emits one entry per redeem event with realized P&L.
export async function getRangePositionHistory(
  managerId: string,
  limit: number = 500,
): Promise<RangePositionHistoryEntry[]> {
  const [redeemEvents, mintEvents] = await Promise.all([
    client.queryEvents({
      query: { MoveEventType: `${PREDICT_PKG}::predict::RangeRedeemed` },
      limit,
      order: "descending",
    }),
    client.queryEvents({
      query: { MoveEventType: `${PREDICT_PKG}::predict::RangeMinted` },
      limit,
      order: "descending",
    }),
  ]);

  const costBasis = new Map<string, MintFacts>();
  for (const e of mintEvents.data) {
    const j = e.parsedJson as {
      manager_id: string;
      oracle_id: string;
      lower_strike: string;
      higher_strike: string;
      quantity: string;
      cost: string;
    };
    if (!j || j.manager_id !== managerId) continue;
    const key = `${j.oracle_id}:${j.lower_strike}:${j.higher_strike}`;
    const cost = Number(BigInt(j.cost)) / 1e6;
    const qty = Number(BigInt(j.quantity)) / 1e6;
    const prev = costBasis.get(key) ?? { totalCost: 0, totalQty: 0 };
    costBasis.set(key, {
      totalCost: prev.totalCost + cost,
      totalQty: prev.totalQty + qty,
    });
  }

  const out: RangePositionHistoryEntry[] = [];
  for (const e of redeemEvents.data) {
    const j = e.parsedJson as {
      manager_id: string;
      oracle_id: string;
      expiry: string;
      lower_strike: string;
      higher_strike: string;
      quantity: string;
      payout: string;
      bid_price: string;
      is_settled: boolean;
    };
    if (!j || j.manager_id !== managerId) continue;
    const quantity = Number(BigInt(j.quantity)) / 1e6;
    const payout = Number(BigInt(j.payout)) / 1e6;
    const key = `${j.oracle_id}:${j.lower_strike}:${j.higher_strike}`;
    const facts = costBasis.get(key);
    const entryAskPrice =
      facts && facts.totalQty > 0 ? facts.totalCost / facts.totalQty : null;
    const pnl =
      entryAskPrice != null ? payout - quantity * entryAskPrice : null;
    out.push({
      txDigest: e.id.txDigest,
      timestampMs: Number(e.timestampMs ?? 0),
      oracleId: j.oracle_id,
      expiry: Number(j.expiry),
      lowerStrike: Number(BigInt(j.lower_strike)) / 1e9,
      higherStrike: Number(BigInt(j.higher_strike)) / 1e9,
      quantity,
      payout,
      bidPrice: Number(BigInt(j.bid_price)) / 1e9,
      isSettled: j.is_settled,
      entryAskPrice,
      pnl,
    });
  }
  return out;
}

export async function findUserPredictManagers(
  owner: string,
): Promise<ManagerSummary[]> {
  const events = await client.queryEvents({
    query: { Sender: owner },
    limit: 50,
    order: "descending",
  });
  const created = events.data.filter(
    (e) => e.type === `${PREDICT_PKG}::predict_manager::PredictManagerCreated`,
  );
  const out: ManagerSummary[] = [];
  for (const e of created) {
    const j = e.parsedJson as { manager_id: string; owner: string };
    if (!j) continue;
    if (j.owner.toLowerCase() !== owner.toLowerCase()) continue;
    try {
      const obj = await client.getObject({
        id: j.manager_id,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as any)?.fields;
      if (!fields) continue;
      out.push({
        id: j.manager_id,
        owner: fields.owner,
        positionCount: Number(fields.positions?.fields?.size ?? 0),
        rangeCount: Number(fields.range_positions?.fields?.size ?? 0),
      });
    } catch {
      continue;
    }
  }
  return out;
}

export const STATUS_LABEL: Record<number, string> = {
  0: "Inactive",
  1: "Active",
  2: "Pending settlement",
  3: "Settled",
};

// === Legacy aliases for incremental refactor (keep old names compiling) ===

export type ActivatedOracle = OracleSummary;
export type OracleState = Oracle;
export const recentActiveOracles = listLiveOracles;
export const getOracleState = getOracle;
