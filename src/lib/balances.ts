import "server-only";
import { fetchCustomBets } from "@/lib/customBets";

const POLYMARKET_ADDRESS =
  process.env.POLYMARKET_ADDRESS ?? "0xdee67d2c135d1c374bbb5ec52ed22cee0edb782f";
const SOLANA_ADDRESS =
  process.env.SOLANA_ADDRESS ?? "EyeWgvbTduRDMzbERKvy6Muxdi83U6DYSLaqCtPjKcGz";
// publicnode blocks getTokenAccountsByOwner with a programId filter, which
// silently breaks every SPL token query (Phantom stables, Polymarket SVM bridge).
// mainnet-beta serves it correctly.
const SOLANA_RPC =
  process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const POLYGON_RPC =
  process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";

const LAMPORTS_PER_SOL = 1_000_000_000;
const REVALIDATE_BALANCES = 10;
const REVALIDATE_RATES = 60;
const REVALIDATE_BRIDGE_ADDRESSES = 3600;
const FETCH_TIMEOUT_MS = 4000;
const FETCH_RETRIES = 1;

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const USDC_MINT_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT_SOL = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const STABLE_MINTS = new Set([USDC_MINT_SOL, USDT_MINT_SOL]);

// pUSD is Polymarket's collateral token since the April 2026 V2 migration —
// resting cash sits in the proxy as pUSD, not USDC. USDC.e / native USDC are
// kept because the bridge deposit relays briefly hold those before conversion.
const PUSD_POLYGON = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDC_E_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const POLYGON_CASH_TOKENS = [PUSD_POLYGON, USDC_E_POLYGON, USDC_POLYGON];
const USDC_DECIMALS = 6;
const BALANCE_OF_SELECTOR = "0x70a08231";

const POLYMARKET_BRIDGE_API = "https://bridge.polymarket.com/deposit";

export interface PolymarketPosition {
  source: string; // "polymarket" or bookie name (e.g., "Roobet")
  title: string;
  slug: string;
  icon: string | null;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  endDate: string | null;
  redeemable: boolean;
  status: "open" | "closed";
}

export type ActivityType =
  | "TRADE"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "REDEEM"
  | "MERGE"
  | "SPLIT"
  | "CONVERSION"
  | "REWARD"
  // Emitted only for settled custom bets — Polymarket's API never sends it,
  // so it stays out of KNOWN_ACTIVITY_TYPES.
  | "LOST"
  | "OTHER";

export interface ActivityEvent {
  source: string; // "polymarket" or bookie name
  timestamp: number; // ms
  type: ActivityType;
  side: "BUY" | "SELL" | null;
  usdcSize: number;
  title: string | null;
  slug: string | null;
  icon: string | null;
  outcome: string | null;
  price: number | null;
  shares: number | null;
  txHash: string | null;
  // Realized result of this event in USD, when derivable: sells/redeems get
  // it from an average-cost replay of the market's trade history, custom-bet
  // settlements from stake vs proceeds. Null = not applicable or basis
  // unknown — the UI then falls back to showing the raw cash amount.
  pnlUsd: number | null;
  // For sells only: how much of the then-held position this sale closed,
  // 0–100. Derived from the same replay (cashed-out bookie bets are 100).
  soldPct: number | null;
}

export interface LiveBalances {
  fetchedAt: number;
  cash: {
    totalNok: number | null;
    polymarketCash: {
      usdc: number | null;
      nok: number | null;
      address: string;
    };
    phantom: {
      sol: number | null;
      stableUsd: number | null;
      usdcAccount: string | null;
      usd: number | null;
      nok: number | null;
      address: string;
    };
  };
  polymarketBets: {
    valueUsd: number | null;
    valueNok: number | null;
    positions: PolymarketPosition[] | null;
    activity: ActivityEvent[] | null;
    address: string;
  };
  customBetsRealizedPnlUsd: number | null;
  rates: { solUsd: number | null; usdNok: number | null };
}

async function safeFetch(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } } = {},
  timeoutMs = FETCH_TIMEOUT_MS,
  retries = FETCH_RETRIES,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return res;
      // 4xx other than 429 = permanent client error, don't retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return res;
      }
      // 5xx or 429 — fall through to retry
    } catch {
      clearTimeout(t);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return null;
}

