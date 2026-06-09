import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  divide?: boolean;
}

export function Section({ className, divide = true, ...props }: SectionProps) {
  return (
    <section
      className={cn(
        "w-full py-20 md:py-28",
        divide && "border-t border-border",
        className,
      )}
      {...props}
    />
  );
}
