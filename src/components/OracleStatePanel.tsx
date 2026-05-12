import type { Oracle } from "../lib/sui";
import { STATUS_LABEL } from "../lib/sui";

const STATUS_COLOR: Record<number, string> = {
  0: "bg-text-faint",
  1: "bg-success",
  2: "bg-hot",
  3: "bg-text-dim",
};

export function OracleStatePanel({ state }: { state: Oracle }) {
  const minutesToExpiry = Math.max(
    0,
    Math.round((state.expiry - Date.now()) / 60000),
  );
  const ageSec = Math.max(0, Math.round((Date.now() - state.timestamp) / 1000));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="kicker mb-3">Live state</div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Underlying" value={state.underlying.symbol} />
          <Stat
            label="Status"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`size-1.5 rounded-full ${STATUS_COLOR[state.status]}`}
                />
                {STATUS_LABEL[state.status]}
              </span>
            }
          />
          <Stat
            label="Spot"
            value={`$${state.spot.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}`}
          />
          <Stat
            label="Forward"
            value={`$${state.forward.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}`}
          />
          <Stat
            label="Time to expiry"
            value={
              minutesToExpiry < 60
                ? `${minutesToExpiry}m`
                : `${Math.round(minutesToExpiry / 60)}h ${minutesToExpiry % 60}m`
            }
          />
          <Stat label="Last update" value={`${ageSec}s ago`} />
          {state.settlement_price != null && (
            <Stat
              label="Settlement"
              value={`$${state.settlement_price.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}`}
            />
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="kicker mb-3">SVI params (live)</div>
        <table className="w-full font-mono text-xs tabular-nums">
          <tbody>
            <ParamRow label="a" value={state.svi.a} digits={6} />
            <ParamRow label="b" value={state.svi.b} digits={6} />
            <ParamRow label="rho" value={state.svi.rho} digits={4} />
            <ParamRow label="m" value={state.svi.m} digits={6} />
            <ParamRow label="sigma" value={state.svi.sigma} digits={6} />
          </tbody>
        </table>
        <div className="mt-3 font-mono text-[10px] text-text-faint">
          {state.id.slice(0, 14)}…{state.id.slice(-4)}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-bg-soft p-3">
      <div className="text-[10px] uppercase tracking-widest text-text-faint">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm text-text tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ParamRow({
  label,
  value,
  digits,
}: {
  label: string;
  value: number;
  digits: number;
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-1.5 text-text-dim">{label}</td>
      <td
        className={`py-1.5 text-right ${value < 0 ? "text-danger" : "text-text"}`}
      >
        {value < 0 ? "" : "+"}
        {value.toFixed(digits)}
      </td>
    </tr>
  );
}
