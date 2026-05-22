import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeProvider } from "@/components/theme-provider"
import {
  TALL_PANEL_HEIGHT,
  TABLE_PANEL_HEIGHT,
} from "@/components/dashboard/dashboard-utils"

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
          <div className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
            Range
          </div>
          <Skeleton className="h-8 min-w-0 flex-1" />
        </div>

        <div className="hidden min-w-0 items-center gap-2 sm:flex lg:max-w-[680px]">
          <div className="shrink-0 text-xs font-medium text-muted-foreground">
            Range
          </div>
          <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
            {["w-44", "w-20"].map((width, index) => (
              <Skeleton key={index} className={`h-8 shrink-0 ${width}`} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
          <div className="flex min-w-0 items-center gap-2">
            <div className="w-10 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto">
              Date
            </div>
            <Skeleton className="h-8 min-w-0 flex-1 sm:w-[260px] sm:flex-none" />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="w-10 shrink-0 text-xs font-medium text-muted-foreground sm:w-auto">
              Group
            </div>
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

export function DashboardPageSkeleton() {
  return (
    <ThemeProvider>
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6 lg:py-8">
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
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
                  >
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
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
                  >
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
      </main>
    </ThemeProvider>
  )
}
