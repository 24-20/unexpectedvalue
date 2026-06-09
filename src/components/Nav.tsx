import Link from "next/link";
import { Container } from "@/components/ui";

const LINKS = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/about", label: "About" },
  { href: "/community", label: "Community" },
];

export function Nav() {
  return (
    <header className="border-b border-border">
      <Container className="flex h-14 items-center justify-between px-6 sm:px-10 md:px-16">
        <Link
          href="/portfolio"
          className="font-mono text-sm font-semibold uppercase tracking-widest"
        >
          UNX
        </Link>
        <nav className="flex items-center gap-6 font-mono text-xs uppercase tracking-widest text-muted">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="mailto:contact@unx.capital"
            className="hidden sm:inline-flex border border-border text-foreground px-4 py-2 hover:border-foreground transition-colors"
          >
            Contact
          </Link>
        </nav>
      </Container>
    </header>
  );
}
