"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, AlertTriangle, DollarSign, KeyRound } from "lucide-react"

import { ThemeProvider } from "@/components/theme-provider"
import {
  BudgetsOverview,
  BudgetsLoginHeader,
} from "@/components/budgets/budgets-overview"
import {
  BudgetsTable,
  CreateBudgetForm,
  LoginForm,
  SummaryCard,
} from "@/components/budgets/budgets-sections"
import {
  CCS_LIMIT_URL,
  formatCurrency,
  formatNumber,
} from "@/components/budgets/budgets-utils"
import type { ApiKeyEntry, BudgetRow, BudgetWindow } from "@/lib/types"

export { BudgetsPageSkeleton } from "@/components/budgets/budgets-loading"

const BUDGET_AUTH_STORAGE_KEY = "ccs-dashboard:budgets-auth"
const FALLBACK_SESSION_TTL_MS = 24 * 60 * 60 * 1000

type StoredBudgetAuth = {
  token: string
  expiresAt: number
}

type ApiResponse<T> = {
  ok: boolean
  data?: T
  error?: string
}

function loadStoredBudgetAuth(): StoredBudgetAuth | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(BUDGET_AUTH_STORAGE_KEY)
    if (!raw) return null

    const stored = JSON.parse(raw) as Partial<StoredBudgetAuth>
    if (
      typeof stored.token !== "string" ||
      !stored.token ||
      typeof stored.expiresAt !== "number" ||
      stored.expiresAt <= Date.now()
    ) {
      window.localStorage.removeItem(BUDGET_AUTH_STORAGE_KEY)
      return null
    }

    return {
      token: stored.token,
      expiresAt: stored.expiresAt,
    }
  } catch {
    window.localStorage.removeItem(BUDGET_AUTH_STORAGE_KEY)
    return null
  }
}

function storeBudgetAuth(token: string, expiresInSeconds?: number) {
  if (typeof window === "undefined") return

  const ttlMs =
    typeof expiresInSeconds === "number" && expiresInSeconds > 0
      ? expiresInSeconds * 1000
      : FALLBACK_SESSION_TTL_MS

  window.localStorage.setItem(
    BUDGET_AUTH_STORAGE_KEY,
    JSON.stringify({
      token,
      expiresAt: Date.now() + ttlMs,
    } satisfies StoredBudgetAuth)
  )
}

function clearBudgetAuth() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(BUDGET_AUTH_STORAGE_KEY)
}

function getApiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error
    if (typeof error === "string" && error.trim()) return error
  }

  return fallback
}

