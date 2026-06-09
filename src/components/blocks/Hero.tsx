import type { ReactNode } from "react";
import { Container, Mono, Section } from "@/components/ui";
import { cn } from "@/lib/cn";

interface HeroProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  ascii?: string;
  actions?: ReactNode;
  className?: string;
}

export function Hero({
  eyebrow,
  title,
  subtitle,
  ascii,
  actions,
  className,
}: HeroProps) {
  return (
    <Section
      divide={false}
      className={cn("pt-16 md:pt-24 pb-20 md:pb-28", className)}
    >
      <Container>
        <div className="flex flex-col gap-12 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            {eyebrow && <Mono className="text-muted">{eyebrow}</Mono>}
            <h1 className="mt-4 text-5xl md:text-7xl font-normal tracking-[-0.01em] leading-[1.05]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-6 text-lg md:text-xl text-muted max-w-xl leading-relaxed">
                {subtitle}
              </p>
            )}
            {actions && <div className="mt-10 flex flex-wrap gap-4">{actions}</div>}
          </div>

          {ascii && (
            <pre
              aria-hidden
              className="font-mono text-[10px] md:text-xs leading-[1.1] text-foreground select-none whitespace-pre overflow-x-auto"
            >
              {ascii}
            </pre>
          )}
        </div>
      </Container>
    </Section>
  );
}
