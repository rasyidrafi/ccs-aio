import { config } from "./config";
import { signJwt, verifyJwt, validateCredentials } from "./auth";
import { hashApiKey, providerKeyFromApiKey } from "./pricing";
import {
  getBudget,
  getAllBudgets,
  upsertBudget,
  updateResetDate,
  setBudgetEnabled,
  deleteBudget,
  autoAdvanceWeek,
  todayDate,
  addDays,
} from "./db";
import { getWeeklyCost } from "./usage";
import { resolveApiKeys } from "./api-keys";
import { ok, fail, json, extractBearerToken } from "./response";

function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function getRoutePath(url: string): string {
  const idx = url.indexOf("?");
  return idx >= 0 ? url.slice(0, idx) : url;
}

async function requireAdmin(req: Request): Promise<Response | null> {
  const token = extractBearerToken(req);
  if (!token) return fail("Missing authorization token", 401);
  const payload = await verifyJwt(token);
  if (!payload) return fail("Invalid or expired token", 401);
  return null;
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

  const enriched = await Promise.all(
    budgets.map(async (b) => {
      const b2 = autoAdvanceWeek(b);
      const providerKey = `api-key:${b2.api_key_hash}`;
      const spent = getWeeklyCost(providerKey, b2.week_start_date, b2.next_reset_date);
      const allKeys = await resolveApiKeys();
      const matched = allKeys.find((k) => k.hash === b2.api_key_hash);
      return {
        ...b2,
        apiKeyName: matched?.name ?? null,
        spentUsd: spent,
        remainingUsd: Math.max(0, b2.weekly_limit_usd - spent),
        percentUsed: b2.weekly_limit_usd > 0 ? (spent / b2.weekly_limit_usd) * 100 : 0,
        isOverBudget: spent >= b2.weekly_limit_usd,
        daysUntilReset: Math.max(
          0,
          Math.ceil(
            (new Date(b2.next_reset_date + "T00:00:00Z").getTime() -
              new Date(today + "T00:00:00Z").getTime()) /
              86400000
          )
        ),
      };
    })
  );

  return ok(enriched);
}

async function handleGetBudget(hash: string): Promise<Response> {
  let budget = getBudget(hash);
  if (!budget) return fail("Budget not found", 404);
  budget = autoAdvanceWeek(budget);

  const providerKey = `api-key:${budget.api_key_hash}`;
  const spent = getWeeklyCost(providerKey, budget.week_start_date, budget.next_reset_date);
  const allKeys = await resolveApiKeys();
  const matched = allKeys.find((k) => k.hash === budget.api_key_hash);

  return ok({
    ...budget,
    apiKeyName: matched?.name ?? null,
    spentUsd: spent,
    remainingUsd: Math.max(0, budget.weekly_limit_usd - spent),
    percentUsed: budget.weekly_limit_usd > 0 ? (spent / budget.weekly_limit_usd) * 100 : 0,
    isOverBudget: spent >= budget.weekly_limit_usd,
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

  const hash = body.apiKeyHash || (body.apiKey ? hashApiKey(body.apiKey) : null);
  if (!hash) return fail("apiKeyHash or apiKey required");
  if (!body.weeklyLimitUsd || body.weeklyLimitUsd <= 0) {
    return fail("weeklyLimitUsd must be > 0");
  }

  const today = todayDate();
  const weekStart = body.weekStartDate || today;
  const nextReset = body.nextResetDate || addDays(weekStart, 7);

  if (nextReset <= weekStart) {
    return fail("nextResetDate must be after weekStartDate");
  }
  const maxReset = addDays(weekStart, 7);
  if (nextReset > maxReset) {
    return fail("nextResetDate cannot be more than 7 days after weekStartDate");
  }

  const budget = upsertBudget(
    hash,
    body.weeklyLimitUsd,
    weekStart,
    nextReset,
    body.enabled ?? true
  );

  return ok(budget);
}

async function handleUpdateResetDate(
  hash: string,
  req: Request
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

  const today = todayDate();
  if (body.nextResetDate < today) {
    return fail("nextResetDate cannot be in the past");
  }
  const maxReset = addDays(existing.week_start_date, 7);
  if (body.nextResetDate > maxReset) {
    return fail("nextResetDate cannot be more than 7 days after current weekStartDate");
  }

  const updated = updateResetDate(hash, body.nextResetDate);
  return ok(updated);
}

async function handleToggleBudget(
  hash: string,
  req: Request
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
    }))
  );
}

