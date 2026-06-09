import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Mono({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("font-mono text-xs uppercase tracking-widest", className)}
      {...props}
    />
  );
}
