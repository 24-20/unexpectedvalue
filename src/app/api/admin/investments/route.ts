import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminCookie } from "@/lib/adminAuth";
import { recordInvestment, slugifyName } from "@/lib/investors";
import { getLiveBalances, liveTotalNok } from "@/lib/balances";

export const dynamic = "force-dynamic";

interface PostBody {
  investorId?: string | null;
  newName?: string | null;
  amountNok?: number;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  if (!verifyAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const amount = Number(body.amountNok);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 },
    );
  }

  // New investor branch validation
  const newName = body.investorId ? null : (body.newName ?? "").trim();
  if (!body.investorId) {
    if (!newName) {
      return NextResponse.json(
        { error: "newName required when investorId is null" },
        { status: 400 },
      );
    }
  }
  const newSlug = newName ? slugifyName(newName) : null;
  if (!body.investorId && !newSlug) {
    return NextResponse.json(
      { error: "could not derive slug from newName" },
      { status: 400 },
    );
  }

  // Server-side equity snapshot — never trust a client-supplied number.
  const balances = await getLiveBalances();
  const equity = liveTotalNok(balances);
  if (equity == null) {
    return NextResponse.json(
      { error: "equity unavailable — chain data incomplete, try again" },
      { status: 503 },
    );
  }
  if (equity <= 0) {
    return NextResponse.json(
      { error: "equity is zero — first-ever deposit must be handled manually" },
      { status: 400 },
    );
  }

  try {
    const result = await recordInvestment({
      investorId: body.investorId ?? null,
      newName: body.investorId ? null : newName,
      newSlug: body.investorId ? null : newSlug,
      amountNok: amount,
      equityNowNok: equity,
    });
    return NextResponse.json({ ok: true, equityBeforeNok: equity, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
