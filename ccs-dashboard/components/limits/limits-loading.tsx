import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { TABLE_PANEL_HEIGHT } from "@/components/limits/limits-utils"

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

function LoadingLimitsHeader() {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-40 sm:h-9 sm:w-48" />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,156px)_minmax(0,180px)] lg:flex lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-2 sm:col-span-2 lg:hidden">
            <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
              Page
            </div>
            <div className="flex min-w-0 flex-1">
              <Skeleton className="h-8 min-w-0 flex-1 rounded-r-none" />
              <Skeleton className="h-8 min-w-0 flex-1 rounded-l-none border-l-0" />
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="flex items-center">
              <Skeleton className="h-9 w-[142px] rounded-r-none" />
              <Skeleton className="h-9 w-[102px] rounded-l-none border-l-0" />
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">
              Theme
            </div>
            <Skeleton className="h-8 min-w-0 flex-1 sm:h-9 sm:w-full lg:w-[196px]" />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:block">
            <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground sm:hidden">
              Refresh
            </div>
            <Skeleton className="h-8 min-w-0 flex-1 sm:h-9 sm:w-full lg:w-[116px]" />
          </div>
        </div>
      </div>
    </section>
  )
}

function LoadingLimitsAlerts() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border/70 bg-card/95 p-4"
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full max-w-[420px]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LoadingInventorySection() {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <LoadingSummaryGrid />
    </section>
  )
}

function LoadingLimitsTable() {
  return (
    <div className="rounded-lg border border-border/70">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="grid min-w-[1260px] grid-cols-[44px_minmax(220px,1.5fr)_88px_92px_minmax(180px,1fr)_minmax(180px,1fr)_88px_88px_88px_110px] gap-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full max-w-full" />
          ))}
        </div>
      </div>
      <div>
        {Array.from({ length: 6 }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid min-w-[1260px] grid-cols-[44px_minmax(220px,1.5fr)_88px_92px_minmax(180px,1fr)_minmax(180px,1fr)_88px_88px_88px_110px] gap-4 border-b border-border/70 px-4 py-4 last:border-b-0"
          >
            <Skeleton className="h-4 w-6 justify-self-center" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-16" />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-14 justify-self-end" />
            <Skeleton className="h-4 w-10 justify-self-end" />
            <Skeleton className="h-4 w-10 justify-self-end" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function LimitsPageSkeleton() {
  return (
    <ThemeProvider>
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
          <LoadingLimitsHeader />
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
          <LoadingInventorySection />
          <section className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <LoadingLimitsAlerts />
          </section>
          <section className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Card
              className={cn(TABLE_PANEL_HEIGHT, "border-border/70 bg-card/95")}
            >
              <CardHeader>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-32" />
              </CardHeader>
              <CardContent className="min-h-0 flex-1">
                <LoadingLimitsTable />
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </ThemeProvider>
  )
}
