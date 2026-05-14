import { useEffect, useState } from "react";
import { fetch24hForSymbol, type DayPrice } from "../lib/gmxApi";

type Props = {
  symbol: string;
  livePrice?: number | null; // override close with a live tick if available
};

const REFRESH_MS = 5000;

export function PriceStrip({ symbol, livePrice }: Props) {
  const [day, setDay] = useState<DayPrice | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const d = await fetch24hForSymbol(symbol, controller.signal);
        if (!cancelled) setDay(d);
      } catch {
        // ignore — polling will retry
      }
    };

    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [symbol]);

  const close = livePrice ?? day?.close ?? null;
  const delta =
    day && close != null ? ((close - day.open) / day.open) * 100 : null;
  const up = (delta ?? 0) >= 0;

  return (
    <div className="flex items-center gap-6 border-b border-border bg-card px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-text-faint">
          {symbol}/USD
        </span>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="tabular font-mono text-2xl font-semibold text-text">
          {close != null ? formatPrice(close) : "—"}
        </span>
        {delta != null && (
          <span
            className={`tabular font-mono text-xs ${up ? "text-success" : "text-danger"}`}
          >
            {up ? "+" : ""}
            {delta.toFixed(2)}%
          </span>
        )}
      </div>

      <Stat label="24h high" value={day?.high} />
      <Stat label="24h low" value={day?.low} />
      <Stat label="24h open" value={day?.open} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-faint">
        {label}
      </span>
      <span className="tabular font-mono text-xs text-text-dim">
        {value != null ? formatPrice(value) : "—"}
      </span>
    </div>
  );
}

function formatPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  return n.toPrecision(4);
}
