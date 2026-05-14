import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <AppHeader />
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
