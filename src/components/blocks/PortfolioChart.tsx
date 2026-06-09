"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { cn } from "@/lib/cn";
import {
  formatDateNo,
  formatNOK,
  formatNOKDelta,
  formatPct,
} from "@/lib/format";
import type { PortfolioSeries, Range } from "@/lib/portfolio";
import { Mono } from "@/components/ui";

interface PortfolioChartProps {
  series: Record<Range, PortfolioSeries>;
  ranges: { key: Range; label: string }[];
  defaultRange?: Range;
}

interface HoverState {
  t: number;
  value: number;
  pct: number;
  delta: number;
}

interface ThemeColors {
  fg: string;
  bg: string;
  surface: string;
  border: string;
  muted: string;
  up: string;
  down: string;
}

function readThemeColors(): ThemeColors {
  const fallback: ThemeColors = {
    fg: "#171717",
    bg: "#fafafa",
    surface: "#ffffff",
    border: "#e5e5e5",
    muted: "#737373",
    up: "#16a34a",
    down: "#dc2626",
  };
  if (typeof window === "undefined") return fallback;
  const root = getComputedStyle(document.documentElement);
  return {
    fg: root.getPropertyValue("--foreground").trim() || fallback.fg,
    bg: root.getPropertyValue("--background").trim() || fallback.bg,
    surface: root.getPropertyValue("--surface").trim() || fallback.surface,
    border: root.getPropertyValue("--border").trim() || fallback.border,
    muted: root.getPropertyValue("--muted").trim() || fallback.muted,
    up: root.getPropertyValue("--up").trim() || fallback.up,
    down: root.getPropertyValue("--down").trim() || fallback.down,
  };
}

export function PortfolioChart({
  series,
  ranges,
  defaultRange = "3M",
}: PortfolioChartProps) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [hover, setHover] = useState<HoverState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const themeRef = useRef<ThemeColors>(readThemeColors());

  const active = series[range];
  const base = active.points[0]?.v ?? 0;
  const directionUp = active.changePct >= 0;

  const chartData = useMemo(() => {
    return active.points.map((p) => ({
      time: Math.floor(p.t / 1000) as UTCTimestamp,
      value: base > 0 ? ((p.v - base) / base) * 100 : 0,
    }));
  }, [active, base]);

  const absLookup = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of active.points) m.set(Math.floor(p.t / 1000), p.v);
    return m;
  }, [active]);

  useEffect(() => {
    if (!containerRef.current) return;
    const colors = readThemeColors();
    themeRef.current = colors;
    const initialLineColor = directionUp ? colors.up : colors.down;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: colors.muted,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: false,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: colors.muted,
          width: 1,
          style: LineStyle.Solid,
          labelVisible: false,
        },
        horzLine: {
          color: colors.muted,
          width: 1,
          style: LineStyle.Dashed,
          labelVisible: false,
        },
      },
      handleScroll: false,
      handleScale: false,
      kineticScroll: { mouse: false, touch: false },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: initialLineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: colors.bg,
      crosshairMarkerBackgroundColor: initialLineColor,
      crosshairMarkerBorderWidth: 2,
      priceFormat: {
        type: "custom",
        formatter: (v: number) => {
          const abs = Math.abs(v);
          const digits = abs < 1 ? 2 : abs < 10 ? 1 : 0;
          return `${v < 0 ? "−" : ""}${abs.toFixed(digits)}%`;
        },
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    seriesRef.current = lineSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !seriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(seriesRef.current);
      if (!data || typeof param.time !== "number") {
        setHover(null);
        return;
      }
      const t = param.time as number;
      const absValue = absLookupRef.current.get(t);
      if (absValue === undefined) {
        setHover(null);
        return;
      }
      const startVal = baseRef.current;
      const pct = startVal > 0 ? ((absValue - startVal) / startVal) * 100 : 0;
      const delta = absValue - startVal;
      setHover({ t: t * 1000, value: absValue, pct, delta });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const absLookupRef = useRef(absLookup);
  const baseRef = useRef(base);
  useEffect(() => {
    absLookupRef.current = absLookup;
    baseRef.current = base;
  }, [absLookup, base]);

  useEffect(() => {
    if (!seriesRef.current) return;
    const color = directionUp ? themeRef.current.up : themeRef.current.down;
    seriesRef.current.applyOptions({
      color,
      crosshairMarkerBackgroundColor: color,
    });
    seriesRef.current.setData(chartData);
    chartRef.current?.timeScale().fitContent();
    setHover(null);
  }, [chartData, directionUp]);

  const display = hover ?? {
    t: active.points[active.points.length - 1]?.t ?? 0,
    value: active.endValue,
    pct: active.changePct,
    delta: active.changeAbs,
  };
  const rangeLabel = ranges.find((r) => r.key === range)?.label ?? "";
  const isUp = display.delta >= 0;
  const deltaTone = isUp ? "text-up" : "text-down";

  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 md:px-10">
        <div className="bg-surface">
          <div className="p-6 border-b border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Mono className="text-muted">Egenkapital</Mono>
                <div className="mt-2 text-4xl md:text-5xl font-medium tabular-nums tracking-tight">
                  {formatNOK(display.value)}
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-3 font-mono text-sm tabular-nums">
                  <span className="text-muted">
                    {hover ? formatDateNo(display.t) : rangeLabel}
                  </span>
                  <span className={deltaTone}>{formatPct(display.pct)}</span>
                  <span className={deltaTone}>
                    {formatNOKDelta(display.delta)}
                  </span>
                  <span aria-hidden className={cn(deltaTone, "opacity-80")}>
                    {isUp ? "▲" : "▼"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={containerRef}
            className="h-[300px] md:h-[420px] w-full touch-none"
          />

          <div className="border-t border-border p-3 md:p-4 flex flex-wrap gap-2">
            {ranges.map((r) => {
              const isActive = r.key === range;
              const s = series[r.key];
              const up = s.changePct >= 0;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5",
                    "px-3 md:px-4 py-2 min-w-[72px] flex-1 md:flex-initial",
                    "border transition-colors font-mono uppercase",
                    isActive
                      ? "border-foreground bg-surface-elevated"
                      : "border-border bg-transparent hover:border-border-strong hover:bg-surface-elevated/60",
                  )}
                >
                  <span className="text-[11px] tracking-widest">{r.label}</span>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      up ? "text-up" : "text-down",
                    )}
                  >
                    {formatPct(s.changePct)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
