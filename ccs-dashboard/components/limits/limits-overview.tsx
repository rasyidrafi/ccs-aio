"use client"

import { RefreshCw } from "lucide-react"

import { ConsoleTabs } from "@/components/console-tabs"
import { ThemeSelect } from "@/components/theme-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { LimitsPayload } from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatDateTime, formatNumber } from "@/components/limits/limits-utils"

export function LimitsOverview({
  limits,
  loading,
  onRefresh,
}: {
  limits: LimitsPayload | null
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">CCS limits</h1>
            {loading && limits ? (
              <Badge variant="outline" className="gap-2">
                <RefreshCw className="size-3.5 animate-spin" />
                Refreshing
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>Live Codex quota inspection</span>
            <span>
              {limits ? formatDateTime(limits.generatedAt) : "Loading"}
            </span>
            <span>
              {limits
                ? `${formatNumber(limits.accounts.length)} accounts`
                : "Discovering accounts"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,156px)_minmax(0,180px)] lg:flex lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-2 sm:col-span-2 lg:hidden">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
              Page
            </span>
            <ConsoleTabs className="flex-1" />
          </div>
          <div className="hidden lg:block">
            <ConsoleTabs />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">
              Theme
            </span>
            <ThemeSelect className="h-8 min-w-0 flex-1 sm:h-9 sm:flex-none" />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">
              Refresh
            </span>
            <Button
              variant="outline"
              className="h-8 min-w-0 flex-1 gap-2 sm:h-9 sm:w-full sm:flex-none"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={cn("size-4", loading ? "animate-spin" : "")}
              />
              {loading ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
