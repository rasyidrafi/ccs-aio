import { describe, expect, test } from "bun:test"

import { buildResetWebhookPayload, signRawBody } from "../src/webhook.ts"
import type { GroupedResetEvent, NotifierConfig } from "../src/types.ts"

const config: NotifierConfig = {
  ccsDir: "/tmp/.ccs",
  authDir: "/tmp/.ccs/cliproxy/auth",
  managementUrl: "http://127.0.0.1:8097",
  managementSecret: "ccs",
  webhookUrl: "https://webhook.r45.dev/test",
  webhookSecret: "topsecret",
  stateDir: "/tmp/.ccs-limit-notifier",
  resetConfirmationPolls: 2,
  resetFullTolerancePercent: 0,
  resetGroupWindowMinutes: 30,
  resetTimezone: "Asia/Jakarta",
  sourceName: "srv-02",
  subjectApp: "ccs-limit-notifier",
  subjectEnvironment: "production",
  machineName: "srv-02",
  dashboardUrl: "http://127.0.0.1:3000/limits",
  retryAttempts: 3,
  retryBaseDelayMs: 100,
}

const group: GroupedResetEvent = {
  groupId: "srv-02:codex.limit.reset.group:2026-05-24T10:15",
  firstDetectedAt: "2026-05-24T10:15:00.000Z",
  lastDetectedAt: "2026-05-24T10:15:00.000Z",
  events: [
    {
      eventId: "srv-02:codex.limit.reset:codex-a:2026-05-24T10:15",
      accountKey: "codex-a",
      accountLabel: "codex-a",
      planType: "plus",
      detectedAt: "2026-05-24T10:15:00.000Z",
      previousObservationAt: "2026-05-24T10:10:00.000Z",
      before: {
        remaining: 12,
        limit: 100,
        availablePercent: 12,
      },
      after: {
        remaining: 100,
        limit: 100,
        availablePercent: 100,
      },
      confidence: "high",
      reason: "remaining quota jumped from partial to full",
    },
  ],
}

describe("webhook", () => {
  test("generates stable signature for exact raw body", () => {
    const payload = buildResetWebhookPayload(config, group)
    const rawBody = JSON.stringify(payload)

    expect(signRawBody("topsecret", rawBody)).toBe(
      "sha256=5682405eefa8862322883c18f5fa527969255a0c36d7a08ae5290b674fe7a865"
    )
  })
})
