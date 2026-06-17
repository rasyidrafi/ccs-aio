import http from "node:http";
import https from "node:https";
import { pipeline, Readable } from "node:stream";
import type { Duplex } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { config } from "./config";
import { signJwt, verifyJwt, validateCredentials } from "./auth";
import { hashApiKey, providerKeyFromApiKey } from "./pricing";
import {
  getBudget,
  getAllBudgets,
  upsertBudget,
  updateResetDate,
  setBudgetEnabled,
  updateLimit,
  deleteBudget,
  autoAdvanceWeek,
  todayDate,
  addDays,
} from "./db";
import { getWeeklyCost } from "./usage";
import { resolveApiKeys } from "./api-keys";
import { ok, fail, extractBearerToken, CORS_HEADERS } from "./response";

type NodeHandler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;

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

function extractApiKeyFromAuthHeader(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function getRoutePath(url: URL): string {
  return url.pathname;
}

function shouldSkipBudgetPrecheck(pathname: string): boolean {
  return pathname === "/" || pathname === "/v1/models";
}

function requiresBudgetPrecheck(pathname: string): boolean {
  return !shouldSkipBudgetPrecheck(pathname);
}

function isLocalApiRoute(pathname: string, method: string): boolean {
  if (pathname === "/api/auth/login" && method === "POST") return true;
  if (pathname === "/api/public/budgets" && method === "GET") return true;
  if (pathname === "/api/budgets" && (method === "GET" || method === "POST")) return true;
  if (pathname === "/api/keys" && method === "GET") return true;

  const budgetMatch = pathname.match(/^\/api\/budgets\/([a-f0-9]+)$/);
  if (budgetMatch && (method === "GET" || method === "DELETE")) return true;

  const resetMatch = pathname.match(/^\/api\/budgets\/([a-f0-9]+)\/reset-date$/);
  if (resetMatch && method === "PUT") return true;

  const limitMatch = pathname.match(/^\/api\/budgets\/([a-f0-9]+)\/limit$/);
  if (limitMatch && method === "PUT") return true;

  const toggleMatch = pathname.match(/^\/api\/budgets\/([a-f0-9]+)\/enabled$/);
  if (toggleMatch && method === "PUT") return true;

  return false;
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

async function writeNodeResponse(res: http.ServerResponse, response: Response): Promise<void> {
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
      }
    );
  });
}

function cloneProxyHeaders(
  headers: http.IncomingHttpHeaders,
  target: URL,
  isUpgrade: boolean
): http.OutgoingHttpHeaders {
  const outgoing: http.OutgoingHttpHeaders = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    const lowerKey = key.toLowerCase();
    if (lowerKey === "host") {
      continue;
    }
    if (!isUpgrade && HOP_BY_HOP_REQUEST_HEADERS.has(lowerKey)) {
      continue;
    }

    outgoing[key] = value;
  }

  outgoing.host = target.host;
  return outgoing;
}

function writeUpgradeFailure(
  socket: Duplex,
  statusCode: number,
  statusText: string,
  payload: unknown
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
    ].join("\r\n")
  );
  socket.destroy();
}

