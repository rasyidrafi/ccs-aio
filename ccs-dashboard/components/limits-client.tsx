"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  Clock3,
  KeyRound,
  ShieldAlert,
  PauseCircle,
} from "lucide-react"

import { ThemeProvider } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { refreshLimits as refreshLimitsTag } from "@/app/actions"
import { LimitsOverview } from "@/components/limits/limits-overview"
import {
  AlertsPanel,
  LimitsTable,
  SummaryCard,
} from "@/components/limits/limits-sections"
import { formatNumber } from "@/components/limits/limits-utils"
import { CCS_LIMIT_URL } from "@/components/budgets/budgets-utils"
import type { LimitsPayload } from "@/lib/types"

export { LimitsPageSkeleton } from "@/components/limits/limits-loading"

const LIMITS_AUTH_STORAGE_KEY = "ccs-dashboard:budgets-auth"
const FALLBACK_SESSION_TTL_MS = 24 * 60 * 60 * 1000

type StoredLimitsAuth = {
  token: string
  expiresAt: number
}

type ApiResponse<T> = {
  ok: boolean
  data?: T
  error?: string
}

function loadStoredLimitsAuth(): StoredLimitsAuth | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(LIMITS_AUTH_STORAGE_KEY)
    if (!raw) return null

    const stored = JSON.parse(raw) as Partial<StoredLimitsAuth>
    if (
      typeof stored.token !== "string" ||
      !stored.token ||
      typeof stored.expiresAt !== "number" ||
      stored.expiresAt <= Date.now()
    ) {
      window.localStorage.removeItem(LIMITS_AUTH_STORAGE_KEY)
      return null
    }

    return {
      token: stored.token,
      expiresAt: stored.expiresAt,
    }
  } catch {
    window.localStorage.removeItem(LIMITS_AUTH_STORAGE_KEY)
    return null
  }
}

function storeLimitsAuth(token: string, expiresInSeconds?: number) {
  if (typeof window === "undefined") return

  const ttlMs =
    typeof expiresInSeconds === "number" && expiresInSeconds > 0
      ? expiresInSeconds * 1000
      : FALLBACK_SESSION_TTL_MS

  window.localStorage.setItem(
    LIMITS_AUTH_STORAGE_KEY,
    JSON.stringify({
      token,
      expiresAt: Date.now() + ttlMs,
    } satisfies StoredLimitsAuth)
  )
}

function clearLimitsAuth() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(LIMITS_AUTH_STORAGE_KEY)
}

function getApiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error
    if (typeof error === "string" && error.trim()) return error
  }

  return fallback
}

