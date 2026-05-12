// Find actually-active oracles right now using OraclePricesUpdated events
// (these fire ~every 1s per live oracle from Block Scholes).
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const PREDICT_PKG = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";

const client = new SuiJsonRpcClient({ url: "https://fullnode.testnet.sui.io", network: "testnet" });

async function main() {
  console.log("now:", new Date().toISOString());
  console.log("now ms:", Date.now());

  // Latest OracleActivated events (last 30)
  console.log("\n=== OracleActivated · last 30 ===");
  const act = await client.queryEvents({
    query: { MoveEventType: `${PREDICT_PKG}::oracle::OracleActivated` },
    limit: 30,
    order: "descending",
  });
  const distinctOracles = new Set<string>();
  for (const e of act.data) {
    const j = e.parsedJson as { oracle_id: string; expiry: string; timestamp: string };
    distinctOracles.add(j.oracle_id);
    const exp = Number(j.expiry);
    const tsAct = Number(j.timestamp);
    const expired = exp < Date.now();
    console.log(
      `  ${j.oracle_id.slice(0, 14)}… activated ${new Date(tsAct).toISOString()} expiry ${new Date(exp).toISOString()} ${expired ? "EXPIRED" : "live (" + ((exp - Date.now()) / 60000).toFixed(0) + "min)"}`
    );
  }
  console.log("distinct activated:", distinctOracles.size);

  // Latest OraclePricesUpdated events — see who's getting price pushes right now
  console.log("\n=== OraclePricesUpdated · last 20 (who is alive) ===");
  const upd = await client.queryEvents({
    query: { MoveEventType: `${PREDICT_PKG}::oracle::OraclePricesUpdated` },
    limit: 20,
    order: "descending",
  });
  const recentlyUpdated = new Map<string, number>();
  for (const e of upd.data) {
    const j = e.parsedJson as { oracle_id: string; spot: string; forward: string; timestamp: string };
    const ts = Number(j.timestamp);
    if (!recentlyUpdated.has(j.oracle_id)) {
      recentlyUpdated.set(j.oracle_id, ts);
    }
  }
  console.log("distinct oracles receiving updates:", recentlyUpdated.size);
  for (const [id, ts] of recentlyUpdated.entries()) {
    const ageSec = (Date.now() - ts) / 1000;
    console.log(`  ${id.slice(0, 14)}… last update ${ageSec.toFixed(0)}s ago`);
  }

  // Latest PositionMinted events — what specific markets are being traded
  console.log("\n=== PositionMinted · last 10 (recent trades) ===");
  const pos = await client.queryEvents({
    query: { MoveEventType: `${PREDICT_PKG}::predict::PositionMinted` },
    limit: 10,
    order: "descending",
  });
  for (const e of pos.data) {
    const j = e.parsedJson as any;
    const tsMs = Number(e.timestampMs);
    const ageMin = (Date.now() - tsMs) / 60000;
    const strikeUsd = Number(BigInt(j.strike)) / 1e9;
    const qtyUsd = Number(BigInt(j.quantity)) / 1e6;
    console.log(
      `  ${ageMin.toFixed(0)}min ago: ${j.is_up ? "UP" : "DOWN"} @ $${strikeUsd.toFixed(0)} qty $${qtyUsd.toFixed(2)} on oracle ${j.oracle_id.slice(0, 14)}…`
    );
  }
}

main().catch(console.error);
