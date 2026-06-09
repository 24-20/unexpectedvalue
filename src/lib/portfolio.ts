import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export type Range = "1D" | "1U" | "1M" | "3M";

export const RANGES: { key: Range; label: string }[] = [
  { key: "1D", label: "Today" },
  { key: "1U", label: "1 week" },
  { key: "1M", label: "1 month" },
  { key: "3M", label: "3 months" },
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

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const RANGE_DAYS: Record<Range, number> = {
  "1D": 1,
  "1U": 7,
  "1M": 30,
  "3M": 90,
};

// Bar resolution per range. Finer for short ranges (precise live-point spacing),
// coarser for long ranges (keep bar count under ~5k).
const STEP_MS: Record<Range, number> = {
  "1D": MIN_MS,
  "1U": 5 * MIN_MS,
  "1M": 15 * MIN_MS,
  "3M": 30 * MIN_MS,
};

interface RawRow {
  hour_bucket: string;
  total_nok: number | string | null;
}

function buildSeries(
  range: Range,
  hourValues: Map<number, number>,
  now: number,
  liveValue: number | null,
): PortfolioSeries {
  const rangeStart = now - RANGE_DAYS[range] * DAY_MS;
  const stepMs = STEP_MS[range];

  // Hourly anchors across the range. Missing hour → 0 per user spec.
  const firstHour = Math.ceil(rangeStart / HOUR_MS) * HOUR_MS;
  const lastHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const anchors: SeriesPoint[] = [];
  for (let h = firstHour; h <= lastHour; h += HOUR_MS) {
    anchors.push({ t: h, v: hourValues.get(h) ?? 0 });
  }
  if (liveValue != null) {
    anchors.push({ t: now, v: liveValue });
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
      points.push({ t, v: 0 });
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

  const startValue = points.find((p) => p.v > 0)?.v ?? 0;
  const endValue = points[points.length - 1]?.v ?? 0;
  const changeAbs = endValue - startValue;
  const changePct = startValue > 0 ? (changeAbs / startValue) * 100 : 0;

  return { range, points, startValue, endValue, changeAbs, changePct };
}

export async function getPortfolioSeries(
  liveValue: number | null = null,
): Promise<Record<Range, PortfolioSeries>> {
  const now = Date.now();
  const earliest = new Date(now - RANGE_DAYS["3M"] * DAY_MS).toISOString();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("hour_bucket, total_nok")
    .gte("hour_bucket", earliest)
    .not("total_nok", "is", null)
    .order("hour_bucket", { ascending: true })
    .limit(10_000);

  const hourValues = new Map<number, number>();
  if (!error && data) {
    for (const r of data as RawRow[]) {
      const v = typeof r.total_nok === "string" ? Number(r.total_nok) : r.total_nok;
      if (v == null || !Number.isFinite(v)) continue;
      hourValues.set(Date.parse(r.hour_bucket), v);
    }
  }

  const out = {} as Record<Range, PortfolioSeries>;
  for (const r of RANGES) out[r.key] = buildSeries(r.key, hourValues, now, liveValue);
  return out;
}
