import { useState } from "react";
import { CandleChart } from "../components/CandleChart";
import { PriceStrip } from "../components/PriceStrip";
import { MarketStrip } from "../components/MarketStrip";
import { ManagerPanel } from "../components/ManagerPanel";
import { TradeForm } from "../components/TradeForm";
import { PositionsList } from "../components/PositionsList";
import { VolSurfaceChart } from "../components/VolSurfaceChart";
import type { Oracle, OracleSummary } from "../lib/sui";

type Props = {
  oracles: OracleSummary[];
  oraclesLoading: boolean;
  selectedOracleId: string | null;
  onSelectOracle: (id: string | null) => void;
  oracleState: Oracle | null;
  oracleError: string | null;
  selectedManagerId: string | null;
  onSelectManager: (id: string | null) => void;
  positionsRefreshKey: number;
  onMutate: () => void;
  T: number;
  oracleRefreshMs: number;
};

const PERIODS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Period = (typeof PERIODS)[number];

type PanelTab = "svi" | "position";

export function TradeView({
  oracles,
  oraclesLoading,
  selectedOracleId,
  onSelectOracle,
  oracleState,
  oracleError,
  selectedManagerId,
  onSelectManager,
  positionsRefreshKey,
  onMutate,
  T,
  oracleRefreshMs,
}: Props) {
  const [period, setPeriod] = useState<Period>("5m");
  const [panelTab, setPanelTab] = useState<PanelTab>("svi");

  const symbol = oracleState?.underlying.symbol ?? "BTC";
  const livePrice = oracleState?.spot ?? null;

  return (
    <div className="flex flex-col">
      {/* ─ Price strip header ─ */}
      <PriceStrip symbol={symbol} livePrice={livePrice} />

      {/* ─ Market strip (underlying tabs + expiry pills) ─ */}
      <MarketStrip
        oracles={oracles}
        selectedId={selectedOracleId}
        onSelect={onSelectOracle}
        loading={oraclesLoading}
      />

      {/* ─ Period selector ─ */}
      <div className="flex items-center justify-between border-b border-border bg-bg-soft px-5 py-2">
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                period === p
                  ? "bg-card text-text"
                  : "text-text-dim hover:bg-card-hover hover:text-text"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ─ Main grid: chart left, trade panel right ─ */}
      <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-[1fr_450px]">
        {/* Chart column */}
        <div className="flex flex-col bg-bg">
          <div className="h-[400px] bg-card lg:h-[480px]">
            <div className="mx-auto h-full w-full max-w-[1100px]">
              <CandleChart symbol={symbol} period={period} />
            </div>
          </div>

          {/* SVI / Position panel — always visible */}
          <div className="border-t border-border bg-card">
            {/* Tab header */}
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-2">
              <div className="flex items-center gap-1">
                <PanelTabButton
                  label="SVI vol surface"
                  active={panelTab === "svi"}
                  onClick={() => setPanelTab("svi")}
                />
                <PanelTabButton
                  label="Position"
                  active={panelTab === "position"}
                  onClick={() => setPanelTab("position")}
                />
              </div>
              {panelTab === "svi" && oracleState && (
                <span className="font-mono text-[10px] text-text-faint">
                  block scholes oracle · T = {(T * 365).toFixed(1)}d
                </span>
              )}
            </div>

            {/* Tab body */}
            <div className="p-5">
              {panelTab === "svi" ? (
                oracleState ? (
                  <VolSurfaceChart
                    oracle={oracleState}
                    T={T}
                    refreshMs={oracleRefreshMs}
                  />
                ) : (
                  <div className="py-8 text-center font-mono text-[11px] text-text-faint">
                    waiting on oracle state…
                  </div>
                )
              ) : (
                <PositionsList
                  managerId={selectedManagerId}
                  refreshKey={positionsRefreshKey}
                  onMutate={onMutate}
                />
              )}
            </div>
          </div>
        </div>

        {/* Trade column */}
        <div className="flex flex-col gap-px bg-border">
          <div className="bg-card p-4">
            <ManagerPanel
              selectedManagerId={selectedManagerId}
              onSelectManager={onSelectManager}
            />
          </div>
          {oracleState && (
            <div className="bg-card p-4">
              <TradeForm oracle={oracleState} managerId={selectedManagerId} />
            </div>
          )}
        </div>
      </div>

      {/* ─ Error banner ─ */}
      {oracleError && (
        <div className="border-t border-danger/30 bg-danger/10 px-5 py-2 font-mono text-xs text-danger">
          {oracleError}
        </div>
      )}
    </div>
  );
}

function PanelTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
        active
          ? "bg-bg-soft text-text"
          : "text-text-dim hover:bg-card-hover hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}
