import { useEffect, useRef, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { VolSurfaceChart } from "./components/VolSurfaceChart";
import { OraclePicker } from "./components/OraclePicker";
import { WalletBar } from "./components/WalletBar";
import { ManagerPanel } from "./components/ManagerPanel";
import { TradeForm } from "./components/TradeForm";
import { VaultPanel } from "./components/VaultPanel";
import { LPForm } from "./components/LPForm";
import {
  listLiveOracles,
  getOracle,
  getVaultState,
  getUserPlpBalance,
  getUserDusdcBalance,
  type OracleSummary,
  type Oracle,
  type VaultState,
} from "./lib/sui";

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

  const [vault, setVault] = useState<VaultState | null>(null);
  const [userPlp, setUserPlp] = useState<number>(0);
  const [userDusdc, setUserDusdc] = useState<number>(0);

  const tickRef = useRef(0);

  // Refresh the oracle list on mount + every 60s. Block Scholes spawns new
  // oracles every ~15min and existing ones drop out as they expire — without
  // periodic refresh the picker drifts out of sync.
  useEffect(() => {
    let cancelled = false;
    let isFirst = true;

    const refresh = async () => {
      try {
        const list = await listLiveOracles();
        if (cancelled) return;
        setOracles(list);
        if (isFirst) {
          setOraclesLoading(false);
          isFirst = false;
        }
        if (list.length > 0 && !selectedOracleId) {
          const active = list.filter((o) => o.status === 1);
          const safe = active.find(
            (o) => o.expiry - Date.now() > 30 * 60 * 1000,
          );
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

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      // Fetch each independently so one failure doesn't blank everything.
      const [vSettled, plpSettled, dusdcSettled] = await Promise.allSettled([
        getVaultState(),
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
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      {/* ─ Editorial title block ─ */}
      <header className="flex items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="kicker mb-2">santos · predict on sui · v0</p>
          <h1 className="m-0 text-4xl font-bold tracking-tighter gradient-heading">
            Read the smile before it moves.
          </h1>
        </div>
        <div className="text-right font-mono text-[10px] text-text-faint">
          live testnet
          <br />
          oracle {ORACLE_REFRESH_MS}ms · vault {VAULT_REFRESH_MS}ms
        </div>
      </header>

      {/* ─ Wallet row ─ */}
      <WalletBar />

      {/* ─ HERO: chart + live stats ─ */}
      {oracleError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 font-mono text-xs text-danger">
          {oracleError}
        </div>
      )}
      {oracleState ? (
        <VolSurfaceChart
          oracle={oracleState}
          T={T}
          refreshMs={ORACLE_REFRESH_MS}
        />
      ) : selectedOracleId && !oracleError ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center font-mono text-xs text-text-faint">
          loading oracle state…
        </div>
      ) : null}

      {/* ─ Markets selector (compact, sits below chart) ─ */}
      <OraclePicker
        oracles={oracles}
        selectedId={selectedOracleId}
        onSelect={setSelectedOracleId}
        loading={oraclesLoading}
      />

      {/* ─ Two action columns: Trade (left) | Liquidity (right) ─ */}
      {oracleState && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* LEFT — TRADE column */}
          <div className="space-y-5">
            <SectionHeader number="01" title="TRADE" subtitle="Mint binary options against the vault" />
            <ManagerPanel
              selectedManagerId={selectedManagerId}
              onSelectManager={setSelectedManagerId}
            />
            <TradeForm oracle={oracleState} managerId={selectedManagerId} />
          </div>

          {/* RIGHT — LIQUIDITY column */}
          <div className="space-y-5">
            <SectionHeader number="02" title="LIQUIDITY" subtitle="Supply dUSDC, earn vault yield" />
            <VaultPanel vault={vault} userPlpBalance={userPlp} />
            <LPForm
              userDusdc={userDusdc}
              userPlp={userPlp}
              plpNav={vault?.plpNav ?? 1}
            />
          </div>
        </div>
      )}

      <footer className="mt-4 border-t border-border pt-4 font-mono text-[10px] text-text-faint">
        <div className="flex items-center justify-between">
          <span>
            predict · live testnet ·{" "}
            {oracles.length > 0 ? (
              <>
                {oracles.filter((o) => o.status === 1).length} active ·{" "}
                {oracles.filter((o) => o.status === 2).length} pending ·{" "}
                {oracles.filter((o) => o.status === 3).length} settled
              </>
            ) : (
              "no markets"
            )}
          </span>
          <span>
            {account
              ? `${account.address.slice(0, 8)}…${account.address.slice(-4)}`
              : "wallet disconnected"}
          </span>
        </div>
      </footer>
    </div>
  );
}

function SectionHeader({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border pb-2">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] text-accent-2 tabular-nums">
          {number}
        </span>
        <span className="font-mono text-xs uppercase tracking-widest text-text">
          {title}
        </span>
      </div>
      <span className="font-mono text-[10px] text-text-faint">{subtitle}</span>
    </div>
  );
}
