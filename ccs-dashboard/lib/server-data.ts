import { cacheLife, cacheTag } from "next/cache"

import { getDashboardPayload } from "@/lib/dashboard-service"
import { getLimitsPayload } from "@/lib/limits-service"
import type {
  DashboardPayload,
  DashboardQuery,
  LimitsPayload,
} from "@/lib/types"

export async function getCachedDashboardPayload(
  query: DashboardQuery
): Promise<DashboardPayload> {
  "use cache"
  cacheLife({
    stale: 15,
    revalidate: 15,
    expire: 60,
  })
  cacheTag("dashboard")

  return getDashboardPayload(query)
}

export async function getLimitsPayloadForRequest(): Promise<LimitsPayload> {
  return getLimitsPayload()
}
