"use server"

import { updateTag } from "next/cache"

import { refreshLimitsPayload } from "@/lib/limits-service"

export async function refreshDashboard() {
  updateTag("dashboard")
}

export async function refreshLimits() {
  await refreshLimitsPayload()
}
