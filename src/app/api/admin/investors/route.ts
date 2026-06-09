import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminCookie } from "@/lib/adminAuth";
import { searchInvestorsByName } from "@/lib/investors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  if (!verifyAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") ?? "";
  const trimmed = name.trim();

  if (!trimmed) {
    return NextResponse.json({ match: null, results: [] });
  }

  const results = await searchInvestorsByName(trimmed);
  // Prefer exact case-insensitive match; otherwise the highest-percentage hit.
  const exact = results.find(
    (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const match = exact ?? results[0] ?? null;
  return NextResponse.json({ match, results });
}
