"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChartColumnBig, ShieldAlert, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/", label: "Dashboard", icon: ChartColumnBig },
  { href: "/limits", label: "Limits", icon: ShieldAlert },
  { href: "/budgets", label: "Budgets", icon: Wallet },
]

export function ConsoleTabs({ className }: { className?: string }) {
  const pathname = usePathname()

  return (
    <ButtonGroup className={cn("flex min-w-0 items-center", className)}>
      {ITEMS.map((item) => {
        const active = pathname === item.href
        const Icon = item.icon

        return (
          <Button
            key={item.href}
            asChild
            variant="outline"
            className={cn(
              "h-8 min-w-0 flex-1 sm:flex-none",
              active && "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            <Link href={item.href} aria-current={active ? "page" : undefined}>
              <Icon className="size-4" />
              {item.label}
            </Link>
          </Button>
        )
      })}
    </ButtonGroup>
  )
}
