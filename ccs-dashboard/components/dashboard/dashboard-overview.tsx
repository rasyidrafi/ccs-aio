"use client"

import { startTransition } from "react"
import { CalendarDays, RefreshCw } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { ConsoleTabs } from "@/components/console-tabs"
import { ThemeSelect } from "@/components/theme-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type {
  DashboardPayload,
  DashboardSourceBadge,
  DatePreset,
  TrendGranularityInput,
} from "@/lib/types"
import {
  DEFAULT_GRANULARITY,
  DESKTOP_PRESET_OPTIONS,
  PRESET_OPTIONS,
  formatDateTime,
  formatGranularityLabel,
  getGranularityOptions,
  getOptionLabel,
  getRangeLabel,
  getSourceBadgeVariant,
} from "@/components/dashboard/dashboard-utils"

function StatusBadges({ badges }: { badges: DashboardSourceBadge[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <Badge
          key={`${badge.kind}-${badge.label}`}
          variant={getSourceBadgeVariant(badge.kind)}
        >
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
    <div
      className={cn(compact ? "flex min-w-0 items-center gap-2" : "space-y-2")}
    >
      <div
        className={cn(
          compact
            ? "w-10 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto"
            : "text-sm font-medium"
        )}
      >
        {label}
      </div>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className={cn(
                "justify-between font-normal",
                compact
                  ? "h-8 min-w-0 flex-1 sm:w-[260px] sm:flex-none"
                  : "w-full"
              )}
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

export function DashboardOverview({
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
  const selectedGranularity = granularityOptions.some(
    (option) => option.value === granularity
  )
    ? granularity
    : DEFAULT_GRANULARITY
  const presetLabel = getOptionLabel(PRESET_OPTIONS, preset)
  const desktopPresetLabel = preset === "custom" ? "Select range" : presetLabel
  const granularityLabel = getOptionLabel(
    granularityOptions,
    selectedGranularity
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              CCS dashboard
            </h1>
            {dashboard ? (
              <StatusBadges badges={dashboard.source.badges} />
            ) : null}
            {loading && dashboard ? (
              <Badge variant="outline" className="gap-2">
                <RefreshCw className="size-3.5 animate-spin" />
                Refreshing
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{dashboard?.range.label ?? presetLabel}</span>
            <span>
              {dashboard
                ? formatGranularityLabel(dashboard.range.resolvedGranularity)
                : granularityLabel}
            </span>
            <span>
              {dashboard ? formatDateTime(dashboard.generatedAt) : "Loading"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,156px)_minmax(0,180px)] lg:flex lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-2 sm:col-span-2 lg:hidden">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
              Page
            </span>
            <ConsoleTabs className="flex-1" />
          </div>
          <div className="hidden lg:block">
            <ConsoleTabs />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">
              Theme
            </span>
            <ThemeSelect className="h-8 min-w-0 flex-1 sm:h-9 sm:flex-none" />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">
              Refresh
            </span>
            <Button
              variant="outline"
              className="h-8 min-w-0 flex-1 gap-2 sm:h-9 sm:w-full sm:flex-none"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={cn("size-4", loading ? "animate-spin" : "")}
              />
              {loading ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </div>
      </div>

      <div className="border-y border-border/70 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:hidden">
            <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
              Range
            </span>
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
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              Range
            </span>
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
            <DateRangePicker
              range={selectedRange}
              label="Date"
              onChange={onRangeChange}
              compact
            />

            <div className="flex min-w-0 items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto">
                Group
              </span>
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