async function safeJson<T>(res: Response | null): Promise<T | null> {
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function solRpc<T>(body: object): Promise<T | null> {
  const res = await safeFetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: REVALIDATE_BALANCES },
  });
  const data = await safeJson<{ result?: T; error?: unknown }>(res);
  return data?.result ?? null;
}

async function polyRpc<T>(body: object): Promise<T | null> {
  const res = await safeFetch(POLYGON_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: REVALIDATE_BALANCES },
  });
  const data = await safeJson<{ result?: T; error?: unknown }>(res);
  return data?.result ?? null;
}

function balanceOfData(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, "");
  return BALANCE_OF_SELECTOR + clean.padStart(64, "0");
}

async function fetchErc20Balance(
  contract: string,
  holder: string,
): Promise<number | null> {
  const hex = await polyRpc<string>({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: contract, data: balanceOfData(holder) }, "latest"],
  });
  if (typeof hex !== "string" || !hex.startsWith("0x") || hex.length < 3) {
    return null;
  }
  try {
    return Number(BigInt(hex)) / 10 ** USDC_DECIMALS;
  } catch {
    return null;
  }
}

async function fetchOwnerUsdc(owner: string): Promise<number | null> {
  const balances = await Promise.all(
    POLYGON_CASH_TOKENS.map((token) => fetchErc20Balance(token, owner)),
  );
  // All-or-nothing: resting cash sits mostly in pUSD, so a partial read
  // (one token call rate-limited) would undercount badly. Unknown beats
  // wrong — null lets the client merge hold the last good value.
  if (balances.some((v) => v == null)) return null;
  return (balances as number[]).reduce((s, v) => s + v, 0);
}

interface ParsedTokenAccount {
  pubkey: string;
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: { uiAmount: number | null };
        };
      };
    };
  };
}

async function fetchSolanaUsdc(owner: string): Promise<number | null> {
  const result = await solRpc<{ value: ParsedTokenAccount[] }>({
    jsonrpc: "2.0",
    id: 9,
    method: "getTokenAccountsByOwner",
    params: [
      owner,
      { programId: SPL_TOKEN_PROGRAM },
      { encoding: "jsonParsed" },
    ],
  });
  if (!result?.value) return null;
  let sum = 0;
  for (const acc of result.value) {
    const info = acc.account?.data?.parsed?.info;
    if (!info) continue;
    if (info.mint !== USDC_MINT_SOL) continue;
    const amount = info.tokenAmount?.uiAmount;
    if (typeof amount === "number") sum += amount;
  }
  return sum;
}

interface BridgeAddresses {
  evm: string | null;
  svm: string | null;
}

// Polymarket's Bridge API returns per-user deposit relay addresses. Funds
// sent there from supported chains are auto-converted to USDC and forwarded
// to the proxy — so the cash count must include any in-flight balance there.
async function fetchPolymarketBridgeAddresses(
  wallet: string,
): Promise<BridgeAddresses> {
  const res = await safeFetch(POLYMARKET_BRIDGE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet }),
    next: { revalidate: REVALIDATE_BRIDGE_ADDRESSES },
  });
  const data = await safeJson<{
    address?: { evm?: string; svm?: string };
  }>(res);
  return {
    evm: data?.address?.evm ?? null,
    svm: data?.address?.svm ?? null,
  };
}

async function fetchPolymarketCashUsdc(): Promise<number | null> {
  const bridges = await fetchPolymarketBridgeAddresses(POLYMARKET_ADDRESS);
  const [proxy, evmBridge, svmBridge] = await Promise.all([
    fetchOwnerUsdc(POLYMARKET_ADDRESS),
    bridges.evm ? fetchOwnerUsdc(bridges.evm) : Promise.resolve(null),
    bridges.svm ? fetchSolanaUsdc(bridges.svm) : Promise.resolve(null),
  ]);
  // A bridge leg is only legitimately absent when there is no relay address;
  // if a relay exists but its read failed, the total is unknowable — return
  // null rather than silently undercounting in-flight deposits.
  if (proxy == null) return null;
  if (bridges.evm && evmBridge == null) return null;
  if (bridges.svm && svmBridge == null) return null;
  return proxy + (evmBridge ?? 0) + (svmBridge ?? 0);
}

