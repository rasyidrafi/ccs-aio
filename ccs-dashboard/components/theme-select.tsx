"use client"

import { useEffect, useState } from "react"
import { MoonStar, SunMedium } from "lucide-react"
import { useTheme } from "next-themes"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const

export function ThemeSelect({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const value = mounted ? theme ?? "system" : "system"
  const label = THEME_OPTIONS.find((option) => option.value === value)?.label ?? "System"
  const icon = resolvedTheme === "dark" ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />

  return (
    <Select
      value={value}
      onValueChange={(nextValue: string | null) => {
        if (!nextValue) return
        setTheme(nextValue)
      }}
    >
      <SelectTrigger className={cn("w-full min-w-36 sm:w-[156px]", className)}>
        {icon}
        <span className="truncate">{label}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Theme</SelectLabel>
          {THEME_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
