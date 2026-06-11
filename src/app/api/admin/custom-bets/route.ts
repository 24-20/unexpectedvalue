import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminCookie } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastAlertsChanged } from "@/lib/realtime";

export const dynamic = "force-dynamic";

interface PostBody {
  bookie?: string;
  title?: string;
  outcome?: string;
  stakeUsd?: number;
  oddsDecimal?: number;
  endsAt?: string | null;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  if (!verifyAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  const bookie = (body?.bookie ?? "").trim();
  const title = (body?.title ?? "").trim();
  const outcome = (body?.outcome ?? "").trim();
  const stake = Number(body?.stakeUsd);
  const odds = Number(body?.oddsDecimal);

  if (!bookie || !title || !outcome) {
    return NextResponse.json(
      { error: "bookie, title and outcome are required" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json(
      { error: "stake must be a positive number (USD)" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(odds) || odds <= 1) {
    return NextResponse.json(
      { error: "odds must be decimal odds greater than 1 (e.g. 2.40)" },
      { status: 400 },
    );
  }

  let endsAtIso: string | null = null;
  if (body?.endsAt) {
    const parsed = Date.parse(body.endsAt);
    if (!Number.isFinite(parsed)) {
      return NextResponse.json(
        { error: "endsAt is not a valid date" },
        { status: 400 },
      );
    }
    endsAtIso = new Date(parsed).toISOString();
  }

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "supabase unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await sb
    .from("custom_bets")
    .insert({
      bookie,
      title,
      outcome,
      stake_usd: stake,
      odds_decimal: odds,
      ends_at: endsAtIso,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Awaited: in serverless, work left running after the response can be
  // frozen before it completes. Best-effort — never fails the request.
  await broadcastAlertsChanged("custom_bet");
  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

interface PatchBody {
  id?: string;
  status?: string;
}

export async function PATCH(req: Request) {
  const cookieStore = await cookies();
  if (!verifyAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  const id = body?.id;
  const status = body?.status;
  if (!id || (status !== "won" && status !== "lost")) {
    return NextResponse.json(
      { error: "id and status ('won' | 'lost') required" },
      { status: 400 },
    );
  }

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "supabase unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: row, error: readError } = await sb
    .from("custom_bets")
    .select("id, status, stake_usd, odds_decimal")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "bet not found" }, { status: 404 });
  }
  if (row.status !== "pending") {
    return NextResponse.json(
      { error: `bet already settled (${row.status})` },
      { status: 409 },
    );
  }

  const stake = Number(row.stake_usd) || 0;
  const odds = Number(row.odds_decimal) || 0;
  // Store proceeds explicitly for won bets so the table is self-documenting;
  // fetchCustomBets would fall back to stake × odds anyway.
  const settledAmount =
    status === "won" ? Math.round(stake * odds * 100) / 100 : null;

  const { error: updateError } = await sb
    .from("custom_bets")
    .update({
      status,
      settled_at: new Date().toISOString(),
      settled_amount_usd: settledAmount,
    })
    .eq("id", id)
    // Re-assert pending so a double-click can't settle twice.
    .eq("status", "pending");
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await broadcastAlertsChanged("custom_bet");
  return NextResponse.json({ ok: true, settledAmountUsd: settledAmount });
}
