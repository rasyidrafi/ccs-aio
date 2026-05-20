"use client"

import { startTransition, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChartColumnBig,
  Database,
  KeyRound,
  RefreshCw,
  Wallet,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"

import { ConsoleTabs } from "@/components/console-tabs"
import { ThemeSelect } from "@/components/theme-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type {
  DashboardKeyRow,
  DashboardModelRow,
  DashboardPayload,
  DashboardSourceBadge,
  DatePreset,
  TrendGranularityInput,
} from "@/lib/types"

const DEFAULT_PRESET: DatePreset = "today"
const DEFAULT_GRANULARITY: TrendGranularityInput = "auto"
const KEY_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
const TALL_PANEL_HEIGHT = "h-[560px]"
const TABLE_PANEL_HEIGHT = "h-[640px]"

const PRESET_OPTIONS: Array<{ value: DatePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "month", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
]

const DESKTOP_PRESET_OPTIONS = PRESET_OPTIONS.filter((option) => option.value !== "custom")

function buildQuery(
  preset: DatePreset,
  from: string,
  to: string,
  granularity: TrendGranularityInput,
  refreshToken: number
): string {
  const params = new URLSearchParams()
  params.set("preset", preset)

  if (granularity !== "auto") {
    params.set("granularity", granularity)
  }

  if (preset === "custom") {
    if (from) params.set("from", from)
    if (to) params.set("to", to)
  }

  if (refreshToken > 0) {
    params.set("refresh", String(refreshToken))
  }

  return params.toString()
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return formatNumber(value)
}

function formatCost(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value)
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

