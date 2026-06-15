"use client"

import { useState } from "react"
import {
  AlertTriangle,
  DollarSign,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react"

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
import { Input } from "@/components/ui/input"
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
import type { ApiKeyEntry, BudgetRow } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  TABLE_PANEL_HEIGHT,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/components/budgets/budgets-utils"

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
    <Card className="mx-auto max-w-sm border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Enter your budget management credentials.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            />
          </div>
          {error ? (
            <Alert variant="destructive" className="border-border/70">
              <AlertTriangle className="size-4" />
              <AlertTitle>Login failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function BudgetsTable({
  budgets,
  refreshing,
  onToggle,
  onDelete,
  onUpdateResetDate,
}: {
  budgets: BudgetRow[]
  refreshing: boolean
  onToggle: (hash: string, enabled: boolean) => void
  onDelete: (hash: string) => void
  onUpdateResetDate: (hash: string, date: string) => void
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
        <CardDescription>API key budgets</CardDescription>
        <CardTitle>Weekly spending limits</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full rounded-lg border border-border/70">
          <Table className="min-w-[1000px]">
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
                <TableHead className="sticky top-0 z-10 bg-card">
                  Week Period
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-card text-center">
                  Reset in
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
                    colSpan={8}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No budgets configured. Use the management API to create
                    budgets.
                  </TableCell>
                </TableRow>
              ) : (
                budgets.map((budget, index) => (
                  <TableRow key={budget.api_key_hash} className="align-top">
                    <TableCell className="text-center font-mono text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="min-w-[160px]">
                      <div className="space-y-1">
                        <div className="font-medium">
                          {budget.apiKeyName ?? "Unknown"}
                        </div>
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
                      {formatCurrency(budget.weekly_limit_usd)}
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-muted-foreground">
                            {formatCurrency(budget.spentUsd)} /{" "}
                            {formatCurrency(budget.weekly_limit_usd)}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatPercent(budget.percentUsed)}
                          </span>
                        </div>
                        <Progress value={Math.min(budget.percentUsed, 100)}>
                          <ProgressLabel className="sr-only">
                            Budget usage
                          </ProgressLabel>
                        </Progress>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(budget.remainingUsd)} remaining
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>
                          {formatDate(budget.week_start_date)} &rarr;{" "}
                          {formatDate(budget.next_reset_date)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="w-[88px] text-center text-sm text-muted-foreground tabular-nums">
                      {budget.daysUntilReset === 0
                        ? "Today"
                        : `${budget.daysUntilReset}d`}
                    </TableCell>
                    <TableCell className="w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            onToggle(budget.api_key_hash, !budget.enabled)
                          }
                        >
                          {budget.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            const date = prompt(
                              "New reset date (YYYY-MM-DD):",
                              budget.next_reset_date
                            )
                            if (date) onUpdateResetDate(budget.api_key_hash, date)
                          }}
                        >
                          Move reset
                        </Button>
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => {
                            if (
                              confirm(
                                `Delete budget for ${budget.apiKeyName ?? budget.api_key_hash}?`
                              )
                            )
                              onDelete(budget.api_key_hash)
                          }}
                        >
                          Delete
                        </Button>
                      </div>
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

export function CreateBudgetForm({
  apiKeys,
  onCreate,
  loading,
}: {
  apiKeys: ApiKeyEntry[]
  onCreate: (hash: string, limit: number, resetDate: string) => void
  loading: boolean
}) {
  const availableKeys = apiKeys.filter((k) => !k.hasBudget)
  const [selectedHash, setSelectedHash] = useState("")
  const [limit, setLimit] = useState("50")
  const [resetDate, setResetDate] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedHash || !limit || !resetDate) return
    onCreate(selectedHash, Number(limit), resetDate)
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
          className="flex flex-wrap items-end gap-4"
        >
          <div className="min-w-[180px] flex-1 space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <select
              className="h-8 w-full rounded-md border border-border/70 bg-background px-2 text-sm"
              value={selectedHash}
              onChange={(e) => setSelectedHash(e.target.value)}
            >
              <option value="">Select key...</option>
              {availableKeys.map((k) => (
                <option key={k.hash} value={k.hash}>
                  {k.name} ({k.hash})
                </option>
              ))}
            </select>
          </div>
          <div className="w-[140px] space-y-2">
            <label className="text-sm font-medium">Weekly limit ($)</label>
            <Input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              min="0.01"
              step="0.01"
              className="h-8"
            />
          </div>
          <div className="w-[160px] space-y-2">
            <label className="text-sm font-medium">Reset date</label>
            <Input
              type="date"
              value={resetDate}
              onChange={(e) => setResetDate(e.target.value)}
              className="h-8"
            />
          </div>
          <Button type="submit" size="sm" disabled={loading || !selectedHash}>
            Create
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
