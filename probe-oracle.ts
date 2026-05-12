// Verify OracleSVI field shape for one active oracle.
import { recentActiveOracles, getOracleState, STATUS_LABEL } from "./src/lib/sui";
import { client } from "./src/lib/sui";

async function main() {
  const oracles = await recentActiveOracles(4);
  console.log(`recent active oracles: ${oracles.length}`);

  for (const o of oracles.slice(0, 3)) {
    console.log(`\n--- ${o.oracle_id.slice(0, 18)}… ---`);
    console.log("expiry:", new Date(o.expiry).toISOString(), "in", ((o.expiry - Date.now()) / 60000).toFixed(0), "min");

    // Raw object dump first.
    const raw = await client.getObject({
      id: o.oracle_id,
      options: { showContent: true },
    });
    const fields = (raw.data?.content as any)?.fields ?? {};
    console.log("raw top-level:", Object.keys(fields));
    console.log("svi raw:", JSON.stringify(fields.svi, null, 2));
    console.log("prices raw:", JSON.stringify(fields.prices, null, 2));
    console.log("settlement_price raw:", JSON.stringify(fields.settlement_price));

    // Parsed.
    const state = await getOracleState(o.oracle_id);
    if (state) {
      console.log("--- parsed ---");
      console.log("underlying:", state.underlying_asset);
      console.log("status:", STATUS_LABEL[state.status]);
      console.log("spot:", state.spot.toFixed(2));
      console.log("forward:", state.forward.toFixed(2));
      console.log("svi:", state.svi);
      console.log("timestamp:", new Date(state.timestamp).toISOString());
    }
  }
}

main().catch(console.error);
