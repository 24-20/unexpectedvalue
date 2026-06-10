import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface Investor {
  id: string;
  name: string;
  slug: string;
  percentage: number;
  totalInvestedNok: number;
}

interface InvestorRow {
  id: string;
  name: string;
  slug: string;
  current_percentage: number | string;
  total_invested_nok: number | string;
}

function rowToInvestor(r: InvestorRow): Investor {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    percentage: Number(r.current_percentage),
    totalInvestedNok: Number(r.total_invested_nok),
  };
}

export async function getInvestors(): Promise<Investor[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investors")
    .select("id, name, slug, current_percentage, total_invested_nok")
    .order("current_percentage", { ascending: false });
  if (error) {
    console.error("getInvestors failed", error);
    return [];
  }
  return (data as InvestorRow[]).map(rowToInvestor);
}

export async function searchInvestorsByName(query: string): Promise<Investor[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investors")
    .select("id, name, slug, current_percentage, total_invested_nok")
    .ilike("name", `%${trimmed}%`)
    .order("current_percentage", { ascending: false })
    .limit(10);
  if (error) {
    console.error("searchInvestorsByName failed", error);
    return [];
  }
  return (data as InvestorRow[]).map(rowToInvestor);
}

// Public-safe view of the investments log for the alert feed. Investor names
// are already public on /owners, but NOK amounts, equity snapshots, and
// percentages must never leave the server through this path.
export interface RecentInvestment {
  id: number;
  name: string;
  isNewInvestor: boolean;
  timestamp: number; // ms epoch
}

interface RecentInvestmentRow {
  id: number;
  percentage_before: number | string;
  created_at: string;
  investors: { name: string } | { name: string }[] | null;
}

export async function getRecentInvestments(
  limit = 25,
): Promise<RecentInvestment[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investments")
    .select("id, percentage_before, created_at, investors(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getRecentInvestments failed", error);
    return [];
  }
  return (data as unknown as RecentInvestmentRow[]).map((r) => {
    const investor = Array.isArray(r.investors) ? r.investors[0] : r.investors;
    return {
      id: r.id,
      name: investor?.name ?? "Unknown",
      // record_investment writes percentage_before = 0 only on the deposit
      // that created the investor row, so 0 marks a first-time investor.
      isNewInvestor: Number(r.percentage_before) === 0,
      timestamp: new Date(r.created_at).getTime(),
    };
  });
}

export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface RecordInvestmentInput {
  investorId: string | null;
  newName: string | null;
  newSlug: string | null;
  amountNok: number;
  equityNowNok: number;
}

interface RecordInvestmentResult {
  investorId: string;
  newPercentage: number;
  newEquityNok: number;
}

export async function recordInvestment(
  input: RecordInvestmentInput,
): Promise<RecordInvestmentResult> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("record_investment", {
    p_investor_id: input.investorId,
    p_new_name: input.newName,
    p_new_slug: input.newSlug,
    p_amount_nok: input.amountNok,
    p_equity_now_nok: input.equityNowNok,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("record_investment returned no row");
  return {
    investorId: row.investor_id,
    newPercentage: Number(row.new_percentage),
    newEquityNok: Number(row.new_equity_nok),
  };
}
