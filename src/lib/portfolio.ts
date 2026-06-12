import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

// "VM" = World Cup window (kickoff → now) at daily resolution. It backs the
// WC views in the chart and is not part of RANGES (the default footer
// buttons); the chart swaps it in for the "1M" button in those views.
export type Range = "1D" | "1U" | "1M" | "VM";
export type Metric = "equity" | "pnl";

export const RANGES: { key: Range; label: string }[] = [
  { key: "1D", label: "Today" },
  { key: "1U", label: "1 week" },
  { key: "1M", label: "1 month" },
];

const ALL_RANGES: Range[] = ["1D", "1U", "1M", "VM"];

export const METRICS: { key: Metric; label: string }[] = [
  { key: "equity", label: "Equity" },
  { key: "pnl", label: "PnL" },
];

export interface SeriesPoint {
  t: number;
  v: number;
}

export interface PortfolioSeries {
  range: Range;
  points: SeriesPoint[];
  startValue: number;
  endValue: number;
  changeAbs: number;
  changePct: number;
}

export type SeriesByRange = Record<Range, PortfolioSeries>;
export type SeriesByMetric = Record<Metric, SeriesByRange>;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// WC 2026 kickoff (June 11) — the "VM" range starts here. The chart reads
// this back as the first point of the VM series, so it lives only here.
const VM_START_MS = Date.UTC(2026, 5, 11);

const RANGE_DAYS: Record<Exclude<Range, "VM">, number> = {
  "1D": 1,
  "1U": 7,
  "1M": 30,
};

// Bar resolution per range. Finer for short ranges (precise live-point spacing),
// coarser for long ranges (keep bar count under ~5k). "VM" is day-by-day:
// that's the unit the WC-end target/projection views reason in.
const STEP_MS: Record<Range, number> = {
  "1D": MIN_MS,
  "1U": 5 * MIN_MS,
  "1M": 15 * MIN_MS,
  VM: DAY_MS,
};

type Column = "total_nok" | "pnl_nok";

function buildSeries(
  range: Range,
  rangeStart: number,
  hourValues: Map<number, number>,
  now: number,
  liveValue: number | null,
  seedValue: number,
  firstNonZeroTime: number | null,
): PortfolioSeries {
  const stepMs = STEP_MS[range];

  // Hourly anchors across the range. Two regimes:
  //  - Before firstNonZeroTime (the first non-zero value ever recorded):
  //    missing hours stay at 0 — nothing happened yet.
  //  - At/after firstNonZeroTime: missing hours carry forward the last
  //    known value, so cron gaps render as a flat hold instead of dropping.
  const firstHour = Math.ceil(rangeStart / HOUR_MS) * HOUR_MS;
  const lastHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const anchors: SeriesPoint[] = [];
  const startBeforeFNZ =
    firstNonZeroTime != null && rangeStart < firstNonZeroTime;
  let lastKnown = startBeforeFNZ ? 0 : seedValue;
  anchors.push({ t: rangeStart, v: lastKnown });
  for (let h = firstHour; h <= lastHour; h += HOUR_MS) {
    const v = hourValues.get(h);
    if (v != null) lastKnown = v;
    if (firstNonZeroTime != null && h < firstNonZeroTime && v == null) {
      anchors.push({ t: h, v: 0 });
    } else {
      anchors.push({ t: h, v: lastKnown });
    }
  }
  if (liveValue != null) {
    anchors.push({ t: now, v: liveValue });
    lastKnown = liveValue;
  }

  // Densify to step resolution with linear interpolation between anchors.
  // The dense grid is what gives lightweight-charts proportional spacing —
  // the live point ends up N bars past the last hourly anchor where N is
  // (minutes_elapsed / step_minutes), so a 30min gap renders as half an hour.
  const points: SeriesPoint[] = [];
  let anchorIdx = 0;
  for (let t = rangeStart; t <= now; t += stepMs) {
    while (anchorIdx < anchors.length && anchors[anchorIdx].t <= t) {
      anchorIdx++;
    }
    if (anchorIdx === 0) {
      points.push({ t, v: anchors[0]?.v ?? seedValue });
    } else if (anchorIdx >= anchors.length) {
      points.push({ t, v: anchors[anchors.length - 1].v });
    } else {
      const prev = anchors[anchorIdx - 1];
      const next = anchors[anchorIdx];
      if (next.t === prev.t) {
        points.push({ t, v: next.v });
      } else {
        const frac = (t - prev.t) / (next.t - prev.t);
        points.push({ t, v: prev.v + frac * (next.v - prev.v) });
      }
    }
  }

  // Pin the final bar to exact `now` so the live point lands at its true
  // time, not snapped to the step grid.
  if (liveValue != null) {
    const last = points[points.length - 1];
    if (last && last.t === now) {
      last.v = liveValue;
    } else if (!last || last.t < now) {
      points.push({ t: now, v: liveValue });
    }
  }

  // Anchor pct to the first non-zero point. Using abs() lets negative starts
  // produce intuitive deltas — e.g. PnL going from −500 to −300 reads as +40%
  // (loss shrank by 40%), not −40%.
  const startValue = points.find((p) => p.v !== 0)?.v ?? points[0]?.v ?? 0;
  const endValue = points[points.length - 1]?.v ?? 0;
  const changeAbs = endValue - startValue;
  const changePct =
    startValue !== 0 ? (changeAbs / Math.abs(startValue)) * 100 : 0;

  return { range, points, startValue, endValue, changeAbs, changePct };
}