export interface PolymarketMarketInfo {
  slug: string;
  question: string | null;
  image: string | null;
  icon: string | null;
  endDate: string | null;
  closed: boolean;
  outcomes: string[];
  outcomePrices: number[];
  winningOutcome: string | null;
}

interface RawGammaMarket {
  slug?: string;
  question?: string;
  image?: string;
  icon?: string;
  endDate?: string;
  endDateIso?: string;
  closed?: boolean;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
}

function parseJsonArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function fetchPolymarketMarket(
  slug: string,
): Promise<PolymarketMarketInfo | null> {
  if (!slug) return null;
  const url = `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`;
  const res = await safeFetch(url, { next: { revalidate: 300 } });
  const data = await safeJson<RawGammaMarket[]>(res);
  if (!Array.isArray(data) || data.length === 0) return null;
  const m = data[0];
  const outcomes = parseJsonArray(m.outcomes);
  const prices = parseJsonArray(m.outcomePrices).map((p) => Number(p));
  let winningOutcome: string | null = null;
  if (m.closed && outcomes.length > 0 && prices.length === outcomes.length) {
    const winIdx = prices.findIndex((p) => p >= 0.5);
    if (winIdx >= 0) winningOutcome = outcomes[winIdx];
  }
  return {
    slug: m.slug ?? slug,
    question: m.question ?? null,
    image: m.image ?? null,
    icon: m.icon ?? null,
    endDate: m.endDateIso ?? m.endDate ?? null,
    closed: !!m.closed,
    outcomes,
    outcomePrices: prices,
    winningOutcome,
  };
}

async function fetchPolymarketBetsUsd(): Promise<number | null> {
  const url = `https://data-api.polymarket.com/value?user=${POLYMARKET_ADDRESS}`;
  const res = await safeFetch(url, {
    next: { revalidate: REVALIDATE_BALANCES },
  });
  const data = await safeJson<Array<{ user: string; value: number }>>(res);
  if (!Array.isArray(data)) return null;
  return data[0]?.value ?? 0;
}

interface RawPolymarketPosition {
  title?: string;
  slug?: string;
  icon?: string | null;
  outcome?: string;
  size?: number;
  avgPrice?: number;
  curPrice?: number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  endDate?: string | null;
  redeemable?: boolean;
}

function classifyStatus(p: {
  redeemable: boolean;
  curPrice: number;
}): "open" | "closed" {
  // Reliable signals only:
  //  - redeemable=true: market resolved in user's favor, USDC claimable
  //  - curPrice exactly 0: losing side of a resolved market (tokens are worthless)
  // endDate and near-extreme prices are unreliable — markets keep trading
  // past their listed end date, and active markets can sit at 0.99 / 0.01.
  if (p.redeemable) return "closed";
  if (p.curPrice === 0) return "closed";
  return "open";
}

interface RawActivityEvent {
  timestamp?: number;
  type?: string;
  side?: string;
  usdcSize?: number;
  size?: number;
  price?: number;
  title?: string;
  slug?: string;
  icon?: string;
  outcome?: string;
  transactionHash?: string;
}

const KNOWN_ACTIVITY_TYPES = new Set<ActivityType>([
  "TRADE",
  "DEPOSIT",
  "WITHDRAWAL",
  "REDEEM",
  "MERGE",
  "SPLIT",
  "CONVERSION",
  "REWARD",
]);

