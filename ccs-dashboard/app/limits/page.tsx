import { Suspense } from "react"

import { LimitsClient, LimitsPageSkeleton } from "@/components/limits-client"
import { getCachedLimitsPayload } from "@/lib/server-data"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LimitsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<LimitsPageSkeleton />}>
      <LimitsServerContent searchParams={searchParams} />
    </Suspense>
  )
}

async function LimitsServerContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const refreshKey =
    typeof params.refresh === "string" ? params.refresh : "initial"
  const limits = await getCachedLimitsPayload(refreshKey)

  return <LimitsClient limits={limits} refreshKey={refreshKey} />
}
