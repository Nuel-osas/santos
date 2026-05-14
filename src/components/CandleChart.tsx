import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchCandles, type Candle, type Period } from "../lib/gmxApi";

type Props = {
  symbol: string; // e.g. "BTC"
  period?: Period;
  limit?: number;
  pollMs?: number;
};

export function CandleChart({
  symbol,
  period = "5m",
  limit = 1000,
  pollMs = 1000,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Mount chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#8a93ab",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#161b25" },
        horzLines: { color: "#161b25" },
      },
      rightPriceScale: {
        borderColor: "#1f2532",
        textColor: "#8a93ab",
      },
      timeScale: {
        borderColor: "#1f2532",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 6,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
      },
      crosshair: {
        vertLine: { color: "#5b6480", labelBackgroundColor: "#1a1f2c" },
        horzLine: { color: "#5b6480", labelBackgroundColor: "#1a1f2c" },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#2ed47a",
      downColor: "#f25767",
      borderUpColor: "#2ed47a",
      borderDownColor: "#f25767",
      wickUpColor: "#2ed47a",
      wickDownColor: "#f25767",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Initial + symbol/period changes — full backfill
  useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;
    const controller = new AbortController();
    lastTimeRef.current = 0;

    (async () => {
      try {
        const candles = await fetchCandles(symbol, period, limit, controller.signal);
        if (cancelled || !seriesRef.current) return;
        const sorted = [...candles].sort((a, b) => a.time - b.time);
        seriesRef.current.setData(
          sorted.map(toLW),
        );
        if (sorted.length) lastTimeRef.current = sorted[sorted.length - 1].time;
        // Pin the visible window to the most recent candle (right edge),
        // leaving older history pannable to the left. Don't call fitContent —
        // that compresses everything into the visible width and makes candles
        // skinny.
        chartRef.current?.timeScale().scrollToRealTime();
        setError(null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, period, limit]);

  // Live polling (GMX uses 1s; pause on tab hidden)
  useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || document.hidden || !seriesRef.current) return;
      try {
        // Fetch a small window — we only need the latest 2 candles to merge.
        const recent = await fetchCandles(symbol, period, 2);
        if (cancelled || !seriesRef.current) return;
        for (const c of recent.sort((a, b) => a.time - b.time)) {
          if (c.time >= lastTimeRef.current) {
            seriesRef.current.update(toLW(c));
            if (c.time > lastTimeRef.current) lastTimeRef.current = c.time;
          }
        }
      } catch {
        // swallow transient errors — main backfill effect surfaces them
      }
    };

    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, period, pollMs]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-md border border-danger/40 bg-danger/10 px-3 py-1 font-mono text-[10px] text-danger">
          chart: {error}
        </div>
      )}
    </div>
  );
}

function toLW(c: Candle) {
  return {
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}
