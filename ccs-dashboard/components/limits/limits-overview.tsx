"use client"

import { useState } from "react"
import { LogOut, RefreshCw, ShieldCheck } from "lucide-react"

import { ConsoleTabs } from "@/components/console-tabs"
import { ThemeSelect } from "@/components/theme-select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { LimitsPayload } from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatDateTime, formatNumber } from "@/components/limits/limits-utils"

function AdminModeControl({
  unlocked,
  error,
  loading,
  onLogin,
  onLogout,
}: {
  unlocked: boolean
  error: string | null
  loading: boolean
  onLogin: (username: string, password: string) => void
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  if (unlocked) {
    return (
      <Button
        variant="outline"
        className="h-8 min-w-0 flex-1 gap-2 sm:h-9 sm:w-full sm:flex-none"
        onClick={onLogout}
      >
        <LogOut className="size-4" />
        Admin On
      </Button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="h-8 min-w-0 flex-1 gap-2 sm:h-9 sm:w-full sm:flex-none"
          >
            <ShieldCheck className="size-4" />
            Unlock Admin
          </Button>
        }
      />
      <PopoverContent className="w-80 p-3" align="end">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onLogin(username, password)
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="limits-admin-username">Username</FieldLabel>
              <Input
                id="limits-admin-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="limits-admin-password">Password</FieldLabel>
              <Input
                id="limits-admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            {error ? (
              <Alert variant="destructive" className="p-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Unlocking..." : "Unlock Admin Actions"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export function LimitsOverview({
  limits,
  loading,
  onRefresh,
  adminUnlocked,
  loginError,
  loginLoading,
  onAdminLogin,
  onAdminLogout,
}: {
  limits: LimitsPayload | null
  loading: boolean
  onRefresh: () => void
  adminUnlocked: boolean
  loginError: string | null
  loginLoading: boolean
  onAdminLogin: (username: string, password: string) => void
  onAdminLogout: () => void
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">CCS limits</h1>
            {loading && limits ? (
              <Badge variant="outline" className="gap-2">
                <RefreshCw className="size-3.5 animate-spin" />
                Refreshing
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>Live Codex quota inspection</span>
            <span>
              {limits ? formatDateTime(limits.generatedAt) : "Loading"}
            </span>
            <span>
              {limits
                ? `${formatNumber(limits.accounts.length)} accounts`
                : "Discovering accounts"}
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
          <div className="flex min-w-0 items-center gap-2 sm:col-span-2 lg:block">
            <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">
              Admin
            </span>
            <AdminModeControl
              unlocked={adminUnlocked}
              error={loginError}
              loading={loginLoading}
              onLogin={onAdminLogin}
              onLogout={onAdminLogout}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
