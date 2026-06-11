import { getLiveBalances } from "@/lib/balances";

// No `dynamic = "force-dynamic"` here: route handlers are already uncached
// by default in this Next version, and force-dynamic would set every inner
// fetch to no-store — bypassing the 10s data cache the balance fetchers
// depend on, so every poll from every client would hammer Polymarket /
// the RPC providers straight into their rate limits.
export async function GET() {
  const data = await getLiveBalances();
  return Response.json(data);
}
