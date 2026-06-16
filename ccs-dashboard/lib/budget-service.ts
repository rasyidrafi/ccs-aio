import type { BudgetRow } from "@/lib/types"

type BudgetApiResponse = {
  ok?: boolean
  data?: BudgetRow[]
}

const DEFAULT_LIMITS_URL = "http://127.0.0.1:8098"
const BUDGETS_ENDPOINT = "/api/public/budgets"

function resolveBudgetServiceUrl(): string {
  return (
    process.env.CCS_LIMIT_URL?.trim().replace(/\/$/, "") || DEFAULT_LIMITS_URL
  )
}

export async function getPublicBudgetMap(): Promise<Map<string, BudgetRow>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)

  try {
    const response = await fetch(
      `${resolveBudgetServiceUrl()}${BUDGETS_ENDPOINT}`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      return new Map()
    }

    const body = (await response.json()) as BudgetApiResponse
    if (!body.ok || !Array.isArray(body.data)) {
      return new Map()
    }

    return new Map(
      body.data.map((budget) => [budget.api_key_hash.toLowerCase(), budget])
    )
  } catch {
    return new Map()
  } finally {
    clearTimeout(timer)
  }
}