async function proxyUpstream(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const upstreamUrl = `${config.upstreamUrl}${url.pathname}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");

  try {
    const upstreamResp = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: req.body,
      duplex: "half",
    } as RequestInit);

    const respHeaders = new Headers(upstreamResp.headers);
    respHeaders.delete("transfer-encoding");

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: {
          message: `Upstream connection failed: ${err instanceof Error ? err.message : String(err)}`,
          type: "proxy_error",
        },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleForward(req: Request): Promise<Response> {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: "Missing API key", type: "invalid_request_error" } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const hash = hashApiKey(apiKey);
  let budget = getBudget(hash);

  if (budget && budget.enabled) {
    budget = autoAdvanceWeek(budget);
    const providerKey = providerKeyFromApiKey(apiKey);
    const spent = getWeeklyCost(providerKey, budget.week_start_date, budget.next_reset_date);

    if (spent >= budget.weekly_limit_usd) {
      return new Response(
        JSON.stringify({
          error: {
            message: `Weekly budget exceeded. Used $${spent.toFixed(2)} of $${budget.weekly_limit_usd.toFixed(2)} limit. Resets on ${budget.next_reset_date}.`,
            type: "budget_exceeded",
            budget_usd: budget.weekly_limit_usd,
            spent_usd: spent,
            remaining_usd: 0,
            resets_on: budget.next_reset_date,
          },
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return proxyUpstream(req);
}

const server = Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = getRoutePath(url.pathname);
    const method = req.method;

    // Management API routes
    if (path.startsWith("/api/")) {
      // Public: login
      if (path === "/api/auth/login" && method === "POST") {
        return handleLogin(req);
      }

      // Protected: all other /api/ routes require JWT
      const authErr = await requireAdmin(req);
      if (authErr) return authErr;

      // Budget CRUD
      if (path === "/api/budgets" && method === "GET") {
        return handleListBudgets();
      }
      if (path === "/api/budgets" && method === "POST") {
        return handleCreateBudget(req);
      }

      // Single budget by hash
      const budgetMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)$/);
      if (budgetMatch) {
        const hash = budgetMatch[1];
        if (method === "GET") return handleGetBudget(hash);
        if (method === "DELETE") return handleDeleteBudget(hash);
      }

      // Update reset date
      const resetMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/reset-date$/);
      if (resetMatch && method === "PUT") {
        return handleUpdateResetDate(resetMatch[1], req);
      }

      // Toggle enabled
      const toggleMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/enabled$/);
      if (toggleMatch && method === "PUT") {
        return handleToggleBudget(toggleMatch[1], req);
      }

      // List API keys
      if (path === "/api/keys" && method === "GET") {
        return handleListApiKeys();
      }

      return fail("Not found", 404);
    }

    // Health check
    if (path === "/health") {
      return ok({ status: "ok", upstream: config.upstreamUrl });
    }

    // Root "/" — forward directly, no budget check
    if (path === "/" || path === "") {
      return proxyUpstream(req);
    }

    // Everything else: forward with budget pre-check
    return handleForward(req);
  },
});

console.log(`[ccs-limit] listening on :${server.port}`);
console.log(`[ccs-limit] upstream: ${config.upstreamUrl}`);
console.log(`[ccs-limit] budget db: ${config.budgetDbPath}`);
console.log(`[ccs-limit] usage db: ${config.usageDbPath}`);
