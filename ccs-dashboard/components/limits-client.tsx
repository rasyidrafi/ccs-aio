"use client"

import { useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  Clock3,
  KeyRound,
  ShieldAlert,
  TimerReset,
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
import { formatDateTime, formatNumber } from "@/components/limits/limits-utils"
import type { LimitsPayload } from "@/lib/types"

export { LimitsPageSkeleton } from "@/components/limits/limits-loading"

export function LimitsClient({ limits }: { limits: LimitsPayload }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
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

  return (
    <ThemeProvider>
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
          <LimitsOverview
            limits={limits}
            loading={isPending}
            onRefresh={handleRefresh}
          />

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
                Status mix and latest snapshot.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
              <SummaryCard
                title="Latest snapshot"
                value={formatDateTime(limits.generatedAt)}
                detail="Last successful quota snapshot."
                icon={TimerReset}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Healthy"
                value={formatNumber(healthyCount)}
                detail="Accounts returning live quota normally."
                icon={Activity}
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
            <LimitsTable limits={limits} refreshing={isRefreshing} />
          </section>
        </div>
      </main>
    </ThemeProvider>
  )
}
