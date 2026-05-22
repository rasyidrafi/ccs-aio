"use server"

import { updateTag } from "next/cache"

export async function refreshDashboard() {
  updateTag("dashboard")
}

export async function refreshLimits() {
  updateTag("limits")
}
