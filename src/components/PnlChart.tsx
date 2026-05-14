import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PnlPoint } from "../lib/predictServer";

type Props = {
  points: PnlPoint[];
};

export function PnlChart({ points }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Mount chart once.
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
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { color: "#5b6480", labelBackgroundColor: "#1a1f2c" },
        horzLine: { color: "#5b6480", labelBackgroundColor: "#1a1f2c" },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#4d8eff",
      topColor: "rgba(77, 142, 255, 0.25)",
      bottomColor: "rgba(77, 142, 255, 0.02)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push new data when points change.
  useEffect(() => {
    if (!seriesRef.current) return;
    if (points.length === 0) {
      seriesRef.current.setData([]);
      return;
    }
    // lightweight-charts requires strictly ascending time + dedupe.
    const seen = new Set<number>();
    const data = [...points]
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .filter((p) => {
        const sec = Math.floor(p.timestampMs / 1000);
        if (seen.has(sec)) return false;
        seen.add(sec);
        return true;
      })
      .map((p) => ({
        time: Math.floor(p.timestampMs / 1000) as UTCTimestamp,
        value: p.cumulativeRealizedPnl,
      }));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [points]);

  return <div ref={containerRef} className="h-full w-full" />;
}
