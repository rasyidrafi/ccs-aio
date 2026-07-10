"use client"

import { Fragment } from "react"
import { Activity, AlertTriangle, RefreshCw } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
  formatPredictionPercent,
  formatPlanLabel,
  formatRelativeSeconds,
  getAlertVariant,
  getPlanBadgeClassName,
  getPlanBadgeVariant,
  getStatusBadgeVariant,
  getStatusLabel,
  getWeeklyUsagePrediction,
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

function UsagePredictionCell({
  used,
  resetAfterSeconds,
}: {
  used: number | null
  resetAfterSeconds: number | null
}) {
  const prediction =
    used === null
      ? null
      : getWeeklyUsagePrediction(used, resetAfterSeconds)

  if (!prediction) {
    return (
      <div className="min-w-[190px] text-xs text-muted-foreground">
        Prediction unavailable
      </div>
    )
  }

  const isExhausted = prediction.remainingPercent <= 0
  const isOverPace = prediction.paceBalancePercent < -0.005
  const isUnderPace = prediction.paceBalancePercent > 0.005
  const horizonLabel =
    prediction.recommendationHorizonSeconds < 86_400
      ? `until reset (${formatRelativeSeconds(prediction.recommendationHorizonSeconds)})`
      : "next 24h"

  return (
    <div className="min-w-[190px] space-y-1 text-xs tabular-nums">
      <div
        className={cn(
          "font-medium",
          isExhausted ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
        )}
      >
        {formatPredictionPercent(prediction.remainingPercent)}% remaining usage
      </div>
      <div
        className={cn(
          "font-medium",
          isOverPace
            ? "text-destructive"
            : isUnderPace
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground"
        )}
      >
        {isOverPace
          ? `-${formatPredictionPercent(prediction.paceBalancePercent)}% over pace`
          : isUnderPace
            ? `+${formatPredictionPercent(prediction.paceBalancePercent)}% usage buffer`
            : "On pace"}
      </div>
      <div className="text-muted-foreground">
        {isOverPace
          ? prediction.recoveryPercent !== null &&
            prediction.recoveryPercent > 0.005
            ? `Use \u2264${formatPredictionPercent(prediction.recoveryPercent)}% ${horizonLabel} to recover`
            : `Pause for ${formatRelativeSeconds(prediction.recoverySeconds)} to recover`
          : `Recommended \u2264${formatPredictionPercent(prediction.recommendedDailyPercent)}%/day until reset`}
      </div>
    </div>
  )
}

function isProPlan(planType: string | null): boolean {
  const value = planType?.toLowerCase() ?? ""
  return value === "pro" || value === "prolite"
}

const PRO_PLUS_ORBIT_TURNS = [-48, -24, 0, 24, 48, 72, 96, 120, 144]

const PRO_PLUS_ORBIT_FRONT_PATH = PRO_PLUS_ORBIT_TURNS.map(
  (start) => `M ${start} 3 C ${start + 4} 3 ${start + 8} 37 ${start + 12} 37`
).join(" ")

const PRO_PLUS_ORBIT_BACK_PATH = PRO_PLUS_ORBIT_TURNS.map(
  (start) =>
    `M ${start + 12} 37 C ${start + 16} 37 ${start + 20} 3 ${start + 24} 3`
).join(" ")

function ProPlusOrbit({ layer }: { layer: "back" | "front" }) {
  const path =
    layer === "front" ? PRO_PLUS_ORBIT_FRONT_PATH : PRO_PLUS_ORBIT_BACK_PATH

  return (
    <span
      className={cn("plan-chip-orbit-layer", `plan-chip-orbit-layer-${layer}`)}
      aria-hidden="true"
    >
      <svg viewBox="0 0 90 40" focusable="false">
        <g className="plan-chip-orbit-motion">
          <path className="plan-chip-orbit-edge" d={path} />
          <path className="plan-chip-orbit-core" d={path} />
          {layer === "front" ? (
            <path className="plan-chip-orbit-hot" d={path} />
          ) : null}
        </g>
      </svg>
    </span>
  )
}

