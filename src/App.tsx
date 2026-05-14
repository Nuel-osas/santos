import { useEffect, useRef, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { TradeView } from "./pages/TradeView";
import { VaultView } from "./pages/VaultView";
import { PortfolioView } from "./pages/PortfolioView";
import { LeaderboardView } from "./pages/LeaderboardView";
import {
  getOracle,
  getUserPlpBalance,
  getUserDusdcBalance,
  findUserPredictManagers,
  type ManagerSummary,
  type OracleSummary,
  type Oracle,
  type VaultState,
} from "./lib/sui";
import { getOracleList, getVaultSummary } from "./lib/predictServer";

const ORACLE_REFRESH_MS = 1500;
const VAULT_REFRESH_MS = 4000;

export default function App() {
  const account = useCurrentAccount();

  const [oracles, setOracles] = useState<OracleSummary[]>([]);
  const [oraclesLoading, setOraclesLoading] = useState(true);
  const [selectedOracleId, setSelectedOracleId] = useState<string | null>(null);
  const [oracleState, setOracleState] = useState<Oracle | null>(null);
  const [oracleError, setOracleError] = useState<string | null>(null);

  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerSummary[]>([]);
  const [positionsRefreshKey, setPositionsRefreshKey] = useState(0);

  // Discover the user's PredictManagers. Lifted up here so AppHeader + each
  // page see the same list, and so creating a new manager (which bumps
  // positionsRefreshKey via onMutate) refreshes everywhere at once.
  useEffect(() => {
    if (!account) {
      setManagers([]);
      setSelectedManagerId(null);
      return;
    }
    let cancelled = false;
    findUserPredictManagers(account.address)
      .then((list) => {
        if (cancelled) return;
        setManagers(list);
        if (list.length > 0 && !selectedManagerId) {
          setSelectedManagerId(list[0].id);
        } else if (
          selectedManagerId &&
          !list.some((m) => m.id === selectedManagerId)
        ) {
          setSelectedManagerId(list[0]?.id ?? null);
        }
      })
      .catch((e) => console.warn("manager discovery failed:", e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, positionsRefreshKey]);

  const [vault, setVault] = useState<VaultState | null>(null);
  const [userPlp, setUserPlp] = useState<number>(0);
  const [userDusdc, setUserDusdc] = useState<number>(0);

  const tickRef = useRef(0);

  // Oracle list — refresh every 60s; Block Scholes spawns/expires markets continuously.
  useEffect(() => {
    let cancelled = false;
    let isFirst = true;

    const refresh = async () => {
      try {
        // Server returns ALL oracles in one shot (~2.3k including settled
        // history). Filter to the recently-active ones the UI cares about:
        // anything not yet settled, plus settled-within-the-last-24h so the
        // user can still inspect/redeem fresh history.
        const all = await getOracleList();
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const list = all
          .filter((o) => o.status !== 3 || o.expiry > cutoff)
          .sort((a, b) => a.expiry - b.expiry);
        if (cancelled) return;
        setOracles(list);
        if (isFirst) {
          setOraclesLoading(false);
          isFirst = false;
        }
        if (list.length > 0 && !selectedOracleId) {
          const active = list.filter((o) => o.status === 1);
          const safe = active.find((o) => o.expiry - Date.now() > 30 * 60 * 1000);
          setSelectedOracleId(
            safe?.id ?? active[0]?.id ?? list.find((o) => o.status !== 3)?.id ?? null,
          );
        }
      } catch (e: any) {
        if (cancelled) return;
        if (isFirst) {
          setOracleError(`failed to load oracles: ${e.message}`);
          setOraclesLoading(false);
        } else {
          console.warn("oracle list refresh failed:", e.message);
        }
      }
    };

    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selected oracle state — ticks at ORACLE_REFRESH_MS for live SVI surface.
  useEffect(() => {
    if (!selectedOracleId) return;
    let cancelled = false;
    let consecutiveNulls = 0;
    setOracleError(null);

    const tick = async () => {
      try {
        const s = await getOracle(selectedOracleId);
        if (cancelled) return;
        if (s) {
          consecutiveNulls = 0;
          setOracleState(s);
          tickRef.current += 1;
        } else {
          consecutiveNulls += 1;
          if (consecutiveNulls >= 3) {
            setOracleError("oracle state not readable (likely settled or unreachable)");
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        setOracleError(e.message);
      }
    };

    tickRef.current = 0;
    setOracleState(null);
    tick();
    const id = setInterval(tick, ORACLE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedOracleId]);

  // Vault + wallet balances — independent fetches so one failure doesn't blank everything.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const [vSettled, plpSettled, dusdcSettled] = await Promise.allSettled([
        getVaultSummary(),
        account ? getUserPlpBalance(account.address) : Promise.resolve(0),
        account ? getUserDusdcBalance(account.address) : Promise.resolve(0),
      ]);
      if (cancelled) return;
      if (vSettled.status === "fulfilled") setVault(vSettled.value);
      else console.warn("vault read failed:", vSettled.reason);
      if (plpSettled.status === "fulfilled") setUserPlp(plpSettled.value);
      else console.warn("PLP balance read failed:", plpSettled.reason);
      if (dusdcSettled.status === "fulfilled") setUserDusdc(dusdcSettled.value);
      else console.warn("dUSDC balance read failed:", dusdcSettled.reason);
    };
    tick();
    const id = setInterval(tick, VAULT_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [account]);

  const T =
    oracleState && oracleState.expiry > oracleState.timestamp
      ? (oracleState.expiry - Date.now()) / (1000 * 60 * 60 * 24 * 365.25)
      : 7 / 365;

  return (
    <BrowserRouter>
      <AppShell
        managers={managers}
        selectedManagerId={selectedManagerId}
        onSelectManager={setSelectedManagerId}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/trade" replace />} />
          <Route
            path="/trade"
            element={
              <TradeView
                oracles={oracles}
                oraclesLoading={oraclesLoading}
                selectedOracleId={selectedOracleId}
                onSelectOracle={setSelectedOracleId}
                oracleState={oracleState}
                oracleError={oracleError}
                selectedManagerId={selectedManagerId}
                onSelectManager={setSelectedManagerId}
                positionsRefreshKey={positionsRefreshKey}
                onMutate={() => setPositionsRefreshKey((k) => k + 1)}
                T={T}
                oracleRefreshMs={ORACLE_REFRESH_MS}
              />
            }
          />
          <Route
            path="/vault"
            element={
              <VaultView vault={vault} userPlp={userPlp} userDusdc={userDusdc} />
            }
          />
          <Route
            path="/portfolio"
            element={
              <PortfolioView
                managerId={selectedManagerId}
                userDusdc={userDusdc}
                userPlp={userPlp}
                plpNav={vault?.plpNav ?? 1}
                positionsRefreshKey={positionsRefreshKey}
                onMutate={() => setPositionsRefreshKey((k) => k + 1)}
              />
            }
          />
          <Route path="/leaderboard" element={<LeaderboardView />} />
          {/* legacy /pools → /vault */}
          <Route path="/pools" element={<Navigate to="/vault" replace />} />
          <Route path="*" element={<Navigate to="/trade" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
