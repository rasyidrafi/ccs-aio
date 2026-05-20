"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChartColumnBig, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/", label: "Dashboard", icon: ChartColumnBig },
  { href: "/limits", label: "Limits", icon: ShieldAlert },
]

export function ConsoleTabs({ className }: { className?: string }) {
  const pathname = usePathname()

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {ITEMS.map((item) => {
        const active = pathname === item.href
        const Icon = item.icon

        return (
          <Button key={item.href} asChild variant={active ? "secondary" : "outline"} className="h-8 min-w-0 flex-1 sm:flex-none">
            <Link href={item.href} aria-current={active ? "page" : undefined}>
              <Icon className="size-4" />
              {item.label}
            </Link>
          </Button>
        )
      })}
    </div>
  )
}
