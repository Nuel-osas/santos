import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const PREDICT_PKG =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const PREDICT_OBJ =
  "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const PLP_TYPE = `${PREDICT_PKG}::plp::PLP`;

const client = new SuiJsonRpcClient({
  url: "https://fullnode.testnet.sui.io",
  network: "testnet",
});

async function main() {
  console.log("=== Predict shared object — vault field ===");
  const obj = await client.getObject({
    id: PREDICT_OBJ,
    options: { showContent: true },
  });
  const fields = (obj.data?.content as any)?.fields;
  console.log("top-level fields:", Object.keys(fields ?? {}));
  console.log("");
  console.log("vault raw:", JSON.stringify(fields?.vault, null, 2).slice(0, 1200));

  console.log("\n=== PLP total supply ===");
  try {
    const supply = await client.getTotalSupply({ coinType: PLP_TYPE });
    console.log("result:", supply);
  } catch (e: any) {
    console.log("FAILED:", e.message);
  }
}

main().catch((e) => {
  console.error("error:", e.message);
});
