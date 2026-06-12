"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  AreaSeries,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/cn";
import {
  formatDateTime,
  formatNOK,
  formatNOKDelta,
  formatPct,
} from "@/lib/format";
import type {
  PortfolioSeries,
  Range,
  SeriesByMetric,
  SeriesByRange,
} from "@/lib/portfolio";
import type { Owner } from "@/lib/owners";
import { Mono } from "@/components/ui";

type ViewMode = "total" | "relative" | "target" | "projection";

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: "total", label: "Total equity" },
  { key: "relative", label: "Relative equity" },
  { key: "target", label: "Target" },
  { key: "projection", label: "Projection" },
];

// FIFA World Cup 2026 final — the horizon of the WC views. Their window
// starts at kickoff (June 11), which the server bakes in as the first point
// of the "VM" series; the chart reads it back from there. Both views plot
// pure PnL accumulated since kickoff (deposits never move the curve), and
// money numbers are the pot: deposits × PnL multiplier = deposits +
// lifetime PnL. Targets are multiples of deposits; both the target path
// and the projection compound at a constant daily rate.
const WC_END_MS = Date.UTC(2026, 6, 19);
const WC_END_LABEL = "Jul 19";
const TARGET_MULTIPLIERS = [2, 3, 4];
const DAY_MS = 86_400_000;

function isWcView(mode: ViewMode): boolean {
  return mode === "target" || mode === "projection";
}

// Freshest client-side reading, polled from /api/balances. Null values mean
// "currently unknown" and leave the server-rendered series untouched.
export interface LiveEquityPoint {
  t: number;
  equityNok: number | null;
  pnlNok: number | null;
}

interface PortfolioChartProps {
  series: SeriesByMetric;
  ranges: { key: Range; label: string }[];
  owners: ReadonlyArray<Owner>;
  // Sum of all deposits in NOK — the 1x baseline of the WC views: targets
  // are multiples of it and the pot is deposits + lifetime PnL. 0 (e.g.
  // investors fetch failed) hides both overlays.
  totalDepositsNok: number;
  defaultRange?: Range;
  live?: LiveEquityPoint;
}

// Replace/append the live tail of a server-built series with a fresher
// client-side reading, recomputing the derived stats the same way the
// server does. Always applied to the pristine series prop, so repeated
// polls never accumulate extra points.
function withLivePoint(
  s: PortfolioSeries,
  t: number,
  v: number | null,
): PortfolioSeries {
  if (v == null) return s;
  const points = [...s.points];
  const last = points[points.length - 1];
  // Compare at whole-second granularity: the chart plots floor(t/1000)
  // timestamps and asserts they are strictly ascending, so a reading that
  // lands in the same second as the series tail (typical for the very first
  // client render) must replace the tail, not extend it.
  if (last && Math.floor(t / 1000) <= Math.floor(last.t / 1000)) {
    points[points.length - 1] = { t: last.t, v };
  } else {
    points.push({ t, v });
  }
  const startValue = points.find((p) => p.v !== 0)?.v ?? points[0]?.v ?? 0;
  const endValue = points[points.length - 1]?.v ?? 0;
  const changeAbs = endValue - startValue;
  const changePct =
    startValue !== 0 ? (changeAbs / Math.abs(startValue)) * 100 : 0;
  return { ...s, points, startValue, endValue, changeAbs, changePct };
}

interface HoverState {
  t: number;
  // Curve value at t. Null when hovering the future region of the target
  // view — there is a target value there but no actual reading yet.
  value: number | null;
  pct: number;
  delta: number;
}

interface ThemeColors {
  fg: string;
  bg: string;
  surface: string;
  border: string;
  muted: string;
  primary: string;
  up: string;
  down: string;
}

function findNearestKey(
  map: Map<number, number>,
  target: number,
): number | null {
  let best: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const k of map.keys()) {
    const diff = Math.abs(k - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  }
  return best;
}

function readThemeColors(): ThemeColors {
  const fallback: ThemeColors = {
    fg: "#171717",
    bg: "#fafafa",
    surface: "#ffffff",
    border: "#e5e5e5",
    muted: "#737373",
    primary: "#f43f5e",
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
    primary: root.getPropertyValue("--primary").trim() || fallback.primary,
    up: root.getPropertyValue("--up").trim() || fallback.up,
    down: root.getPropertyValue("--down").trim() || fallback.down,
  };
}

