import "server-only";

const POLYMARKET_ADDRESS =
  process.env.POLYMARKET_ADDRESS ?? "0xdee67d2c135d1c374bbb5ec52ed22cee0edb782f";
const SOLANA_ADDRESS =
  process.env.SOLANA_ADDRESS ?? "EyeWgvbTduRDMzbERKvy6Muxdi83U6DYSLaqCtPjKcGz";
const SOLANA_RPC =
  process.env.SOLANA_RPC_URL ?? "https://solana-rpc.publicnode.com";
const POLYGON_RPC =
  process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";

const LAMPORTS_PER_SOL = 1_000_000_000;
const REVALIDATE_BALANCES = 10;
const REVALIDATE_RATES = 60;
const FETCH_TIMEOUT_MS = 4000;
const FETCH_RETRIES = 1;

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const USDC_MINT_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT_SOL = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const STABLE_MINTS = new Set([USDC_MINT_SOL, USDT_MINT_SOL]);

const USDC_E_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_DECIMALS = 6;
const BALANCE_OF_SELECTOR = "0x70a08231";

const POLYMARKET_BRIDGE_EVM =
  process.env.POLYMARKET_BRIDGE_EVM ??
  "0xD7658791eb8b7D5410E43127520C351De453A71D";
const POLYMARKET_BRIDGE_SVM =
  process.env.POLYMARKET_BRIDGE_SVM ??
  "3ADZFsTweYNgcLUYDJHTAZV9AsJX1KJN3WJC4zQ9x9ja";

export interface PolymarketPosition {
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
      usd: number | null;
      nok: number | null;
      address: string;
    };
  };
  polymarketBets: {
    valueUsd: number | null;
    valueNok: number | null;
    positions: PolymarketPosition[] | null;
    address: string;
  };
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
  const [bridged, native] = await Promise.all([
    fetchErc20Balance(USDC_E_POLYGON, owner),
    fetchErc20Balance(USDC_POLYGON, owner),
  ]);
  if (bridged == null && native == null) return null;
  return (bridged ?? 0) + (native ?? 0);
}

interface ParsedTokenAccount {
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

async function fetchPolymarketCashUsdc(): Promise<number | null> {
  const [proxy, evmBridge, svmBridge] = await Promise.all([
    fetchOwnerUsdc(POLYMARKET_ADDRESS),
    fetchOwnerUsdc(POLYMARKET_BRIDGE_EVM),
    fetchSolanaUsdc(POLYMARKET_BRIDGE_SVM),
  ]);
  const parts = [proxy, evmBridge, svmBridge].filter(
    (v): v is number => v != null,
  );
  if (parts.length === 0) return null;
  return parts.reduce((s, v) => s + v, 0);
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

async function fetchPolymarketPositions(): Promise<
  PolymarketPosition[] | null
> {
  const url = `https://data-api.polymarket.com/positions?user=${POLYMARKET_ADDRESS}&limit=200&sortBy=CURRENT&sortDirection=DESC`;
  const res = await safeFetch(url, {
    next: { revalidate: REVALIDATE_BALANCES },
  });
  const data = await safeJson<RawPolymarketPosition[]>(res);
  if (!Array.isArray(data)) return null;
  return data.map((p) => ({
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
  }));
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

async function fetchStableUsd(): Promise<number | null> {
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
  if (!result?.value) return null;
  let sum = 0;
  for (const acc of result.value) {
    const info = acc.account?.data?.parsed?.info;
    if (!info) continue;
    if (!STABLE_MINTS.has(info.mint)) continue;
    const amount = info.tokenAmount?.uiAmount;
    if (typeof amount === "number") sum += amount;
  }
  return sum;
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
  const [polyBetsUsd, polyCashUsdc, positions, sol, stableUsd, rates] =
    await Promise.all([
      fetchPolymarketBetsUsd(),
      fetchPolymarketCashUsdc(),
      fetchPolymarketPositions(),
      fetchSolBalance(),
      fetchStableUsd(),
      fetchRates(),
    ]);

  const { usdNok, solUsd } = rates;

  const polyCashNok =
    polyCashUsdc != null && usdNok != null ? polyCashUsdc * usdNok : null;

  const solNativeUsd = sol != null && solUsd != null ? sol * solUsd : null;
  const phantomUsd = sumOrNull([solNativeUsd, stableUsd]);
  const phantomNok =
    phantomUsd != null && usdNok != null ? phantomUsd * usdNok : null;

  const cashTotalNok = sumOrNull([polyCashNok, phantomNok]);

  const betsValueNok =
    polyBetsUsd != null && usdNok != null ? polyBetsUsd * usdNok : null;

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
        stableUsd,
        usd: phantomUsd,
        nok: phantomNok,
        address: SOLANA_ADDRESS,
      },
    },
    polymarketBets: {
      valueUsd: polyBetsUsd,
      valueNok: betsValueNok,
      positions,
      address: POLYMARKET_ADDRESS,
    },
    rates,
  };
}
