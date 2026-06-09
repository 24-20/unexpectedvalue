import { Container } from "@/components/ui";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background mt-auto">
      <Container className="flex items-center py-8 font-mono text-xs uppercase tracking-widest text-muted px-6 sm:px-10 md:px-16">
        <span>© {new Date().getFullYear()} UNX</span>
      </Container>
    </footer>
  );
}
