"use client"

import { Fragment, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  LoaderCircle,
  RefreshCw,
  Save,
} from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
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
          ? "Not currently applied"
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
    used === null ? null : getWeeklyUsagePrediction(used, resetAfterSeconds)

  if (!prediction) {
    return (
      <div className="text-xs text-muted-foreground">
        Prediction unavailable
      </div>
    )
  }

  const hasDailySurplus = prediction.dailyBalancePercent >= 0

  return (
    <div className="text-xs tabular-nums">
      <div
        className={cn(
          "font-medium",
          hasDailySurplus
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-destructive"
        )}
      >
        {hasDailySurplus
          ? `${formatPredictionPercent(prediction.dailyBalancePercent)}% Surplus`
          : `${formatPredictionPercent(prediction.dailyBalancePercent)}% Over`}
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

function PriorityEditor({
  account,
  adminUnlocked,
  saving,
  onSave,
}: {
  account: LimitsAccountRow
  adminUnlocked: boolean
  saving: boolean
  onSave: (accountId: string, priority: number) => Promise<void>
}) {
  const [value, setValue] = useState(String(account.priority))

  if (!adminUnlocked) {
    return <span className="tabular-nums">{account.priority}</span>
  }

  const parsed = Number(value)
  const valid = Number.isInteger(parsed)
  const changed = valid && parsed !== account.priority

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Input
        type="number"
        step={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 w-20 text-center tabular-nums"
        aria-label={`Priority for ${account.displayName}`}
      />
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={!changed || saving}
        aria-label={`Save priority for ${account.displayName}`}
        title="Save priority"
        onClick={() => {
          if (!valid) return
          void onSave(account.id, parsed)
        }}
      >
        {saving ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Save className="size-3.5" />
        )}
      </Button>
    </div>
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
  routingStrategy,
  refreshing,
  adminUnlocked,
  savingRoutingStrategy,
  savingPriorityAccountId,
  redeemingAccountId,
  onRoutingStrategyChange,
  onPriorityChange,
  onRedeem,
}: {
  limits: LimitsPayload
  routingStrategy: LimitsPayload["routingStrategy"]
  refreshing: boolean
  adminUnlocked: boolean
  savingRoutingStrategy: boolean
  savingPriorityAccountId: string | null
  redeemingAccountId: string | null
  onRoutingStrategyChange: (strategy: LimitsPayload["routingStrategy"]) => void
  onPriorityChange: (accountId: string, priority: number) => Promise<void>
  onRedeem: (accountId: string) => void
}) {
  const [fillFirstSortBy, setFillFirstSortBy] = useState<
    "remaining" | "priority"
  >("priority")
  const sortBy =
    routingStrategy === "fill-first" ? fillFirstSortBy : "remaining"

  const sortedAccounts = useMemo(() => {
    return [...limits.accounts].sort((left, right) => {
      if (sortBy === "priority") {
        if (right.priority !== left.priority) {
          return right.priority - left.priority
        }
      } else {
        const weeklyDifference =
          (right.weekly?.remainingPercent ?? -1) -
          (left.weekly?.remainingPercent ?? -1)
        if (weeklyDifference !== 0) return weeklyDifference

        const fiveHourDifference =
          (right.fiveHour?.remainingPercent ?? -1) -
          (left.fiveHour?.remainingPercent ?? -1)
        if (fiveHourDifference !== 0) return fiveHourDifference
      }

      return left.displayName.localeCompare(right.displayName)
    })
  }, [limits.accounts, routingStrategy, sortBy])

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/70 bg-card/95",
        TABLE_PANEL_HEIGHT
      )}
    >
      {refreshing ? <RefreshScrim /> : null}
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardDescription>Registered accounts</CardDescription>
            <CardTitle>Quota runway</CardTitle>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <div className="flex min-w-48 flex-1 flex-col gap-2">
              <span className="text-sm font-medium">Routing strategy</span>
              {adminUnlocked ? (
                <Select
                  value={routingStrategy}
                  disabled={savingRoutingStrategy}
                  onValueChange={(value: string | null) => {
                    if (value === "round-robin" || value === "fill-first") {
                      setFillFirstSortBy("priority")
                      onRoutingStrategyChange(value)
                    }
                  }}
                >
                  <SelectTrigger>
                    <span className="truncate">
                      {savingRoutingStrategy
                        ? "Saving..."
                        : routingStrategy === "fill-first"
                          ? "Fill First"
                          : "Round Robin"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Routing strategy</SelectLabel>
                      <SelectItem value="round-robin">Round Robin</SelectItem>
                      <SelectItem value="fill-first">Fill First</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-9 items-center">
                  <Badge variant="outline">
                    {routingStrategy === "fill-first"
                      ? "Fill First"
                      : "Round Robin"}
                  </Badge>
                </div>
              )}
            </div>
            {routingStrategy === "fill-first" ? (
              <div className="flex min-w-52 flex-1 flex-col gap-2">
                <span className="text-sm font-medium">Order rows by</span>
                <Select
                  value={sortBy}
                  onValueChange={(value: string | null) => {
                    if (value === "remaining" || value === "priority") {
                      setFillFirstSortBy(value)
                    }
                  }}
                >
                  <SelectTrigger>
                    <span className="truncate">
                      {sortBy === "priority"
                        ? "Highest priority first"
                        : "Most remaining quota"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Ordering</SelectLabel>
                      <SelectItem value="remaining">
                        Most remaining quota
                      </SelectItem>
                      <SelectItem value="priority">
                        Highest priority first
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full rounded-lg border border-border/70">
          <Table className="min-w-[1760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 w-[144px] max-w-[144px] bg-card text-center">
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
                <TableHead className="sticky top-0 z-10 bg-card text-center">
                  Usage 14.29%/day
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[88px] bg-card text-center">
                  Reset
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[96px] bg-card text-center">
                  Unused Resets
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-[132px] bg-card text-center">
                  Priority
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
                    colSpan={14}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No Codex accounts were discovered.
                  </TableCell>
                </TableRow>
              ) : (
                sortedAccounts.map((account, index) => {
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
                        <TableCell className="w-[144px] max-w-[144px] text-center">
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
                          className="w-[132px] text-center"
                        >
                          <PriorityEditor
                            key={`${account.id}:${account.priority}`}
                            account={account}
                            adminUnlocked={adminUnlocked}
                            saving={savingPriorityAccountId === account.id}
                            onSave={onPriorityChange}
                          />
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
                          <TableCell className="w-[144px] max-w-[144px] text-center">
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
