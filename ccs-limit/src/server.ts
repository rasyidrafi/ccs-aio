import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pipeline, Readable } from "node:stream";
import type { Duplex } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import YAML from "yaml";
import { config } from "./config";
import { signJwt, verifyJwt, validateCredentials } from "./auth";
import { hashApiKey } from "./pricing";
import {
  getBudget,
  getAllBudgets,
  getBudgetWindow,
  getActiveBudgetBypassSession,
  isBudgetBypassEnabled,
  setBudgetBypassEnabled,
  setBudgetWindow,
  upsertBudget,
  updateResetDate,
  updateBudgetDateRange,
  setBudgetEnabled,
  updateLimit,
  deleteBudget,
  autoAdvanceWeek,
  todayDate,
  addDays,
} from "./db";
import {
  getCostForDateWindow,
  getCostForTimestampWindow,
  getCostsForDateWindow,
  getCostsForTimestampWindow,
} from "./usage";
import { resolveApiKeys } from "./api-keys";
import { ok, fail, extractBearerToken, CORS_HEADERS } from "./response";
import {
  getAbsoluteRequestTarget,
  getRequestPath,
  isUnsafeAbsoluteRequestTarget,
} from "./upstream-url";

type NodeHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => Promise<void>;

function datePart(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function resolveBudgetUsageWindow(
  weekStartDate: string,
  nextResetDate: string,
  bypassLimitEnabled: boolean,
): {
  usageStartDate: string;
  usageEndDate: string;
  costStartInclusive: string;
  costEndExclusive: string;
  useExactTimestamps: boolean;
  bypassSessionStartedAt: string | null;
  bypassSessionEndedAt: string | null;
} {
  const activeSession = bypassLimitEnabled ? getActiveBudgetBypassSession() : null;
  if (activeSession) {
    const usageEndDate = activeSession.ended_at
      ? datePart(activeSession.ended_at)
      : todayDate();
    return {
      usageStartDate: datePart(activeSession.started_at),
      usageEndDate,
      costStartInclusive: activeSession.started_at,
      costEndExclusive: activeSession.ended_at ?? addDays(usageEndDate, 1),
      useExactTimestamps: true,
      bypassSessionStartedAt: activeSession.started_at,
      bypassSessionEndedAt: activeSession.ended_at,
    };
  }

  return {
    usageStartDate: weekStartDate,
    usageEndDate: nextResetDate,
    costStartInclusive: weekStartDate,
    costEndExclusive: nextResetDate,
    useExactTimestamps: false,
    bypassSessionStartedAt: null,
    bypassSessionEndedAt: null,
  };
}

function getBudgetUsageCost(
  providerKey: string,
  usageWindow: ReturnType<typeof resolveBudgetUsageWindow>,
): number {
  if (usageWindow.useExactTimestamps) {
    return getCostForTimestampWindow(
      providerKey,
      usageWindow.costStartInclusive,
      usageWindow.costEndExclusive,
    );
  }

  return getCostForDateWindow(
    providerKey,
    usageWindow.costStartInclusive,
    usageWindow.costEndExclusive,
  );
}

function getBudgetUsageCosts(
  providerKeys: string[],
  usageWindow: ReturnType<typeof resolveBudgetUsageWindow>,
): Map<string, number> {
  if (usageWindow.useExactTimestamps) {
    return getCostsForTimestampWindow(
      providerKeys,
      usageWindow.costStartInclusive,
      usageWindow.costEndExclusive,
    );
  }

  return getCostsForDateWindow(
    providerKeys,
    usageWindow.costStartInclusive,
    usageWindow.costEndExclusive,
  );
}

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const CODEX_BACKEND_BASE_URL = "https://chatgpt.com/backend-api";
const CODEX_USER_AGENT = "codex-cli";

const httpAgent = config.nodePort > 0
  ? new http.Agent({
      keepAlive: true,
      maxSockets: 256,
      maxFreeSockets: 32,
      timeout: config.upstreamIdleTimeoutMs,
    })
  : undefined;
const httpsAgent = config.nodePort > 0
  ? new https.Agent({
      keepAlive: true,
      maxSockets: 256,
      maxFreeSockets: 32,
      timeout: config.upstreamIdleTimeoutMs,
    })
  : undefined;
const upstreamTarget = new URL(config.upstreamUrl);
const upstreamTransport = upstreamTarget.protocol === "https:" ? https : http;
const upstreamAgent = upstreamTarget.protocol === "https:" ? httpsAgent : httpAgent;
const upstreamHost = upstreamTarget.host;
const upstreamPort = upstreamTarget.port || undefined;
const unsafeClients = new Map<string, number>();
const MAX_UNSAFE_CLIENTS = 4_096;
const UNSAFE_REQUEST_BODY = Buffer.from(
  JSON.stringify({
    error: {
      message: "Absolute request targets are not allowed",
      type: "invalid_request_error",
    },
  }),
);
const HEALTH_BODY = Buffer.from(
  JSON.stringify({ ok: true, data: { status: "ok", upstream: config.upstreamUrl } }),
);
const HEALTH_RESPONSE = new Response(HEALTH_BODY, {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "Content-Length": HEALTH_BODY.length.toString(),
    ...CORS_HEADERS,
  },
});

type CodexAuthFile = {
  access_token?: string;
  account_id?: string;
  tokens?: {
    access_token?: string;
    account_id?: string;
  };
};

type CodexUsageWindow = {
  used_percent?: number;
  usedPercent?: number;
};

type CodexUsageResponse = {
  rate_limit_reset_credits?: {
    available_count?: number | string | null;
  } | null;
  rateLimitResetCredits?: {
    available_count?: number | string | null;
    availableCount?: number | string | null;
  } | null;
  rate_limit?: {
    secondary_window?: CodexUsageWindow | null;
    secondaryWindow?: CodexUsageWindow | null;
  } | null;
  rateLimit?: {
    secondary_window?: CodexUsageWindow | null;
    secondaryWindow?: CodexUsageWindow | null;
  } | null;
};

type CodexConsumeResponse = {
  code?: string;
  windows_reset?: number;
  windowsReset?: number;
};

type WebSocketPayload = string | ArrayBuffer | Uint8Array;

