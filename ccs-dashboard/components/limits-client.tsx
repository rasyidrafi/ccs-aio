"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, AlertTriangle, Clock3, KeyRound, RefreshCw, ShieldAlert, TimerReset } from "lucide-react"

import { ConsoleTabs } from "@/components/console-tabs"
import { ThemeSelect } from "@/components/theme-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { LimitsAccountRow, LimitsAlert, LimitsPayload } from "@/lib/types"
import { cn } from "@/lib/utils"

const TABLE_PANEL_HEIGHT = "h-[640px]"

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function formatDateTime(value: string | null): string {
  if (!value) return "Never"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function formatRelativeSeconds(value: number | null): string {
  if (value === null) return "Unknown"
  if (value < 60) return `${value}s`

  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remHours = hours % 24
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

function formatPercent(value: number | null): string {
  if (value === null) return "N/A"
  return `${Math.round(value)}%`
}

function getAlertVariant(severity: LimitsAlert["severity"]): "default" | "destructive" {
  return severity === "urgent" ? "destructive" : "default"
}

function getStatusBadgeVariant(status: LimitsAccountRow["status"]): "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "secondary"
    case "expired":
      return "outline"
    default:
      return "destructive"
  }
}

function getStatusLabel(status: LimitsAccountRow["status"]): string {
  if (status === "active") return "Active"
  if (status === "expired") return "Expired"
  return "Error"
}

function getPlanBadgeVariant(planType: string | null): "secondary" | "outline" | "destructive" {
  const value = planType?.toLowerCase() ?? ""
  if (value === "plus") return "secondary"
  if (value === "free") return "destructive"
  if (value === "team") return "outline"
  return "outline"
}

function getPlanBadgeClassName(planType: string | null): string {
  const value = planType?.toLowerCase() ?? ""
  if (value === "plus") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
  if (value === "team") return "border-sky-500/40 bg-sky-500/15 text-sky-200"
  return ""
}

function formatPlanLabel(planType: string | null): string {
  if (!planType) return "Unknown"
  return planType.charAt(0).toUpperCase() + planType.slice(1)
}

function RefreshScrim({ label = "Refreshing data..." }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-end rounded-[inherit] bg-background/40 p-3 backdrop-blur-[1.5px]">
      <Badge variant="outline" className="gap-2 bg-card/90 px-3 py-1.5 shadow-sm">
        <RefreshCw className="size-3.5 animate-spin" />
        {label}
      </Badge>
    </div>
  )
}

function LoadingSummaryGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="border-border/70 bg-card/95">
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-28" />
          </CardHeader>
          <CardFooter className="border-t">
            <Skeleton className="h-4 w-full" />
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

function LoadingLimitsHeader() {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-40 sm:h-9 sm:w-48" />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,156px)_minmax(0,180px)] lg:flex lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-2 sm:col-span-2 lg:hidden">
            <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground">Page</div>
            <Skeleton className="h-8 min-w-0 flex-1" />
          </div>
          <div className="hidden lg:block">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-[142px]" />
              <Skeleton className="h-9 w-[102px]" />
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">Theme</div>
            <Skeleton className="h-8 min-w-0 flex-1 sm:h-9 sm:w-full lg:w-[196px]" />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">Refresh</div>
            <Skeleton className="h-8 min-w-0 flex-1 sm:h-9 sm:w-full lg:w-[116px]" />
          </div>
        </div>
      </div>
    </section>
  )
}

function LoadingLimitsAlerts() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border/70 bg-card/95 p-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full max-w-[420px]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LoadingInventorySection() {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <LoadingSummaryGrid />
    </section>
  )
}

