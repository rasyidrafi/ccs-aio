"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, AlertTriangle, Clock3, KeyRound, RefreshCw, ShieldAlert } from "lucide-react"

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

function LimitsPageSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/95">
        <CardHeader className="gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardHeader>
      </Card>
      <LoadingSummaryGrid />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card className={cn(TABLE_PANEL_HEIGHT, "border-border/70 bg-card/95")}>
          <CardHeader>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-36" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[460px] w-full" />
          </CardContent>
        </Card>
      </div>
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
    <Alert variant={getAlertVariant(alert.severity)} className="border-border/70">
      <AlertTriangle className="size-4" />
      <AlertTitle>{alert.title}</AlertTitle>
      <AlertDescription className="space-y-1">
        <div className="font-medium">{alert.accountLabel}</div>
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
    <Card className="relative border-border/70 bg-card/95">
      {refreshing ? <RefreshScrim /> : null}
      <CardHeader>
        <CardDescription>Priority board</CardDescription>
        <CardTitle>Use-before-reset alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {limits.alerts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No reset urgency right now.
          </div>
        ) : (
          limits.alerts.map((alert) => <LimitsAlertCard key={alert.id} alert={alert} />)
        )}
      </CardContent>
    </Card>
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
        <ScrollArea className="h-[520px] w-full rounded-md">
          <Table>
            <TableHeader className="bg-card/95">
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>5h</TableHead>
                <TableHead>Weekly</TableHead>
                <TableHead>Reset</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Failures</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {limits.accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-sm text-muted-foreground">
                    No Codex accounts were discovered.
                  </TableCell>
                </TableRow>
              ) : (
                limits.accounts.map((account) => (
                  <TableRow key={account.id} className="align-top">
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
                    <TableCell>{account.planType ?? "Unknown"}</TableCell>
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
                    <TableCell className="min-w-[120px] text-sm text-muted-foreground">
                      {account.weekly ? formatRelativeSeconds(account.weekly.resetAfterSeconds) : "Unknown"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(account.successCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(account.failureCount)}</TableCell>
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

                <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
                  <div className="space-y-4">
                    <AlertsPanel limits={limits} refreshing={isRefreshing} />
                    <Card className="relative border-border/70 bg-card/95">
                      {isRefreshing ? <RefreshScrim /> : null}
                      <CardHeader>
                        <CardDescription>Inventory</CardDescription>
                        <CardTitle>Status mix</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                          <div className="text-xs font-medium text-muted-foreground">Updated</div>
                          <div className="mt-2 text-sm font-medium">{formatDateTime(limits.generatedAt)}</div>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                          <div className="text-xs font-medium text-muted-foreground">Healthy</div>
                          <div className="mt-2 text-2xl font-semibold">{formatNumber(healthyCount)}</div>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                          <div className="text-xs font-medium text-muted-foreground">Expired</div>
                          <div className="mt-2 text-2xl font-semibold">{formatNumber(expiredCount)}</div>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                          <div className="text-xs font-medium text-muted-foreground">Errors</div>
                          <div className="mt-2 text-2xl font-semibold">{formatNumber(errorCount)}</div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <LimitsTable limits={limits} refreshing={isRefreshing} />
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
