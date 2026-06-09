// A bet is identified by (slug, outcome) — the same market can host both YES
// and NO positions, so the slug alone isn't unique. We join the two with `__`
// because Polymarket slugs and UUIDs use single hyphens only, never doubled
// underscores.
const SEP = "__";

export function encodeBetId(slug: string, outcome: string): string {
  return `${encodeURIComponent(slug)}${SEP}${encodeURIComponent(outcome)}`;
}

export function decodeBetId(
  betId: string,
): { slug: string; outcome: string } | null {
  const idx = betId.lastIndexOf(SEP);
  if (idx <= 0 || idx >= betId.length - SEP.length) return null;
  try {
    const slug = decodeURIComponent(betId.slice(0, idx));
    const outcome = decodeURIComponent(betId.slice(idx + SEP.length));
    if (!slug || !outcome) return null;
    return { slug, outcome };
  } catch {
    return null;
  }
}

export function betHref(slug: string, outcome: string): string {
  return `/bets/${encodeBetId(slug, outcome)}`;
}
