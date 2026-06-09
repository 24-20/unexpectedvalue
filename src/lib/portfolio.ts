import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export type Range = "1D" | "1U" | "1M";

export const RANGES: { key: Range; label: string }[] = [
  { key: "1D", label: "Today" },
  { key: "1U", label: "1 week" },
  { key: "1M", label: "1 month" },
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
};

// Bar resolution per range. Finer for short ranges (precise live-point spacing),
// coarser for long ranges (keep bar count under ~5k).
const STEP_MS: Record<Range, number> = {
  "1D": MIN_MS,
  "1U": 5 * MIN_MS,
  "1M": 15 * MIN_MS,
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
  seedValue: number,
  firstNonZeroTime: number | null,
): PortfolioSeries {
  const rangeStart = now - RANGE_DAYS[range] * DAY_MS;
  const stepMs = STEP_MS[range];

  // Hourly anchors across the range. Two regimes:
  //  - Before firstNonZeroTime (the first time the balance ever went > 0):
  //    missing hours stay at 0 — the user hadn't gotten money yet.
  //  - At/after firstNonZeroTime: missing hours carry forward the last
  //    known value, so cron gaps render as a flat hold instead of dropping.
  const firstHour = Math.ceil(rangeStart / HOUR_MS) * HOUR_MS;
  const lastHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const anchors: SeriesPoint[] = [];
  // Seed: if the visible range starts BEFORE the user ever had a non-zero
  // balance, seed at 0; otherwise carry forward from the prior snapshot.
  const startBeforeFNZ =
    firstNonZeroTime != null && rangeStart < firstNonZeroTime;
  let lastKnown = startBeforeFNZ ? 0 : seedValue;
  anchors.push({ t: rangeStart, v: lastKnown });
  for (let h = firstHour; h <= lastHour; h += HOUR_MS) {
    const v = hourValues.get(h);
    if (v != null) lastKnown = v;
    if (firstNonZeroTime != null && h < firstNonZeroTime && v == null) {
      // Pre-FNZ gap → stay at 0, don't carry forward a future value.
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

  // Anchor the % change to the FIRST non-zero point in the range — i.e. the
  // moment the user actually had a balance. If we used points[0] here it
  // would be 0 when the range starts pre-FNZ and the chart would derive a
  // useless "0% change from 0 NOK" instead of "X% since first deposit".
  const startValue = points.find((p) => p.v > 0)?.v ?? points[0]?.v ?? 0;
  const endValue = points[points.length - 1]?.v ?? 0;
  const changeAbs = endValue - startValue;
  const changePct = startValue > 0 ? (changeAbs / startValue) * 100 : 0;

  return { range, points, startValue, endValue, changeAbs, changePct };
}

function parseTotal(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

export async function getPortfolioSeries(
  liveValue: number | null = null,
): Promise<Record<Range, PortfolioSeries>> {
  const now = Date.now();
  const earliest = new Date(now - RANGE_DAYS["1M"] * DAY_MS).toISOString();
  const supabase = getSupabaseAdmin();

  // Snapshots within the visible range.
  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("hour_bucket, total_nok")
    .gte("hour_bucket", earliest)
    .not("total_nok", "is", null)
    .order("hour_bucket", { ascending: true })
    .limit(10_000);

  // Most recent snapshot BEFORE the range so each chart starts from the
  // user's actual equity at range-start instead of zero.
  const { data: priorData } = await supabase
    .from("portfolio_snapshots")
    .select("total_nok")
    .lt("hour_bucket", earliest)
    .not("total_nok", "is", null)
    .order("hour_bucket", { ascending: false })
    .limit(1);

  // First snapshot EVER where the balance was > 0. Marks the moment the
  // user's portfolio went from empty to non-empty; before this timestamp
  // the chart pins to 0, after it carry-forward kicks in.
  const { data: firstNonZeroData } = await supabase
    .from("portfolio_snapshots")
    .select("hour_bucket")
    .gt("total_nok", 0)
    .order("hour_bucket", { ascending: true })
    .limit(1);

  let firstNonZeroTime: number | null = null;
  if (firstNonZeroData && firstNonZeroData.length > 0) {
    firstNonZeroTime = Date.parse(firstNonZeroData[0].hour_bucket);
  }

  const hourValues = new Map<number, number>();
  if (!error && data) {
    for (const r of data as RawRow[]) {
      const v = parseTotal(r.total_nok);
      if (v == null) continue;
      hourValues.set(Date.parse(r.hour_bucket), v);
    }
  }

  // Build a seed value for carry-forward: prefer the snapshot just before
  // the range, fall back to the earliest in-range snapshot, then 0.
  let seedValue = 0;
  const prior = priorData?.[0];
  if (prior) {
    const v = parseTotal(prior.total_nok);
    if (v != null) seedValue = v;
  } else {
    const firstInRange = data?.[0];
    if (firstInRange) {
      const v = parseTotal((firstInRange as RawRow).total_nok);
      if (v != null) seedValue = v;
    }
  }

  const out = {} as Record<Range, PortfolioSeries>;
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
