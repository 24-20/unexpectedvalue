import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Container({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("w-full max-w-7xl mx-auto px-6 md:px-10", className)}
      {...props}
    />
  );
}