type WebSocketBridge = {
  upstream: WebSocket;
  client: Bun.ServerWebSocket<WebSocketBridge> | null;
  pendingToClient: WebSocketPayload[];
};

const BunWebSocket = WebSocket as unknown as {
  new (url: string | URL, options?: Bun.WebSocketOptions): WebSocket;
};

function extractApiKeyFromAuthHeader(
  authHeader: string | undefined,
): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function shouldSkipBudgetPrecheck(pathname: string): boolean {
  return pathname === "/" || pathname === "/v1/models";
}

function requiresBudgetPrecheck(pathname: string): boolean {
  return !shouldSkipBudgetPrecheck(pathname);
}

function isLocalApiRoute(pathname: string, method: string): boolean {
  const redeemMatch = pathname.match(
    /^\/api\/codex-resets\/([^/]+)\/redeem$/,
  );

  if (method === "OPTIONS") {
    return (
      pathname === "/api/auth/login" ||
      pathname === "/api/public/budgets" ||
      pathname === "/api/budgets" ||
      pathname === "/api/budgets/bypass" ||
      pathname === "/api/budgets/window" ||
      pathname === "/api/keys" ||
      /^\/api\/budgets\/([a-f0-9]+)$/.test(pathname) ||
      /^\/api\/budgets\/([a-f0-9]+)\/reset-date$/.test(pathname) ||
      /^\/api\/budgets\/([a-f0-9]+)\/date-range$/.test(pathname) ||
      /^\/api\/budgets\/([a-f0-9]+)\/limit$/.test(pathname) ||
      /^\/api\/budgets\/([a-f0-9]+)\/enabled$/.test(pathname) ||
      Boolean(redeemMatch)
    );
  }

  if (pathname === "/api/auth/login" && method === "POST") return true;
  if (pathname === "/api/public/budgets" && method === "GET") return true;
  if (pathname === "/api/budgets" && (method === "GET" || method === "POST"))
    return true;
  if (pathname === "/api/budgets/bypass" && method === "PUT") return true;
  if (
    pathname === "/api/budgets/window" &&
    (method === "GET" || method === "PUT")
  )
    return true;
  if (pathname === "/api/keys" && method === "GET") return true;

  const budgetMatch = pathname.match(/^\/api\/budgets\/([a-f0-9]+)$/);
  if (budgetMatch && (method === "GET" || method === "DELETE")) return true;

  const resetMatch = pathname.match(
    /^\/api\/budgets\/([a-f0-9]+)\/reset-date$/,
  );
  if (resetMatch && method === "PUT") return true;

  const rangeMatch = pathname.match(
    /^\/api\/budgets\/([a-f0-9]+)\/date-range$/,
  );
  if (rangeMatch && method === "PUT") return true;

  const limitMatch = pathname.match(/^\/api\/budgets\/([a-f0-9]+)\/limit$/);
  if (limitMatch && method === "PUT") return true;

  const toggleMatch = pathname.match(/^\/api\/budgets\/([a-f0-9]+)\/enabled$/);
  if (toggleMatch && method === "PUT") return true;

  if (redeemMatch && method === "POST") return true;

  return false;
}

function shouldProxyApiRequestWithoutBudgetCheck(
  pathname: string,
  method: string,
): boolean {
  return pathname.startsWith("/api/") && !isLocalApiRoute(pathname, method);
}

function createNodeRequest(req: http.IncomingMessage): Request {
  const origin = `http://${req.headers.host || "127.0.0.1"}`;
  const method = req.method || "GET";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: req.headers as HeadersInit,
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(req) as unknown as BodyInit;
    init.duplex = "half";
  }

  return new Request(new URL(req.url || "/", origin), init);
}

async function writeNodeResponse(
  res: http.ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      res,
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
  });
}

function cloneProxyHeaders(
  headers: http.IncomingHttpHeaders,
): http.OutgoingHttpHeaders {
  const outgoing: http.OutgoingHttpHeaders = {};

  for (const key in headers) {
    const value = headers[key];
    if (value === undefined) {
      continue;
    }

    if (key === "host") {
      continue;
    }
    if (HOP_BY_HOP_REQUEST_HEADERS.has(key)) {
      continue;
    }

    outgoing[key] = value;
  }

  outgoing.host = upstreamHost;
  return outgoing;
}

function markUnsafeClient(req: http.IncomingMessage): void {
  const address = req.socket.remoteAddress;
  if (!address || address === "127.0.0.1" || address === "::1") return;

  const now = Date.now();
  if (unsafeClients.size >= MAX_UNSAFE_CLIENTS) {
    for (const [client, expiresAt] of unsafeClients) {
      if (expiresAt <= now || unsafeClients.size >= MAX_UNSAFE_CLIENTS) {
        unsafeClients.delete(client);
      }
      if (unsafeClients.size < MAX_UNSAFE_CLIENTS) break;
    }
  }
  unsafeClients.set(address, now + config.unsafeClientBlockMs);
}

function writeBufferResponse(
  res: http.ServerResponse,
  statusCode: number,
  body: Buffer,
  close = false,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
    ...(close ? { Connection: "close" } : CORS_HEADERS),
  });
  res.end(body);
}

function writeUpgradeFailure(
  socket: Duplex,
  statusCode: number,
  statusText: string,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  socket.write(
    [
      `HTTP/1.1 ${statusCode} ${statusText}`,
      "Content-Type: application/json",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "Connection: close",
      "",
      body,
    ].join("\r\n"),
  );
  socket.destroy();
}

function proxyErrorPayload(message: string): {
  error: { message: string; type: string };
} {
  return {
    error: {
      message,
      type: "proxy_error",
    },
  };
}

