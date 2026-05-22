import { format } from "date-fns"
import type { DateRange } from "react-day-picker"

import type {
  DashboardKeyRow,
  DashboardSourceBadge,
  DatePreset,
  TrendGranularityInput,
} from "@/lib/types"

export const DEFAULT_PRESET: DatePreset = "today"
export const DEFAULT_GRANULARITY: TrendGranularityInput = "auto"
export const KEY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
export const TALL_PANEL_HEIGHT = "h-[560px]"
export const TABLE_PANEL_HEIGHT = "h-[640px]"

export const PRESET_OPTIONS: Array<{ value: DatePreset; label: string }> = [
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

export const DESKTOP_PRESET_OPTIONS = PRESET_OPTIONS.filter(
  (option) => option.value !== "custom"
)

export function buildQuery(
  preset: DatePreset,
  from: string,
  to: string,
  granularity: TrendGranularityInput
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

  return params.toString()
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

export function formatTokenCount(value: number): string {
  const absValue = Math.abs(value)
  const units = ["", "K", "M", "B", "T", "Q"]

  if (absValue < 1_000) return formatNumber(value)

  const unitIndex = Math.min(
    Math.floor(Math.log10(absValue) / 3),
    units.length - 1
  )
  const scaled = value / 1_000 ** unitIndex
  const absScaled = Math.abs(scaled)
  const fractionDigits = absScaled >= 100 ? 0 : absScaled >= 10 ? 1 : 2

  return `${scaled.toFixed(fractionDigits)}${units[unitIndex]}`
}

export function formatTokenCountExact(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

export function formatTokenCountWithExact(value: number): string {
  return `${formatTokenCount(value)} (${formatTokenCountExact(value)})`
}

export function formatCost(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value)
}

export function formatDateTime(value: string | null): string {
  if (!value) return "Never"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

export function formatCalendarSelection(date: Date | undefined): string {
  if (!date) return ""
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseDateInputValue(value: string): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function formatGranularityLabel(value: string): string {
  if (value === "hourly") return "Hourly"
  if (value === "daily") return "Daily"
  if (value === "weekly") return "Weekly"
  if (value === "monthly") return "Monthly"
  if (value === "yearly") return "Yearly"
  return value
}

export function formatStateLabel(
  value: DashboardKeyRow["sourceState"]
): string {
  if (value === "live") return "Live"
  if (value === "config") return "Config"
  return "Fallback"
}

export function getSourceBadgeVariant(
  kind: DashboardSourceBadge["kind"]
): "secondary" | "outline" | "destructive" {
  switch (kind) {
    case "live":
      return "secondary"
    case "config":
      return "outline"
    default:
      return "outline"
  }
}

export function getStateBadgeVariant(
  value: DashboardKeyRow["sourceState"]
): "secondary" | "outline" | "destructive" {
  switch (value) {
    case "live":
      return "secondary"
    case "config":
      return "outline"
    default:
      return "outline"
  }
}

export function getGranularityOptions(
  preset: DatePreset
): Array<{ value: TrendGranularityInput; label: string }> {
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

export function getRangeLabel(
  range: DateRange | undefined,
  fallback?: string
): string {
  if (!range?.from) return fallback ?? "Pick a date range"
  if (!range.to) return format(range.from, "MMM dd, yyyy")
  return `${format(range.from, "MMM dd, yyyy")} - ${format(range.to, "MMM dd, yyyy")}`
}

export function getOptionLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T
): string {
  return options.find((option) => option.value === value)?.label ?? value
}

export function resolveSelectedRange(
  from: string,
  to: string
): DateRange | undefined {
  const fromDate = parseDateInputValue(from)
  const toDate = parseDateInputValue(to)
  if (!fromDate && !toDate) return undefined
  return {
    from: fromDate,
    to: toDate,
  }
}
