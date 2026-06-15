import type { BudgetRow } from "@/lib/types"

export const TABLE_PANEL_HEIGHT = "h-[640px]"

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function formatDate(value: string): string {
  if (!value) return "N/A"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value + "T00:00:00"))
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

export function getStatusBadgeVariant(
  budget: BudgetRow
): "secondary" | "outline" | "destructive" {
  if (!budget.enabled) return "outline"
  if (budget.isOverBudget) return "destructive"
  return "secondary"
}

export function getStatusLabel(budget: BudgetRow): string {
  if (!budget.enabled) return "Disabled"
  if (budget.isOverBudget) return "Exceeded"
  return "Active"
}

export function getProgressColor(percentUsed: number): string {
  if (percentUsed >= 100) return "bg-destructive"
  if (percentUsed >= 80) return "bg-amber-500"
  return "bg-emerald-500"
}

export const CCS_LIMIT_URL =
  typeof window !== "undefined"
    ? window.location.protocol === "https:"
      ? "https://api.ccs.halotec.my.id"
      : `http://${window.location.hostname}:8098`
    : "http://localhost:8098"