async function requireAdmin(req: Request): Promise<Response | null> {
  const token = extractBearerToken(req);
  if (!token) return fail("Missing authorization token", 401);
  const payload = await verifyJwt(token);
  if (!payload) return fail("Invalid or expired token", 401);
  return null;
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function resolveCodexAuthDir(): Promise<string> {
  const configPath = path.join(config.cliproxyConfigDir, "config.yaml");
  const raw = await readText(configPath);
  if (!raw) return path.join(config.cliproxyConfigDir, "auth");

  try {
    const parsed = YAML.parse(raw) as { "auth-dir"?: string } | null;
    const configuredAuthDir = parsed?.["auth-dir"]?.trim();
    return configuredAuthDir || path.join(config.cliproxyConfigDir, "auth");
  } catch {
    return path.join(config.cliproxyConfigDir, "auth");
  }
}

function getCodexResetCreditCount(usage: CodexUsageResponse): number {
  const raw =
    usage.rate_limit_reset_credits?.available_count ??
    usage.rateLimitResetCredits?.available_count ??
    usage.rateLimitResetCredits?.availableCount;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    return Number(raw);
  }
  return 0;
}

function getWeeklyUsedPercent(usage: CodexUsageResponse): number | null {
  const rateLimit = usage.rate_limit || usage.rateLimit;
  const weekly = rateLimit?.secondary_window || rateLimit?.secondaryWindow;
  const raw = weekly?.used_percent ?? weekly?.usedPercent;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, raw));
}

async function loadCodexAuth(accountId: string): Promise<{
  accessToken: string;
  accountId: string | null;
}> {
  const decoded = decodeURIComponent(accountId);
  if (
    !decoded ||
    decoded !== path.basename(decoded) ||
    !decoded.startsWith("codex") ||
    !decoded.endsWith(".json")
  ) {
    throw new Error("Invalid Codex account id");
  }

  const authDir = await resolveCodexAuthDir();
  const candidates = [
    path.join(authDir, decoded),
    path.join(path.dirname(authDir), "auth-paused", decoded),
  ];

  for (const candidate of candidates) {
    const raw = await readText(candidate);
    if (!raw) continue;

    let parsed: CodexAuthFile;
    try {
      parsed = JSON.parse(raw) as CodexAuthFile;
    } catch {
      throw new Error("Codex auth file is not valid JSON");
    }

    const accessToken =
      parsed.access_token?.trim() || parsed.tokens?.access_token?.trim();
    const chatgptAccountId =
      parsed.account_id?.trim() || parsed.tokens?.account_id?.trim() || null;

    if (!accessToken) {
      throw new Error("Codex auth file does not contain an access token");
    }

    return { accessToken, accountId: chatgptAccountId };
  }

  throw new Error("Codex account auth file was not found");
}

async function requestCodexJson<T>(
  method: string,
  url: string,
  auth: { accessToken: string; accountId: string | null },
  payload?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "User-Agent": CODEX_USER_AGENT,
      ...(auth.accountId ? { "ChatGPT-Account-ID": auth.accountId } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(`Codex request failed with HTTP ${response.status}`);
  }
  if (!data || typeof data !== "object") {
    throw new Error("Codex request returned an invalid response");
  }

  return data as T;
}

