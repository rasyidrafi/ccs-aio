"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  DollarSign,
  KeyRound,
  Wallet,
} from "lucide-react"

import { ThemeProvider } from "@/components/theme-provider"
import { BudgetsOverview, BudgetsLoginHeader } from "@/components/budgets/budgets-overview"
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
import type { ApiKeyEntry, BudgetRow } from "@/lib/types"

export { BudgetsPageSkeleton } from "@/components/budgets/budgets-loading"

export function BudgetsClient() {
  const [token, setToken] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  )

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [budgetsRes, keysRes] = await Promise.all([
        fetch(`${CCS_LIMIT_URL}/api/budgets`, { headers }),
        fetch(`${CCS_LIMIT_URL}/api/keys`, { headers }),
      ])
      if (budgetsRes.status === 401 || keysRes.status === 401) {
        setToken(null)
        return
      }
      const budgetsData = await budgetsRes.json()
      const keysData = await keysRes.json()
      if (budgetsData.ok) setBudgets(budgetsData.data)
      if (keysData.ok) setApiKeys(keysData.data)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch budget data"
      )
    } finally {
      setLoading(false)
    }
  }, [token, headers])

  useEffect(() => {
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
      } else {
        setLoginError(data.error ?? "Login failed")
      }
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : "Connection failed"
      )
    } finally {
      setLoginLoading(false)
    }
  }

  function handleLogout() {
    setToken(null)
    setBudgets([])
    setApiKeys([])
  }

  function handleRefresh() {
    fetchData()
  }

  async function handleToggle(hash: string, enabled: boolean) {
    try {
      await fetch(`${CCS_LIMIT_URL}/api/budgets/${hash}/enabled`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ enabled }),
      })
      fetchData()
    } catch {
      // ignore
    }
  }

  async function handleDelete(hash: string) {
    try {
      await fetch(`${CCS_LIMIT_URL}/api/budgets/${hash}`, {
        method: "DELETE",
        headers,
      })
      fetchData()
    } catch {
      // ignore
    }
  }

  async function handleUpdateResetDate(hash: string, date: string) {
    try {
      await fetch(`${CCS_LIMIT_URL}/api/budgets/${hash}/reset-date`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ nextResetDate: date }),
      })
      fetchData()
    } catch {
      // ignore
    }
  }

  async function handleCreate(
    hash: string,
    limit: number,
    resetDate: string
  ) {
    const today = new Date().toISOString().slice(0, 10)
    try {
      await fetch(`${CCS_LIMIT_URL}/api/budgets`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          apiKeyHash: hash,
          weeklyLimitUsd: limit,
          weekStartDate: today,
          nextResetDate: resetDate,
        }),
      })
      fetchData()
    } catch {
      // ignore
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
    () => budgets.filter((b) => b.isOverBudget).length,
    [budgets]
  )
  const activeCount = useMemo(
    () => budgets.filter((b) => b.enabled && !b.isOverBudget).length,
    [budgets]
  )

  if (!token) {
    return (
      <ThemeProvider>
        <main className="min-h-screen bg-background">
          <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
            <BudgetsLoginHeader />
            <LoginForm
              onLogin={handleLogin}
              error={loginError}
              loading={loginLoading}
            />
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
              refreshing={loading}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onUpdateResetDate={handleUpdateResetDate}
            />
          </section>
        </div>
      </main>
    </ThemeProvider>
  )
}
