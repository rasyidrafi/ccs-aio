"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  AlertTriangle,
  CalendarDays,
  DollarSign,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

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
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ApiKeyEntry, BudgetRow, BudgetWindow } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  TABLE_PANEL_HEIGHT,
  formatBudgetUsageSince,
  formatCurrency,
  formatDate,
  formatPercent,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/components/budgets/budgets-utils"

type BudgetSortKey = "limit" | "usage" | "name"

const BUDGET_SORT_OPTIONS = [
  { value: "limit", label: "Highest limit first" },
  { value: "usage", label: "Highest usage first" },
  { value: "name", label: "API key name" },
] as const

function getSortLabel(value: BudgetSortKey): string {
  return (
    BUDGET_SORT_OPTIONS.find((option) => option.value === value)?.label ??
    BUDGET_SORT_OPTIONS[0].label
  )
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

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
      <span>{compact ? "Unlimited" : "Unlimited"}</span>
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
  icon: typeof DollarSign
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

export function LoginForm({
  onLogin,
  error,
  loading,
}: {
  onLogin: (username: string, password: string) => void
  error: string | null
  loading: boolean
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onLogin(username, password)
  }

  return (
    <div className={cn("flex flex-col gap-6", "w-full")}>
      <Card>
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your username below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              {error ? (
                <Alert variant="destructive" className="border-border/70 p-3">
                  <AlertTriangle className="size-4" />
                  <AlertDescription className="ml-2 font-medium">
                    {error}
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function BudgetRowItem({
  budget,
  index,
  onToggle,
  onDelete,
  onUpdateLimit,
  bypassLimitEnabled,
}: {
  budget: BudgetRow
  index: number
  onToggle: (hash: string, enabled: boolean) => void
  onDelete: (hash: string) => void
  onUpdateLimit: (hash: string, limit: number) => void
  bypassLimitEnabled: boolean
}) {
  const [isLimitOpen, setIsLimitOpen] = useState(false)
  const [limitValue, setLimitValue] = useState(String(budget.weekly_limit_usd))

  useEffect(() => {
    setLimitValue(String(budget.weekly_limit_usd))
  }, [budget.weekly_limit_usd])

  return (
    <TableRow className="align-top">
      <TableCell className="text-center font-mono text-muted-foreground">
        {index + 1}
      </TableCell>
      <TableCell className="min-w-[160px]">
        <div className="space-y-1">
          <div className="font-medium">{budget.apiKeyName ?? "Unknown"}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {budget.api_key_hash}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={getStatusBadgeVariant(budget)}>
          {getStatusLabel(budget)}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {bypassLimitEnabled ? (
          <div className="flex justify-end">
            <UnlimitedMark />
          </div>
        ) : (
          formatCurrency(budget.weekly_limit_usd)
        )}
      </TableCell>
      <TableCell className="min-w-[200px]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              {bypassLimitEnabled
                ? formatBudgetUsageSince(budget)
                : `${formatCurrency(budget.spentUsd)} / ${formatCurrency(
                    budget.weekly_limit_usd
                  )}`}
            </span>
            {bypassLimitEnabled ? (
              <UnlimitedMark compact />
            ) : (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatPercent(budget.percentUsed)}
              </span>
            )}
          </div>
          <Progress
            value={bypassLimitEnabled ? 100 : Math.min(budget.percentUsed, 100)}
            className={bypassLimitEnabled ? "unlimited-progress" : undefined}
          >
            <ProgressLabel className="sr-only">Budget usage</ProgressLabel>
          </Progress>
          <div className="text-xs text-muted-foreground">
            {bypassLimitEnabled
              ? "Unlimited Usage"
              : `${formatCurrency(budget.remainingUsd)} remaining`}
          </div>
        </div>
      </TableCell>
      <TableCell className="w-[200px]">
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="xs"
            onClick={() => onToggle(budget.api_key_hash, !budget.enabled)}
          >
            {budget.enabled ? "Disable" : "Enable"}
          </Button>
          <Popover open={isLimitOpen} onOpenChange={setIsLimitOpen}>
            <PopoverTrigger
              render={
                <Button variant="outline" size="xs">
                  Limit
                </Button>
              }
            />
            <PopoverContent className="w-auto p-3" align="end">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Edit Limit ($)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={limitValue}
                    onChange={(event) => setLimitValue(event.target.value)}
                    min="0.01"
                    step="0.01"
                    className="h-8 w-24"
                  />
                  <Button
                    size="sm"
                    disabled={Number(limitValue) <= 0}
                    onClick={() => {
                      const val = Number(limitValue)
                      if (Number.isFinite(val) && val > 0) {
                        onUpdateLimit(budget.api_key_hash, val)
                        setIsLimitOpen(false)
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="xs">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Budget</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete the budget for{" "}
                  {budget.apiKeyName ?? budget.api_key_hash}? This action cannot
                  be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(budget.api_key_hash)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  )
}

function SharedBudgetWindowControl({
  budgetWindow,
  refreshing,
  onUpdateBudgetWindow,
}: {
  budgetWindow: BudgetWindow | null
  refreshing: boolean
  onUpdateBudgetWindow: (weekStartDate: string, nextResetDate: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>()

  useEffect(() => {
    if (!budgetWindow) return
    setSelectedRange({
      from: new Date(budgetWindow.week_start_date),
      to: new Date(budgetWindow.next_reset_date),
    })
  }, [budgetWindow])

  const today = startOfToday()
  const maxResetDate = selectedRange?.from
    ? addDays(selectedRange.from, 7)
    : undefined
  const rangeLabel = budgetWindow
    ? `${formatDate(budgetWindow.week_start_date)} - ${formatDate(
        budgetWindow.next_reset_date
      )}`
    : "Loading"
  const resetLabel = budgetWindow
    ? formatBudgetResetIn(budgetWindow.daysUntilReset)
    : "Loading"
  const bypassEnabled = Boolean(budgetWindow?.bypass_limit_enabled)
  const triggerDisabled = refreshing || !budgetWindow || bypassEnabled

  useEffect(() => {
    if (bypassEnabled) setIsOpen(false)
  }, [bypassEnabled])

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <span className="text-sm font-medium">Budget window</span>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="h-8 min-w-56 justify-between gap-2 border-border/70 bg-background sm:h-9"
              disabled={triggerDisabled}
            >
              <span className="truncate text-left">{rangeLabel}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {bypassEnabled ? "Bypass active" : resetLabel}
              </span>
              <CalendarDays className="size-4 shrink-0" />
            </Button>
          }
        />
        <PopoverContent className="w-auto p-3" align="end">
          <div className="flex flex-col gap-3">
            <Calendar
              mode="range"
              selected={selectedRange}
              defaultMonth={selectedRange?.from}
              onSelect={setSelectedRange}
              disabled={
                maxResetDate
                  ? { before: today, after: maxResetDate }
                  : { before: today }
              }
              numberOfMonths={1}
              initialFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (budgetWindow) {
                    setSelectedRange({
                      from: new Date(budgetWindow.week_start_date),
                      to: new Date(budgetWindow.next_reset_date),
                    })
                  }
                  setIsOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!selectedRange?.from || !selectedRange?.to}
                onClick={() => {
                  if (!selectedRange?.from || !selectedRange?.to) return
                  onUpdateBudgetWindow(
                    format(selectedRange.from, "yyyy-MM-dd"),
                    format(selectedRange.to, "yyyy-MM-dd")
                  )
                  setIsOpen(false)
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function BypassLimitControl({
  enabled,
  refreshing,
  onToggleBypass,
}: {
  enabled: boolean
  refreshing: boolean
  onToggleBypass: (enabled: boolean) => void
}) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <span className="text-sm font-medium">Unlimited mode</span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant={enabled ? "default" : "outline"}
            className={cn(
              "h-8 min-w-40 gap-2 border-border/70 sm:h-9",
              enabled ? "unlimited-button" : "unlimited-button-idle"
            )}
            disabled={refreshing}
          >
            <Sparkles className="size-4" />
            {enabled ? "Bypass Active" : "Bypass Limit"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {enabled ? "Turn off bypass mode?" : "Bypass all budget limits?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {enabled
                ? "Budget enforcement will resume immediately. API keys will be checked against their configured weekly limits again."
                : "This temporarily bypasses all user budget limits. Every API key can be used freely with unlimited budget enforcement until you turn this mode off again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onToggleBypass(!enabled)}>
              {enabled ? "Resume limits" : "Enable bypass"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function BudgetsTable({
  budgets,
  budgetWindow,
  refreshing,
  onToggle,
  onToggleBypass,
  onDelete,
  onUpdateBudgetWindow,
  onUpdateLimit,
}: {
  budgets: BudgetRow[]
  budgetWindow: BudgetWindow | null
  refreshing: boolean
  onToggle: (hash: string, enabled: boolean) => void
  onToggleBypass: (enabled: boolean) => void
  onDelete: (hash: string) => void
  onUpdateBudgetWindow: (weekStartDate: string, nextResetDate: string) => void
  onUpdateLimit: (hash: string, limit: number) => void
}) {
  const [sortBy, setSortBy] = useState<BudgetSortKey>("limit")
  const bypassLimitEnabled = Boolean(budgetWindow?.bypass_limit_enabled)

  const sortedBudgets = useMemo(() => {
    return [...budgets].sort((a, b) => {
      if (sortBy === "limit") {
        return b.weekly_limit_usd - a.weekly_limit_usd
      }

      if (sortBy === "name") {
        return (a.apiKeyName ?? a.api_key_hash).localeCompare(
          b.apiKeyName ?? b.api_key_hash
        )
      }

      const aPercent =
        a.weekly_limit_usd > 0 ? a.spentUsd / a.weekly_limit_usd : 0
      const bPercent =
        b.weekly_limit_usd > 0 ? b.spentUsd / b.weekly_limit_usd : 0
      return bPercent - aPercent
    })
  }, [budgets, sortBy])

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
            <CardDescription>API key budgets</CardDescription>
            <CardTitle>Weekly spending limits</CardTitle>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <BypassLimitControl
              enabled={bypassLimitEnabled}
              refreshing={refreshing}
              onToggleBypass={onToggleBypass}
            />
            <SharedBudgetWindowControl
              budgetWindow={budgetWindow}
              refreshing={refreshing}
              onUpdateBudgetWindow={onUpdateBudgetWindow}
            />
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <span className="text-sm font-medium">Order rows by</span>
              <Select
                value={sortBy}
                onValueChange={(value: string | null) => {
                  if (!value) return
                  setSortBy(value as BudgetSortKey)
                }}
              >
                <SelectTrigger className="min-w-44">
                  <span className="truncate">{getSortLabel(sortBy)}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Ordering</SelectLabel>
                    {BUDGET_SORT_OPTIONS.map((option) => (
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
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full rounded-lg border border-border/70">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 bg-card text-center">
                  No
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  API Key
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Status
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-right">
                  Limit
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">
                  Usage
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-center">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No budgets configured. Create a budget above to start
                    tracking weekly spending.
                  </TableCell>
                </TableRow>
              ) : (
                sortedBudgets.map((budget, index) => (
                  <BudgetRowItem
                    key={budget.api_key_hash}
                    budget={budget}
                    index={index}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onUpdateLimit={onUpdateLimit}
                    bypassLimitEnabled={bypassLimitEnabled}
                  />
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

export function CreateBudgetForm({
  apiKeys,
  onCreate,
  loading,
}: {
  apiKeys: ApiKeyEntry[]
  onCreate: (hash: string, limit: number) => void
  loading: boolean
}) {
  const availableKeys = apiKeys.filter((k) => !k.hasBudget)
  const [selectedHash, setSelectedHash] = useState("")
  const [limit, setLimit] = useState("50")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedHash || !limit || Number(limit) <= 0) return
    onCreate(selectedHash, Number(limit))
  }

  if (availableKeys.length === 0) {
    return (
      <Alert className="border-border/70 bg-card/95">
        <ShieldCheck className="size-4" />
        <AlertTitle>All keys have budgets</AlertTitle>
        <AlertDescription>
          Every API key already has a budget configured.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader>
        <CardDescription>Add budget</CardDescription>
        <CardTitle>New API key budget</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="min-w-[180px] flex-1 space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <Select
              value={selectedHash}
              onValueChange={(val) => setSelectedHash(val ?? "")}
            >
              <SelectTrigger className="h-9 w-full border-border/70 bg-background">
                <SelectValue placeholder="Select key..." />
              </SelectTrigger>
              <SelectContent>
                {availableKeys.map((k) => (
                  <SelectItem key={k.hash} value={k.hash}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-2 sm:w-[140px]">
            <label className="text-sm font-medium">Weekly limit ($)</label>
            <div className="relative">
              <DollarSign className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                min="0.01"
                step="0.01"
                className="h-9 border-border/70 bg-background pl-8"
              />
            </div>
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-9 w-full sm:w-auto"
            disabled={loading || !selectedHash || Number(limit) <= 0}
          >
            Create
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
