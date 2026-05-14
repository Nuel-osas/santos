import { VaultPanel } from "../components/VaultPanel";
import { LPForm } from "../components/LPForm";
import type { VaultState } from "../lib/sui";

type Props = {
  vault: VaultState | null;
  userPlp: number;
  userDusdc: number;
};

export function PoolsView({ vault, userPlp, userDusdc }: Props) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-6">
      <div className="border-b border-border pb-3">
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-faint">
          Liquidity
        </p>
        <h1 className="mt-1 font-mono text-lg font-medium tracking-tight text-text">
          Supply dUSDC · earn vault yield
        </h1>
      </div>

      <div className="grid gap-px bg-border lg:grid-cols-2">
        <div className="bg-card p-5">
          <VaultPanel vault={vault} userPlpBalance={userPlp} />
        </div>
        <div className="bg-card p-5">
          <LPForm
            userDusdc={userDusdc}
            userPlp={userPlp}
            plpNav={vault?.plpNav ?? 1}
          />
        </div>
      </div>
    </div>
  );
}
