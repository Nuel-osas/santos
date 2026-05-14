import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import type { ManagerSummary } from "../lib/sui";

type Props = {
  children: ReactNode;
  managers: ManagerSummary[];
  selectedManagerId: string | null;
  onSelectManager: (id: string | null) => void;
};

export function AppShell({
  children,
  managers,
  selectedManagerId,
  onSelectManager,
}: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <AppHeader
        managers={managers}
        selectedManagerId={selectedManagerId}
        onSelectManager={onSelectManager}
      />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-bg px-5 py-3">
        <div className="flex items-center justify-between font-mono text-[10px] text-text-faint">
          <span>predict · live testnet</span>
          <span>charts: gmx oracle · markets: block scholes</span>
        </div>
      </footer>
    </div>
  );
}
