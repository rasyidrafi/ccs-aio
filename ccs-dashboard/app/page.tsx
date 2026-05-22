import { Suspense } from "react"

import {
  DashboardClient,
  DashboardPageSkeleton,
} from "@/components/dashboard-client"
import { parseDashboardQuery } from "@/lib/dashboard-service"
import { getCachedDashboardPayload } from "@/lib/server-data"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function toUrlSearchParams(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      searchParams.set(key, value)
    }
  }

  return searchParams
}

export default async function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <DashboardServerContent searchParams={searchParams} />
    </Suspense>
  )
}

async function DashboardServerContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = parseDashboardQuery(toUrlSearchParams(params))
  const dashboard = await getCachedDashboardPayload(query)

  return <DashboardClient dashboard={dashboard} query={query} />
}
