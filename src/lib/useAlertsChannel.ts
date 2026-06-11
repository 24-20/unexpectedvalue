"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Mirrors src/lib/realtime.ts (server-only module — can't import it here).
const ALERTS_TOPIC = "alerts";
const ALERTS_EVENT = "changed";

export type AlertKind = "investment" | "custom_bet";

// Subscribes to the public alerts broadcast channel and invokes the callback
// whenever the server announces a change (new investment, custom bet
// created/settled). Push is an accelerator, not a dependency: subscribers
// keep their polling, so a dropped websocket or missing env vars only means
// updates arrive at poll cadence again. supabase-js handles reconnects.
export function useAlertsChannel(onChanged: (kind: AlertKind) => void) {
  // Keep the latest callback without resubscribing the channel per render.
  const cbRef = useRef(onChanged);
  useEffect(() => {
    cbRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const channel = supabase
      .channel(ALERTS_TOPIC)
      .on("broadcast", { event: ALERTS_EVENT }, (msg) => {
        const kind = (msg.payload as { kind?: AlertKind } | undefined)?.kind;
        cbRef.current(kind === "investment" ? "investment" : "custom_bet");
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, []);
}
