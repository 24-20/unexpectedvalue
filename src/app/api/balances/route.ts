import { getLiveBalances } from "@/lib/balances";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getLiveBalances();
  return Response.json(data);
}
