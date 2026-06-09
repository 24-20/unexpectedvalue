import "server-only";

const DISCORD_GUILD_ID =
  process.env.DISCORD_GUILD_ID ?? "1513722216846458971";
const DISCORD_INVITE_URL =
  process.env.DISCORD_INVITE_URL ?? "https://discord.gg/GjC4F6Yp";

const REVALIDATE_WIDGET = 60;

export type DiscordPresence = "online" | "idle" | "dnd";

export interface DiscordMember {
  id: string;
  username: string;
  status: DiscordPresence;
  avatarUrl: string;
}

export interface DiscordWidget {
  name: string;
  presenceCount: number;
  members: DiscordMember[];
  instantInvite: string;
}

interface RawWidget {
  name?: string;
  presence_count?: number;
  instant_invite?: string | null;
  members?: Array<{
    id?: string;
    username?: string;
    status?: string;
    avatar_url?: string;
  }>;
}

function normalizeStatus(s: string | undefined): DiscordPresence {
  if (s === "idle" || s === "dnd") return s;
  return "online";
}

export async function getDiscordWidget(): Promise<DiscordWidget | null> {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`,
      { next: { revalidate: REVALIDATE_WIDGET } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as RawWidget;
    const members = (data.members ?? [])
      .map((m): DiscordMember | null => {
        if (!m.id || !m.username || !m.avatar_url) return null;
        return {
          id: m.id,
          username: m.username,
          status: normalizeStatus(m.status),
          avatarUrl: m.avatar_url,
        };
      })
      .filter((m): m is DiscordMember => m != null);
    return {
      name: data.name ?? "Discord",
      presenceCount: data.presence_count ?? members.length,
      members,
      instantInvite: data.instant_invite ?? DISCORD_INVITE_URL,
    };
  } catch {
    return null;
  }
}

export function getDiscordInviteUrl(): string {
  return DISCORD_INVITE_URL;
}
