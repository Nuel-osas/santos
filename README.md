# santos

A trading dapp for **DeepBook Predict** on Sui testnet. Live SVI volatility
surface, real on-chain reads, wallet-connected mint / supply / withdraw flows
against actual testnet markets.

## What's here

- **Live SVI smile chart** rendered from `OracleSVI` shared objects on Sui
  testnet (Block Scholes pushes ~1Hz). Y-axis auto-scales to the smile;
  ATM iv computed from real params + time-to-expiry.
- **Status-aware market picker** — groups oracles by underlying, sorts by
  Active → Pending → Settled, color-codes chips, disables settled.
- **Binary position mint flow** — wallet connect via `@mysten/dapp-kit`,
  builds real `predict::mint<dUSDC>` PTBs, executes on testnet.
- **Vault / LP panel** — reads `Predict.vault` shared state (balance,
  total_mtm, total_max_payout), PLP NAV, your PLP balance.
- **Supply / Withdraw form** — real `predict::supply<DUSDC>` and
  `predict::withdraw<DUSDC>` flows. Splits / merges coins automatically.
- **`PredictManager` creation + tracking** — finds your existing managers
  via `PredictManagerCreated` events, shows position / range counts.

## Stack

- Vite + React 18 + TypeScript
- Tailwind v4
- Motion (Framer Motion successor) for animations
- `@mysten/sui` for JSON-RPC + transaction building
- `@mysten/dapp-kit` for wallet integration
- `@tanstack/react-query` for data hooks

## Predict on testnet

- Package: `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138`
- Predict shared object: `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a`
- Registry: `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64`
- Quote asset: dUSDC (gated — DM DeepBook team in Discord for test tokens)
- Source: `MystenLabs/deepbookv3` branch `predict-testnet-4-16`

## Run locally

```sh
bun install
bun run dev
# open http://localhost:5174
```

Connect a Sui testnet wallet. Click **+ create manager** (free, just gas)
to make your `PredictManager` shared object. Once funded with dUSDC, the
mint and supply flows execute against live testnet markets.

## Probes

A few read-only probes ship alongside for diagnosing chain state:

- `bun probe.ts` — dumps Predict / Registry / oracle activation events
- `bun probe-active.ts` — live oracles via `OraclePricesUpdated` events
- `bun probe-oracle.ts` — single OracleSVI object inspection
- `bun probe-gql.ts` — (currently nonfunctional — Sui GraphQL endpoints
  unreachable as of 2026-05)
