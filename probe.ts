// Probe testnet Predict state. Run: `bun probe.ts`
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const PREDICT_PKG = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const PREDICT_OBJ = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const REGISTRY_OBJ = "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64";

const client = new SuiJsonRpcClient({ url: "https://fullnode.testnet.sui.io" });

async function main() {
  console.log("=== Predict shared object ===");
  const predict = await client.getObject({
    id: PREDICT_OBJ,
    options: { showContent: true, showType: true, showOwner: true },
  });
  console.log("type:", predict.data?.type);
  console.log("owner:", JSON.stringify(predict.data?.owner));
  const fields = (predict.data?.content as any)?.fields ?? {};
  console.log("top-level fields:", Object.keys(fields));
  console.log("trading_paused:", fields.trading_paused);

  console.log("\n=== Registry shared object ===");
  const registry = await client.getObject({
    id: REGISTRY_OBJ,
    options: { showContent: true, showType: true, showOwner: true },
  });
  console.log("type:", registry.data?.type);
  console.log("owner:", JSON.stringify(registry.data?.owner));
  const rFields = (registry.data?.content as any)?.fields ?? {};
  console.log("top-level fields:", Object.keys(rFields));
  for (const [k, v] of Object.entries(rFields)) {
    if (typeof v === "object" && v !== null) {
      console.log(`  ${k}:`, JSON.stringify(v).slice(0, 240));
    } else {
      console.log(`  ${k}:`, v);
    }
  }

  console.log("\n=== Registry dynamic fields ===");
  const dfs = await client.getDynamicFields({ parentId: REGISTRY_OBJ });
  console.log(`count: ${dfs.data.length}`);
  for (const df of dfs.data.slice(0, 5)) {
    console.log("  ->", df.name?.type, "value:", df.objectType);
  }

  console.log("\n=== Predict dynamic fields ===");
  const pdfs = await client.getDynamicFields({ parentId: PREDICT_OBJ });
  console.log(`count: ${pdfs.data.length}`);
  for (const df of pdfs.data.slice(0, 5)) {
    console.log("  ->", df.name?.type, "value:", df.objectType);
  }

  console.log("\n=== Recent events: OracleActivated ===");
  try {
    const evt = await client.queryEvents({
      query: { MoveEventType: `${PREDICT_PKG}::oracle::OracleActivated` },
      limit: 10,
      order: "descending",
    });
    console.log(`found ${evt.data.length} events`);
    for (const e of evt.data) {
      console.log("  ->", e.parsedJson, "tx:", e.id.txDigest);
    }
  } catch (e: any) {
    console.log("error:", e.message);
  }

  console.log("\n=== Recent events: PositionMinted ===");
  try {
    const evt = await client.queryEvents({
      query: { MoveEventType: `${PREDICT_PKG}::predict::PositionMinted` },
      limit: 5,
      order: "descending",
    });
    console.log(`found ${evt.data.length} events`);
    for (const e of evt.data) {
      console.log("  ->", e.parsedJson);
    }
  } catch (e: any) {
    console.log("error:", e.message);
  }

  console.log("\n=== Recent events: OraclePricesUpdated (latest 3) ===");
  try {
    const evt = await client.queryEvents({
      query: { MoveEventType: `${PREDICT_PKG}::oracle::OraclePricesUpdated` },
      limit: 3,
      order: "descending",
    });
    console.log(`found ${evt.data.length} events`);
    for (const e of evt.data) {
      console.log("  ->", e.parsedJson);
    }
  } catch (e: any) {
    console.log("error:", e.message);
  }
}

main().catch(console.error);
