import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";

export function WalletBar() {
  const account = useCurrentAccount();

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-bg-soft p-3">
      <div className="flex items-center gap-3">
        <span
          className={`size-2 rounded-full ${account ? "bg-success" : "bg-text-faint"}`}
        />
        <div className="font-mono text-xs text-text-dim">
          {account ? (
            <>
              <span className="text-text-faint">connected</span>{" "}
              <span className="text-text">
                {account.address.slice(0, 8)}…{account.address.slice(-4)}
              </span>
            </>
          ) : (
            <span className="text-text-faint">testnet wallet not connected</span>
          )}
        </div>
      </div>
      <ConnectButton />
    </div>
  );
}
