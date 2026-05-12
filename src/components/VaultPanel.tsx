import type { VaultState } from "../lib/sui";

export function VaultPanel({
  vault,
  userPlpBalance,
}: {
  vault: VaultState | null;
  userPlpBalance: number;
}) {
  if (!vault) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center font-mono text-xs text-text-faint">
        loading vault state…
      </div>
    );
  }

  const utilization =
    vault.balance > 0 ? (vault.totalMtm / vault.balance) * 100 : 0;
  const reserveUtilization =
    vault.balance > 0 ? (vault.totalMaxPayout / vault.balance) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <div className="kicker mb-1">Vault · PLP</div>
          <div className="font-mono text-2xl text-text tabular-nums">
            ${vault.vaultValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className="ml-2 text-xs text-text-faint">vault value</span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] text-text-dim">
            NAV{" "}
            <span className="text-text">
              ${vault.plpNav.toFixed(4)}
            </span>{" "}
            / PLP
          </div>
          <div className="font-mono text-[10px] text-text-faint">
            {vault.plpTotalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
            PLP outstanding
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Balance"
          value={`$${vault.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          hint="quote in vault"
        />
        <Stat
          label="Mark-to-Market"
          value={`$${vault.totalMtm.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          hint={`${utilization.toFixed(1)}% utilization`}
        />
        <Stat
          label="Max payout"
          value={`$${vault.totalMaxPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          hint={`${reserveUtilization.toFixed(1)}% reserved`}
          tone="warn"
        />
        <Stat
          label="LP withdrawable"
          value={`$${vault.available.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          hint="balance − max_payout"
          tone="ok"
        />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-bg-soft px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-faint">
            Your PLP
          </div>
          <div className="mt-0.5 font-mono text-base text-text tabular-nums">
            {userPlpBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-text-faint">
            Value
          </div>
          <div className="mt-0.5 font-mono text-base tabular-nums text-accent-2">
            ${(userPlpBalance * vault.plpNav).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  const valueColor =
    tone === "ok"
      ? "text-success"
      : tone === "warn"
        ? "text-hot"
        : "text-text";
  return (
    <div className="rounded-lg bg-bg-soft p-3">
      <div className="text-[10px] uppercase tracking-widest text-text-faint">
        {label}
      </div>
      <div className={`mt-1 font-mono text-sm tabular-nums ${valueColor}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 font-mono text-[10px] text-text-faint">
          {hint}
        </div>
      )}
    </div>
  );
}