function LoadingLimitsTable() {
  return (
    <div className="rounded-lg border border-border/70">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="grid min-w-[1260px] grid-cols-[44px_minmax(220px,1.5fr)_88px_92px_minmax(180px,1fr)_minmax(180px,1fr)_88px_88px_88px_110px] gap-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full max-w-full" />
          ))}
        </div>
      </div>
      <div>
        {Array.from({ length: 6 }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid min-w-[1260px] grid-cols-[44px_minmax(220px,1.5fr)_88px_92px_minmax(180px,1fr)_minmax(180px,1fr)_88px_88px_88px_110px] gap-4 border-b border-border/70 px-4 py-4 last:border-b-0"
          >
            <Skeleton className="h-4 w-6 justify-self-center" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-16" />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-14 justify-self-end" />
            <Skeleton className="h-4 w-10 justify-self-end" />
            <Skeleton className="h-4 w-10 justify-self-end" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

function LimitsPageSkeleton() {
  return (
    <div className="space-y-4">
      <LoadingLimitsHeader />
      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>
        <LoadingSummaryGrid />
      </section>
      <LoadingInventorySection />
      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <LoadingLimitsAlerts />
      </section>
      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Card className={cn(TABLE_PANEL_HEIGHT, "border-border/70 bg-card/95")}>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-32" />
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <LoadingLimitsTable />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  refreshing,
}: {
  title: string
  value: string
  detail: string
  icon: typeof Activity
  refreshing: boolean
}) {
  return (
    <Card className="relative border-border/70 bg-card/95 shadow-sm">
      {refreshing ? <RefreshScrim label="Updating" /> : null}
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-3xl tracking-tight">{value}</CardTitle>
          <div className="rounded-md border border-border/70 bg-muted/40 p-2 text-muted-foreground">
            <Icon className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardFooter className="border-t text-xs text-muted-foreground">{detail}</CardFooter>
    </Card>
  )
}

function LimitsOverview({
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
            <span>{limits ? formatDateTime(limits.generatedAt) : "Loading"}</span>
            <span>{limits ? `${formatNumber(limits.accounts.length)} accounts` : "Discovering accounts"}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,156px)_minmax(0,180px)] lg:flex lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-2 sm:col-span-2 lg:hidden">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">Page</span>
            <ConsoleTabs className="flex-1" />
          </div>
          <div className="hidden lg:block">
            <ConsoleTabs />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">Theme</span>
            <ThemeSelect className="h-8 min-w-0 flex-1 sm:h-9 sm:flex-none" />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">Refresh</span>
            <Button
              variant="outline"
              className="h-8 min-w-0 flex-1 gap-2 sm:h-9 sm:w-full sm:flex-none"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn("size-4", loading ? "animate-spin" : "")} />
              {loading ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function LimitsAlertCard({ alert }: { alert: LimitsAlert }) {
  return (
    <Alert variant={getAlertVariant(alert.severity)} className="border-border/70 bg-card/95">
      <AlertTriangle className="size-4" />
      <AlertTitle>{alert.accountLabel}</AlertTitle>
      <AlertDescription className="space-y-1">
        <div className="font-medium">{alert.title}</div>
        <div>{alert.message}</div>
      </AlertDescription>
    </Alert>
  )
}

function QuotaCell({ label, remaining, used, resetAfterSeconds }: {
  label: string
  remaining: number | null
  used: number | null
  resetAfterSeconds: number | null
}) {
  return (
    <div className="min-w-[180px] space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{formatPercent(remaining)}</span>
      </div>
      <Progress value={remaining ?? 0}>
        <ProgressLabel className="sr-only">{label}</ProgressLabel>
      </Progress>
      <div className="text-xs text-muted-foreground">
        {remaining === null || used === null ? "No live window" : `Used ${Math.round(used)}%, resets in ${formatRelativeSeconds(resetAfterSeconds)}`}
      </div>
    </div>
  )
}

function AlertsPanel({ limits, refreshing }: { limits: LimitsPayload; refreshing: boolean }) {
  return (
    <div className="relative">
      {refreshing ? <RefreshScrim /> : null}
      <div className="space-y-3">
        {limits.alerts.length === 0 ? (
          <Alert className="border-border/70 bg-card/95">
            <AlertTriangle className="size-4" />
            <AlertTitle>No reset urgency</AlertTitle>
            <AlertDescription>No reset urgency right now.</AlertDescription>
          </Alert>
        ) : (
          limits.alerts.map((alert) => <LimitsAlertCard key={alert.id} alert={alert} />)
        )}
      </div>
    </div>
  )
}

function LimitsTable({ limits, refreshing }: { limits: LimitsPayload; refreshing: boolean }) {
  return (
    <Card className={cn("relative overflow-hidden border-border/70 bg-card/95", TABLE_PANEL_HEIGHT)}>
      {refreshing ? <RefreshScrim /> : null}
      <CardHeader>
        <CardDescription>Registered accounts</CardDescription>
        <CardTitle>Quota runway</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full rounded-lg border border-border/70">
          <Table className="min-w-[1260px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 bg-card text-center">No</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Account</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Status</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Plan</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">5h</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Weekly</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card w-[88px] text-center">Reset</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card w-[88px] text-center">Success</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card w-[88px] text-center">Failures</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {limits.accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                    No Codex accounts were discovered.
                  </TableCell>
                </TableRow>
              ) : (
                limits.accounts.map((account, index) => (
                  <TableRow key={account.id} className="align-top">
                    <TableCell className="text-center font-mono text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="min-w-[220px]">
                      <div className="space-y-1">
                        <div className="font-medium">{account.displayName}</div>
                        <div className="text-xs text-muted-foreground">{account.email || account.sourceLabel}</div>
                        {account.error ? <div className="text-xs text-destructive">{account.error}</div> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(account.status)}>{getStatusLabel(account.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getPlanBadgeVariant(account.planType)}
                        className={getPlanBadgeClassName(account.planType)}
                      >
                        {formatPlanLabel(account.planType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <QuotaCell
                        label="5 hour"
                        remaining={account.fiveHour?.remainingPercent ?? null}
                        used={account.fiveHour?.usedPercent ?? null}
                        resetAfterSeconds={account.fiveHour?.resetAfterSeconds ?? null}
                      />
                    </TableCell>
                    <TableCell>
                      <QuotaCell
                        label="Weekly"
                        remaining={account.weekly?.remainingPercent ?? null}
                        used={account.weekly?.usedPercent ?? null}
                        resetAfterSeconds={account.weekly?.resetAfterSeconds ?? null}
                      />
                    </TableCell>
                    <TableCell className="w-[88px] text-center text-sm text-muted-foreground tabular-nums">
                      {account.weekly ? formatRelativeSeconds(account.weekly.resetAfterSeconds) : "Unknown"}
                    </TableCell>
                    <TableCell className="w-[88px] text-center tabular-nums">{formatNumber(account.successCount)}</TableCell>
                    <TableCell className="w-[88px] text-center tabular-nums">{formatNumber(account.failureCount)}</TableCell>
                    <TableCell className="min-w-[110px] text-sm text-muted-foreground">
                      {formatDateTime(account.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export function LimitsClient() {
  const [refreshToken, setRefreshToken] = useState(0)
  const [limits, setLimits] = useState<LimitsPayload | null>(null)
  const [limitsLoading, setLimitsLoading] = useState(true)
  const [limitsError, setLimitsError] = useState<string | null>(null)

  const isRefreshing = limitsLoading && limits !== null

  useEffect(() => {
    const controller = new AbortController()

    async function loadLimits() {
      setLimitsLoading(true)
      setLimitsError(null)

      try {
        const response = await fetch(`/api/limits?refresh=${refreshToken}`, {
          cache: "no-store",
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? `Limits request failed with status ${response.status}`)
        }

        const payload = (await response.json()) as LimitsPayload
        setLimits(payload)
      } catch (error) {
        if (controller.signal.aborted) return
        setLimitsError(error instanceof Error ? error.message : "Failed to load limits")
      } finally {
        if (!controller.signal.aborted) {
          setLimitsLoading(false)
        }
      }
    }

    void loadLimits()
    return () => controller.abort()
  }, [refreshToken])

  const healthyCount = useMemo(
    () => limits?.accounts.filter((account) => account.status === "active").length ?? 0,
    [limits]
  )
  const expiredCount = useMemo(
    () => limits?.accounts.filter((account) => account.status === "expired").length ?? 0,
    [limits]
  )
  const errorCount = useMemo(
    () => limits?.accounts.filter((account) => account.status === "error").length ?? 0,
    [limits]
  )

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
        {limitsLoading && !limits ? (
          <LimitsPageSkeleton />
        ) : (
          <>
            <LimitsOverview
              limits={limits}
              loading={limitsLoading}
              onRefresh={() => setRefreshToken((value) => value + 1)}
            />

            {limitsError ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>Limits request failed</AlertTitle>
                <AlertDescription>{limitsError}</AlertDescription>
              </Alert>
            ) : null}

            {limits ? (
              <>
                <section className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Limits summary</h2>
                      <p className="text-sm text-muted-foreground">
                        Live quota state for discovered Codex accounts.
                      </p>
                    </div>
                    {isRefreshing ? <Badge variant="outline">Refreshing in place</Badge> : null}
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
                    <h2 className="text-lg font-semibold tracking-tight">Inventory</h2>
                    <p className="text-sm text-muted-foreground">Status mix and latest snapshot.</p>
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
                    <h2 className="text-lg font-semibold tracking-tight">Priority board</h2>
                    <p className="text-sm text-muted-foreground">Accounts that should be used before their quota resets.</p>
                  </div>
                  <AlertsPanel limits={limits} refreshing={isRefreshing} />
                </section>

                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Registered accounts</h2>
                    <p className="text-sm text-muted-foreground">Quota runway across every discovered Codex account.</p>
                  </div>
                  <LimitsTable limits={limits} refreshing={isRefreshing} />
                </section>
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
