import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({ className, hoverable = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "border border-border bg-surface p-6",
        hoverable &&
          "transition-transform duration-100 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--border-strong)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardLabel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "font-mono text-xs uppercase tracking-widest text-muted mb-3",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-2xl font-medium tracking-tight", className)}
      {...props}
    />
  );
}

export function CardBody({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-muted leading-relaxed mt-3", className)} {...props} />
  );
}