export function LimitsClient({ limits }: { limits: LimitsPayload }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [adminToken, setAdminToken] = useState<string | null>(
    () => loadStoredLimitsAuth()?.token ?? null
  )
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [redeemingAccountId, setRedeemingAccountId] = useState<string | null>(
    null
  )
  const isRefreshing = isPending

  const healthyCount = useMemo(
    () =>
      limits.accounts.filter((account) => account.status === "active").length,
    [limits]
  )
  const expiredCount = useMemo(
    () =>
      limits.accounts.filter((account) => account.status === "expired").length,
    [limits]
  )
  const pausedCount = useMemo(
    () =>
      limits.accounts.filter((account) => account.status === "paused").length,
    [limits]
  )
  const errorCount = useMemo(
    () =>
      limits.accounts.filter((account) => account.status === "error").length,
    [limits]
  )

  function handleRefresh() {
    startTransition(async () => {
      await refreshLimitsTag()
      router.refresh()
    })
  }

  const clearSession = useCallback(() => {
    clearLimitsAuth()
    setAdminToken(null)
  }, [])

  async function handleLogin(username: string, password: string) {
    setLoginLoading(true)
    setLoginError(null)
    try {
      const resp = await fetch(`${CCS_LIMIT_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = (await resp.json().catch(() => null)) as unknown
      if (!resp.ok) {
        setLoginError(getApiError(data, `Login failed with HTTP ${resp.status}`))
        return
      }

      const apiData = data as ApiResponse<{ token: string; expiresIn?: number }>
      if (apiData.ok && apiData.data?.token) {
        setAdminToken(apiData.data.token)
        storeLimitsAuth(apiData.data.token, apiData.data.expiresIn)
      } else {
        setLoginError(getApiError(apiData, "Login failed"))
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

  async function handleRedeem(accountId: string) {
    if (!adminToken) return
    setActionError(null)
    setRedeemingAccountId(accountId)
    try {
      const response = await fetch(
        `${CCS_LIMIT_URL}/api/codex-resets/${encodeURIComponent(
          accountId
        )}/redeem`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
        }
      )
      const data = (await response.json().catch(() => null)) as unknown

      if (response.status === 401) {
        clearSession()
        throw new Error("Session expired. Unlock admin mode again.")
      }
      if (!response.ok) {
        throw new Error(
          getApiError(data, `Redeem failed with HTTP ${response.status}`)
        )
      }

      const apiData = data as ApiResponse<unknown>
      if (!apiData.ok) {
        throw new Error(getApiError(apiData, "Redeem failed"))
      }

      handleRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Redeem failed")
    } finally {
      setRedeemingAccountId(null)
    }
  }

  return (
    <ThemeProvider>
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
          <LimitsOverview
            limits={limits}
            loading={isPending}
            onRefresh={handleRefresh}
            adminUnlocked={Boolean(adminToken)}
            loginError={loginError}
            loginLoading={loginLoading}
            onAdminLogin={handleLogin}
            onAdminLogout={handleLogout}
          />

          {actionError ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {actionError}
            </div>
          ) : null}

          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Limits summary
                </h2>
                <p className="text-sm text-muted-foreground">
                  Live quota state for discovered Codex accounts.
                </p>
              </div>
              {isRefreshing ? (
                <Badge variant="outline">Refreshing in place</Badge>
              ) : null}
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
              <SummaryCard
                title="Registered accounts"
                value={formatNumber(limits.summary.totalAccounts)}
                detail="Every discovered Codex auth file."
                icon={KeyRound}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Active sessions"
                value={formatNumber(limits.summary.activeAccounts)}
                detail="Accounts currently returning live quota."
                icon={Activity}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Reset soon"
                value={formatNumber(limits.summary.resetSoonCount)}
                detail="Accounts worth using before weekly reset."
                icon={Clock3}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Weekly exhausted"
                value={formatNumber(limits.summary.exhaustedWeeklyCount)}
                detail="Accounts with no weekly headroom left."
                icon={ShieldAlert}
                refreshing={isRefreshing}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Inventory
              </h2>
              <p className="text-sm text-muted-foreground">
                Status mix across discovered Codex accounts.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
              <SummaryCard
                title="Healthy"
                value={formatNumber(healthyCount)}
                detail="Accounts returning live quota normally."
                icon={Activity}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Paused"
                value={formatNumber(pausedCount)}
                detail="Accounts paused in CCS but still showing quota."
                icon={PauseCircle}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Expired"
                value={formatNumber(expiredCount)}
                detail="Accounts with expired or inactive quota state."
                icon={Clock3}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Errors"
                value={formatNumber(errorCount)}
                detail="Accounts failing quota inspection."
                icon={ShieldAlert}
                refreshing={isRefreshing}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Priority board
              </h2>
              <p className="text-sm text-muted-foreground">
                Accounts that should be used before their quota resets.
              </p>
            </div>
            <AlertsPanel limits={limits} refreshing={isRefreshing} />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Registered accounts
              </h2>
              <p className="text-sm text-muted-foreground">
                Quota runway across every discovered Codex account.
              </p>
            </div>
            <LimitsTable
              limits={limits}
              refreshing={isRefreshing}
              adminUnlocked={Boolean(adminToken)}
              redeemingAccountId={redeemingAccountId}
              onRedeem={handleRedeem}
            />
          </section>
        </div>
      </main>
    </ThemeProvider>
  )
}
