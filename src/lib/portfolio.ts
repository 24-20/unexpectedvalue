import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export type Range = "1D" | "1U" | "1M" | "3M";

export const RANGES: { key: Range; label: string }[] = [
  { key: "1D", label: "I dag" },
  { key: "1U", label: "1 uke" },
  { key: "1M", label: "1 måned" },
  { key: "3M", label: "3 måned" },
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

const DAY_MS = 86_400_000;

const RANGE_DAYS: Record<Range, number> = {
  "1D": 1,
  "1U": 7,
  "1M": 30,
  "3M": 90,
};

interface RawRow {
  captured_at: string;
  total_nok: number | string | null;
}

function buildSeries(range: Range, rows: SeriesPoint[], now: number): PortfolioSeries {
  const start = now - RANGE_DAYS[range] * DAY_MS;
  const points = rows.filter((p) => p.t >= start);

  if (points.length === 0) {
    return {
      range,
      points: [],
      startValue: 0,
      endValue: 0,
      changeAbs: 0,
      changePct: 0,
    };
  }

  const startValue = points[0].v;
  const endValue = points[points.length - 1].v;
  const changeAbs = endValue - startValue;
  const changePct = startValue > 0 ? (changeAbs / startValue) * 100 : 0;
  return { range, points, startValue, endValue, changeAbs, changePct };
}

export async function getPortfolioSeries(): Promise<Record<Range, PortfolioSeries>> {
  const now = Date.now();
  const earliest = new Date(now - RANGE_DAYS["3M"] * DAY_MS).toISOString();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("captured_at, total_nok")
    .gte("captured_at", earliest)
    .not("total_nok", "is", null)
    .order("captured_at", { ascending: true })
    .limit(10_000);

  const rows: SeriesPoint[] = [];
  if (!error && data) {
    for (const r of data as RawRow[]) {
      const v = typeof r.total_nok === "string" ? Number(r.total_nok) : r.total_nok;
      if (v == null || !Number.isFinite(v)) continue;
      rows.push({ t: Date.parse(r.captured_at), v });
    }
  }

  const out = {} as Record<Range, PortfolioSeries>;
  for (const r of RANGES) out[r.key] = buildSeries(r.key, rows, now);
  return out;
}
