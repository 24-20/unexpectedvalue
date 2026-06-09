import { OWNERS } from "@/lib/owners";

const SHADES = [
  "bg-foreground",
  "bg-foreground/60",
  "bg-foreground/30",
];

export default function PercentagesPage() {
  return (
    <div className="flex-1 flex justify-center px-6">
      <div className="w-full max-w-xl border-b border-border bg-surface">
        <div className="px-5 md:px-7 pt-5 md:pt-6 pb-4 md:pb-5">
          <div
            className="flex h-6 w-full overflow-hidden gap-px bg-border"
            role="img"
            aria-label="Ownership distribution"
          >
            {OWNERS.map((o, i) => (
              <div
                key={o.name}
                className={SHADES[i % SHADES.length]}
                style={{ width: `${o.percentage}%` }}
                title={`${o.name} — ${o.percentage.toFixed(2)}%`}
              />
            ))}
          </div>
        </div>
        <ul className="divide-y divide-border border-t border-border">
          {OWNERS.map((o, i) => (
            <li
              key={o.name}
              className="px-5 md:px-7 py-3 md:py-3.5 flex items-baseline justify-between gap-4"
            >
              <div className="flex items-baseline gap-3 min-w-0">
                <span
                  aria-hidden
                  className={`inline-block w-2.5 h-2.5 shrink-0 translate-y-0.5 ${SHADES[i % SHADES.length]}`}
                />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted tabular-nums">
                  {(i + 1).toString().padStart(2, "0")}
                </span>
                <span className="text-base md:text-lg truncate">{o.name}</span>
              </div>
              <span className="font-mono tabular-nums text-base md:text-lg">
                {o.percentage.toFixed(2)}
                <span className="text-muted">%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
