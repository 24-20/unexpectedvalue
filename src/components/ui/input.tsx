import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          // text-base (16px) prevents iOS Safari from zooming the page on focus.
          "flex h-11 w-full bg-surface border border-border px-3 py-2 text-base",
          "font-mono tabular-nums",
          "placeholder:text-muted",
          "focus-visible:outline-none focus-visible:border-foreground/60 focus-visible:bg-surface-elevated",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "transition-colors",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
