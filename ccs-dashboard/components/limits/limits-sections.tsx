"use client"

import { Fragment } from "react"
import { Activity, AlertTriangle, RefreshCw } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  TABLE_PANEL_HEIGHT,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPlanLabel,
  formatRelativeSeconds,
  getAlertVariant,
  getPlanBadgeClassName,
  getPlanBadgeVariant,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/components/limits/limits-utils"

function RefreshScrim({ label = "Refreshing data..." }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-end rounded-[inherit] bg-background/40 p-3 backdrop-blur-[1.5px]">
      <Badge
        variant="outline"
        className="gap-2 bg-card/90 px-3 py-1.5 shadow-sm"
      >
        <RefreshCw className="size-3.5 animate-spin" />
        {label}
      </Badge>
    </div>
  )
}

export function SummaryCard({
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
      <CardFooter className="border-t text-xs text-muted-foreground">
        {detail}
      </CardFooter>
    </Card>
  )
}

function LimitsAlertCard({ alert }: { alert: LimitsAlert }) {
  return (
    <Alert
      variant={getAlertVariant(alert.severity)}
      className="border-border/70 bg-card/95"
    >
      <AlertTriangle className="size-4" />
      <AlertTitle>{alert.accountLabel}</AlertTitle>
      <AlertDescription className="space-y-1">
        <div className="font-medium">{alert.title}</div>
        <div>{alert.message}</div>
      </AlertDescription>
    </Alert>
  )
}

function QuotaCell({
  label,
  remaining,
  used,
  resetAfterSeconds,
}: {
  label: string
  remaining: number | null
  used: number | null
  resetAfterSeconds: number | null
}) {
  return (
    <div className="min-w-[180px] space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatPercent(remaining)}
        </span>
      </div>
      <Progress value={remaining ?? 0}>
        <ProgressLabel className="sr-only">{label}</ProgressLabel>
      </Progress>
      <div className="text-xs text-muted-foreground">
        {remaining === null || used === null
          ? "No live window"
          : `Used ${Math.round(used)}%, resets in ${formatRelativeSeconds(resetAfterSeconds)}`}
      </div>
    </div>
  )
}

function isProPlan(planType: string | null): boolean {
  const value = planType?.toLowerCase() ?? ""
  return value === "pro" || value === "prolite"
}

function getSparkPool(account: LimitsAccountRow) {
  return account.additionalPools.find(
    (pool) => pool.displayLabel === "Codex Spark"
  )
}

function shouldMergeResetCell(account: LimitsAccountRow): boolean {
  const sparkPool = getSparkPool(account)
  if (!sparkPool) return false

  return (
    (account.weekly?.resetAfterSeconds ?? null) ===
    (sparkPool.weekly?.resetAfterSeconds ?? null)
  )
}

function InlineNotePill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/80 px-1.5 py-0.5 font-mono text-[0.75em] leading-none text-foreground shadow-sm dark:border-border/50 dark:bg-muted/40">
      {children}
    </span>
  )
}

export function AlertsPanel({
  limits,
  refreshing,
}: {
  limits: LimitsPayload
  refreshing: boolean
}) {
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
          limits.alerts.map((alert) => (
            <LimitsAlertCard key={alert.id} alert={alert} />
          ))
        )}
      </div>
    </div>
  )
}

