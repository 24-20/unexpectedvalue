import { Container, Mono } from "@/components/ui";

const TELEGRAM_URL = "https://t.me/unxcapital";

export default function CommunityPage() {
  return (
    <div className="py-16 md:py-24 flex-1 flex items-center">
      <Container>
        <div className="max-w-2xl">
          <Mono className="text-muted">[ Community ]</Mono>
          <h1 className="mt-4 text-4xl md:text-6xl font-normal tracking-[-0.01em] leading-[1.05]">
            Join us on Telegram.
          </h1>
          <p className="mt-6 text-lg text-muted leading-relaxed">
            Discussion, ideas, and a frontrow view of the bets we&apos;re
            placing.
          </p>

          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-4 border border-border bg-surface hover:border-foreground hover:bg-foreground hover:text-background p-5 transition-colors group"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-10 h-10 shrink-0"
              aria-hidden
              fill="currentColor"
            >
              <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.56 8.16-1.86 8.78c-.14.62-.51.77-1.03.48l-2.85-2.1-1.37 1.32c-.15.15-.28.28-.57.28l.2-2.9 5.27-4.76c.23-.2-.05-.32-.36-.12L9.4 13.3l-2.8-.88c-.61-.19-.62-.61.13-.9l10.96-4.22c.5-.18.95.12.78.86Z" />
            </svg>
            <span className="flex flex-col">
              <span className="font-mono text-xs uppercase tracking-widest text-muted group-hover:text-background/70">
                Telegram
              </span>
              <span className="font-mono text-lg uppercase tracking-wider">
                t.me/unxcapital →
              </span>
            </span>
          </a>
        </div>
      </Container>
    </div>
  );
}
