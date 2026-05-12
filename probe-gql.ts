// Query Sui testnet GraphQL for ALL OracleSVI objects.
// One paginated GraphQL request stream instead of registry-walk + multiGetObjects.

const GQL = "https://sui-testnet.mystenlabs.com/graphql";
const PREDICT_PKG =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const ORACLE_TYPE = `${PREDICT_PKG}::oracle::OracleSVI`;

async function fetchPage(cursor: string | null): Promise<any> {
  const query = /* GraphQL */ `
    query AllOracles($type: String!, $cursor: String) {
      objects(filter: { type: $type }, first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          address
          asMoveObject {
            contents {
              json
            }
          }
        }
      }
    }
  `;
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { type: ORACLE_TYPE, cursor } }),
  });
  return res.json();
}

type Counters = { active: number; pending: number; settled: number; inactive: number };

async function main() {
  const start = Date.now();
  let cursor: string | null = null;
  let total = 0;
  const byStatus: Counters = { active: 0, pending: 0, settled: 0, inactive: 0 };
  const byUnderlying = new Map<string, Counters>();
  let pageCount = 0;

  do {
    const data = await fetchPage(cursor);
    if (data.errors) {
      console.error("GraphQL errors:", JSON.stringify(data.errors, null, 2));
      return;
    }
    const page = data.data?.objects;
    if (!page) {
      console.error("Unexpected shape:", JSON.stringify(data).slice(0, 400));
      return;
    }
    pageCount++;

    for (const node of page.nodes) {
      total++;
      const fields = node.asMoveObject?.contents?.json;
      if (!fields) continue;
      const symbol = String(fields.underlying_asset ?? "?");
      const active = !!fields.active;
      const expiry = Number(fields.expiry ?? 0);
      const settlement =
        fields.settlement_price?.vec?.length > 0
          ? fields.settlement_price.vec[0]
          : null;
      let status: keyof Counters;
      if (settlement != null) status = "settled";
      else if (!active) status = "inactive";
      else if (Date.now() < expiry) status = "active";
      else status = "pending";
      byStatus[status]++;

      if (!byUnderlying.has(symbol)) {
        byUnderlying.set(symbol, { active: 0, pending: 0, settled: 0, inactive: 0 });
      }
      byUnderlying.get(symbol)![status]++;
    }

    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    process.stdout.write(`\rpages: ${pageCount}  oracles: ${total}  `);
  } while (cursor);

  const elapsed = Date.now() - start;
  console.log(`\n\nFetched ${total} OracleSVI objects across ${pageCount} pages in ${(elapsed / 1000).toFixed(1)}s`);
  console.log("\nBy status:");
  for (const [k, v] of Object.entries(byStatus)) console.log(`  ${k}: ${v}`);
  console.log("\nBy underlying × status:");
  for (const [symbol, c] of byUnderlying.entries()) {
    console.log(`  ${symbol}: active=${c.active} pending=${c.pending} settled=${c.settled} inactive=${c.inactive}`);
  }
}

main().catch(console.error);
