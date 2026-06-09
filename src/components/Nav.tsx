import Link from "next/link";
import { Container } from "@/components/ui";
import { AlertBell } from "@/components/AlertBell";

const RIGHT_LINKS = [
  { href: "/about", label: "About" },
  { href: "/owners", label: "Owners" },
];

export function Nav() {
  return (
    <header className="border-b border-border">
      <Container className="flex h-14 items-center justify-between px-6 sm:px-10 md:px-16">
        <Link
          href="/portfolio"
          className="font-mono text-xs uppercase tracking-widest text-muted hover:text-foreground transition-colors"
        >
          Portfolio
        </Link>
        <nav className="flex items-center gap-6 font-mono text-xs uppercase tracking-widest text-muted">
          {RIGHT_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <AlertBell />
        </nav>
      </Container>
    </header>
  );
}