async function fetchActivity(): Promise<ActivityEvent[] | null> {
  // Limit deliberately wide — livePnlNok walks this for realized PnL, so the
  // window has to cover every BUY/SELL/REDEEM the user has ever done.
  // Paginate if/when accounts exceed 500 events.
  const url = `https://data-api.polymarket.com/activity?user=${POLYMARKET_ADDRESS}&limit=500`;
  const res = await safeFetch(url, {
    next: { revalidate: REVALIDATE_BALANCES },
  });
  const data = await safeJson<RawActivityEvent[]>(res);
  if (!Array.isArray(data)) return null;
  const events = data.map<ActivityEvent>((e) => {
    const rawType = (e.type ?? "OTHER").toUpperCase();
    const type: ActivityType = KNOWN_ACTIVITY_TYPES.has(rawType as ActivityType)
      ? (rawType as ActivityType)
      : "OTHER";
    const rawSide = (e.side ?? "").toUpperCase();
    const side: "BUY" | "SELL" | null =
      rawSide === "BUY" || rawSide === "SELL" ? rawSide : null;
    return {
      source: "polymarket",
      timestamp: typeof e.timestamp === "number" ? e.timestamp * 1000 : 0,
      type,
      side,
      usdcSize: typeof e.usdcSize === "number" ? e.usdcSize : 0,
      title: e.title ?? null,
      slug: e.slug ?? null,
      icon: e.icon ?? null,
      outcome: e.outcome ?? null,
      price: typeof e.price === "number" ? e.price : null,
      shares: typeof e.size === "number" ? e.size : null,
      txHash: e.transactionHash ?? null,
      pnlUsd: null,
      soldPct: null,
    };
  });
  return enrichPolymarketPnl(events);
}

const PNL_EPS = 1e-6;

// Fills pnlUsd on sells and redeems by replaying each market's history
// chronologically with an average-cost basis (the same basis Polymarket's
// avgPrice uses). Anything that makes the basis untrustworthy — share counts
// minted outside trades (MERGE/SPLIT/CONVERSION), missing share data, selling
// more than the replay says we hold (truncated history), or a redeem we
// can't attribute to a single outcome — taints that market and leaves pnlUsd
// null, so the UI falls back to the raw amount rather than showing a wrong
// number.
function enrichPolymarketPnl(events: ActivityEvent[]): ActivityEvent[] {
  // reverse() first: the API returns newest-first, so this restores
  // chronological order even within identical timestamps; the stable sort
  // then only fixes genuinely out-of-order pairs.
  const asc = [...events].reverse().sort((a, b) => a.timestamp - b.timestamp);
  const books = new Map<string, { shares: number; cost: number }>();
  const tainted = new Set<string>();

  for (const e of asc) {
    const slug = e.slug;
    if (!slug) continue;

    if (e.type === "MERGE" || e.type === "SPLIT" || e.type === "CONVERSION") {
      tainted.add(slug);
      continue;
    }
    if (tainted.has(slug)) continue;

    if (e.type === "TRADE" && e.side === "BUY") {
      if (e.shares == null) {
        tainted.add(slug);
        continue;
      }
      const key = `${slug}|${e.outcome ?? ""}`;
      const book = books.get(key) ?? { shares: 0, cost: 0 };
      book.shares += e.shares;
      book.cost += Math.abs(e.usdcSize);
      books.set(key, book);
      continue;
    }

    if (e.type === "TRADE" && e.side === "SELL") {
      const key = `${slug}|${e.outcome ?? ""}`;
      const book = books.get(key);
      if (
        e.shares == null ||
        !book ||
        book.shares <= PNL_EPS ||
        book.shares + PNL_EPS < e.shares
      ) {
        tainted.add(slug);
        continue;
      }
      const avg = book.cost / book.shares;
      e.pnlUsd = Math.abs(e.usdcSize) - e.shares * avg;
      e.soldPct = (e.shares / book.shares) * 100;
      book.shares -= e.shares;
      book.cost -= e.shares * avg;
      continue;
    }

    if (e.type === "REDEEM") {
      // Redeems arrive without an outcome — attribute to the only book of
      // this market still holding shares.
      const candidates = [...books.entries()].filter(
        ([k, b]) => k.startsWith(`${slug}|`) && b.shares > PNL_EPS,
      );
      if (candidates.length !== 1) {
        tainted.add(slug);
        continue;
      }
      const [, book] = candidates[0];
      const payout = Math.abs(e.usdcSize);
      // Winning shares redeem at $1 apiece, so payout doubles as the share
      // count when the API omits it.
      const shares = e.shares ?? payout;
      if (book.shares + PNL_EPS < shares) {
        tainted.add(slug);
        continue;
      }
      const avg = book.cost / book.shares;
      e.pnlUsd = payout - shares * avg;
      book.shares -= shares;
      book.cost -= shares * avg;
    }
  }
  return events;
}

async function fetchPolymarketPositions(): Promise<
  PolymarketPosition[] | null
