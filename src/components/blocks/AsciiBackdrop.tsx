"use client";

import { cn } from "@/lib/cn";

interface AsciiBackdropProps {
  art: string;
  className?: string;
  textClassName?: string;
}

// Cosmic gradient: deep purple → wine → red → orange → amber.
// Applied via background-clip:text so the ASCII glyphs themselves are painted.
const COSMIC_GRADIENT =
  "bg-[radial-gradient(ellipse_at_35%_50%,#fbbf24_0%,#f97316_12%,#dc2626_28%,#9f1239_48%,#6b21a8_72%,#2e1065_95%)] " +
  "bg-clip-text text-transparent";

export function AsciiBackdrop({
  art,
  className,
  textClassName,
}: AsciiBackdropProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        "flex items-center justify-center",
        "opacity-0 animate-[ascii-fade-in_2s_ease-out_0.5s_forwards]",
        className,
      )}
    >
      <pre
        className={cn(
          "font-mono leading-[1.05] select-none whitespace-pre",
          "text-[6px] sm:text-[8px] md:text-[10px] lg:text-xs",
          COSMIC_GRADIENT,
          textClassName,
        )}
      >
        {art}
      </pre>
    </div>
  );
}
