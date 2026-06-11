import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export type AlertKind = "investment" | "custom_bet";

// Topic + event shared with the client subscription (src/lib/useAlertsChannel.ts).
export const ALERTS_TOPIC = "alerts";
export const ALERTS_EVENT = "changed";

// Notify connected clients that alert-worthy data changed (new investment,
// custom bet created/settled). Delivery is via Supabase Realtime's REST
// broadcast (httpSend) — no websocket needed from the server, which suits
// serverless. Clients react by refetching the relevant API routes, so the
// payload carries no data beyond the kind; nothing sensitive crosses this
// channel. Best-effort by design: the mutation has already committed, so a
// failed broadcast must never fail the request — pollers pick the change up
// within seconds anyway.
export async function broadcastAlertsChanged(kind: AlertKind): Promise<void> {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return;
  }
  const channel = supabase.channel(ALERTS_TOPIC);
  try {
    await channel.httpSend(ALERTS_EVENT, { kind }, { timeout: 3000 });
  } catch {
    // Best-effort — see above.
  } finally {
    await supabase.removeChannel(channel).catch(() => {});
  }
}