function parseTotal(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

interface SnapshotRow {
  hour_bucket: string;
  total_nok: unknown;
  pnl_nok: unknown;
}

// Every snapshot since inception, oldest first. The "VM" range needs full
// history anyway, and hourly rows are tiny (~8.7k/year), so one blanket
// fetch serving every range of both metrics beats six scoped queries.
// Revisit the cap if the fund outlives it.
async function loadSnapshotRows(): Promise<SnapshotRow[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("portfolio_snapshots")
    .select("hour_bucket, total_nok, pnl_nok")
    .order("hour_bucket", { ascending: true })
    .limit(10_000);
  return (data as SnapshotRow[] | null) ?? [];
}

function buildColumnSeries(
  rows: SnapshotRow[],
  column: Column,
  now: number,
  liveValue: number | null,
): SeriesByRange {
  // Time-ascending [hourMs, value] entries for this column. Ascending order
  // is what lets the seed scan below stop at range start.
  const entries: [number, number][] = [];
  for (const r of rows) {
    const v = parseTotal(r[column]);
    if (v == null) continue;
    entries.push([Date.parse(r.hour_bucket), v]);
  }
  const hourValues = new Map(entries);
  const firstNonZeroTime = entries.find(([, v]) => v !== 0)?.[0] ?? null;

  // Last known value strictly before the range start; falls back to the
  // first value ever so a range opening mid-gap still anchors sensibly.
  const seedFor = (rangeStart: number): number => {
    let seed = entries[0]?.[1] ?? 0;
    for (const [t, v] of entries) {
      if (t >= rangeStart) break;
      seed = v;
    }
    return seed;
  };

  const out = {} as SeriesByRange;
  for (const key of ALL_RANGES) {
    const rangeStart =
      key === "VM" ? VM_START_MS : now - RANGE_DAYS[key] * DAY_MS;
    out[key] = buildSeries(
      key,
      rangeStart,
      hourValues,
      now,
      liveValue,
      seedFor(rangeStart),
      firstNonZeroTime,
    );
  }
  return out;
}

export async function getPortfolioSeries(
  live:
    | { equityNok: number | null; pnlNok: number | null }
    | Promise<{ equityNok: number | null; pnlNok: number | null }>,
): Promise<SeriesByMetric> {
  const now = Date.now();
  const livePromise = Promise.resolve(live);
  // Kick the snapshot query off first so it overlaps with the (slow)
  // live-balance fetch instead of running after it.
  const rows = await loadSnapshotRows();
  const liveVals = await livePromise;
  return {
    equity: buildColumnSeries(rows, "total_nok", now, liveVals.equityNok),
    pnl: buildColumnSeries(rows, "pnl_nok", now, liveVals.pnlNok),
  };
}