function formatCalendarSelection(date: Date | undefined): string {
  if (!date) return ""
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseDateInputValue(value: string): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function formatGranularityLabel(value: string): string {
  if (value === "hourly") return "Hourly"
  if (value === "daily") return "Daily"
  if (value === "weekly") return "Weekly"
  if (value === "monthly") return "Monthly"
  if (value === "yearly") return "Yearly"
  return value
}

function formatStateLabel(value: DashboardKeyRow["sourceState"]): string {
  if (value === "live") return "Live"
  if (value === "config") return "Config"
  return "Fallback"
}

function getSourceBadgeVariant(kind: DashboardSourceBadge["kind"]): "secondary" | "outline" | "destructive" {
  switch (kind) {
    case "live":
      return "secondary"
    case "config":
      return "outline"
    default:
      return "outline"
  }
}

function getStateBadgeVariant(value: DashboardKeyRow["sourceState"]): "secondary" | "outline" | "destructive" {
  switch (value) {
    case "live":
      return "secondary"
    case "config":
      return "outline"
    default:
      return "outline"
  }
}

function getGranularityOptions(preset: DatePreset): Array<{ value: TrendGranularityInput; label: string }> {
  if (preset === "month") {
    return [
      { value: "auto", label: "Auto (daily)" },
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
    ]
  }

  if (preset === "custom") {
    return [
      { value: "auto", label: "Automatic" },
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" },
      { value: "yearly", label: "Yearly" },
    ]
  }

  if (preset === "today" || preset === "yesterday") {
    return [
      { value: "auto", label: "Auto (hourly)" },
      { value: "hourly", label: "Hourly" },
    ]
  }

  if (preset === "year") {
    return [
      { value: "auto", label: "Auto (monthly)" },
      { value: "monthly", label: "Monthly" },
    ]
  }

  if (preset === "all") {
    return [
      { value: "auto", label: "Automatic" },
      { value: "monthly", label: "Monthly" },
      { value: "yearly", label: "Yearly" },
    ]
  }

  return [
    { value: "auto", label: "Auto (daily)" },
    { value: "daily", label: "Daily" },
  ]
}

function getRangeLabel(range: DateRange | undefined, fallback?: string): string {
  if (!range?.from) return fallback ?? "Pick a date range"
  if (!range.to) return format(range.from, "MMM dd, yyyy")
  return `${format(range.from, "MMM dd, yyyy")} - ${format(range.to, "MMM dd, yyyy")}`
}

function getOptionLabel<T extends string>(options: Array<{ value: T; label: string }>, value: T): string {
  return options.find((option) => option.value === value)?.label ?? value
}

function resolveSelectedRange(from: string, to: string): DateRange | undefined {
  const fromDate = parseDateInputValue(from)
  const toDate = parseDateInputValue(to)
  if (!fromDate && !toDate) return undefined
  return {
    from: fromDate,
    to: toDate,
  }
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

function LoadingControlRows() {
  return (
    <div className="border-y border-border/70 py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:hidden">
          <div className="w-10 shrink-0 text-xs font-medium text-muted-foreground">Range</div>
          <Skeleton className="h-8 min-w-0 flex-1" />
        </div>

        <div className="hidden min-w-0 items-center gap-2 sm:flex lg:max-w-[680px]">
          <div className="shrink-0 text-xs font-medium text-muted-foreground">Range</div>
          <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
            {["w-44", "w-20"].map((width, index) => (
              <Skeleton key={index} className={`h-8 shrink-0 ${width}`} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
          <div className="flex min-w-0 items-center gap-2">
            <div className="w-10 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto">Date</div>
            <Skeleton className="h-8 min-w-0 flex-1 sm:w-[260px] sm:flex-none" />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="w-10 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto">Group</div>
            <Skeleton className="h-8 min-w-0 flex-1 sm:w-[190px] sm:flex-none" />
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingTableSkeleton() {
  return (
    <div className="rounded-lg border border-border/70">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="grid grid-cols-[44px_minmax(0,2fr)_minmax(0,1fr)_80px_80px_80px_minmax(0,1.4fr)_96px_72px] gap-4">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full max-w-full" />
          ))}
        </div>
      </div>
      <div className="space-y-0">
        {Array.from({ length: 7 }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid grid-cols-[44px_minmax(0,2fr)_minmax(0,1fr)_80px_80px_80px_minmax(0,1.4fr)_96px_72px] gap-4 border-b border-border/70 px-4 py-4 last:border-b-0"
          >
            <Skeleton className="h-4 w-6 justify-self-center" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20 max-w-full" />
            <Skeleton className="h-4 w-16 justify-self-end" />
            <Skeleton className="h-4 w-16 justify-self-end" />
            <Skeleton className="h-4 w-14 justify-self-end" />
            <Skeleton className="h-4 w-full max-w-[180px]" />
            <Skeleton className="h-4 w-24 max-w-full" />
            <Skeleton className="h-6 w-16 max-w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function DashboardPageSkeleton() {
  return (
    <div className="space-y-4">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-44 sm:h-9 sm:w-56" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
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

        <LoadingControlRows />
      </section>

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

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
        <Card className={`${TALL_PANEL_HEIGHT} border-border/70 bg-card/95`}>
          <CardHeader>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <Skeleton className="h-full min-h-[360px] w-full" />
          </CardContent>
        </Card>
        <Card className={`${TALL_PANEL_HEIGHT} border-border/70 bg-card/95`}>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-[220px] w-full" />
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card className={`${TABLE_PANEL_HEIGHT} border-border/70 bg-card/95`}>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-40" />
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-44" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <LoadingTableSkeleton />
          </CardContent>
        </Card>
        <Card className={`${TABLE_PANEL_HEIGHT} border-border/70 bg-card/95`}>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-[220px] w-full" />
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="space-y-2 text-right">
                  <Skeleton className="ml-auto h-4 w-16" />
                  <Skeleton className="ml-auto h-3 w-10" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
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

function StatusBadges({ badges }: { badges: DashboardSourceBadge[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <Badge key={`${badge.kind}-${badge.label}`} variant={getSourceBadgeVariant(badge.kind)}>
          {badge.label}
        </Badge>
      ))}
    </div>
  )
}

function DateRangePicker({
  range,
  label,
  onChange,
  compact = false,
}: {
  range: DateRange | undefined
  label: string
  onChange: (range: DateRange | undefined) => void
  compact?: boolean
}) {
  return (
    <div className={cn(compact ? "flex min-w-0 items-center gap-2" : "space-y-2")}>
      <div className={cn(compact ? "w-10 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto" : "text-sm font-medium")}>
        {label}
      </div>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className={cn("justify-between font-normal", compact ? "h-8 min-w-0 flex-1 sm:w-[260px] sm:flex-none" : "w-full")}
            />
          }
        >
          <span className="truncate text-left">{getRangeLabel(range)}</span>
          <CalendarDays data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={range?.from}
            selected={range}
            onSelect={(nextRange) => onChange(nextRange)}
            numberOfMonths={1}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function DashboardOverview({
  dashboard,
  loading,
  preset,
  setPreset,
  granularity,
  setGranularity,
  selectedRange,
  onRangeChange,
  onRefresh,
}: {
  dashboard: DashboardPayload | null
  loading: boolean
  preset: DatePreset
  setPreset: (value: DatePreset) => void
  granularity: TrendGranularityInput
  setGranularity: (value: TrendGranularityInput) => void
  selectedRange: DateRange | undefined
  onRangeChange: (range: DateRange | undefined) => void
  onRefresh: () => void
}) {
  const granularityOptions = getGranularityOptions(preset)
  const selectedGranularity = granularityOptions.some((option) => option.value === granularity)
    ? granularity
    : DEFAULT_GRANULARITY
  const presetLabel = getOptionLabel(PRESET_OPTIONS, preset)
  const desktopPresetLabel = preset === "custom" ? "Select range" : presetLabel
  const granularityLabel = getOptionLabel(granularityOptions, selectedGranularity)

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">CCS dashboard</h1>
            {dashboard ? <StatusBadges badges={dashboard.source.badges} /> : null}
            {loading && dashboard ? (
              <Badge variant="outline" className="gap-2">
                <RefreshCw className="size-3.5 animate-spin" />
                Refreshing
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{dashboard?.range.label ?? presetLabel}</span>
            <span>{dashboard ? formatGranularityLabel(dashboard.range.resolvedGranularity) : granularityLabel}</span>
            <span>{dashboard ? formatDateTime(dashboard.generatedAt) : "Loading"}</span>
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

      <div className="border-y border-border/70 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:hidden">
            <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">Range</span>
            <Select
              value={preset}
              onValueChange={(value: string | null) => {
                if (!value) return
                setPreset(value as DatePreset)
              }}
            >
              <SelectTrigger className="h-8 min-w-0 flex-1">
                <span className="truncate">{presetLabel}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Preset</SelectLabel>
                  {PRESET_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="hidden min-w-0 items-center gap-2 sm:flex lg:max-w-[680px]">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Range</span>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Select
                value={preset === "custom" ? undefined : preset}
                onValueChange={(value: string | null) => {
                  if (!value) return
                  startTransition(() => setPreset(value as DatePreset))
                }}
              >
                <SelectTrigger className="h-8 min-w-0 flex-1 sm:w-[220px] sm:flex-none">
                  <span className="truncate">{desktopPresetLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Preset</SelectLabel>
                    {DESKTOP_PRESET_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant={preset === "custom" ? "default" : "outline"}
                className="h-8 shrink-0"
                onClick={() => {
                  startTransition(() => setPreset("custom"))
                }}
              >
                Custom
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
            <DateRangePicker range={selectedRange} label="Date" onChange={onRangeChange} compact />

            <div className="flex min-w-0 items-center gap-2">
            <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto">Group</span>
              <Select
                value={selectedGranularity}
                onValueChange={(value: string | null) => {
                  if (!value) return
                  setGranularity(value as TrendGranularityInput)
                }}
              >
                <SelectTrigger className="h-8 min-w-0 flex-1 sm:w-[190px] sm:flex-none">
                  <span className="truncate">{granularityLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Grouping</SelectLabel>
                    {granularityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DashboardTrend({ dashboard, refreshing }: { dashboard: DashboardPayload; refreshing: boolean }) {
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
    <Card className={cn("relative overflow-hidden border-border/70 bg-card/95", TALL_PANEL_HEIGHT)}>
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
          <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-requests)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-requests)" stopOpacity={0.06} />
              </linearGradient>
              <linearGradient id="fillCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-cost)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-cost)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} />
            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span>{name === "cost" ? "Cost" : "Requests"}</span>
                      <span className="font-mono">
                        {name === "cost" ? formatCost(Number(value ?? 0)) : formatNumber(Number(value ?? 0))}
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

function TopKeys({ keys, refreshing }: { keys: DashboardKeyRow[]; refreshing: boolean }) {
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
    <Card className={cn("relative overflow-hidden border-border/70 bg-card/95", TALL_PANEL_HEIGHT)}>
      {refreshing ? <RefreshScrim /> : null}
      <CardHeader>
        <CardDescription>Concentration</CardDescription>
        <CardTitle>Top keys by cost</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 4 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={90} tickLine={false} axisLine={false} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span>Cost</span>
                      <span className="font-mono">{formatCost(Number(value ?? 0))}</span>
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
              <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(row.requests)} requests</div>
                </div>
                <div className="text-sm font-medium">{formatCost(row.cost)}</div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function ModelMix({ models, refreshing }: { models: DashboardModelRow[]; refreshing: boolean }) {
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
    <Card className={cn("relative overflow-hidden border-border/70 bg-card/95", TABLE_PANEL_HEIGHT)}>
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
                      <span className="font-mono">{formatCost(Number(value ?? 0))}</span>
                    </div>
                  )}
                />
              }
            />
            <Pie data={rows} dataKey="cost" nameKey="model" innerRadius={58} outerRadius={92} paddingAngle={3}>
              {rows.map((entry) => (
                <Cell key={entry.model} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <ScrollArea className="min-h-0 flex-1 rounded-lg">
          <div className="space-y-2 pr-3">
            {rows.map((row) => (
              <div key={row.model} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{row.model}</div>
                  <div className="text-xs text-muted-foreground">{formatTokenCount(row.tokens)} tokens</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{formatCost(row.cost)}</div>
                  <div className="text-xs text-muted-foreground">{row.share}%</div>
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

function UsageTable({ keys, refreshing }: { keys: DashboardKeyRow[]; refreshing: boolean }) {
  const [sortBy, setSortBy] = useState<"cost" | "lastActive">("cost")
  const sortOptions = [
    { value: "cost", label: "Highest cost first" },
    { value: "lastActive", label: "Most recently active" },
  ] as const

  const sortedKeys = useMemo(() => {
    return [...keys].sort((left, right) => {
      if (sortBy === "lastActive") {
        const leftTime = left.lastUsed ? new Date(left.lastUsed).getTime() : 0
        const rightTime = right.lastUsed ? new Date(right.lastUsed).getTime() : 0
        return rightTime - leftTime
      }

      return right.cost - left.cost
    })
  }, [keys, sortBy])

  return (
    <Card className={cn("relative overflow-hidden border-border/70 bg-card/95", TABLE_PANEL_HEIGHT)}>
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
                <span className="truncate">{getOptionLabel([...sortOptions], sortBy)}</span>
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
          <Table className="min-w-[1140px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 bg-card text-center">No</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Key</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Provider</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-right">Requests</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-right">Tokens</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-right">Cost</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Models</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Last used</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedKeys.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="text-center font-mono text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{row.displayName}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{row.maskedKey}</div>
                  </TableCell>
                  <TableCell>{row.providerLabel}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.requests)}</TableCell>
                  <TableCell className="text-right">{formatTokenCount(row.totalTokens)}</TableCell>
                  <TableCell className="text-right">{formatCost(row.cost)}</TableCell>
                  <TableCell className="max-w-[240px] whitespace-normal text-muted-foreground">
                    {row.modelsUsed.join(", ") || "—"}
                  </TableCell>
                  <TableCell>{formatDateTime(row.lastUsed)}</TableCell>
                  <TableCell>
                    <Badge variant={getStateBadgeVariant(row.sourceState)}>{formatStateLabel(row.sourceState)}</Badge>
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

function EmptyState({
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

export function DashboardClient() {
  const [preset, setPreset] = useState<DatePreset>(DEFAULT_PRESET)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [granularity, setGranularity] = useState<TrendGranularityInput>(DEFAULT_GRANULARITY)
  const [refreshToken, setRefreshToken] = useState(0)
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState<string | null>(null)

  const activeGranularity = useMemo(() => {
    const options = getGranularityOptions(preset)
    return options.some((option) => option.value === granularity) ? granularity : DEFAULT_GRANULARITY
  }, [granularity, preset])

  const selectedRange = useMemo(() => resolveSelectedRange(from, to), [from, to])
  const isRefreshing = dashboardLoading && dashboard !== null

  useEffect(() => {
    if (activeGranularity !== granularity) {
      setGranularity(activeGranularity)
    }
  }, [activeGranularity, granularity])

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      setDashboardLoading(true)
      setDashboardError(null)

      try {
        const query = buildQuery(preset, from, to, activeGranularity, refreshToken)
        const response = await fetch(`/api/dashboard?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? `Dashboard request failed with status ${response.status}`)
        }

        const payload = (await response.json()) as DashboardPayload
        setDashboard(payload)
      } catch (error) {
        if (controller.signal.aborted) return
        setDashboardError(error instanceof Error ? error.message : "Failed to load dashboard")
      } finally {
        if (!controller.signal.aborted) {
          setDashboardLoading(false)
        }
      }
    }

    void loadDashboard()
    return () => controller.abort()
  }, [activeGranularity, from, preset, refreshToken, to])

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
        {dashboardLoading && !dashboard ? (
          <DashboardPageSkeleton />
        ) : (
          <>
            <DashboardOverview
              dashboard={dashboard}
              loading={dashboardLoading}
              preset={preset}
              setPreset={setPreset}
              granularity={activeGranularity}
              setGranularity={setGranularity}
              selectedRange={selectedRange}
              onRangeChange={(range) => {
                const nextFrom = formatCalendarSelection(range?.from)
                const nextTo = formatCalendarSelection(range?.to)
                startTransition(() => {
                  setFrom(nextFrom)
                  setTo(nextTo)
                  setPreset(range?.from ? "custom" : DEFAULT_PRESET)
                })
              }}
              onRefresh={() => setRefreshToken((value) => value + 1)}
            />

            {dashboardError ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>Dashboard request failed</AlertTitle>
                <AlertDescription>{dashboardError}</AlertDescription>
              </Alert>
            ) : null}

            {dashboard ? (
              <>
                <section className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Usage summary</h2>
                      <p className="text-sm text-muted-foreground">
                        High-level totals for the currently selected range.
                      </p>
                    </div>
                    {isRefreshing ? <Badge variant="outline">Refreshing in place</Badge> : null}
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

                {dashboard.trend.length > 0 || dashboard.keys.length > 0 || dashboard.models.length > 0 ? (
                  <>
                    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
                      {dashboard.trend.length > 0 ? (
                        <DashboardTrend dashboard={dashboard} refreshing={isRefreshing} />
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
                        <ModelMix models={dashboard.models} refreshing={isRefreshing} />
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
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
