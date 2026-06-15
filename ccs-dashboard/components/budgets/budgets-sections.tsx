"use client"

import { useState, useMemo } from "react"
import { format } from "date-fns"
import {
  AlertTriangle,
  CalendarIcon,
  DollarSign,
  RefreshCw,
  ShieldCheck,
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
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
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
import type { ApiKeyEntry, BudgetRow } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  TABLE_PANEL_HEIGHT,
  formatCurrency,
  formatDate,
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
                  <AlertDescription className="ml-2 font-medium">{error}</AlertDescription>
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
  onUpdateResetDate,
  onUpdateLimit,
}: {
  budget: BudgetRow
  index: number
  onToggle: (hash: string, enabled: boolean) => void
  onDelete: (hash: string) => void
  onUpdateResetDate: (hash: string, date: string) => void
  onUpdateLimit: (hash: string, limit: number) => void
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  return (
    <TableRow className="align-top">
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
            <ProgressLabel className="sr-only">Budget usage</ProgressLabel>
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
        {budget.daysUntilReset === 0 ? "Today" : `${budget.daysUntilReset}d`}
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
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="xs">Limit</Button>} />
            <PopoverContent className="w-auto p-3" align="end">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Edit Limit ($)</label>
                <div className="flex items-center gap-2">
                  <Input 
                    type="number" 
                    defaultValue={budget.weekly_limit_usd}
                    id={`limit-${budget.api_key_hash}`}
                    min="0.01"
                    step="0.01"
                    className="w-24 h-8"
                  />
                  <Button 
                    size="sm"
                    onClick={() => {
                      const val = parseFloat((document.getElementById(`limit-${budget.api_key_hash}`) as HTMLInputElement).value)
                      if (!isNaN(val) && val > 0) {
                        onUpdateLimit(budget.api_key_hash, val)
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger render={<Button variant="outline" size="xs">Move reset</Button>} />
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={new Date(budget.next_reset_date)}
                onSelect={(date) => {
                  if (date) {
                    onUpdateResetDate(budget.api_key_hash, format(date, "yyyy-MM-dd"))
                    setIsPopoverOpen(false)
                  }
                }}
                initialFocus
              />
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
                  Are you sure you want to delete the budget for {budget.apiKeyName ?? budget.api_key_hash}? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(budget.api_key_hash)}>
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

export function BudgetsTable({
  budgets,
  refreshing,
  onToggle,
  onDelete,
  onUpdateResetDate,
  onUpdateLimit,
}: {
  budgets: BudgetRow[]
  refreshing: boolean
  onToggle: (hash: string, enabled: boolean) => void
  onDelete: (hash: string) => void
  onUpdateResetDate: (hash: string, date: string) => void
  onUpdateLimit: (hash: string, limit: number) => void
}) {
  const [sortBy, setSortBy] = useState<"limit" | "usage">("limit")

  const sortedBudgets = useMemo(() => {
    return [...budgets].sort((a, b) => {
      if (sortBy === "limit") {
        return b.weekly_limit_usd - a.weekly_limit_usd
      } else {
        const aPercent = a.weekly_limit_usd > 0 ? a.spentUsd / a.weekly_limit_usd : 0
        const bPercent = b.weekly_limit_usd > 0 ? b.spentUsd / b.weekly_limit_usd : 0
        return bPercent - aPercent
      }
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
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="space-y-1.5">
          <CardDescription>API key budgets</CardDescription>
          <CardTitle>Weekly spending limits</CardTitle>
        </div>
        <Select value={sortBy} onValueChange={(val) => setSortBy(val as "limit" | "usage")}>
          <SelectTrigger className="w-[180px] bg-background border-border/70">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Order by</SelectLabel>
              <SelectItem value="limit">Highest Limit ($)</SelectItem>
              <SelectItem value="usage">Highest Usage (%)</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
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
                sortedBudgets.map((budget, index) => (
                  <BudgetRowItem
                    key={budget.api_key_hash}
                    budget={budget}
                    index={index}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onUpdateResetDate={onUpdateResetDate}
                    onUpdateLimit={onUpdateLimit}
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
  onCreate: (hash: string, limit: number, resetDate: string) => void
  loading: boolean
}) {
  const availableKeys = apiKeys.filter((k) => !k.hasBudget)
  const [selectedHash, setSelectedHash] = useState("")
  const [limit, setLimit] = useState("50")
  const [resetDate, setResetDate] = useState<Date | undefined>(undefined)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedHash || !limit || !resetDate) return
    onCreate(selectedHash, Number(limit), format(resetDate, "yyyy-MM-dd"))
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
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap"
        >
          <div className="min-w-[180px] flex-1 space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <Select value={selectedHash} onValueChange={(val) => setSelectedHash(val ?? "")}>
              <SelectTrigger className="h-9 w-full bg-background border-border/70">
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
          <div className="w-full sm:w-[140px] space-y-2">
            <label className="text-sm font-medium">Weekly limit ($)</label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                min="0.01"
                step="0.01"
                className="h-9 pl-8 bg-background border-border/70"
              />
            </div>
          </div>
          <div className="w-full sm:w-[200px] space-y-2">
            <label className="text-sm font-medium">Reset date</label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger render={
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-9 justify-start text-left font-normal bg-background border-border/70",
                    !resetDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {resetDate ? format(resetDate, "PPP") : <span>Pick a date</span>}
                </Button>
              } />
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={resetDate}
                  onSelect={(date) => {
                    setResetDate(date)
                    setIsCalendarOpen(false)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button type="submit" size="sm" className="h-9 w-full sm:w-auto" disabled={loading || !selectedHash || !resetDate}>
            Create
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
