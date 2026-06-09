import { Container, Mono } from "@/components/ui";
import { AsciiBackdrop } from "@/components/blocks";
import { cn } from "@/lib/cn";
import {
  getDiscordInviteUrl,
  getDiscordWidget,
  type DiscordMember,
  type DiscordPresence,
} from "@/lib/discord";

export const revalidate = 60;

const PLANET_ASCII = String.raw`
        .                  *                 .              ·
              ·                       .                 *
   *                .                          ·                 .
                                .
        .                ___                                       *
   ·            ,oO8888888888Oo,.                       .
            .o8888888888888888888o.                          ·
          o888888888888888888888888o
   _.,---.8888888888888888888888888.,---.,_                       .
  '-,_   '888888888888888888888888'   _,-'
      '-,_  '''Y888888888888P'''   _,-'                  ·
            '-,_     '''''''   _,-'
                ''-,         ,-''                 .
                    ''----''                                   *
        .                                                .
   ·                  *                  .                   ·
              ·                  .                  *                 .
                       .                  ·                       .
`;

export default async function CommunityPage() {
  const widget = await getDiscordWidget();
  const inviteUrl = widget?.instantInvite ?? getDiscordInviteUrl();

  return (
    <div className="relative sm:pl-20 py-12 md:py-24 flex-1 overflow-hidden">
      <AsciiBackdrop art={PLANET_ASCII} />
      <Container className="relative z-10">
        <div className="max-w-2xl">
          
          

          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 sm:mt-10 inline-flex items-center gap-3 sm:gap-4 border border-border bg-surface hover:border-foreground hover:bg-foreground hover:text-background p-4 sm:p-5 transition-colors group"
          >
            <svg
              viewBox="0 -28.5 256 256"
              className="w-8 h-8 sm:w-10 sm:h-10 shrink-0"
              aria-hidden
              fill="currentColor"
            >
              <path d="M216.86 16.6A208.5 208.5 0 0 0 164.04 0c-2.27 4.1-4.93 9.6-6.76 13.98a194 194 0 0 0-58.6 0C96.86 9.6 94.13 4.1 91.84 0A207.8 207.8 0 0 0 39 16.64C5.62 66.69-3.44 115.5.09 163.62A209.7 209.7 0 0 0 64.05 196c5.18-7.06 9.79-14.55 13.77-22.45a134.9 134.9 0 0 1-21.7-10.42c1.82-1.35 3.6-2.76 5.32-4.21 41.83 19.55 87.27 19.55 128.6 0a128 128 0 0 0 5.32 4.2 134.6 134.6 0 0 1-21.74 10.43 161.5 161.5 0 0 0 13.78 22.45 209.06 209.06 0 0 0 63.96-32.37c4.14-55.83-10.25-104.2-34.5-147.04ZM85.47 134c-12.6 0-22.91-11.69-22.91-25.92 0-14.24 10.1-25.95 22.9-25.95 12.8 0 23.11 11.7 22.9 25.94.02 14.24-10.1 25.93-22.9 25.93Zm85.05 0c-12.6 0-22.91-11.69-22.91-25.92 0-14.24 10.1-25.95 22.91-25.95 12.79 0 23.1 11.7 22.89 25.94 0 14.24-10.1 25.93-22.9 25.93Z" />
            </svg>
            <span className="flex flex-col">
              <span className="font-mono text-[10px] sm:text-xs uppercase tracking-widest text-muted group-hover:text-background/70">
                Discord
              </span>
              <span className="font-mono text-base sm:text-lg uppercase tracking-wider">
                {prettyInvite(inviteUrl)} →
              </span>
            </span>
          </a>
        </div>

        {widget && widget.members.length > 0 ? (
          <MemberGrid
            members={widget.members}
            presenceCount={widget.presenceCount}
          />
        ) : (
          <WidgetDisabledNote enabled={widget != null} />
        )}
      </Container>
    </div>
  );
}

function MemberGrid({
  members,
  presenceCount,
}: {
  members: DiscordMember[];
  presenceCount: number;
}) {
  return (
    <div className="mt-12 sm:mt-16 md:mt-20">
      <div className="flex items-baseline justify-between gap-4 mb-4 sm:mb-6">
        <Mono className="text-muted">
          [ Online · {presenceCount.toString().padStart(2, "0")} ]
        </Mono>
        <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-muted">
          updates every minute
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-px bg-border border border-border">
        {members.map((m) => (
          <MemberCell key={m.id} member={m} />
        ))}
      </ul>
    </div>
  );
}

function MemberCell({ member }: { member: DiscordMember }) {
  return (
    <li className="bg-surface flex items-center gap-3 p-3">
      <div className="relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={member.avatarUrl}
          alt=""
          className="w-9 h-9 border border-border object-cover"
        />
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border border-background",
            statusColor(member.status),
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate leading-tight">{member.username}</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted mt-0.5">
          {statusLabel(member.status)}
        </div>
      </div>
    </li>
  );
}

function WidgetDisabledNote({ enabled }: { enabled: boolean }) {
  return (
    <></>
  );
}

function statusColor(s: DiscordPresence): string {
  if (s === "online") return "bg-up";
  if (s === "idle") return "bg-yellow-400";
  return "bg-down";
}

function statusLabel(s: DiscordPresence): string {
  if (s === "online") return "Online";
  if (s === "idle") return "Idle";
  return "Do not disturb";
}

function prettyInvite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
