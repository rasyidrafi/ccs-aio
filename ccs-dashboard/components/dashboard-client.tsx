"use client"

import { startTransition, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  ChartColumnBig,
  Database,
  KeyRound,
  Wallet,
} from "lucide-react"

import { ThemeProvider } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { refreshDashboard } from "@/app/actions"
import {
  DashboardTrend,
  EmptyState,
  ModelMix,
  SummaryCard,
  TopKeys,
  UsageTable,
} from "@/components/dashboard/dashboard-panels"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import {
  DEFAULT_GRANULARITY,
  DEFAULT_PRESET,
  buildQuery,
  formatCalendarSelection,
  formatCost,
  formatNumber,
  formatTokenCount,
  getGranularityOptions,
  resolveSelectedRange,
} from "@/components/dashboard/dashboard-utils"
import type {
  DashboardPayload,
  DashboardQuery,
  DatePreset,
  TrendGranularityInput,
} from "@/lib/types"

export { DashboardPageSkeleton } from "@/components/dashboard/dashboard-loading"

export function DashboardClient({
  dashboard,
  query,
}: {
  dashboard: DashboardPayload
  query: DashboardQuery
}) {
  const router = useRouter()
  const [isPending, startUrlTransition] = useTransition()
  const [preset, setPresetState] = useState<DatePreset>(query.preset)
  const [from, setFromState] = useState(query.from ?? "")
  const [to, setToState] = useState(query.to ?? "")
  const [granularity, setGranularityState] = useState<TrendGranularityInput>(
    query.granularity ?? DEFAULT_GRANULARITY
  )

  const activeGranularity = useMemo(() => {
    const options = getGranularityOptions(preset)
    return options.some((option) => option.value === granularity)
      ? granularity
      : DEFAULT_GRANULARITY
  }, [granularity, preset])

  const selectedRange = useMemo(
    () => resolveSelectedRange(from, to),
    [from, to]
  )
  const isRefreshing = isPending

  function navigate(next: {
    preset?: DatePreset
    from?: string
    to?: string
    granularity?: TrendGranularityInput
  }) {
    const nextPreset = next.preset ?? preset
    const nextFrom = next.from ?? from
    const nextTo = next.to ?? to
    const nextGranularity = next.granularity ?? activeGranularity
    const href = `/?${buildQuery(nextPreset, nextFrom, nextTo, nextGranularity)}`

    startUrlTransition(() => {
      router.replace(href, { scroll: false })
    })
  }

  function setPreset(value: DatePreset) {
    setPresetState(value)
    navigate({ preset: value })
  }

  function setGranularity(value: TrendGranularityInput) {
    setGranularityState(value)
    navigate({ granularity: value })
  }

  function handleRefresh() {
    startUrlTransition(async () => {
      await refreshDashboard()
      router.refresh()
    })
  }

  return (
    <ThemeProvider>
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
          <DashboardOverview
            dashboard={dashboard}
            loading={isPending}
            preset={preset}
            setPreset={setPreset}
            granularity={activeGranularity}
            setGranularity={setGranularity}
            selectedRange={selectedRange}
            onRangeChange={(range) => {
              const nextFrom = formatCalendarSelection(range?.from)
              const nextTo = formatCalendarSelection(range?.to)
              startTransition(() => {
                const nextPreset = range?.from ? "custom" : DEFAULT_PRESET
                setFromState(nextFrom)
                setToState(nextTo)
                setPresetState(nextPreset)
                navigate({ preset: nextPreset, from: nextFrom, to: nextTo })
              })
            }}
            onRefresh={handleRefresh}
          />

          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Usage summary
                </h2>
                <p className="text-sm text-muted-foreground">
                  High-level totals for the currently selected range.
                </p>
              </div>
              {isRefreshing ? (
                <Badge variant="outline">Refreshing in place</Badge>
              ) : null}
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
              <SummaryCard
                title="Requests"
                value={formatNumber(dashboard.summary.totalRequests)}
                detail="Total request volume in the selected range."
                icon={ChartColumnBig}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Tokens"
                value={formatTokenCount(dashboard.summary.totalTokens)}
                detail="Input, output, and cache tokens combined."
                icon={Activity}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Estimated cost"
                value={formatCost(dashboard.summary.totalCost)}
                detail="Provider-aware spend estimate."
                icon={Wallet}
                refreshing={isRefreshing}
              />
              <SummaryCard
                title="Active keys"
                value={formatNumber(dashboard.summary.activeKeys)}
                detail="Keys that handled traffic in this window."
                icon={KeyRound}
                refreshing={isRefreshing}
              />
            </div>
          </section>

          {dashboard.trend.length > 0 ||
          dashboard.keys.length > 0 ||
          dashboard.models.length > 0 ? (
            <>
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
                {dashboard.trend.length > 0 ? (
                  <DashboardTrend
                    dashboard={dashboard}
                    refreshing={isRefreshing}
                  />
                ) : (
                  <EmptyState
                    title="No trend data"
                    description="No usage buckets were found for this range."
                    icon={ChartColumnBig}
                  />
                )}

                {dashboard.keys.length > 0 ? (
                  <TopKeys keys={dashboard.keys} refreshing={isRefreshing} />
                ) : (
                  <EmptyState
                    title="No key activity"
                    description="No keys handled traffic in this range."
                    icon={KeyRound}
                  />
                )}
              </div>

              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                {dashboard.keys.length > 0 ? (
                  <UsageTable keys={dashboard.keys} refreshing={isRefreshing} />
                ) : (
                  <EmptyState
                    title="No table rows"
                    description="There is no per-key usage to show for this filter."
                    icon={Database}
                  />
                )}

                {dashboard.models.length > 0 ? (
                  <ModelMix
                    models={dashboard.models}
                    refreshing={isRefreshing}
                  />
                ) : (
                  <EmptyState
                    title="No model mix"
                    description="No model usage was recorded for this filter."
                    icon={Wallet}
                  />
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>
    </ThemeProvider>
  )
}