> {
  const url = `https://data-api.polymarket.com/positions?user=${POLYMARKET_ADDRESS}&limit=200&sortBy=CURRENT&sortDirection=DESC&sizeThreshold=0`;
  const res = await safeFetch(url, {
    next: { revalidate: REVALIDATE_BALANCES },
  });
  const data = await safeJson<RawPolymarketPosition[]>(res);
  if (!Array.isArray(data)) return null;
  return data.map((p) => {
    const core = {
      source: "polymarket",
      title: p.title ?? "Unknown market",
      slug: p.slug ?? "",
      icon: p.icon ?? null,
      outcome: p.outcome ?? "?",
      size: typeof p.size === "number" ? p.size : 0,
      avgPrice: typeof p.avgPrice === "number" ? p.avgPrice : 0,
      curPrice: typeof p.curPrice === "number" ? p.curPrice : 0,
      initialValue: typeof p.initialValue === "number" ? p.initialValue : 0,
      currentValue: typeof p.currentValue === "number" ? p.currentValue : 0,
      cashPnl: typeof p.cashPnl === "number" ? p.cashPnl : 0,
      percentPnl: typeof p.percentPnl === "number" ? p.percentPnl : 0,
      endDate: p.endDate ?? null,
      redeemable: !!p.redeemable,
    };
    return {
      ...core,
      status: classifyStatus({
        redeemable: core.redeemable,
        curPrice: core.curPrice,
      }),
    };
  });
}

async function fetchSolBalance(): Promise<number | null> {
  const result = await solRpc<{ value: number }>({
    jsonrpc: "2.0",
    id: 1,
    method: "getBalance",
    params: [SOLANA_ADDRESS],
  });
  if (typeof result?.value !== "number") return null;
  return result.value / LAMPORTS_PER_SOL;
}

interface StableBalances {
  usd: number | null;
  // Token account holding the wallet's USDC — verify links point here so
  // visitors land on the USDC balance instead of the (near-zero) SOL view.
  usdcAccount: string | null;
}

async function fetchStableUsd(): Promise<StableBalances> {
  const result = await solRpc<{ value: ParsedTokenAccount[] }>({
    jsonrpc: "2.0",
    id: 2,
    method: "getTokenAccountsByOwner",
    params: [
      SOLANA_ADDRESS,
      { programId: SPL_TOKEN_PROGRAM },
      { encoding: "jsonParsed" },
    ],
  });
  if (!result?.value) return { usd: null, usdcAccount: null };
  let sum = 0;
  let usdcAccount: string | null = null;
  let usdcMax = -1;
  for (const acc of result.value) {
    const info = acc.account?.data?.parsed?.info;
    if (!info) continue;
    if (!STABLE_MINTS.has(info.mint)) continue;
    const amount = info.tokenAmount?.uiAmount;
    if (typeof amount === "number") sum += amount;
    if (info.mint === USDC_MINT_SOL && acc.pubkey && (amount ?? 0) > usdcMax) {
      usdcMax = amount ?? 0;
      usdcAccount = acc.pubkey;
    }
  }
  return { usd: sum, usdcAccount };
}

async function fetchRates(): Promise<{
  solUsd: number | null;
  usdNok: number | null;
}> {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=solana,tether&vs_currencies=usd,nok";
  const res = await safeFetch(
    url,
    { next: { revalidate: REVALIDATE_RATES } },
    FETCH_TIMEOUT_MS,
    2,
  );
  const data = await safeJson<{
    solana?: { usd?: number; nok?: number };
    tether?: { usd?: number; nok?: number };
  }>(res);
  return {
    solUsd: data?.solana?.usd ?? null,
    usdNok: data?.tether?.nok ?? null,
  };
}

function sumOrNull(parts: Array<number | null>): number | null {
  const filtered = parts.filter((v): v is number => v != null);
  return filtered.length > 0 ? filtered.reduce((s, v) => s + v, 0) : null;
}

