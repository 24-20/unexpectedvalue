import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export type Range = "1D" | "1U" | "1M";
export type Metric = "equity" | "pnl";

export const RANGES: { key: Range; label: string }[] = [
  { key: "1D", label: "Today" },
  { key: "1U", label: "1 week" },
  { key: "1M", label: "1 month" },
];

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

const RANGE_DAYS: Record<Range, number> = {
  "1D": 1,
  "1U": 7,
  "1M": 30,
};

// Bar resolution per range. Finer for short ranges (precise live-point spacing),
// coarser for long ranges (keep bar count under ~5k).
const STEP_MS: Record<Range, number> = {
  "1D": MIN_MS,
  "1U": 5 * MIN_MS,
  "1M": 15 * MIN_MS,
};

type Column = "total_nok" | "pnl_nok";

function buildSeries(
  range: Range,
  hourValues: Map<number, number>,
  now: number,
  liveValue: number | null,
  seedValue: number,
  firstNonZeroTime: number | null,
): PortfolioSeries {
  const rangeStart = now - RANGE_DAYS[range] * DAY_MS;
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

async function loadMetricSeries(
  column: Column,
  liveValue: number | null,
  now: number,
  earliest: string,
): Promise<SeriesByRange> {
  const supabase = getSupabaseAdmin();

  // In-range snapshots, the prior anchor, and the first non-zero snapshot
  // ever — three queries done in parallel.
  const [inRange, priorRes, firstNonZeroRes] = await Promise.all([
    supabase
      .from("portfolio_snapshots")
      .select(`hour_bucket, ${column}`)
      .gte("hour_bucket", earliest)
      .not(column, "is", null)
      .order("hour_bucket", { ascending: true })
      .limit(10_000),
    supabase
      .from("portfolio_snapshots")
      .select(column)
      .lt("hour_bucket", earliest)
      .not(column, "is", null)
      .order("hour_bucket", { ascending: false })
      .limit(1),
    supabase
      .from("portfolio_snapshots")
      .select("hour_bucket")
      .not(column, "is", null)
      .neq(column, 0)
      .order("hour_bucket", { ascending: true })
      .limit(1),
  ]);

  const data = inRange.data as Array<Record<string, unknown>> | null;
  const priorData = priorRes.data as Array<Record<string, unknown>> | null;
  const firstNonZeroData = firstNonZeroRes.data as
    | Array<{ hour_bucket: string }>
    | null;

  let firstNonZeroTime: number | null = null;
  if (firstNonZeroData && firstNonZeroData.length > 0) {
    firstNonZeroTime = Date.parse(firstNonZeroData[0].hour_bucket);
  }

  const hourValues = new Map<number, number>();
  if (data) {
    for (const r of data) {
      const v = parseTotal(r[column]);
      if (v == null) continue;
      hourValues.set(Date.parse(r.hour_bucket as string), v);
    }
  }

  let seedValue = 0;
  const prior = priorData?.[0];
  if (prior) {
    const v = parseTotal(prior[column]);
    if (v != null) seedValue = v;
  } else {
    const firstInRange = data?.[0];
    if (firstInRange) {
      const v = parseTotal(firstInRange[column]);
      if (v != null) seedValue = v;
    }
  }

  const out = {} as SeriesByRange;
  for (const r of RANGES)
    out[r.key] = buildSeries(
      r.key,
      hourValues,
      now,
      liveValue,
      seedValue,
      firstNonZeroTime,
    );
  return out;
}

export async function getPortfolioSeries(live: {
  equityNok: number | null;
  pnlNok: number | null;
}): Promise<SeriesByMetric> {
  const now = Date.now();
  const earliest = new Date(now - RANGE_DAYS["1M"] * DAY_MS).toISOString();
  const [equity, pnl] = await Promise.all([
    loadMetricSeries("total_nok", live.equityNok, now, earliest),
    loadMetricSeries("pnl_nok", live.pnlNok, now, earliest),
  ]);
  return { equity, pnl };
}
