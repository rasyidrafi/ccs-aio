import {
  updateCliproxyAuthPriority,
  updateCliproxyRoutingStrategy,
} from "@/lib/limits-service"

const DEFAULT_CCS_LIMIT_URL = "http://127.0.0.1:8098"

type RoutingAction =
  | { action: "strategy"; strategy: "round-robin" | "fill-first" }
  | { action: "priority"; name: string; priority: number }

function getAdminToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? ""
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim() || null
    : null
}

async function validateAdminToken(token: string): Promise<Response | null> {
  const baseUrl =
    process.env.CCS_LIMIT_URL?.trim().replace(/\/$/, "") ||
    DEFAULT_CCS_LIMIT_URL

  try {
    const response = await fetch(`${baseUrl}/api/budgets/window`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (response.ok) return null
    if (response.status === 401) {
      return Response.json(
        { error: "Invalid or expired admin session" },
        { status: 401 }
      )
    }
    return Response.json(
      { error: "Unable to validate the admin session" },
      { status: 502 }
    )
  } catch {
    return Response.json(
      { error: "Unable to reach the admin authentication service" },
      { status: 502 }
    )
  }
}

function parseAction(value: unknown): RoutingAction | null {
  if (!value || typeof value !== "object") return null
  const body = value as Record<string, unknown>

  if (
    body.action === "strategy" &&
    (body.strategy === "round-robin" || body.strategy === "fill-first")
  ) {
    return { action: "strategy", strategy: body.strategy }
  }

  if (
    body.action === "priority" &&
    typeof body.name === "string" &&
    body.name.trim() &&
    typeof body.priority === "number" &&
    Number.isFinite(body.priority) &&
    Number.isInteger(body.priority)
  ) {
    return {
      action: "priority",
      name: body.name.trim(),
      priority: body.priority,
    }
  }

  return null
}

export async function PATCH(request: Request) {
  const token = getAdminToken(request)
  if (!token) {
    return Response.json(
      { error: "Missing admin authorization" },
      { status: 401 }
    )
  }

  const authError = await validateAdminToken(token)
  if (authError) return authError

  const action = parseAction(await request.json().catch(() => null))
  if (!action) {
    return Response.json({ error: "Invalid routing action" }, { status: 400 })
  }

  try {
    if (action.action === "strategy") {
      await updateCliproxyRoutingStrategy(action.strategy)
    } else {
      await updateCliproxyAuthPriority(action.name, action.priority)
    }
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Routing update failed",
      },
      { status: 502 }
    )
  }
}
