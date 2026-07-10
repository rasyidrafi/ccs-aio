"use client"

import { useMemo, useState } from "react"
import { Activity, RefreshCw } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
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
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type {
  DashboardKeyRow,
  DashboardModelRow,
  DashboardPayload,
} from "@/lib/types"
import {
  KEY_COLORS,
  TABLE_PANEL_HEIGHT,
  TALL_PANEL_HEIGHT,
  formatCost,
  formatDateTime,
  formatNumber,
  formatStateLabel,
  formatTokenCount,
  getOptionLabel,
  getStateBadgeVariant,
} from "@/components/dashboard/dashboard-utils"
import {
  formatBudgetUsageSince,
  formatCurrency,
  formatDate,
  formatPercent,
} from "@/components/budgets/budgets-utils"

function formatBudgetResetIn(daysUntilReset: number): string {
  return daysUntilReset === 0 ? "Today" : `${daysUntilReset}d`
}

function UnlimitedMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "unlimited-shine inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold tabular-nums",
        compact ? "text-[11px]" : "text-sm"
      )}
    >
      <span className="font-mono">∞</span>
      <span>Unlimited</span>
    </span>
  )
}

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

export function DashboardTrend({
  dashboard,
  refreshing,
}: {
  dashboard: DashboardPayload
  refreshing: boolean
}) {
  const chartData = dashboard.trend.map((point) => ({
    label: point.label,
    requests: point.requests,
    cost: Number(point.cost.toFixed(2)),
  }))

  const chartConfig = {
    requests: { label: "Requests", color: "var(--chart-1)" },
    cost: { label: "Cost", color: "var(--chart-2)" },
  } satisfies ChartConfig

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/70 bg-card/95",
        TALL_PANEL_HEIGHT
      )}
    >
      {refreshing ? <RefreshScrim /> : null}
      <CardHeader>
        <CardDescription>Trend</CardDescription>
        <CardTitle>Requests and spend</CardTitle>
        <CardAction>
          <Badge variant="outline">{dashboard.range.label}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <AreaChart
            data={chartData}
            margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-requests)"
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-requests)"
                  stopOpacity={0.06}
                />
              </linearGradient>
              <linearGradient id="fillCost" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-cost)"
                  stopOpacity={0.28}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-cost)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span>{name === "cost" ? "Cost" : "Requests"}</span>
                      <span className="font-mono">
                        {name === "cost"
                          ? formatCost(Number(value ?? 0))
                          : formatNumber(Number(value ?? 0))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="requests"
              stroke="var(--color-requests)"
              fill="url(#fillRequests)"
              strokeWidth={2}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="cost"
              stroke="var(--color-cost)"
              fill="url(#fillCost)"
              strokeWidth={2}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function TopKeys({
  keys,
  refreshing,
}: {
  keys: DashboardKeyRow[]
  refreshing: boolean
}) {
  const rows = keys.slice(0, 5).map((row, index) => ({
    name: row.displayName,
    cost: Number(row.cost.toFixed(2)),
    requests: row.requests,
    fill: KEY_COLORS[index % KEY_COLORS.length],
  }))

  const chartConfig = {
    cost: { label: "Cost", color: "var(--chart-1)" },
  } satisfies ChartConfig

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/70 bg-card/95",
        TALL_PANEL_HEIGHT
      )}
    >
      {refreshing ? <RefreshScrim /> : null}
      <CardHeader>
        <CardDescription>Concentration</CardDescription>
        <CardTitle>Top keys by cost</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ left: 4, right: 4 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              width={90}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span>Cost</span>
                      <span className="font-mono">
                        {formatCost(Number(value ?? 0))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="cost" radius={10}>
              {rows.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>

        <ScrollArea className="min-h-0 flex-1 rounded-lg">
          <div className="space-y-2 pr-3">
            {rows.map((row) => (
              <div
                key={row.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(row.requests)} requests
                  </div>
                </div>
                <div className="text-sm font-medium">
                  {formatCost(row.cost)}
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export function ModelMix({
  models,
  refreshing,
}: {
  models: DashboardModelRow[]
  refreshing: boolean
}) {
  const totalCost = models.reduce((sum, row) => sum + row.cost, 0)
  const rows = models.slice(0, 5).map((row, index) => ({
    model: row.model,
    cost: row.cost,
    tokens: row.tokens,
    share: totalCost > 0 ? Math.round((row.cost / totalCost) * 100) : 0,
    fill: KEY_COLORS[index % KEY_COLORS.length],
  }))

  const chartConfig = {
    cost: { label: "Cost", color: "var(--chart-2)" },
  } satisfies ChartConfig

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/70 bg-card/95",
        TABLE_PANEL_HEIGHT
      )}
    >
      {refreshing ? <RefreshScrim /> : null}
      <CardHeader>
        <CardDescription>Model mix</CardDescription>
        <CardTitle>Spend allocation</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span>{String(name)}</span>
                      <span className="font-mono">
                        {formatCost(Number(value ?? 0))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={rows}
              dataKey="cost"
              nameKey="model"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={3}
            >
              {rows.map((entry) => (
                <Cell key={entry.model} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <ScrollArea className="min-h-0 flex-1 rounded-lg">
          <div className="space-y-2 pr-3">
            {rows.map((row) => (
              <div
                key={row.model}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {row.model}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTokenCount(row.tokens)} tokens
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    {formatCost(row.cost)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.share}%
                  </div>
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export function UsageTable({
  keys,
  refreshing,
}: {
  keys: DashboardKeyRow[]
  refreshing: boolean
}) {
  const [sortBy, setSortBy] = useState<"cost" | "lastActive">("cost")
  const sortOptions = [
    { value: "cost", label: "Highest cost first" },
    { value: "lastActive", label: "Most recently active" },
  ] as const

  const sortedKeys = useMemo(() => {
    return [...keys].sort((left, right) => {
      if (sortBy === "lastActive") {
        const leftTime = left.lastUsed ? new Date(left.lastUsed).getTime() : 0
        const rightTime = right.lastUsed
          ? new Date(right.lastUsed).getTime()
          : 0
        return rightTime - leftTime
      }

      return right.cost - left.cost
    })
  }, [keys, sortBy])

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
            <CardDescription>Per-key detail</CardDescription>
            <CardTitle>Usage table</CardTitle>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <span className="text-sm font-medium">Order rows by</span>
            <Select
              value={sortBy}
              onValueChange={(value: string | null) => {
                if (!value) return
                setSortBy(value as "cost" | "lastActive")
              }}
            >
              <SelectTrigger className="min-w-44">
                <span className="truncate">
                  {getOptionLabel([...sortOptions], sortBy)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Ordering</SelectLabel>
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full rounded-lg border border-border/70">
          <Table className="min-w-[1580px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 bg-card text-center">
                  No
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Key</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Provider
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-right">
                  Requests
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-right">
                  Tokens
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-right">
                  Cost
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Models
                </TableHead>
                <TableHead className="sticky top-0 z-10 min-w-[220px] bg-card">
                  Weekly Usage
                </TableHead>
                <TableHead className="sticky top-0 z-10 min-w-[180px] bg-card">
                  Weekly Period
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Reset In
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Last used
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  State
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedKeys.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="text-center font-mono text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{row.displayName}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {row.maskedKey}
                    </div>
                  </TableCell>
                  <TableCell>{row.providerLabel}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.requests)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokenCount(row.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCost(row.cost)}
                  </TableCell>
                  <TableCell className="max-w-[240px] whitespace-normal text-muted-foreground">
                    {row.modelsUsed.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    {row.budget ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-muted-foreground">
                            {row.budget.bypassLimitEnabled
                              ? formatBudgetUsageSince(row.budget)
                              : `${formatCurrency(
                                  row.budget.spentUsd
                                )} / ${formatCurrency(
                                  row.budget.weekly_limit_usd
                                )}`}
                          </span>
                          {row.budget.bypassLimitEnabled ? (
                            <UnlimitedMark compact />
                          ) : (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatPercent(row.budget.percentUsed)}
                            </span>
                          )}
                        </div>
                        <Progress
                          value={
                            row.budget.bypassLimitEnabled
                              ? 100
                              : Math.min(row.budget.percentUsed, 100)
                          }
                          className={
                            row.budget.bypassLimitEnabled
                              ? "unlimited-progress"
                              : undefined
                          }
                        >
                          <ProgressLabel className="sr-only">
                            Weekly budget usage
                          </ProgressLabel>
                        </Progress>
                        <div className="text-xs text-muted-foreground">
                          {row.budget.bypassLimitEnabled
                            ? "Unlimited Usage"
                            : `${formatCurrency(row.budget.remainingUsd)} remaining`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[180px] text-sm text-muted-foreground">
                    {row.budget ? (
                      row.budget.bypassLimitEnabled ? (
                        <>
                          Since {formatDate(row.budget.usageStartDate)} &rarr;{" "}
                          Today
                        </>
                      ) : (
                        <>
                          {formatDate(row.budget.week_start_date)} &rarr;{" "}
                          {formatDate(row.budget.next_reset_date)}
                        </>
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {row.budget
                      ? row.budget.bypassLimitEnabled
                        ? "Unlimited"
                        : formatBudgetResetIn(row.budget.daysUntilReset)
                      : "—"}
                  </TableCell>
                  <TableCell>{formatDateTime(row.lastUsed)}</TableCell>
                  <TableCell>
                    <Badge variant={getStateBadgeVariant(row.sourceState)}>
                      {formatStateLabel(row.sourceState)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: typeof Activity
}) {
  return (
    <Card className="border-dashed border-border/70 bg-card/90">
      <CardContent className="flex h-full min-h-56 flex-col items-center justify-center gap-3 text-center">
        <div className="rounded-full border border-border/70 bg-muted/30 p-3 text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-medium">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      </CardContent>
    </Card>
  )
}
