import { BudgetsClient, BudgetsPageSkeleton } from "@/components/budgets-client"
import { Suspense } from "react"

export default function BudgetsPage() {
  return (
    <Suspense fallback={<BudgetsPageSkeleton />}>
      <BudgetsClient />
    </Suspense>
  )
}