export function PortfolioChart({
  series,
  ranges,
  owners,
  totalDepositsNok,
  defaultRange = "1M",
  live,
}: PortfolioChartProps) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [viewMode, setViewModeState] = useState<ViewMode>("total");
  const [targetMult, setTargetMultState] = useState(TARGET_MULTIPLIERS[0]);
  // Selection is held by owner *name* and resolved to an index at render
  // time: the owners list refreshes live (a new investment re-sorts the
  // percentage-ordered list), and a bare index would silently repoint at a
  // different person.
  const [ownerName, setOwnerNameState] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const storedIdx = ownerName
    ? owners.findIndex((o) => o.name === ownerName)
    : -1;
  const ownerIdx = storedIdx >= 0 ? storedIdx : 0;

  // Persist the view mode + selected owner across reloads. SSR renders with
  // the defaults; on mount we read localStorage and update state if the user
  // had a prior choice. The setter wrappers save on every change.
  useEffect(() => {
    try {
      const storedMode = localStorage.getItem("portfolio:viewMode");
      if (VIEW_MODES.some((m) => m.key === storedMode)) {
        const mode = storedMode as ViewMode;
        setViewModeState(mode);
        // The WC views open on the full since-start → WC-end window.
        if (isWcView(mode)) setRange("VM");
      }
      const storedOwner = localStorage.getItem("portfolio:owner");
      if (storedOwner) setOwnerNameState(storedOwner);
      const storedTarget = Number(localStorage.getItem("portfolio:target"));
      if (TARGET_MULTIPLIERS.includes(storedTarget)) {
        setTargetMultState(storedTarget);
      }
    } catch {
      // localStorage unavailable (e.g. private mode) — ignore.
    }
  }, []);

  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    // "VM" only exists in the WC views: entering them defaults to the full
    // window, leaving falls back to the closest classic range.
    if (isWcView(v) && !isWcView(viewMode)) setRange("VM");
    if (!isWcView(v) && range === "VM") setRange("1M");
    try {
      localStorage.setItem("portfolio:viewMode", v);
    } catch {}
  };
  const setTargetMult = (m: number) => {
    setTargetMultState(m);
    try {
      localStorage.setItem("portfolio:target", String(m));
    } catch {}
  };
  const setOwnerIdx = (idx: number) => {
    const name = owners[idx]?.name;
    if (!name) return;
    setOwnerNameState(name);
    try {
      localStorage.setItem("portfolio:owner", name);
    } catch {}
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  // Second line for the WC views: the target pace line or the projection.
  // Holds empty data in the equity views.
  const refLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  // Pulsing "you are here" marker pinned to the curve's last point in the
  // WC views, positioned imperatively (no react state → no rerenders).
  const dotRef = useRef<HTMLDivElement>(null);
  const updateDotRef = useRef<(() => void) | null>(null);
  const themeRef = useRef<ThemeColors>(readThemeColors());
  const rangeRef = useRef<Range>(range);
  const viewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    rangeRef.current = range;
  }, [range]);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Server-rendered series with the freshest polled reading spliced onto the
  // tail — this is what lets a load that rendered while an upstream was
  // failing heal in place instead of staying wrong until a full reload.
  const liveSeries = useMemo<SeriesByMetric>(() => {
    if (!live) return series;
    const equity = {} as SeriesByRange;
    const pnl = {} as SeriesByRange;
    for (const key of Object.keys(series.equity) as Range[]) {
      equity[key] = withLivePoint(series.equity[key], live.t, live.equityNok);
      pnl[key] = withLivePoint(series.pnl[key], live.t, live.pnlNok);
    }
    return { equity, pnl };
  }, [series, live]);

  const active = liveSeries.equity[range];
  const activePnl = liveSeries.pnl[range];
  const base = active.startValue;
  // Current equity (= end of "1D" series, which is "now" for every range) is
  // our denominator when expressing PnL deltas as a percent. Far more stable
  // than the range's starting value — that goes to zero pre-deposit and makes
  // every percent blow up to infinity.
  const currentEquity = liveSeries.equity["1D"].endValue;
  // In Relative mode we scale every displayed NOK value by the selected
  // owner's share. The percent stays the same since both numerator and
  // denominator scale by the same factor.
  const selectedOwner =
    viewMode === "relative" ? owners[ownerIdx] ?? owners[0] : null;
  const ownerScale = selectedOwner ? selectedOwner.percentage / 100 : 1;

  // WC-view baselines. The curve is PnL accumulated since kickoff (wcBasePnl
  // rebases the lifetime PnL column to zero at June 11). Money numbers are
  // the pot — deposits × PnL multiplier, i.e. deposits + lifetime PnL — so
  // the pot at kickoff is deposits + whatever PnL existed by then.
  const isWc = isWcView(viewMode);
  const wcStartT = liveSeries.pnl.VM.points[0]?.t ?? 0;
  const wcBasePnl = liveSeries.pnl.VM.points[0]?.v ?? 0;
  const wcPotStart = totalDepositsNok + wcBasePnl;

  // WC views plot PnL accumulated since kickoff (deposits can't move it);
  // the equity views plot equity, scaled by owner share in relative mode.
  const chartData = useMemo(() => {
    if (isWc) {
      return activePnl.points.map((p) => ({
        time: Math.floor(p.t / 1000) as UTCTimestamp,
        value: p.v - wcBasePnl,
      }));
    }
    return active.points.map((p) => ({
      time: Math.floor(p.t / 1000) as UTCTimestamp,
      value: p.v * ownerScale,
    }));
  }, [active, activePnl, ownerScale, isWc, wcBasePnl]);

  const absLookup = useMemo(() => {
    const m = new Map<number, number>();
    if (isWc) {
      for (const p of activePnl.points)
        m.set(Math.floor(p.t / 1000), p.v - wcBasePnl);
    } else {
      for (const p of active.points)
        m.set(Math.floor(p.t / 1000), p.v * ownerScale);
    }
    return m;
  }, [active, activePnl, ownerScale, isWc, wcBasePnl]);

  // PnL value at each time bucket — used to drive the headline delta/percent.
  // Kept unscaled here; scaling is applied at display time alongside the NOK
  // value, so the percent (a ratio) stays unaffected.
  const pnlLookup = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of activePnl.points) m.set(Math.floor(p.t / 1000), p.v);
    return m;
  }, [activePnl]);

  // Reference line for the WC views, in the same PnL-since-kickoff space as
  // the curve — both modes compound. Target: the pot must grow from its
  // kickoff value to targetMult × deposits by WC end at a constant daily
  // rate. Projection: the average daily growth achieved so far, carried
  // forward. lightweight-charts spaces bars by index, not wall time, so the
  // line mirrors the actual curve's timestamps and then continues on a day
  // grid — uniform stamps are what keep the future region proportional.
  const refLineData = useMemo(() => {
    const out: { time: UTCTimestamp; value: number }[] = [];
    if (!isWc || totalDepositsNok <= 0) return out;
    const basePnl = liveSeries.pnl.VM.points[0]?.v ?? 0;
    const startT = liveSeries.pnl.VM.points[0]?.t ?? 0;
    const potStart = totalDepositsNok + basePnl;
    const horizon = WC_END_MS - startT;
    const lastActual = activePnl.points[activePnl.points.length - 1];
    if (potStart <= 0 || horizon <= 0 || !lastActual) return out;

    const pushFuture = (valueAt: (t: number) => number) => {
      const stamps: number[] = [];
      for (let t = lastActual.t + DAY_MS; t < WC_END_MS; t += DAY_MS) {
        stamps.push(t);
      }
      stamps.push(WC_END_MS);
      for (const t of stamps) {
        const time = Math.floor(t / 1000) as UTCTimestamp;
        // Keeps times strictly ascending; also drops the future leg
        // entirely once "now" has passed WC end.
        if (out.length > 0 && time <= out[out.length - 1].time) continue;
        out.push({ time, value: valueAt(t) });
      }
    };

    if (viewMode === "target") {
      const endPot = targetMult * totalDepositsNok;
      const targetPnl = (t: number) =>
        potStart * Math.pow(endPot / potStart, (t - startT) / horizon) -
        potStart;
      for (const p of activePnl.points) {
        out.push({
          time: Math.floor(p.t / 1000) as UTCTimestamp,
          value: targetPnl(p.t),
        });
      }
      if (range === "VM") pushFuture(targetPnl);
      return out;
    }

    // Projection only exists on the full window — the short ranges show no
    // future, so there is nothing to draw there.
    if (range !== "VM") return out;
    const potNow = potStart + (lastActual.v - basePnl);
    if (potNow <= 0) return out;
    const daysElapsed = Math.max(1, (lastActual.t - startT) / DAY_MS);
    // Average daily growth factor achieved so far, compounded forward.
    const dailyGrowth = Math.pow(potNow / potStart, 1 / daysElapsed);
    out.push({
      time: Math.floor(lastActual.t / 1000) as UTCTimestamp,
      value: lastActual.v - basePnl,
    });
    pushFuture(
      (t) =>
        potNow * Math.pow(dailyGrowth, (t - lastActual.t) / DAY_MS) - potStart,
    );
    return out;
  }, [viewMode, range, targetMult, isWc, totalDepositsNok, liveSeries, activePnl]);

  // Reference-line value per time bucket — lets a hover on the projected
  // leg read the projected PnL straight off the line.
  const refLookup = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of refLineData) m.set(p.time as number, p.value);
    return m;
  }, [refLineData]);

  useEffect(() => {
    if (!containerRef.current) return;
    const colors = readThemeColors();
    themeRef.current = colors;
    const initialLineColor = colors.primary;

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
        scaleMargins: {
          top: 0.1,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => {
          if (typeof time !== "number") return "";
          const d = new Date(time * 1000);
          if (rangeRef.current === "1D") {
            const h = d.getHours().toString().padStart(2, "0");
            const m = d.getMinutes().toString().padStart(2, "0");
            return `${h}:${m}`;
          }
          return d.toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
          });
        },
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

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: initialLineColor,
      topColor: "rgba(255, 255, 255, 0.22)",
      bottomColor: "rgba(255, 255, 255, 0)",
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
        formatter: (v: number) => formatNOK(v),
        minMove: 1,
      },
    });

    const refLine = chart.addSeries(LineSeries, {
      color: colors.muted,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: "custom",
        formatter: (v: number) => formatNOK(v),
        minMove: 1,
      },
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;
    refLineRef.current = refLine;

    // Drive the crosshair manually on touch so it appears immediately —
    // lightweight-charts' built-in tracking mode requires a ~1s long press.
    // setCrosshairPosition does NOT fire subscribeCrosshairMove, so we also
    // compute the displayed values here ourselves.
    const container = containerRef.current;
    function handleTouch(e: TouchEvent) {
      if (
        e.touches.length !== 1 ||
        !container ||
        !chartRef.current ||
        !seriesRef.current
      ) {
        return;
      }
      const touch = e.touches[0];
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const rawTime = chartRef.current.timeScale().coordinateToTime(x);
      if (typeof rawTime !== "number") return;

      // Snap to the nearest data point so the displayed value lines up with
      // the crosshair marker. The reference line participates too — without
      // it a touch drag pins at the live dot and only the ~1s long-press
      // tracking mode could reach the future leg of the WC views. Ties go
      // to the actual curve.
      const snapped = findNearestKey(absLookupRef.current, rawTime);
      const line = refLineRef.current;
      let refKey: number | null = null;
      let refValue = 0;
      let refDiff = Number.POSITIVE_INFINITY;
      if (line) {
        for (const p of line.data()) {
          if (!("value" in p)) continue;
          const diff = Math.abs((p.time as number) - rawTime);
          if (diff < refDiff) {
            refDiff = diff;
            refKey = p.time as number;
            refValue = p.value;
          }
        }
      }
      if (
        line &&
        refKey != null &&
        (snapped == null || refDiff < Math.abs(snapped - rawTime))
      ) {
        chartRef.current.setCrosshairPosition(refValue, refKey as Time, line);
        setHover({ t: refKey * 1000, value: null, pct: 0, delta: 0 });
        return;
      }
      if (snapped == null) return;
      const absValue = absLookupRef.current.get(snapped);
      if (absValue === undefined) return;

      const startVal = baseRef.current;
      const pct =
        startVal !== 0 ? ((absValue - startVal) / Math.abs(startVal)) * 100 : 0;
      const delta = absValue - startVal;

      chartRef.current.setCrosshairPosition(
        pct,
        snapped as Time,
        seriesRef.current,
      );
      setHover({ t: snapped * 1000, value: absValue, pct, delta });
    }
    container.addEventListener("touchstart", handleTouch, { passive: true });
    container.addEventListener("touchmove", handleTouch, { passive: true });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || typeof param.time !== "number") {
        setHover(null);
        return;
      }
      const t = param.time as number;
      const absValue = absLookupRef.current.get(t);
      if (absValue === undefined) {
        // Past the curve's last point there is no actual reading, but the
        // WC views still track the hover: target freezes the real number
        // while the benchmark follows; projection reads the projected
        // value off the line instead.
        if (isWcView(viewModeRef.current)) {
          setHover({ t: t * 1000, value: null, pct: 0, delta: 0 });
        } else {
          setHover(null);
        }
        return;
      }
      const startVal = baseRef.current;
      const pct =
        startVal !== 0 ? ((absValue - startVal) / Math.abs(startVal)) * 100 : 0;
      const delta = absValue - startVal;
      setHover({ t: t * 1000, value: absValue, pct, delta });
    });

    // Pin the pulsing "now" dot to the curve's last point. Shown only while
    // the reference line has data (i.e. in the WC views). Positioned against
    // the chart element's box because the container has horizontal padding.
    const dotEl = dotRef.current;
    function updateDot() {
      if (!dotEl) return;
      const c = chartRef.current;
      const s = seriesRef.current;
      const line = refLineRef.current;
      if (!c || !s || !line || line.data().length === 0) {
        dotEl.style.display = "none";
        return;
      }
      const data = s.data();
      const last = data[data.length - 1];
      if (!last || !("value" in last)) {
        dotEl.style.display = "none";
        return;
      }
      const x = c.timeScale().timeToCoordinate(last.time);
      const y = s.priceToCoordinate(last.value);
      if (x == null || y == null) {
        dotEl.style.display = "none";
        return;
      }
      const chartRect = c.chartElement().getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      dotEl.style.display = "block";
      dotEl.style.left = `${chartRect.left - containerRect.left + x}px`;
      dotEl.style.top = `${chartRect.top - containerRect.top + y}px`;
    }
    updateDotRef.current = updateDot;
    const resizeObserver = new ResizeObserver(() => updateDot());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("touchstart", handleTouch);
      container.removeEventListener("touchmove", handleTouch);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      refLineRef.current = null;
      updateDotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const absLookupRef = useRef(absLookup);
  const baseRef = useRef(base);
  useEffect(() => {
    absLookupRef.current = absLookup;
    baseRef.current = base;
  }, [absLookup, base]);

  // Both reference lines are solid: the projection reads as "your line
  // continuing" (primary, full width); the target line is a benchmark
  // (muted, thin). The pulsing dot marks where "now" sits on either.
  useEffect(() => {
    const line = refLineRef.current;
    if (!line) return;
    const colors = themeRef.current;
    line.applyOptions(
      viewMode === "projection"
        ? { color: colors.primary, lineStyle: LineStyle.Solid, lineWidth: 2 }
        : { color: colors.muted, lineStyle: LineStyle.Solid, lineWidth: 1 },
    );
  }, [viewMode]);

  useEffect(() => {
    if (!seriesRef.current || !refLineRef.current) return;
    // A crosshair pinned by the touch handler outlives the data it snapped
    // to; replacing the series under it (e.g. leaving the WC views drops
    // every future stamp) makes lightweight-charts throw while re-rendering
    // it and takes the page down. Unpin before swapping.
    chartRef.current?.clearCrosshairPosition();
    seriesRef.current.setData(chartData);
    refLineRef.current.setData(refLineData);
    chartRef.current?.timeScale().fitContent();
    updateDotRef.current?.();
    setHover(null);
    // On initial SSR mount the chart's container hasn't settled into its
    // final size when this effect runs, so fitContent computes against a
    // stale viewport and the live point at the right edge gets cropped.
    // Re-fit on the next frame to catch the post-layout dimensions.
    const raf = requestAnimationFrame(() => {
      chartRef.current?.timeScale().fitContent();
      updateDotRef.current?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [chartData, refLineData]);

  // Headline values at the display moment. In the WC views the curve is
  // PnL-since-kickoff and the money number is the pot (deposits + lifetime
  // PnL); in the equity views it's the (owner-scaled) equity value itself.
  const lastCurvePoint = isWc
    ? activePnl.points[activePnl.points.length - 1]
    : active.points[active.points.length - 1];
  const lastCurveValue = isWc
    ? (lastCurvePoint?.v ?? 0) - wcBasePnl
    : active.endValue * ownerScale;
  const displayT = hover?.t ?? lastCurvePoint?.t ?? 0;
  // A null hover value means the cursor is past the curve's end. The target
  // view blanks the real number there ("—", only the benchmark tracks); the
  // projection view shows the projected PnL × money instead, read off the
  // line.
  const hoverProjectedPnl =
    viewMode === "projection" && hover && hover.value == null
      ? refLookup.get(Math.floor(hover.t / 1000)) ?? null
      : null;
  const targetFutureHover =
    viewMode === "target" && hover != null && hover.value == null;
  const displayCurveValue =
    hover?.value ?? hoverProjectedPnl ?? lastCurveValue;
  // Where the projection lands at WC end, in money; null while the line
  // isn't drawn (no baseline yet). Doubles as the projection view's resting
  // headline — the estimate is the view's whole point, so it leads.
  const projectedEndMoney =
    viewMode === "projection" && wcPotStart > 0 && refLineData.length > 1
      ? wcPotStart + refLineData[refLineData.length - 1].value
      : null;
  const headlineValue =
    viewMode === "projection" && !hover && projectedEndMoney != null
      ? projectedEndMoney
      : isWc
        ? wcPotStart + displayCurveValue
        : displayCurveValue;
  // The target view's second number. Default: the pot if the target is hit
  // (targetMult × deposits). While hovering: where the compounding path
  // says the pot should be at the hovered moment.
  const wcHorizon = WC_END_MS - wcStartT;
  const targetMoney =
    viewMode === "target" &&
    totalDepositsNok > 0 &&
    wcPotStart > 0 &&
    wcHorizon > 0
      ? hover
        ? wcPotStart *
          Math.pow(
            (targetMult * totalDepositsNok) / wcPotStart,
            (displayT - wcStartT) / wcHorizon,
          )
        : targetMult * totalDepositsNok
      : null;
  const rangeLabel = ranges.find((r) => r.key === range)?.label ?? "";
  const headerLabel =
    viewMode === "target"
      ? "Money vs target"
      : viewMode === "projection"
        ? "Money & projection"
        : selectedOwner
          ? `${selectedOwner.name}'s equity`
          : "Equity";
  // Daily compounding rates surfaced in the labels: the average daily PnL
  // the projection extrapolates with, and the daily PnL the target needs.
  const wcDaysElapsed = Math.max(
    1,
    ((lastCurvePoint?.t ?? wcStartT) - wcStartT) / DAY_MS,
  );
  const wcPotNow = wcPotStart + lastCurveValue;
  const projDailyPct =
    viewMode === "projection" && wcPotStart > 0 && wcPotNow > 0
      ? (Math.pow(wcPotNow / wcPotStart, 1 / wcDaysElapsed) - 1) * 100
      : null;
  const targetDailyPct =
    targetMoney != null
      ? (Math.pow(
          (targetMult * totalDepositsNok) / wcPotStart,
          DAY_MS / wcHorizon,
        ) -
          1) *
        100
      : null;
  // PnL deltas drive the headline kr + percent. Scale the NOK amount by the
  // selected owner's share, but the percent is a ratio so it cancels out.
  // On the projected leg the delta tracks the projected PnL so it stays
  // consistent with the money number above it.
  const pnlDeltaUnscaled = hover
    ? hoverProjectedPnl != null
      ? hoverProjectedPnl
      : (pnlLookup.get(Math.floor(hover.t / 1000)) ?? activePnl.endValue) -
        activePnl.startValue
    : activePnl.changeAbs;
  const pnlDelta = pnlDeltaUnscaled * ownerScale;
  // Percent basis: the kickoff pot in the WC views (deposit-timing free),
  // current equity elsewhere.
  const pnlPctBase = isWc ? wcPotStart : currentEquity;
  const pnlPct = pnlPctBase > 0 ? (pnlDeltaUnscaled / pnlPctBase) * 100 : 0;
  const isUp = pnlDelta >= 0;
  const deltaTone = isUp ? "text-up" : "text-down";

  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 md:px-10">
        <div className="bg-surface">
          <div className="p-6 border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Mono className="text-muted">{headerLabel}</Mono>
                <div className="mt-2 text-4xl md:text-5xl font-medium tabular-nums tracking-tight">
                  {/* Same formatting as formatNOK (en-US grouping, rounded,
                      " kr"), but with per-digit roll animation on live ticks.
                      While the user scrubs the chart the value snaps instead
                      of spinning through every hovered point. Scrubbing the
                      future in target view has no real reading — show a dash
                      rather than a frozen stale value. */}
                  {targetFutureHover ? (
                    "—"
                  ) : (
                    <NumberFlow
                      value={Math.round(headlineValue)}
                      locales="en-US"
                      format={{ maximumFractionDigits: 0 }}
                      suffix=" kr"
                      animated={!hover}
                    />
                  )}
                </div>
                {targetMoney != null && (
                  <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums text-muted">
                    <span className="text-[10px] uppercase tracking-widest">
                      target {targetMult}x by {WC_END_LABEL}
                    </span>
                    <span className="text-xl md:text-2xl">
                      <NumberFlow
                        value={Math.round(targetMoney)}
                        locales="en-US"
                        format={{ maximumFractionDigits: 0 }}
                        suffix=" kr"
                        animated={!hover}
                      />
                    </span>
                  </div>
                )}
                {/* WC views keep this area clean: no range label or deltas
                    (the pot and pace lines carry it) — only the hovered date
                    while scrubbing, as the time anchor. */}
                {!isWc ? (
                  <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline gap-1 sm:gap-3 font-mono text-sm tabular-nums">
                    <span className="text-muted">
                      {hover ? formatDateTime(displayT) : rangeLabel}
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className={deltaTone}>
                        {formatNOKDelta(pnlDelta)}
                      </span>
                      <span className={deltaTone}>{formatPct(pnlPct)}</span>
                    </div>
                  </div>
                ) : hover ? (
                  <div className="mt-2 font-mono text-sm tabular-nums text-muted">
                    {formatDateTime(displayT)}
                  </div>
                ) : null}
                {viewMode === "target" && targetDailyPct != null && (
                  <div className="mt-1 font-mono text-xs text-muted tabular-nums">
                    needs {formatPct(targetDailyPct)}/day to hit {targetMult}x
                  </div>
                )}
                {viewMode === "projection" &&
                  projectedEndMoney != null &&
                  projDailyPct != null && (
                    <div className="mt-1 font-mono text-xs text-muted tabular-nums">
                      <span
                        className={projDailyPct >= 0 ? "text-up" : "text-down"}
                      >
                        pace {formatPct(projDailyPct)}/day
                      </span>{" "}
                      → est. {WC_END_LABEL}: {formatNOK(projectedEndMoney)} (
                      {(projectedEndMoney / totalDepositsNok).toFixed(2)}x)
                    </div>
                  )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <ViewModeDropdown
                  viewMode={viewMode}
                  onChange={setViewMode}
                />
                {viewMode === "relative" && (
                  <div className="animate-[dropdown-pop-in_180ms_ease-out] origin-top-right">
                    <OwnerDropdown
                      owners={owners}
                      selectedIdx={ownerIdx}
                      onChange={setOwnerIdx}
                    />
                  </div>
                )}
                {viewMode === "target" && (
                  <div className="animate-[dropdown-pop-in_180ms_ease-out] origin-top-right">
                    <TargetDropdown
                      value={targetMult}
                      onChange={setTargetMult}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            ref={containerRef}
            className={cn(
              "relative h-[300px] md:h-[420px] w-full touch-none px-3 sm:px-6",
              // Without the timeframe footer the time axis would sit flush
              // against the card edge.
              isWc && "mb-3 md:mb-4",
            )}
          >
            {/* "You are here" marker for the WC views; positioned by
                updateDot, hidden whenever the reference line is empty. */}
            <div
              ref={dotRef}
              aria-hidden
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ display: "none" }}
            >
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-75"
                style={{ backgroundColor: "var(--primary)" }}
              />
              <span
                className="relative block h-3 w-3 rounded-full"
                style={{ backgroundColor: "var(--primary)" }}
              />
            </div>
          </div>

          {/* The WC views are pinned to the kickoff → WC-end window, so
              they get no timeframe picker at all. */}
          {!isWc && (
          <div className="p-3 md:p-4 flex flex-wrap gap-2">
            {ranges.map((r) => {
              const isActive = r.key === range;
              // The per-range label is always the relative PnL return for
              // that range, regardless of which line is on screen — same
              // semantics as the headline percent.
              const pnlForRange = liveSeries.pnl[r.key].changeAbs;
              const pct =
                currentEquity > 0 ? (pnlForRange / currentEquity) * 100 : 0;
              const up = pnlForRange >= 0;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5",
                    "px-3 md:px-4 py-2 min-w-[72px] flex-1 md:flex-initial",
                    "rounded-lg transition-colors font-mono uppercase",
                    isActive
                      ? "bg-foreground/15 text-foreground"
                      : "bg-foreground/[0.05] text-muted hover:bg-foreground/10 hover:text-foreground",
                  )}
                >
                  <span className="text-[11px] tracking-widest">{r.label}</span>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      up ? "text-up" : "text-down",
                    )}
                  >
                    {formatPct(pct)}
                  </span>
                </button>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useOutsideClick(
  ref: RefObject<HTMLDivElement | null>,
  active: boolean,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!active) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, active, onOutside]);
}

function ViewModeDropdown({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, open, () => setOpen(false));
  const current = VIEW_MODES.find((m) => m.key === viewMode)?.label ?? "";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="font-mono text-[10px] uppercase tracking-widest rounded-lg bg-foreground/[0.05] text-muted px-3 py-2 hover:bg-foreground/10 hover:text-foreground flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
      >
        <span>{current}</span>
        <span
          aria-hidden
          className={cn(
            "transition-transform leading-none",
            open && "rotate-180",
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 rounded-lg bg-surface-elevated min-w-[160px] z-20 overflow-hidden p-1"
        >
          {VIEW_MODES.map((m) => {
            const selected = m.key === viewMode;
            return (
              <button
                key={m.key}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(m.key);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between gap-3 w-full text-left font-mono text-[10px] uppercase tracking-widest rounded-lg px-3 py-2 whitespace-nowrap cursor-pointer transition-colors",
                  selected
                    ? "text-foreground"
                    : "text-muted hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                <span>{m.label}</span>
                <span
                  aria-hidden
                  className={cn(
                    "leading-none",
                    selected ? "opacity-100" : "opacity-0",
                  )}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TargetDropdown({
  value,
  onChange,
}: {
  value: number;
  onChange: (m: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="font-mono text-[10px] uppercase tracking-widest rounded-lg bg-foreground/10 text-foreground ring-1 ring-foreground/25 px-3 py-2 hover:bg-foreground/15 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
      >
        <span aria-hidden className="text-muted leading-none">
          ↳
        </span>
        <span>{value}x</span>
        <span
          aria-hidden
          className={cn(
            "transition-transform leading-none",
            open && "rotate-180",
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 rounded-lg bg-surface-elevated min-w-[160px] z-20 overflow-hidden p-1"
        >
          {TARGET_MULTIPLIERS.map((m) => {
            const selected = m === value;
            return (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between gap-3 w-full text-left font-mono text-[10px] uppercase tracking-widest rounded-lg px-3 py-2 whitespace-nowrap cursor-pointer transition-colors",
                  selected
                    ? "text-foreground"
                    : "text-muted hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                <span>{m}x</span>
                <span
                  aria-hidden
                  className={cn(
                    "leading-none",
                    selected ? "opacity-100" : "opacity-0",
                  )}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OwnerDropdown({
  owners,
  selectedIdx,
  onChange,
}: {
  owners: ReadonlyArray<Owner>;
  selectedIdx: number;
  onChange: (idx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, open, () => setOpen(false));
  const current = owners[selectedIdx] ?? owners[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="font-mono text-[10px] uppercase tracking-widest rounded-lg bg-foreground/10 text-foreground ring-1 ring-foreground/25 px-3 py-2 hover:bg-foreground/15 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
      >
        <span aria-hidden className="text-muted leading-none">
          ↳
        </span>
        <span>{current?.name ?? ""}</span>
        <span
          aria-hidden
          className={cn(
            "transition-transform leading-none",
            open && "rotate-180",
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 rounded-lg bg-surface-elevated min-w-[220px] z-20 overflow-hidden p-1"
        >
          {owners.map((o, idx) => {
            const selected = idx === selectedIdx;
            return (
              <button
                key={o.name}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(idx);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between gap-4 w-full text-left font-mono text-[10px] uppercase tracking-widest rounded-lg px-3 py-2 whitespace-nowrap cursor-pointer transition-colors",
                  selected
                    ? "text-foreground"
                    : "text-muted hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                <span>{o.name}</span>
                <span className="tabular-nums">
                  {o.percentage.toFixed(2)}%
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
