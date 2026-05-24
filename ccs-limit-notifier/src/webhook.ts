import { createHmac } from "node:crypto"

import type {
  GroupedResetEvent,
  NotifierConfig,
  ResetWebhookPayload,
} from "./types.ts"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function signRawBody(secret: string, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex")
  return `sha256=${digest}`
}

export function buildResetWebhookPayload(
  config: NotifierConfig,
  group: GroupedResetEvent
): ResetWebhookPayload {
  const beforeRemaining = group.events.reduce(
    (sum, event) => sum + event.before.remaining,
    0
  )
  const beforeLimit = group.events.reduce(
    (sum, event) => sum + event.before.limit,
    0
  )
  const afterRemaining = group.events.reduce(
    (sum, event) => sum + event.after.remaining,
    0
  )
  const afterLimit = group.events.reduce(
    (sum, event) => sum + event.after.limit,
    0
  )
  const beforePercent = beforeLimit > 0 ? (beforeRemaining / beforeLimit) * 100 : 0
  const afterPercent = afterLimit > 0 ? (afterRemaining / afterLimit) * 100 : 0
  const previousObservationAt = group.events
    .map((event) => event.previousObservationAt)
    .sort()[0]
  const labels = group.events.map((event) => event.accountLabel)

  return {
    event: "codex.limit.reset",
    source: config.sourceName,
    timestamp: group.lastDetectedAt,
    observed_reset: {
      detected_at: group.lastDetectedAt,
      previous_observation_at: previousObservationAt,
      confidence: group.events.length > 1 ? "high" : group.events[0]?.confidence ?? "medium",
      reason:
        group.events.length > 1
          ? "multiple paid Codex accounts reset within the grouping window"
          : group.events[0]?.reason ?? "remaining quota jumped from partial to full",
    },
    period: {
      kind: "weekly",
      timezone: config.resetTimezone,
    },
    before: {
      remaining: beforeRemaining,
      limit: beforeLimit,
      available_percent: Math.round(beforePercent * 100) / 100,
    },
    after: {
      remaining: afterRemaining,
      limit: afterLimit,
      available_percent: Math.round(afterPercent * 100) / 100,
    },
    subject: {
      app: config.subjectApp,
      environment: config.subjectEnvironment,
      machine: config.machineName,
    },
    details: {
      message:
        group.events.length > 1
          ? "Multiple Codex paid accounts appear to have reset to full capacity."
          : "Codex weekly limit appears to have reset to full capacity.",
      dashboard_url: config.dashboardUrl,
      grouped: group.events.length > 1,
      account_count: group.events.length,
      account_labels: labels,
    },
    accounts: group.events.map((event) => ({
      account_key: event.accountKey,
      account_label: event.accountLabel,
      plan_type: event.planType,
      detected_at: event.detectedAt,
      previous_observation_at: event.previousObservationAt,
      before: {
        remaining: event.before.remaining,
        limit: event.before.limit,
        available_percent: event.before.availablePercent,
      },
      after: {
        remaining: event.after.remaining,
        limit: event.after.limit,
        available_percent: event.after.availablePercent,
      },
    })),
    grouping: {
      window_minutes: config.resetGroupWindowMinutes,
      first_detected_at: group.firstDetectedAt,
      last_detected_at: group.lastDetectedAt,
    },
  }
}

function shouldRetryStatus(status: number): boolean {
  return status >= 500 && status <= 599
}

export async function postResetWebhook(
  config: NotifierConfig,
  group: GroupedResetEvent,
  fetchImpl: typeof fetch = fetch
): Promise<{ status: number; rawBody: string }> {
  const payload = buildResetWebhookPayload(config, group)
  const rawBody = JSON.stringify(payload)
  const signature = signRawBody(config.webhookSecret, rawBody)

  let lastError: Error | null = null
  let lastStatus = 0

  for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(config.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
          "X-Event-Type": "codex.limit.reset",
          "X-Idempotency-Key": group.groupId,
        },
        body: rawBody,
      })

      lastStatus = response.status
      if (response.status === 202 || response.status === 409) {
        return { status: response.status, rawBody }
      }
      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 409
      ) {
        throw new Error(`Webhook rejected with HTTP ${response.status}`)
      }
      if (!shouldRetryStatus(response.status)) {
        throw new Error(`Webhook failed with HTTP ${response.status}`)
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Webhook failed")
      if (attempt >= config.retryAttempts) break
      await sleep(config.retryBaseDelayMs * 2 ** (attempt - 1))
      continue
    }
  }

  if (lastError) {
    throw lastError
  }
  throw new Error(`Webhook failed with HTTP ${lastStatus}`)
}
