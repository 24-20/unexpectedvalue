import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-2 font-mono uppercase tracking-wider " +
  "border border-foreground select-none cursor-pointer " +
  "transition-[transform,background-color,color] duration-75 ease-out " +
  "active:translate-x-[1px] active:translate-y-[1px] " +
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 " +
  "focus-visible:outline-none focus-visible:ring-0";

const variants: Record<Variant, string> = {
  primary:
    "bg-foreground text-background hover:bg-background hover:text-foreground",
  secondary:
    "bg-surface text-foreground border-border hover:border-foreground",
  ghost:
    "bg-transparent text-foreground border-transparent hover:border-border",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-11 px-6 text-sm",
  lg: "h-14 px-8 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