export function LimitsTable({
  limits,
  refreshing,
}: {
  limits: LimitsPayload
  refreshing: boolean
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/70 bg-card/95",
        TABLE_PANEL_HEIGHT
      )}
    >
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
                <TableHead className="sticky top-0 z-10 bg-card text-center">
                  No
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Account
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Status
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Plan
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">5h</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Weekly
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[88px] bg-card text-center">
                  Reset
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[88px] bg-card text-center">
                  Success
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[88px] bg-card text-center">
                  Failures
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Updated
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {limits.accounts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No Codex accounts were discovered.
                  </TableCell>
                </TableRow>
              ) : (
                limits.accounts.map((account, index) => {
                  const sparkPool = isProPlan(account.planType)
                    ? getSparkPool(account)
                    : undefined
                  const rowSpan = sparkPool ? 2 : 1
                  const mergeResetCell = sparkPool
                    ? shouldMergeResetCell(account)
                    : false

                  return (
                    <Fragment key={account.id}>
                      <TableRow className="align-top">
                        <TableCell
                          rowSpan={rowSpan}
                          className="text-center font-mono text-muted-foreground"
                        >
                          {index + 1}
                        </TableCell>
                        <TableCell rowSpan={rowSpan} className="min-w-[220px]">
                          <div className="space-y-1">
                            <div className="font-medium">{account.displayName}</div>
                            <div className="text-xs text-muted-foreground">
                              {account.email || account.sourceLabel}
                            </div>
                            {sparkPool ? (
                              <div className="text-xs text-muted-foreground">
                                use{" "}
                                <InlineNotePill>
                                  codex --model gpt-5.3-codex-spark
                                </InlineNotePill>
                                <br />
                                to use spark model
                              </div>
                            ) : null}
                            {account.error ? (
                              <div className="text-xs text-destructive">
                                {account.error}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell rowSpan={rowSpan}>
                          <Badge variant={getStatusBadgeVariant(account.status)}>
                            {getStatusLabel(account.status)}
                          </Badge>
                        </TableCell>
                        <TableCell rowSpan={rowSpan}>
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
                            resetAfterSeconds={
                              account.fiveHour?.resetAfterSeconds ?? null
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <QuotaCell
                            label="Weekly"
                            remaining={account.weekly?.remainingPercent ?? null}
                            used={account.weekly?.usedPercent ?? null}
                            resetAfterSeconds={
                              account.weekly?.resetAfterSeconds ?? null
                            }
                          />
                        </TableCell>
                        {mergeResetCell ? (
                          <TableCell
                            rowSpan={2}
                            className="w-[88px] text-center text-sm text-muted-foreground tabular-nums"
                          >
                            {account.weekly
                              ? formatRelativeSeconds(
                                  account.weekly.resetAfterSeconds
                                )
                              : "Unknown"}
                          </TableCell>
                        ) : (
                          <TableCell className="w-[88px] text-center text-sm text-muted-foreground tabular-nums">
                            {account.weekly
                              ? formatRelativeSeconds(
                                  account.weekly.resetAfterSeconds
                                )
                              : "Unknown"}
                          </TableCell>
                        )}
                        <TableCell rowSpan={rowSpan} className="w-[88px] text-center tabular-nums">
                          {formatNumber(account.successCount)}
                        </TableCell>
                        <TableCell rowSpan={rowSpan} className="w-[88px] text-center tabular-nums">
                          {formatNumber(account.failureCount)}
                        </TableCell>
                        <TableCell
                          rowSpan={rowSpan}
                          className="min-w-[110px] text-sm text-muted-foreground"
                        >
                          {formatDateTime(account.updatedAt)}
                        </TableCell>
                      </TableRow>
                      {sparkPool ? (
                        <TableRow className="align-top bg-muted/20">
                          <TableCell>
                            <QuotaCell
                              label="Codex Spark (5h)"
                              remaining={sparkPool.fiveHour?.remainingPercent ?? null}
                              used={sparkPool.fiveHour?.usedPercent ?? null}
                              resetAfterSeconds={
                                sparkPool.fiveHour?.resetAfterSeconds ?? null
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <QuotaCell
                              label="Codex Spark (weekly)"
                              remaining={sparkPool.weekly?.remainingPercent ?? null}
                              used={sparkPool.weekly?.usedPercent ?? null}
                              resetAfterSeconds={
                                sparkPool.weekly?.resetAfterSeconds ?? null
                              }
                            />
                          </TableCell>
                          {mergeResetCell ? null : (
                            <TableCell className="w-[88px] text-center text-sm text-muted-foreground tabular-nums">
                              {sparkPool.weekly
                                ? formatRelativeSeconds(
                                    sparkPool.weekly.resetAfterSeconds
                                  )
                                : "Unknown"}
                            </TableCell>
                          )}
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })
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