async function handleRedeemCodexReset(accountId: string): Promise<Response> {
  try {
    const auth = await loadCodexAuth(accountId);
    const usage = await requestCodexJson<CodexUsageResponse>(
      "GET",
      `${CODEX_BACKEND_BASE_URL}/wham/usage`,
      auth,
    );
    const resetCredits = getCodexResetCreditCount(usage);
    if (resetCredits < 1) return fail("No unused reset credits available");

    const weeklyUsedPercent = getWeeklyUsedPercent(usage);
    if (weeklyUsedPercent === null) {
      return fail("Weekly limit state is unavailable");
    }
    if (weeklyUsedPercent < 100) {
      return fail("Weekly limit is not exhausted yet");
    }

    const redeemRequestId = crypto.randomUUID();
    const result = await requestCodexJson<CodexConsumeResponse>(
      "POST",
      `${CODEX_BACKEND_BASE_URL}/wham/rate-limit-reset-credits/consume`,
      auth,
      { redeem_request_id: redeemRequestId },
    );

    return ok({
      ...result,
      redeemRequestId,
      resetCreditsBefore: resetCredits,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Redeem failed", 500);
  }
}

async function handleLogin(req: Request): Promise<Response> {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  if (!body.username || !body.password) {
    return fail("Username and password required");
  }
  if (!validateCredentials(body.username, body.password)) {
    return fail("Invalid credentials", 401);
  }
  const token = await signJwt({
    sub: body.username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  });
  return ok({ token, expiresIn: 86400 });
}

async function handleListBudgets(): Promise<Response> {
  const budgets = getAllBudgets();
  const today = todayDate();
  const allKeys = await resolveApiKeys();
  const apiKeyNames = new Map(allKeys.map((key) => [key.hash, key.name]));
  const bypassLimitEnabled = isBudgetBypassEnabled();
  const usageWindow = budgets[0]
    ? resolveBudgetUsageWindow(
        budgets[0].week_start_date,
        budgets[0].next_reset_date,
        bypassLimitEnabled,
      )
    : null;
  const costs = usageWindow
    ? getBudgetUsageCosts(
        budgets.map((budget) => `api-key:${budget.api_key_hash}`),
        usageWindow,
      )
    : new Map<string, number>();

  const enriched = budgets.map((budget) => {
    const providerKey = `api-key:${budget.api_key_hash}`;
    const spent = costs.get(providerKey) ?? 0;
    return {
      ...budget,
      apiKeyName: apiKeyNames.get(budget.api_key_hash) ?? null,
      spentUsd: spent,
      remainingUsd: Math.max(0, budget.weekly_limit_usd - spent),
      percentUsed:
        budget.weekly_limit_usd > 0
          ? (spent / budget.weekly_limit_usd) * 100
          : 0,
      isOverBudget: bypassLimitEnabled
        ? false
        : spent >= budget.weekly_limit_usd,
      daysUntilReset: Math.max(
        0,
        Math.ceil(
          (new Date(budget.next_reset_date + "T00:00:00Z").getTime() -
            new Date(today + "T00:00:00Z").getTime()) /
            86400000,
        ),
      ),
      bypassLimitEnabled,
      usageStartDate: usageWindow?.usageStartDate ?? budget.week_start_date,
      usageEndDate: usageWindow?.usageEndDate ?? budget.next_reset_date,
      bypassSessionStartedAt: usageWindow?.bypassSessionStartedAt ?? null,
      bypassSessionEndedAt: usageWindow?.bypassSessionEndedAt ?? null,
    };
  });

  return ok(enriched);
}

async function handleGetBudget(hash: string): Promise<Response> {
  let budget = getBudget(hash);
  if (!budget) return fail("Budget not found", 404);
  budget = autoAdvanceWeek(budget);
  const bypassLimitEnabled = isBudgetBypassEnabled();

  const providerKey = `api-key:${budget.api_key_hash}`;
  const usageWindow = resolveBudgetUsageWindow(
    budget.week_start_date,
    budget.next_reset_date,
    bypassLimitEnabled,
  );
  const spent = getBudgetUsageCost(providerKey, usageWindow);
  const allKeys = await resolveApiKeys();
  const matched = allKeys.find((k) => k.hash === budget.api_key_hash);

  return ok({
    ...budget,
    apiKeyName: matched?.name ?? null,
    spentUsd: spent,
    remainingUsd: Math.max(0, budget.weekly_limit_usd - spent),
    percentUsed:
      budget.weekly_limit_usd > 0 ? (spent / budget.weekly_limit_usd) * 100 : 0,
    isOverBudget: bypassLimitEnabled ? false : spent >= budget.weekly_limit_usd,
    daysUntilReset: Math.max(
      0,
      Math.ceil(
        (new Date(budget.next_reset_date + "T00:00:00Z").getTime() -
          new Date(todayDate() + "T00:00:00Z").getTime()) /
          86400000,
      ),
    ),
    bypassLimitEnabled,
    usageStartDate: usageWindow.usageStartDate,
    usageEndDate: usageWindow.usageEndDate,
    bypassSessionStartedAt: usageWindow.bypassSessionStartedAt,
    bypassSessionEndedAt: usageWindow.bypassSessionEndedAt,
  });
}

function validateBudgetWindow(
  weekStartDate: string | undefined,
  nextResetDate: string | undefined,
): string | null {
  if (!weekStartDate) return "weekStartDate required";
  if (!nextResetDate) return "nextResetDate required";
  if (nextResetDate <= weekStartDate) {
    return "nextResetDate must be after weekStartDate";
  }

  const today = todayDate();
  if (nextResetDate < today) {
    return "nextResetDate cannot be in the past";
  }

  const maxReset = addDays(weekStartDate, 7);
  if (nextResetDate > maxReset) {
    return "nextResetDate cannot be more than 7 days after weekStartDate";
  }

  return null;
}

async function handleGetBudgetWindow(): Promise<Response> {
  const window = getBudgetWindow();
  const today = todayDate();

  return ok({
    ...window,
    bypass_session_started_at:
      getActiveBudgetBypassSession()?.started_at ?? null,
    bypass_session_ended_at: null,
    daysUntilReset: Math.max(
      0,
      Math.ceil(
        (new Date(window.next_reset_date + "T00:00:00Z").getTime() -
          new Date(today + "T00:00:00Z").getTime()) /
          86400000,
      ),
    ),
  });
}

async function handleUpdateBudgetWindow(req: Request): Promise<Response> {
  let body: { weekStartDate?: string; nextResetDate?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const validationError = validateBudgetWindow(
    body.weekStartDate,
    body.nextResetDate,
  );
  if (validationError) return fail(validationError);

  const window = setBudgetWindow(body.weekStartDate!, body.nextResetDate!);
  return ok({
    ...window,
    daysUntilReset: Math.max(
      0,
      Math.ceil(
        (new Date(window.next_reset_date + "T00:00:00Z").getTime() -
          new Date(todayDate() + "T00:00:00Z").getTime()) /
          86400000,
      ),
    ),
  });
}

async function handleUpdateBudgetBypass(req: Request): Promise<Response> {
  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  if (typeof body.enabled !== "boolean") return fail("enabled must be boolean");

  const enabled = setBudgetBypassEnabled(body.enabled);
  return ok({
    enabled: enabled.enabled,
    bypassSessionStartedAt: enabled.activeSession?.started_at ?? null,
    bypassSessionEndedAt: enabled.activeSession?.ended_at ?? null,
  });
}

async function handleCreateBudget(req: Request): Promise<Response> {
  let body: {
    apiKeyHash?: string;
    apiKey?: string;
    weeklyLimitUsd?: number;
    weekStartDate?: string;
    nextResetDate?: string;
    enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const hash =
    body.apiKeyHash || (body.apiKey ? hashApiKey(body.apiKey) : null);
  if (!hash) return fail("apiKeyHash or apiKey required");
  if (!body.weeklyLimitUsd || body.weeklyLimitUsd <= 0) {
    return fail("weeklyLimitUsd must be > 0");
  }

  const budget = upsertBudget(hash, body.weeklyLimitUsd, body.enabled ?? true);

  return ok(budget);
}

async function handleUpdateResetDate(
  hash: string,
  req: Request,
): Promise<Response> {
  let body: { nextResetDate?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  if (!body.nextResetDate) return fail("nextResetDate required");

  const existing = getBudget(hash);
  if (!existing) return fail("Budget not found", 404);

  const validationError = validateBudgetWindow(
    existing.week_start_date,
    body.nextResetDate,
  );
  if (validationError) return fail(validationError);

  const updated = updateResetDate(hash, body.nextResetDate);
  return ok(updated);
}

async function handleUpdateBudgetDateRange(
  hash: string,
  req: Request,
): Promise<Response> {
  let body: { weekStartDate?: string; nextResetDate?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  const existing = getBudget(hash);
  if (!existing) return fail("Budget not found", 404);

  const validationError = validateBudgetWindow(
    body.weekStartDate,
    body.nextResetDate,
  );
  if (validationError) return fail(validationError);

  const updated = updateBudgetDateRange(
    hash,
    body.weekStartDate!,
    body.nextResetDate!,
  );
  return ok(updated);
}

async function handleUpdateLimit(
  hash: string,
  req: Request,
): Promise<Response> {
  let body: { weeklyLimitUsd?: number };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  if (!body.weeklyLimitUsd || body.weeklyLimitUsd <= 0) {
    return fail("weeklyLimitUsd must be > 0");
  }

  const updated = updateLimit(hash, body.weeklyLimitUsd);
  if (!updated) return fail("Budget not found", 404);
  return ok(updated);
}

async function handleToggleBudget(
  hash: string,
  req: Request,
): Promise<Response> {
  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  if (typeof body.enabled !== "boolean") return fail("enabled must be boolean");

  const updated = setBudgetEnabled(hash, body.enabled);
  if (!updated) return fail("Budget not found", 404);
  return ok(updated);
}

async function handleDeleteBudget(hash: string): Promise<Response> {
  const deleted = deleteBudget(hash);
  if (!deleted) return fail("Budget not found", 404);
  return ok({ deleted: true });
}

async function handleListApiKeys(): Promise<Response> {
  const keys = await resolveApiKeys();
  const budgets = getAllBudgets();
  const budgetMap = new Map(budgets.map((b) => [b.api_key_hash, b]));

  return ok(
    keys.map((k) => ({
      hash: k.hash,
      name: k.name,
      hasBudget: budgetMap.has(k.hash),
      budget: budgetMap.get(k.hash) ?? null,
    })),
  );
}

async function handleLocalApiRequest(
  path: string,
  method: string,
  request: Request,
): Promise<Response> {
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (path === "/api/auth/login" && method === "POST") {
    return handleLogin(request);
  }
  if (path === "/api/public/budgets" && method === "GET") {
    return handleListBudgets();
  }

  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  if (path === "/api/budgets" && method === "GET") {
    return handleListBudgets();
  }
  if (path === "/api/budgets" && method === "POST") {
    return handleCreateBudget(request);
  }
  if (path === "/api/budgets/bypass" && method === "PUT") {
    return handleUpdateBudgetBypass(request);
  }
  if (path === "/api/budgets/window" && method === "GET") {
    return handleGetBudgetWindow();
  }
  if (path === "/api/budgets/window" && method === "PUT") {
    return handleUpdateBudgetWindow(request);
  }

  const budgetMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)$/);
  if (budgetMatch) {
    if (method === "GET") return handleGetBudget(budgetMatch[1]);
    if (method === "DELETE") return handleDeleteBudget(budgetMatch[1]);
  }

  const resetMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/reset-date$/);
  if (resetMatch && method === "PUT") {
    return handleUpdateResetDate(resetMatch[1], request);
  }

  const rangeMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/date-range$/);
  if (rangeMatch && method === "PUT") {
    return handleUpdateBudgetDateRange(rangeMatch[1], request);
  }

  const limitMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/limit$/);
  if (limitMatch && method === "PUT") {
    return handleUpdateLimit(limitMatch[1], request);
  }

  const toggleMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/enabled$/);
  if (toggleMatch && method === "PUT") {
    return handleToggleBudget(toggleMatch[1], request);
  }

  const redeemMatch = path.match(/^\/api\/codex-resets\/([^/]+)\/redeem$/);
  if (redeemMatch && method === "POST") {
    return handleRedeemCodexReset(redeemMatch[1]);
  }
  if (path === "/api/keys" && method === "GET") {
    return handleListApiKeys();
  }

  return fail("Not found", 404);
}