export async function getLiveBalances(): Promise<LiveBalances> {
  const [
    polyBetsUsd,
    polyCashUsdc,
    polyPositions,
    polyActivity,
    customBets,
    sol,
    stables,
    rates,
  ] = await Promise.all([
    fetchPolymarketBetsUsd(),
    fetchPolymarketCashUsdc(),
    fetchPolymarketPositions(),
    fetchActivity(),
    fetchCustomBets(),
    fetchSolBalance(),
    fetchStableUsd(),
    fetchRates(),
  ]);

  // Merge Polymarket + custom bets
  const positions: PolymarketPosition[] | null =
    polyPositions == null && customBets == null
      ? null
      : [...(polyPositions ?? []), ...(customBets?.positions ?? [])];
  const activity: ActivityEvent[] | null =
    polyActivity == null && customBets == null
      ? null
      : [...(polyActivity ?? []), ...(customBets?.activity ?? [])].sort(
          (a, b) => b.timestamp - a.timestamp,
        );
  const totalBetsUsd = sumOrNull([polyBetsUsd, customBets?.pendingStakeUsd ?? null]);

  const { usdNok, solUsd } = rates;

  const polyCashNok =
    polyCashUsdc != null && usdNok != null ? polyCashUsdc * usdNok : null;

  const solNativeUsd = sol != null && solUsd != null ? sol * solUsd : null;
  // All-or-nothing: if the token query is rate-limited while getBalance
  // succeeds, a partial sum would collapse the wallet to its SOL dust and
  // sail through the client's stale-value failsafe (non-null replaces the
  // last good value). Null keeps the previous reading on screen instead.
  const phantomUsd =
    solNativeUsd != null && stables.usd != null
      ? solNativeUsd + stables.usd
      : null;
  const phantomNok =
    phantomUsd != null && usdNok != null ? phantomUsd * usdNok : null;

  const cashTotalNok = sumOrNull([polyCashNok, phantomNok]);

  const betsValueNok =
    totalBetsUsd != null && usdNok != null ? totalBetsUsd * usdNok : null;

  return {
    fetchedAt: Date.now(),
    cash: {
      totalNok: cashTotalNok,
      polymarketCash: {
        usdc: polyCashUsdc,
        nok: polyCashNok,
        address: POLYMARKET_ADDRESS,
      },
      phantom: {
        sol,
        stableUsd: stables.usd,
        usdcAccount: stables.usdcAccount,
        usd: phantomUsd,
        nok: phantomNok,
        address: SOLANA_ADDRESS,
      },
    },
    polymarketBets: {
      valueUsd: totalBetsUsd,
      valueNok: betsValueNok,
      positions,
      activity,
      address: POLYMARKET_ADDRESS,
    },
    customBetsRealizedPnlUsd: customBets?.realizedPnlUsd ?? null,
    rates,
  };
}

export function liveTotalNok(b: LiveBalances): number | null {
  const cash = b.cash.totalNok;
  const bets = b.polymarketBets.valueNok;
  if (cash == null && bets == null) return null;
  return (cash ?? 0) + (bets ?? 0);
}

// Lifetime betting PnL in NOK. Computed as
//   −buys + sells + redeems + rewards + currentValue(open positions) + customRealized
// across Polymarket. The activity walk picks up history that has dropped off
// the /positions API (redeemed winners stop appearing once you claim), while
// the currentValue sum picks up MTM of positions still on the book. Custom
// bets stay summed as realized — pending custom bets have no live odds, so
// no MTM. Returns null if the FX rate is missing or we couldn't load any
// bet data.
export function livePnlNok(b: LiveBalances): number | null {
  const { usdNok } = b.rates;
  if (usdNok == null) return null;

  let pnlUsd = 0;
  let hasData = false;

  if (b.polymarketBets.activity != null) {
    for (const a of b.polymarketBets.activity) {
      if (a.source !== "polymarket") continue;
      if (a.type === "TRADE" && a.side === "BUY") pnlUsd -= a.usdcSize;
      else if (a.type === "TRADE" && a.side === "SELL") pnlUsd += a.usdcSize;
      else if (a.type === "REDEEM" || a.type === "REWARD") pnlUsd += a.usdcSize;
    }
    hasData = true;
  }
  if (b.polymarketBets.positions != null) {
    for (const p of b.polymarketBets.positions) {
      if (p.source !== "polymarket") continue;
      pnlUsd += p.currentValue ?? 0;
    }
    hasData = true;
  }
  if (b.customBetsRealizedPnlUsd != null) {
    pnlUsd += b.customBetsRealizedPnlUsd;
    hasData = true;
  }

  if (!hasData) return null;
  return pnlUsd * usdNok;
}