export function BudgetsClient() {
  const [token, setToken] = useState<string | null>(
    () => loadStoredBudgetAuth()?.token ?? null
  )
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [budgetWindow, setBudgetWindow] = useState<BudgetWindow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  )

  const clearSession = useCallback(() => {
    clearBudgetAuth()
    setToken(null)
    setBudgets([])
    setApiKeys([])
    setBudgetWindow(null)
  }, [])

  const requestJson = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<ApiResponse<T>> => {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...headers,
          ...init?.headers,
        },
      })
      const data = (await response.json().catch(() => null)) as unknown

      if (response.status === 401) {
        clearSession()
        throw new Error("Session expired. Sign in again.")
      }
      if (!response.ok) {
        throw new Error(
          getApiError(data, `Request failed with HTTP ${response.status}`)
        )
      }

      const apiData = data as ApiResponse<T>
      if (!apiData?.ok) {
        throw new Error(getApiError(apiData, "Request failed"))
      }

      return apiData
    },
    [clearSession, headers]
  )

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [budgetsData, keysData, windowData] = await Promise.all([
        requestJson<BudgetRow[]>(`${CCS_LIMIT_URL}/api/budgets`),
        requestJson<ApiKeyEntry[]>(`${CCS_LIMIT_URL}/api/keys`),
        requestJson<BudgetWindow>(`${CCS_LIMIT_URL}/api/budgets/window`),
      ])
      setBudgets(budgetsData.data ?? [])
      setApiKeys(keysData.data ?? [])
      setBudgetWindow(windowData.data ?? null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch budget data"
      )
    } finally {
      setLoading(false)
    }
  }, [token, requestJson])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  async function handleLogin(username: string, password: string) {
    setLoginLoading(true)
    setLoginError(null)
    try {
      const resp = await fetch(`${CCS_LIMIT_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await resp.json()
      if (data.ok) {
        setToken(data.data.token)
        storeBudgetAuth(data.data.token, data.data.expiresIn)
      } else {
        setLoginError(data.error ?? "Login failed")
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Connection failed")
    } finally {
      setLoginLoading(false)
    }
  }

  function handleLogout() {
    clearSession()
  }

  function handleRefresh() {
    fetchData()
  }

  async function handleToggle(hash: string, enabled: boolean) {
    setError(null)
    try {
      await requestJson(`${CCS_LIMIT_URL}/api/budgets/${hash}/enabled`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      })
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update budget")
    }
  }

  async function handleDelete(hash: string) {
    setError(null)
    try {
      await requestJson(`${CCS_LIMIT_URL}/api/budgets/${hash}`, {
        method: "DELETE",
      })
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete budget")
    }
  }

  async function handleUpdateDateRange(
    weekStartDate: string,
    nextResetDate: string
  ) {
    setError(null)
    try {
      await requestJson(`${CCS_LIMIT_URL}/api/budgets/window`, {
        method: "PUT",
        body: JSON.stringify({ weekStartDate, nextResetDate }),
      })
      fetchData()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update budget window"
      )
    }
  }

  async function handleToggleBypass(enabled: boolean) {
    setError(null)
    try {
      await requestJson(`${CCS_LIMIT_URL}/api/budgets/bypass`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      })
      fetchData()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update bypass mode"
      )
    }
  }

  async function handleUpdateLimit(hash: string, limit: number) {
    setError(null)
    try {
      await requestJson(`${CCS_LIMIT_URL}/api/budgets/${hash}/limit`, {
        method: "PUT",
        body: JSON.stringify({ weeklyLimitUsd: limit }),
      })
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update limit")
    }
  }

  async function handleCreate(hash: string, limit: number) {
    setError(null)
    try {
      await requestJson(`${CCS_LIMIT_URL}/api/budgets`, {
        method: "POST",
        body: JSON.stringify({
          apiKeyHash: hash,
          weeklyLimitUsd: limit,
        }),
      })
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create budget")
    }
  }

  const totalBudget = useMemo(
    () => budgets.reduce((sum, b) => sum + b.weekly_limit_usd, 0),
    [budgets]
  )
  const totalSpent = useMemo(
    () => budgets.reduce((sum, b) => sum + b.spentUsd, 0),
    [budgets]
  )
  const overBudgetCount = useMemo(
    () =>
      budgetWindow?.bypass_limit_enabled
        ? 0
        : budgets.filter((b) => b.isOverBudget).length,
    [budgets, budgetWindow]
  )
  const activeCount = useMemo(
    () =>
      budgets.filter(
        (b) =>
          b.enabled && (budgetWindow?.bypass_limit_enabled || !b.isOverBudget)
      ).length,
    [budgets, budgetWindow]
  )

  if (!token) {
    return (
      <ThemeProvider>
        <main className="flex min-h-screen flex-col bg-background">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6 lg:py-8">
            <BudgetsLoginHeader />
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="w-full max-w-sm">
              <LoginForm
                onLogin={handleLogin}
                error={loginError}
                loading={loginLoading}
              />
            </div>
          </div>
        </main>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
          <BudgetsOverview
            budgetCount={budgets.length}
            loading={loading}
            onRefresh={handleRefresh}
            onLogout={handleLogout}
          />

          {error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Budget summary
              </h2>
              <p className="text-sm text-muted-foreground">
                Weekly spending overview across all configured API keys.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
              <SummaryCard
                title="Total budgets"
                value={formatNumber(budgets.length)}
                detail="API keys with budget limits."
                icon={KeyRound}
                refreshing={loading}
              />
              <SummaryCard
                title="Active"
                value={formatNumber(activeCount)}
                detail="Keys under their weekly limit."
                icon={Activity}
                refreshing={loading}
              />
              <SummaryCard
                title="Total spent"
                value={formatCurrency(totalSpent)}
                detail={`of ${formatCurrency(totalBudget)} total budget.`}
                icon={DollarSign}
                refreshing={loading}
              />
              <SummaryCard
                title="Exceeded"
                value={formatNumber(overBudgetCount)}
                detail="Keys that hit their weekly limit."
                icon={AlertTriangle}
                refreshing={loading}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Manage budgets
              </h2>
              <p className="text-sm text-muted-foreground">
                Create new budgets for API keys that don&apos;t have one yet.
              </p>
            </div>
            <CreateBudgetForm
              apiKeys={apiKeys}
              onCreate={handleCreate}
              loading={loading}
            />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                All budgets
              </h2>
              <p className="text-sm text-muted-foreground">
                Per-key weekly spending limits and reset schedule.
              </p>
            </div>
            <BudgetsTable
              budgets={budgets}
              budgetWindow={budgetWindow}
              refreshing={loading}
              onToggle={handleToggle}
              onToggleBypass={handleToggleBypass}
              onDelete={handleDelete}
              onUpdateBudgetWindow={handleUpdateDateRange}
              onUpdateLimit={handleUpdateLimit}
            />
          </section>
        </div>
      </main>
    </ThemeProvider>
  )
}