function proxyErrorPayload(message: string): { error: { message: string; type: string } } {
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

async function handleUpdateResetDate(hash: string, req: Request): Promise<Response> {
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

async function handleUpdateLimit(hash: string, req: Request): Promise<Response> {
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

async function handleToggleBudget(hash: string, req: Request): Promise<Response> {
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

async function proxyUpstreamHttp(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const target = new URL(req.url || "/", config.upstreamUrl);
  const transport = target.protocol === "https:" ? https : http;

  await new Promise<void>((resolve) => {
    const upstreamReq = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers: cloneProxyHeaders(req.headers, target, false),
      },
      (upstreamRes) => {
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          if (value === undefined || HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
            continue;
          }
          res.setHeader(key, value);
        }

        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.statusMessage);
        pipeline(upstreamRes, res, () => resolve());
      }
    );

    upstreamReq.on("error", (err) => {
      if (!res.headersSent) {
        const body = JSON.stringify(
          proxyErrorPayload(
            `Upstream connection failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        res.writeHead(502, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        });
        res.end(body);
      } else {
        res.destroy(err);
      }
      resolve();
    });

    req.on("aborted", () => upstreamReq.destroy());
    res.on("close", () => upstreamReq.destroy());
    pipeline(req, upstreamReq, () => {});
  });
}

function proxyUpstreamUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
  const target = new URL(req.url || "/", config.upstreamUrl);
  const transport = target.protocol === "https:" ? https : http;

  const upstreamReq = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    method: req.method,
    path: `${target.pathname}${target.search}`,
    headers: cloneProxyHeaders(req.headers, target, true),
  });

  const closeSockets = () => {
    if (!socket.destroyed) {
      socket.destroy();
    }
  };

  upstreamReq.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/${upstreamRes.httpVersion} 101 ${upstreamRes.statusMessage || "Switching Protocols"}`];
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          lines.push(`${key}: ${entry}`);
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push("", "");
    socket.write(lines.join("\r\n"));

    if (head.length > 0) {
      upstreamSocket.write(head);
    }
    if (upstreamHead.length > 0) {
      socket.write(upstreamHead);
    }

    upstreamSocket.on("error", closeSockets);
    socket.on("error", () => upstreamSocket.destroy());
    socket.on("close", () => upstreamSocket.destroy());
    upstreamSocket.on("close", () => closeSockets());

    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  upstreamReq.on("response", (upstreamRes) => {
    const bodyChunks: Buffer[] = [];
    upstreamRes.on("data", (chunk) => {
      bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    upstreamRes.on("end", () => {
      const body = Buffer.concat(bodyChunks);
      const lines = [`HTTP/${upstreamRes.httpVersion} ${upstreamRes.statusCode || 502} ${upstreamRes.statusMessage || "Bad Gateway"}`];
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value === undefined || HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const entry of value) {
            lines.push(`${key}: ${entry}`);
          }
        } else {
          lines.push(`${key}: ${value}`);
        }
      }
      lines.push(`Content-Length: ${body.length}`, "Connection: close", "", "");
      socket.write(lines.join("\r\n"));
      if (body.length > 0) {
        socket.write(body);
      }
      closeSockets();
    });
  });

  upstreamReq.on("error", (err) => {
    writeUpgradeFailure(
      socket,
      502,
      "Bad Gateway",
      proxyErrorPayload(
        `Upstream connection failed: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  });

  upstreamReq.end();
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
    { status: 429, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
  );
}

async function handleForward(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const apiKey = extractApiKeyFromAuthHeader(
    typeof req.headers.authorization === "string" ? req.headers.authorization : undefined
  );
  if (!apiKey) {
    await writeNodeResponse(
      res,
      new Response(
        JSON.stringify({ error: { message: "Missing API key", type: "invalid_request_error" } }),
        { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      )
    );
    return;
  }

  const hash = hashApiKey(apiKey);
  let budget = getBudget(hash);

  if (!budget || !budget.enabled) {
    await writeNodeResponse(res, imitateCodexLimitResponse());
    return;
  }

  budget = autoAdvanceWeek(budget);
  const providerKey = providerKeyFromApiKey(apiKey);
  const spent = getWeeklyCost(providerKey, budget.week_start_date, budget.next_reset_date);

  if (spent >= budget.weekly_limit_usd) {
    await writeNodeResponse(res, imitateCodexLimitResponse(budget.next_reset_date));
    return;
  }

  await proxyUpstreamHttp(req, res);
}

const handleHttpRequest: NodeHandler = async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const path = getRoutePath(url);
  const method = req.method || "GET";

  if (path.startsWith("/api/")) {
    if (method === "OPTIONS" && isLocalApiRoute(path, "OPTIONS")) {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (!isLocalApiRoute(path, method)) {
      await proxyUpstreamHttp(req, res);
      return;
    }

    const webReq = createNodeRequest(req);

    if (path === "/api/auth/login" && method === "POST") {
      await writeNodeResponse(res, await handleLogin(webReq));
      return;
    }

    if (path === "/api/public/budgets" && method === "GET") {
      await writeNodeResponse(res, await handleListBudgets());
      return;
    }

    const authErr = await requireAdmin(webReq);
    if (authErr) {
      await writeNodeResponse(res, authErr);
      return;
    }

    if (path === "/api/budgets" && method === "GET") {
      await writeNodeResponse(res, await handleListBudgets());
      return;
    }
    if (path === "/api/budgets" && method === "POST") {
      await writeNodeResponse(res, await handleCreateBudget(webReq));
      return;
    }

    const budgetMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)$/);
    if (budgetMatch) {
      const hash = budgetMatch[1];
      if (method === "GET") {
        await writeNodeResponse(res, await handleGetBudget(hash));
        return;
      }
      if (method === "DELETE") {
        await writeNodeResponse(res, await handleDeleteBudget(hash));
        return;
      }
    }

    const resetMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/reset-date$/);
    if (resetMatch && method === "PUT") {
      await writeNodeResponse(res, await handleUpdateResetDate(resetMatch[1], webReq));
      return;
    }

    const limitMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/limit$/);
    if (limitMatch && method === "PUT") {
      await writeNodeResponse(res, await handleUpdateLimit(limitMatch[1], webReq));
      return;
    }

    const toggleMatch = path.match(/^\/api\/budgets\/([a-f0-9]+)\/enabled$/);
    if (toggleMatch && method === "PUT") {
      await writeNodeResponse(res, await handleToggleBudget(toggleMatch[1], webReq));
      return;
    }

    if (path === "/api/keys" && method === "GET") {
      await writeNodeResponse(res, await handleListApiKeys());
      return;
    }
  }

  if (path === "/health") {
    await writeNodeResponse(res, ok({ status: "ok", upstream: config.upstreamUrl }));
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
            `Unhandled proxy failure: ${error instanceof Error ? error.message : String(error)}`
          )
        ),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    );
  });
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const path = getRoutePath(url);
  const method = req.method || "GET";

  if (path.startsWith("/api/")) {
    if (!isLocalApiRoute(path, method)) {
      proxyUpstreamUpgrade(req, socket, head);
      return;
    }

    writeUpgradeFailure(
      socket,
      404,
      "Not Found",
      { error: { message: "Not found", type: "invalid_request_error" } }
    );
    return;
  }

  if (requiresBudgetPrecheck(path)) {
    const authHeader =
      typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
    const apiKey = extractApiKeyFromAuthHeader(authHeader);
    if (!apiKey) {
      writeUpgradeFailure(
        socket,
        401,
        "Unauthorized",
        { error: { message: "Missing API key", type: "invalid_request_error" } }
      );
      return;
    }

    const hash = hashApiKey(apiKey);
    let budget = getBudget(hash);

    if (!budget || !budget.enabled) {
      writeUpgradeFailure(
        socket,
        429,
        "Too Many Requests",
        {
          error: {
            type: "usage_limit_reached",
            message: "The usage limit has been reached",
          },
        }
      );
      return;
    }

    budget = autoAdvanceWeek(budget);
    const providerKey = providerKeyFromApiKey(apiKey);
    const spent = getWeeklyCost(providerKey, budget.week_start_date, budget.next_reset_date);

    if (spent >= budget.weekly_limit_usd) {
      writeUpgradeFailure(
        socket,
        429,
        "Too Many Requests",
        {
          error: {
            type: "usage_limit_reached",
            message: "The usage limit has been reached",
          },
        }
      );
      return;
    }
  }

  proxyUpstreamUpgrade(req, socket, head);
});

server.listen(config.port, "0.0.0.0", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`[ccs-limit] listening on :${port}`);
  console.log(`[ccs-limit] upstream: ${config.upstreamUrl}`);
  console.log(`[ccs-limit] budget db: ${config.budgetDbPath}`);
  console.log(`[ccs-limit] usage db: ${config.usageDbPath}`);
});
