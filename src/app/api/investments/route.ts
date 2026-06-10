import { getRecentInvestments } from "@/lib/investors";

export const dynamic = "force-dynamic";

export async function GET() {
  const investments = await getRecentInvestments();
  return Response.json({ investments });
}
