import { afterAll, describe, expect, test } from "bun:test"

import { postResetWebhook } from "../src/webhook.ts"
import type { GroupedResetEvent, NotifierConfig } from "../src/types.ts"

let receivedRequest: {
  headers: Headers
  body: string
} | null = null

const server = Bun.serve({
  port: 0,
  fetch: async (request) => {
    receivedRequest = {
      headers: request.headers,
      body: await request.text(),
    }

    return new Response(null, { status: 202 })
  },
})

afterAll(() => {
  server.stop(true)
})

describe("postResetWebhook", () => {
  test("delivers signed webhook successfully", async () => {
    const config: NotifierConfig = {
      ccsDir: "/tmp/.ccs",
      authDir: "/tmp/.ccs/cliproxy/auth",
      managementUrl: "http://127.0.0.1:8097",
      managementSecret: "ccs",
      webhookUrl: `http://127.0.0.1:${server.port}/triggers/codex-limit-reset`,
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
      dashboardUrl: undefined,
      retryAttempts: 2,
      retryBaseDelayMs: 10,
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

    const response = await postResetWebhook(config, group)

    expect(response.status).toBe(202)
    expect(receivedRequest?.headers.get("x-event-type")).toBe("codex.limit.reset")
    expect(receivedRequest?.headers.get("x-idempotency-key")).toBe(
      group.groupId
    )
    expect(receivedRequest?.headers.get("x-hub-signature-256")).toMatch(
      /^sha256=/
    )
    expect(receivedRequest?.body).toContain('"event":"codex.limit.reset"')
    expect(receivedRequest?.body).toContain('"accounts"')
  })
})
