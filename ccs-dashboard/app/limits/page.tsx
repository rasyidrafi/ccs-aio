import { Suspense } from "react"
import { connection } from "next/server"

import { LimitsClient, LimitsPageSkeleton } from "@/components/limits-client"
import { getCachedLimitsPayload } from "@/lib/server-data"

export default function LimitsPage() {
  return (
    <Suspense fallback={<LimitsPageSkeleton />}>
      <LimitsServerContent />
    </Suspense>
  )
}

async function LimitsServerContent() {
  await connection()
  const limits = await getCachedLimitsPayload()

  return <LimitsClient limits={limits} />
}
