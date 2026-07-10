import type { LimitsAccountRow, LimitsAlert } from "@/lib/types"

export const TABLE_PANEL_HEIGHT = "h-[640px]"

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value))
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

export function formatRelativeSeconds(value: number | null): string {
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

export function formatPercent(value: number | null): string {
  if (value === null) return "N/A"
  return `${Math.round(value)}%`
}

const WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60
const DAY_SECONDS = 24 * 60 * 60

export interface WeeklyUsagePrediction {
  remainingPercent: number
  dayNumber: number
  dailyAllowancePercent: number
  dailyBalancePercent: number
}

export function getWeeklyUsagePrediction(
  usedPercent: number,
  resetAfterSeconds: number | null,
  now = new Date()
): WeeklyUsagePrediction | null {
  if (resetAfterSeconds === null) return null

  const used = Math.max(0, Math.min(100, usedPercent))
  const secondsRemaining = Math.max(
    0,
    Math.min(WEEKLY_WINDOW_SECONDS, resetAfterSeconds)
  )
  const resetAt = new Date(now.getTime() + secondsRemaining * 1000)
  const weekStartedAt = new Date(
    resetAt.getTime() - WEEKLY_WINDOW_SECONDS * 1000
  )
  const currentDay = new Date(now)
  currentDay.setHours(0, 0, 0, 0)
  const weekStartDay = new Date(weekStartedAt)
  weekStartDay.setHours(0, 0, 0, 0)
  const elapsedCalendarDays = Math.floor(
    (currentDay.getTime() - weekStartDay.getTime()) / (DAY_SECONDS * 1000)
  )
  const dayNumber = Math.max(1, Math.min(7, elapsedCalendarDays + 1))
  const dailyAllowancePercent = (dayNumber / 7) * 100
  const remainingPercent = Math.max(0, 100 - used)

  return {
    remainingPercent,
    dayNumber,
    dailyAllowancePercent,
    dailyBalancePercent: dailyAllowancePercent - used,
  }
}

export function formatPredictionPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
}

export function getAlertVariant(
  severity: LimitsAlert["severity"]
): "default" | "destructive" {
  return severity === "urgent" ? "destructive" : "default"
}

export function getStatusBadgeVariant(
  status: LimitsAccountRow["status"]
): "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "secondary"
    case "paused":
      return "outline"
    case "expired":
      return "outline"
    default:
      return "destructive"
  }
}

export function getStatusLabel(status: LimitsAccountRow["status"]): string {
  if (status === "active") return "Active"
  if (status === "paused") return "Paused"
  if (status === "expired") return "Expired"
  return "Error"
}

export function getPlanBadgeVariant(
  planType: string | null
): "secondary" | "outline" | "destructive" {
  const value = planType?.toLowerCase() ?? ""
  if (value === "pro" || value === "prolite") return "outline"
  if (value === "plus") return "secondary"
  if (value === "free") return "destructive"
  if (value === "team") return "outline"
  return "outline"
}

export function getPlanBadgeClassName(planType: string | null): string {
  const value = planType?.toLowerCase() ?? ""
  if (value === "prolite") return "plan-chip-pro"
  if (value === "pro") return "plan-chip-pro-plus"
  if (value === "plus")
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
  if (value === "team")
    return "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-200"
  return ""
}

export function formatPlanLabel(planType: string | null): string {
  if (!planType) return "Unknown"

  const value = planType.toLowerCase()
  if (value === "prolite") return "Pro"
  if (value === "pro") return "Pro+"
  if (value === "plus") return "Plus"
  if (value === "team") return "Team"
  if (value === "free") return "Free"

  return planType.charAt(0).toUpperCase() + planType.slice(1)
}
