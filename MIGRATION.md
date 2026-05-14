# predict-server migration

Migrate santos's chain-scan data layer (`src/lib/sui.ts`) onto the public
indexed REST API at `https://predict-server.testnet.mystenlabs.com`.

This is the integration path Mysten explicitly recommends in
`packages/predict/README.md`:

> Do not build the UI by decoding raw Move events everywhere. The
> public server already gives you the useful indexed surface.

## Three-layer read model

| Layer | Use for |
|---|---|
| `predict-server` (REST) | Lists, history, portfolio, vault summaries, P&L. Default render backend. |
| Sui checkpoint / event stream | Second-level live oracle tape only — `OraclePricesUpdated`, `OracleSVIUpdated`, `OracleSettled`, `OracleActivated`. |
| Direct on-chain reads (`@mysten/sui`) | Pre-sign + post-tx confirmation. Manager balance right before mint, oracle state right after a tx. Never as the primary list/query backend. |

## Per-function migration plan

Each row maps a current `sui.ts` function to its server replacement.
Ordered by leverage — top rows are the biggest simplifications.

| `sui.ts` (current) | Predict-server endpoint (target) | Notes |
|---|---|---|
| `listLiveOracles()` — scans `OraclePricesUpdated` events, dedupes, then `multiGetObjects` for each | `GET /predicts/:predict_id/oracles` | One round trip vs N. Server returns `underlying_asset`, `expiry`, `min_strike`, `tick_size`, `status`. Pre-indexed lifecycle state. |
| `getPositionHistory(managerId)` — `queryEvents` PositionRedeemed + PositionMinted, client-side join for P&L | **Stay on chain** | The per-event server endpoint `/positions/redeemed` does NOT carry P&L (it mirrors the raw Move event, which only has `payout` + `bid_price` — same circular dependency). `/managers/:id/positions/summary` has P&L but collapses every redeem on the same market into one row. We want per-redeem-event P&L granularity in the UI, so the chain-event join stays. |
| `getUserPositions(managerId)` — `getDynamicFields` + `multiGetObjects` to walk the manager's positions table | **Stay on chain** OR `GET /managers/:manager_id/positions/summary` filtered to open_qty>0 | Server can give us the open set, but if we keep `getPositionHistory` on chain we keep this for consistency. |
| `findUserPredictManagers(owner)` — `queryEvents` Sender filter, then `getObject` per manager | `GET /managers?owner=:address` (per README §2) | Server returns the indexed manager list directly. |
| `getVaultState()` — reads the shared `Predict` object | `GET /predicts/:predict_id/vault/summary` | Server returns vault balance, liabilities, MTM, max payout, available — server-side aggregated. |
| `getOracle(id)` — `getObject` with content | `GET /oracles/:oracle_id/state` (snapshot) + checkpoint stream `OraclePricesUpdated` (live ticks) | Use server for initial render, stream for sub-second refresh. |
| `getManagerQuoteBalance(managerId, type)` | **stay on-chain** | Confirmation-critical — checked right before signing a mint. Server lag (currently ~60s) is unsafe here. |

## Net effect on `sui.ts`

- Delete: `listLiveOracles`, `getPositionHistory` (with the mint/redeem join), `getUserPositions`, `findUserPredictManagers` event scans.
- Keep: `getManagerQuoteBalance`, the manager-state read used post-mint, the `Underlying` type registry, the i64 / SVI decoders.
- New: `src/lib/predictServer.ts` — typed client mirroring the REST surface.

Code volume roughly halves.

## What we additionally get

- **P&L over time windows** via `GET /managers/:id/pnl?range=ALL|1D|1W|...` — enables a portfolio chart we can't build today without re-scanning the whole event history.
- **Vault performance series** via `GET /predicts/:id/vault/performance?range=ALL` — for the Vault page's APY/yield chart.
- **Oracle SVI history** via `GET /oracles/:id/svi` — for backtesting / smile-evolution overlays on the existing SVI chart.
- **Per-oracle trade tape** via `GET /trades/:oracle_id` — live order flow for the market.

## Migration order

1. `predictServer.ts` typed client + `getOracleList(predictId)` — swap MarketStrip's data source.
2. `getManagerSummary(managerId)` + `getPositionHistory(managerId)` — swap Portfolio page + PositionsList.
3. `getVaultSummary(predictId)` — swap VaultView.
4. `getPnl(managerId, range)` + a small line chart — Portfolio page upgrade.
5. Replace `findUserPredictManagers` with `GET /managers?owner=...` once we expose multi-manager selection.

## What stays on-chain (verified)

- `getManagerQuoteBalance` — TradeForm checks this immediately before submit. Server lag makes it unsafe here.
- Pre-sign manager state if we ever do composite txs that depend on current balances.
- Post-tx refresh of the directly affected object (manager + oracle) for confirmation latency.
- **`getPositionHistory` (PositionsList History tab)** — server's per-event log lacks P&L; the aggregated alternative collapses multiple redeems per market into one row. Per-redeem P&L granularity is the product requirement, so the chain-event join stays.
- **`getUserPositions` (PositionsList Open tab)** — kept on chain alongside the history join for consistency.

## Reference

- Predict primitive README: `/Users/emmanuelosadebe/Downloads/sona/deepbookv3/packages/predict/README.md`
- Public server status: `curl https://predict-server.testnet.mystenlabs.com/status`
