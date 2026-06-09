import { Container } from "@/components/ui";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background mt-auto">
      <Container className="flex flex-col md:flex-row items-start md:items-center justify-between py-8 gap-4 font-mono text-xs uppercase tracking-widest text-muted px-6 sm:px-10 md:px-16">
        <span>© {new Date().getFullYear()} UNX</span>
        <span className="normal-case tracking-normal">
          unexpectedvalueadmin@proton.me
        </span>
      </Container>
    </footer>
  );
}