function PlanBadge({ planType }: { planType: string | null }) {
  const isProPlus = planType?.toLowerCase() === "pro"
  const label = formatPlanLabel(planType)

  return (
    <Badge
      variant={getPlanBadgeVariant(planType)}
      className={cn(
        getPlanBadgeClassName(planType),
        isProPlus &&
          "!h-6 !min-w-[3.65rem] !overflow-visible !border-0 !bg-transparent !p-0 !shadow-none"
      )}
    >
      {isProPlus ? (
        <>
          <ProPlusOrbit layer="back" />
          <span className="plan-chip-capsule" aria-hidden="true" />
          <ProPlusOrbit layer="front" />
          <span className="plan-chip-label">{label}</span>
        </>
      ) : (
        label
      )}
    </Badge>
  )
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

function getRedeemDisabledReason(
  account: LimitsAccountRow,
  adminUnlocked: boolean
): string | null {
  if (!adminUnlocked) return "Unlock Admin Actions to redeem reset credits."
  if (account.status !== "active") return "Only active accounts can redeem."
  if (account.unusedResets === null) return "Unused reset count is unknown."
  if (account.unusedResets < 1) return "No unused reset credits available."
  if (!account.weekly) return "Weekly limit state is unavailable."
  if (account.weekly.remainingPercent > 0) {
    return "Weekly limit must be 0% remaining before redeeming."
  }
  return null
}

function RedeemAction({
  account,
  adminUnlocked,
  redeeming,
  onRedeem,
}: {
  account: LimitsAccountRow
  adminUnlocked: boolean
  redeeming: boolean
  onRedeem: (accountId: string) => void
}) {
  const disabledReason = getRedeemDisabledReason(account, adminUnlocked)
  const disabled = Boolean(disabledReason) || redeeming
  const tooltip = redeeming
    ? "Redeeming reset credit..."
    : (disabledReason ?? "Redeem one Codex reset credit for this account.")

  return (
    <span
      className="inline-flex"
      title={tooltip}
      tabIndex={disabled ? 0 : undefined}
    >
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            disabled={disabled}
            className="min-w-20"
          >
            {redeeming ? "Redeeming" : "Redeem"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redeem reset credit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will consume 1 Codex reset credit for {account.displayName}.
              Continue only if this account&apos;s weekly limit is exhausted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onRedeem(account.id)}>
              Redeem
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
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
  adminUnlocked,
  redeemingAccountId,
  onRedeem,
}: {
  limits: LimitsPayload
  refreshing: boolean
  adminUnlocked: boolean
  redeemingAccountId: string | null
  onRedeem: (accountId: string) => void
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
          <Table className="min-w-[1640px]">
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
                <TableHead className="sticky top-0 z-10 bg-card">
                  Usage Prediction
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[88px] bg-card text-center">
                  Reset
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[96px] bg-card text-center">
                  Unused Resets
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[96px] bg-card text-center">
                  Action
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
                    colSpan={13}
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
                            <div className="font-medium">
                              {account.displayName}
                            </div>
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
                          <Badge
                            variant={getStatusBadgeVariant(account.status)}
                          >
                            {getStatusLabel(account.status)}
                          </Badge>
                        </TableCell>
                        <TableCell rowSpan={rowSpan}>
                          <PlanBadge planType={account.planType} />
                        </TableCell>
                        <TableCell>
                          <QuotaCell
                            label="5 hour"
                            remaining={
                              account.fiveHour?.remainingPercent ?? null
                            }
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
                        <TableCell>
                          <UsagePredictionCell
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
                        <TableCell
                          rowSpan={rowSpan}
                          className="w-[96px] text-center tabular-nums"
                        >
                          {account.unusedResets === null
                            ? "Unknown"
                            : formatNumber(account.unusedResets)}
                        </TableCell>
                        <TableCell
                          rowSpan={rowSpan}
                          className="w-[96px] text-center"
                        >
                          <RedeemAction
                            account={account}
                            adminUnlocked={adminUnlocked}
                            redeeming={redeemingAccountId === account.id}
                            onRedeem={onRedeem}
                          />
                        </TableCell>
                        <TableCell
                          rowSpan={rowSpan}
                          className="w-[88px] text-center tabular-nums"
                        >
                          {formatNumber(account.successCount)}
                        </TableCell>
                        <TableCell
                          rowSpan={rowSpan}
                          className="w-[88px] text-center tabular-nums"
                        >
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
                        <TableRow className="bg-muted/20 align-top">
                          <TableCell>
                            <QuotaCell
                              label="Codex Spark (5h)"
                              remaining={
                                sparkPool.fiveHour?.remainingPercent ?? null
                              }
                              used={sparkPool.fiveHour?.usedPercent ?? null}
                              resetAfterSeconds={
                                sparkPool.fiveHour?.resetAfterSeconds ?? null
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <QuotaCell
                              label="Codex Spark (weekly)"
                              remaining={
                                sparkPool.weekly?.remainingPercent ?? null
                              }
                              used={sparkPool.weekly?.usedPercent ?? null}
                              resetAfterSeconds={
                                sparkPool.weekly?.resetAfterSeconds ?? null
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <UsagePredictionCell
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