async function proxyUpstreamHttp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    let upstreamRes: http.IncomingMessage | null = null;

    const settle = () => {
      if (settled) return;
      settled = true;
      req.off("aborted", abortProxy);
      res.off("close", handleClientClose);
      resolve();
    };

    const abortProxy = () => {
      upstreamReq.destroy();
      upstreamRes?.destroy();
      settle();
    };

    const handleClientClose = () => {
      if (!res.writableFinished) {
        abortProxy();
      }
    };

    const upstreamReq = upstreamTransport.request(
      {
        protocol: upstreamTarget.protocol,
        hostname: upstreamTarget.hostname,
        port: upstreamPort,
        method: req.method,
        path: req.url || "/",
        headers: cloneProxyHeaders(req.headers),
        agent: upstreamAgent,
      },
      (response) => {
        upstreamRes = response;
        for (const key in response.headers) {
          const value = response.headers[key];
          if (
            value === undefined ||
            HOP_BY_HOP_RESPONSE_HEADERS.has(key)
          ) {
            continue;
          }
          res.setHeader(key, value);
        }

        res.writeHead(response.statusCode || 502, response.statusMessage);
        pipeline(response, res, (error) => {
          if (error && !res.destroyed) {
            res.destroy(error);
          }
          settle();
        });
      },
    );

    upstreamReq.setTimeout(config.upstreamIdleTimeoutMs, () => {
      upstreamReq.destroy(new Error("Upstream connection timed out"));
    });

    upstreamReq.on("error", (err) => {
      if (!res.headersSent) {
        const body = JSON.stringify(
          proxyErrorPayload(
            `Upstream connection failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        res.writeHead(502, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        });
        res.end(body);
      } else {
        res.destroy(err);
      }
      upstreamRes?.destroy();
      settle();
    });

    req.once("aborted", abortProxy);
    res.once("close", handleClientClose);
    pipeline(req, upstreamReq, (error) => {
      if (error && !upstreamReq.destroyed) {
        upstreamReq.destroy(error);
      }
    });
  });
}

function cloneFetchRequestHeaders(headers: Headers): Headers {
  const outgoing = new Headers(headers);
  outgoing.delete("host");
  for (const header of HOP_BY_HOP_REQUEST_HEADERS) outgoing.delete(header);
  return outgoing;
}

function cloneFetchResponseHeaders(headers: Headers): Headers {
  const outgoing = new Headers(headers);
  for (const header of HOP_BY_HOP_RESPONSE_HEADERS) outgoing.delete(header);
  return outgoing;
}

async function proxyUpstreamFetch(
  request: Request,
  requestTarget = getAbsoluteRequestTarget(request.url),
): Promise<Response> {
  const target = `${upstreamTarget.origin}${requestTarget}`;
  const method = request.method;

  try {
    const response = await fetch(target, {
      method,
      headers: cloneFetchRequestHeaders(request.headers),
      body: method === "GET" || method === "HEAD" ? undefined : request.body,
      signal: request.signal,
      redirect: "manual",
      decompress: false,
      keepalive: true,
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: cloneFetchResponseHeaders(response.headers),
    });
  } catch (error) {
    return new Response(
      JSON.stringify(
        proxyErrorPayload(
          `Upstream connection failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}

function proxyUpstreamUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const requestLines = [
    `${req.method || "GET"} ${req.url || "/"} HTTP/${req.httpVersion}`,
  ];
  let wroteHost = false;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index];
    const value = req.rawHeaders[index + 1];
    if (name.toLowerCase() === "host") {
      requestLines.push(`${name}: ${upstreamHost}`);
      wroteHost = true;
    } else {
      requestLines.push(`${name}: ${value}`);
    }
  }
  if (!wroteHost) requestLines.push(`Host: ${upstreamHost}`);
  requestLines.push("", "");
  const handshake = Buffer.from(requestLines.join("\r\n"));
  const port = Number(upstreamPort) || (upstreamTarget.protocol === "https:" ? 443 : 80);
  let connected = false;

  const onConnect = (upstreamSocket: net.Socket): void => {
    connected = true;
    upstreamSocket.setTimeout(config.upstreamIdleTimeoutMs);
    upstreamSocket.write(handshake);
    if (head.length > 0) upstreamSocket.write(head);
    upstreamSocket.on("data", (data) => {
      if (!socket.write(data)) upstreamSocket.pause();
    });
    socket.on("drain", () => upstreamSocket.resume());
    socket.on("data", (data) => {
      if (!upstreamSocket.write(data)) socket.pause();
    });
    upstreamSocket.on("drain", () => socket.resume());
    socket.resume();
  };

  let upstreamSocket: net.Socket;
  if (upstreamTarget.protocol === "https:") {
    const tlsSocket = tls.connect({
      host: upstreamTarget.hostname,
      port,
      servername: upstreamTarget.hostname,
    });
    upstreamSocket = tlsSocket;
    tlsSocket.once("secureConnect", () => onConnect(tlsSocket));
  } else {
    upstreamSocket = net.connect({ host: upstreamTarget.hostname, port });
    upstreamSocket.once("connect", () => onConnect(upstreamSocket));
  }

  upstreamSocket.once("timeout", () => upstreamSocket.destroy());
  upstreamSocket.once("error", (error) => {
    if (!connected && !socket.destroyed) {
      writeUpgradeFailure(
        socket,
        502,
        "Bad Gateway",
        proxyErrorPayload(`Upstream connection failed: ${error.message}`),
      );
      return;
    }
    if (!socket.destroyed) socket.destroy(error);
  });
  upstreamSocket.once("close", () => {
    if (!socket.destroyed) socket.destroy();
  });
  socket.once("error", () => upstreamSocket.destroy());
  socket.once("close", () => upstreamSocket.destroy());
}

function imitateCodexLimitResponse(resetDateStr?: string | null): Response {
  let resets_at: number;
  let resets_in_seconds: number;

  const now = Date.now();

  if (resetDateStr) {
    const d = new Date(resetDateStr + "T00:00:00Z");
    resets_at = Math.floor(d.getTime() / 1000);
    resets_in_seconds = Math.max(0, Math.floor((d.getTime() - now) / 1000));
  } else {
    resets_at = Math.floor(now / 1000) + 86400 * 365;
    resets_in_seconds = 86400 * 365;
  }

  return new Response(
    JSON.stringify({
      error: {
        type: "usage_limit_reached",
        message: "The usage limit has been reached",
        plan_type: "team",
        resets_at,
        eligible_promo: null,
        resets_in_seconds,
      },
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    },
  );
}

async function handleForward(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const apiKey = extractApiKeyFromAuthHeader(
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : undefined,
  );
  if (!apiKey) {
    await writeNodeResponse(
      res,
      new Response(
        JSON.stringify({
          error: { message: "Missing API key", type: "invalid_request_error" },
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      ),
    );
    return;
  }

  if (isBudgetBypassEnabled()) {
    await proxyUpstreamHttp(req, res);
    return;
  }

  const hash = hashApiKey(apiKey);
  let budget = getBudget(hash);

  if (!budget || !budget.enabled) {
    await writeNodeResponse(res, imitateCodexLimitResponse());
    return;
  }

  budget = autoAdvanceWeek(budget);
  const providerKey = `api-key:${hash}`;
  const spent = getCostForDateWindow(
    providerKey,
    budget.week_start_date,
    budget.next_reset_date,
  );

  if (spent >= budget.weekly_limit_usd) {
    await writeNodeResponse(
      res,
      imitateCodexLimitResponse(budget.next_reset_date),
    );
    return;
  }

  await proxyUpstreamHttp(req, res);
}

async function handleForwardFetch(
  request: Request,
  requestTarget?: string,
): Promise<Response> {
  const apiKey = extractApiKeyFromAuthHeader(
    request.headers.get("authorization") ?? undefined,
  );
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: { message: "Missing API key", type: "invalid_request_error" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  }

  if (isBudgetBypassEnabled()) return proxyUpstreamFetch(request, requestTarget);

  const hash = hashApiKey(apiKey);
  let budget = getBudget(hash);
  if (!budget || !budget.enabled) return imitateCodexLimitResponse();

  budget = autoAdvanceWeek(budget);
  const spent = getCostForDateWindow(
    `api-key:${hash}`,
    budget.week_start_date,
    budget.next_reset_date,
  );
  if (spent >= budget.weekly_limit_usd) {
    return imitateCodexLimitResponse(budget.next_reset_date);
  }

  return proxyUpstreamFetch(request, requestTarget);
}

function getUpgradeBudgetRejection(
  path: string,
  method: string,
  authorization: string | null,
): Response | null {
  if (
    path.startsWith("/api/") &&
    !shouldProxyApiRequestWithoutBudgetCheck(path, method)
  ) {
    return new Response(
      JSON.stringify({
        error: { message: "Not found", type: "invalid_request_error" },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!requiresBudgetPrecheck(path)) return null;

  const apiKey = extractApiKeyFromAuthHeader(authorization ?? undefined);
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: { message: "Missing API key", type: "invalid_request_error" },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  if (isBudgetBypassEnabled()) return null;

  const hash = hashApiKey(apiKey);
  let budget = getBudget(hash);
  if (!budget || !budget.enabled) return imitateCodexLimitResponse();
  budget = autoAdvanceWeek(budget);
  const spent = getCostForDateWindow(
    `api-key:${hash}`,
    budget.week_start_date,
    budget.next_reset_date,
  );
  return spent >= budget.weekly_limit_usd
    ? imitateCodexLimitResponse(budget.next_reset_date)
    : null;
}

function cloneWebSocketHeaders(headers: Headers): http.OutgoingHttpHeaders {
  const outgoing: http.OutgoingHttpHeaders = {};
  headers.forEach((value, key) => {
    if (
      key === "host" ||
      key === "connection" ||
      key === "upgrade" ||
      key.startsWith("sec-websocket-")
    ) {
      return;
    }
    outgoing[key] = value;
  });
  return outgoing;
}

async function handleNativeUpgrade(
  request: Request,
  server: Bun.Server<WebSocketBridge>,
  path: string,
  requestTarget: string,
): Promise<Response | undefined> {
  const rejection = getUpgradeBudgetRejection(
    path,
    request.method,
    request.headers.get("authorization"),
  );
  if (rejection) return rejection;

  const protocols = (request.headers.get("sec-websocket-protocol") || "")
    .split(",")
    .map((protocol) => protocol.trim())
    .filter(Boolean);
  const targetProtocol = upstreamTarget.protocol === "https:" ? "wss:" : "ws:";
  const target = `${targetProtocol}//${upstreamHost}${requestTarget}`;
  const upstream = new BunWebSocket(target, {
    headers: cloneWebSocketHeaders(request.headers),
    protocols: protocols.length > 0 ? protocols : undefined,
    perMessageDeflate: request.headers
      .get("sec-websocket-extensions")
      ?.toLowerCase()
      .includes("permessage-deflate"),
  });
  upstream.binaryType = "arraybuffer";

  const bridge: WebSocketBridge = {
    upstream,
    client: null,
    pendingToClient: [],
  };
  upstream.addEventListener("close", (event) => {
    if (!bridge.client) return;
    const code = event.code >= 1000 && event.code !== 1005 ? event.code : 1011;
    bridge.client.close(code, event.reason || "Upstream WebSocket closed");
  });
  upstream.addEventListener("error", () => {
    bridge.client?.close(1011, "Upstream WebSocket error");
  });
  upstream.addEventListener("message", (event) => {
    const payload = typeof event.data === "string"
      ? event.data
      : event.data instanceof ArrayBuffer
        ? event.data
        : new Uint8Array(event.data as ArrayBuffer);
    if (bridge.client) {
      const result = bridge.client.send(payload);
      if (result === -1) bridge.pendingToClient.push(payload);
    } else {
      bridge.pendingToClient.push(payload);
    }
  });

  const opened = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      upstream.close();
      resolve(false);
    }, config.headersTimeoutMs);
    upstream.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
      { once: true },
    );
    upstream.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        resolve(false);
      },
      { once: true },
    );
  });
  if (!opened) {
    return new Response(
      JSON.stringify(proxyErrorPayload("Upstream WebSocket upgrade failed")),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const upgraded = server.upgrade(request, {
    data: bridge,
    headers: upstream.protocol
      ? { "Sec-WebSocket-Protocol": upstream.protocol }
      : undefined,
  });
  if (!upgraded) {
    upstream.close();
    return new Response(
      JSON.stringify(proxyErrorPayload("Client WebSocket upgrade failed")),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  return undefined;
}

async function handleNativeHttpRequest(
  request: Request,
  server: Bun.Server<WebSocketBridge>,
): Promise<Response | undefined> {
  const requestTarget = getAbsoluteRequestTarget(request.url);
  const path = getRequestPath(requestTarget);
  const method = request.method;

  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return handleNativeUpgrade(request, server, path, requestTarget);
  }

  if (path.startsWith("/api/")) {
    if (shouldProxyApiRequestWithoutBudgetCheck(path, method)) {
      return handleForwardFetch(request, requestTarget);
    }
    return handleLocalApiRequest(path, method, request);
  }

  if (path === "/health") {
    return new Response(HEALTH_BODY, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": HEALTH_BODY.length.toString(),
        ...CORS_HEADERS,
      },
    });
  }
  if (shouldSkipBudgetPrecheck(path)) {
    return proxyUpstreamFetch(request, requestTarget);
  }
  return handleForwardFetch(request, requestTarget);
}

const handleHttpRequest: NodeHandler = async (req, res) => {
  if (isUnsafeAbsoluteRequestTarget(req.url)) {
    markUnsafeClient(req);
    res.shouldKeepAlive = false;
    writeBufferResponse(res, 400, UNSAFE_REQUEST_BODY, true);
    return;
  }

  const path = getRequestPath(req.url);
  const method = req.method || "GET";

  if (path.startsWith("/api/")) {
    if (shouldProxyApiRequestWithoutBudgetCheck(path, method)) {
      await handleForward(req, res);
      return;
    }

    await writeNodeResponse(
      res,
      await handleLocalApiRequest(path, method, createNodeRequest(req)),
    );
    return;
  }

  if (path === "/health") {
    writeBufferResponse(res, 200, HEALTH_BODY);
    return;
  }

  if (shouldSkipBudgetPrecheck(path)) {
    await proxyUpstreamHttp(req, res);
    return;
  }

  await handleForward(req, res);
};

const server = http.createServer((req, res) => {
  void handleHttpRequest(req, res).catch(async (error) => {
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }

    await writeNodeResponse(
      res,
      new Response(
        JSON.stringify(
          proxyErrorPayload(
            `Unhandled proxy failure: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
  });
});

server.on("connection", (socket) => {
  const address = socket.remoteAddress;
  if (!address) return;
  const expiresAt = unsafeClients.get(address);
  if (!expiresAt) return;
  if (expiresAt <= Date.now()) {
    unsafeClients.delete(address);
    return;
  }
  socket.destroy();
});

server.headersTimeout = config.headersTimeoutMs;
server.keepAliveTimeout = config.keepAliveTimeoutMs;
server.requestTimeout = 0;
server.maxHeadersCount = 200;
server.maxRequestsPerSocket = 1_000;
server.setTimeout(config.clientIdleTimeoutMs, (socket) => socket.destroy());

server.on("upgrade", (req, socket, head) => {
  if (isUnsafeAbsoluteRequestTarget(req.url)) {
    markUnsafeClient(req);
    writeUpgradeFailure(socket, 400, "Bad Request", {
      error: {
        message: "Absolute request targets are not allowed",
        type: "invalid_request_error",
      },
    });
    return;
  }

  const path = getRequestPath(req.url);
  const method = req.method || "GET";

  if (path.startsWith("/api/")) {
    if (shouldProxyApiRequestWithoutBudgetCheck(path, method)) {
      if (requiresBudgetPrecheck(path)) {
        const authHeader =
          typeof req.headers.authorization === "string"
            ? req.headers.authorization
            : undefined;
        const apiKey = extractApiKeyFromAuthHeader(authHeader);
        if (!apiKey) {
          writeUpgradeFailure(socket, 401, "Unauthorized", {
            error: {
              message: "Missing API key",
              type: "invalid_request_error",
            },
          });
          return;
        }

        if (isBudgetBypassEnabled()) {
          proxyUpstreamUpgrade(req, socket, head);
          return;
        }

        const hash = hashApiKey(apiKey);
        let budget = getBudget(hash);

        if (!budget || !budget.enabled) {
          writeUpgradeFailure(socket, 429, "Too Many Requests", {
            error: {
              type: "usage_limit_reached",
              message: "The usage limit has been reached",
            },
          });
          return;
        }

        budget = autoAdvanceWeek(budget);
        const providerKey = `api-key:${hash}`;
        const spent = getCostForDateWindow(
          providerKey,
          budget.week_start_date,
          budget.next_reset_date,
        );

        if (spent >= budget.weekly_limit_usd) {
          writeUpgradeFailure(socket, 429, "Too Many Requests", {
            error: {
              type: "usage_limit_reached",
              message: "The usage limit has been reached",
            },
          });
          return;
        }
      }

      proxyUpstreamUpgrade(req, socket, head);
      return;
    }

    writeUpgradeFailure(socket, 404, "Not Found", {
      error: { message: "Not found", type: "invalid_request_error" },
    });
    return;
  }

  if (requiresBudgetPrecheck(path)) {
    const authHeader =
      typeof req.headers.authorization === "string"
        ? req.headers.authorization
        : undefined;
    const apiKey = extractApiKeyFromAuthHeader(authHeader);
    if (!apiKey) {
      writeUpgradeFailure(socket, 401, "Unauthorized", {
        error: { message: "Missing API key", type: "invalid_request_error" },
      });
      return;
    }

    if (isBudgetBypassEnabled()) {
      proxyUpstreamUpgrade(req, socket, head);
      return;
    }

    const hash = hashApiKey(apiKey);
    let budget = getBudget(hash);

    if (!budget || !budget.enabled) {
      writeUpgradeFailure(socket, 429, "Too Many Requests", {
        error: {
          type: "usage_limit_reached",
          message: "The usage limit has been reached",
        },
      });
      return;
    }

    budget = autoAdvanceWeek(budget);
    const providerKey = `api-key:${hash}`;
    const spent = getCostForDateWindow(
      providerKey,
      budget.week_start_date,
      budget.next_reset_date,
    );

    if (spent >= budget.weekly_limit_usd) {
      writeUpgradeFailure(socket, 429, "Too Many Requests", {
        error: {
          type: "usage_limit_reached",
          message: "The usage limit has been reached",
        },
      });
      return;
    }
  }

  proxyUpstreamUpgrade(req, socket, head);
});

if (config.nativePort > 0) {
  Bun.serve<WebSocketBridge>({
    hostname: "127.0.0.1",
    port: config.nativePort,
    idleTimeout: 0,
    routes: { "/health": HEALTH_RESPONSE },
    fetch: handleNativeHttpRequest,
    websocket: {
      open(socket) {
        socket.data.client = socket;
        if (socket.data.pendingToClient.length === 0) return;
        const pending = socket.data.pendingToClient;
        socket.data.pendingToClient = [];
        for (let index = 0; index < pending.length; index += 1) {
          if (socket.send(pending[index]) === -1) {
            socket.data.pendingToClient.push(...pending.slice(index));
            break;
          }
        }
      },
      message(socket, message) {
        if (socket.data.upstream.readyState === WebSocket.OPEN) {
          socket.data.upstream.send(message);
        }
      },
      drain(socket) {
        if (socket.data.pendingToClient.length === 0) return;
        const pending = socket.data.pendingToClient;
        socket.data.pendingToClient = [];
        for (let index = 0; index < pending.length; index += 1) {
          if (socket.send(pending[index]) === -1) {
            socket.data.pendingToClient.push(...pending.slice(index));
            break;
          }
        }
      },
      close(socket, code, reason) {
        socket.data.client = null;
        if (
          socket.data.upstream.readyState === WebSocket.OPEN ||
          socket.data.upstream.readyState === WebSocket.CONNECTING
        ) {
          const closeCode = code >= 1000 && code !== 1005 ? code : 1000;
          socket.data.upstream.close(closeCode, reason);
        }
      },
    },
    error(error) {
      return new Response(
        JSON.stringify(
          proxyErrorPayload(
            `Unhandled proxy failure: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  console.log(`[ccs-limit] native HTTP backend: 127.0.0.1:${config.nativePort}`);
}

const nodeHost = config.nativePort > 0 ? "127.0.0.1" : "0.0.0.0";
if (config.nodePort > 0) {
  server.listen(config.nodePort, nodeHost, () => {
    const address = server.address();
    const port =
      typeof address === "object" && address ? address.port : config.nodePort;
    console.log(`[ccs-limit] Node compatibility backend: ${nodeHost}:${port}`);
  });
} else {
  console.log("[ccs-limit] Node compatibility backend: disabled");
}
if (config.nativePort > 0 || config.nodePort > 0) {
  console.log(`[ccs-limit] upstream: ${config.upstreamUrl}`);
  console.log(`[ccs-limit] budget db: ${config.budgetDbPath}`);
  console.log(`[ccs-limit] usage db: ${config.usageDbPath}`);
}
