import { describe, expect, test } from "bun:test"

import {
  enqueueResetEvent,
  createResetEventId,
  extractDueResetGroups,
  evaluateResetTransition,
  getEmptyAccountState,
} from "../src/detect.ts"
import type { ResetEvent, WeeklyQuotaObservation } from "../src/types.ts"

function buildObservation(
  overrides: Partial<WeeklyQuotaObservation>
): WeeklyQuotaObservation {
  return {
    accountKey: "codex-a.json",
    accountLabel: "codex-a.json",
    planType: "plus",
    observedAt: "2026-05-24T10:10:00.000Z",
    remaining: 12,
    limit: 100,
    availablePercent: 12,
    resetAt: null,
    isFull: false,
    ...overrides,
  }
}

describe("evaluateResetTransition", () => {
  test("detects reset transition after confirmation", () => {
    const initialState = getEmptyAccountState()
    const nonFull = buildObservation({})
    const full1 = buildObservation({
      observedAt: "2026-05-24T10:20:00.000Z",
      remaining: 100,
      availablePercent: 100,
      isFull: true,
    })
    const full2 = buildObservation({
      observedAt: "2026-05-24T10:30:00.000Z",
      remaining: 100,
      availablePercent: 100,
      isFull: true,
    })

    const first = evaluateResetTransition({
      sourceName: "srv-02",
      current: nonFull,
      previousState: initialState,
      confirmationPolls: 2,
      tolerancePercent: 0,
    })
    const second = evaluateResetTransition({
      sourceName: "srv-02",
      current: full1,
      previousState: first.nextState,
      confirmationPolls: 2,
      tolerancePercent: 0,
    })
    const third = evaluateResetTransition({
      sourceName: "srv-02",
      current: full2,
      previousState: second.nextState,
      confirmationPolls: 2,
      tolerancePercent: 0,
    })

    expect(second.event).toBeNull()
    expect(third.event).not.toBeNull()
    expect(third.event?.before.remaining).toBe(12)
    expect(third.event?.after.remaining).toBe(100)
    expect(third.event?.eventId).toBe(
      "srv-02:codex.limit.reset:codex-a.json:2026-05-24T10:30"
    )
  })

  test("does not duplicate while quota stays full", () => {
    const nonFull = buildObservation({})
    const full1 = buildObservation({
      observedAt: "2026-05-24T10:20:00.000Z",
      remaining: 100,
      availablePercent: 100,
      isFull: true,
    })
    const full2 = buildObservation({
      observedAt: "2026-05-24T10:30:00.000Z",
      remaining: 100,
      availablePercent: 100,
      isFull: true,
    })
    const full3 = buildObservation({
      observedAt: "2026-05-24T10:40:00.000Z",
      remaining: 100,
      availablePercent: 100,
      isFull: true,
    })

    const first = evaluateResetTransition({
      sourceName: "srv-02",
      current: nonFull,
      previousState: getEmptyAccountState(),
      confirmationPolls: 2,
      tolerancePercent: 0,
    })
    const second = evaluateResetTransition({
      sourceName: "srv-02",
      current: full1,
      previousState: first.nextState,
      confirmationPolls: 2,
      tolerancePercent: 0,
    })
    const third = evaluateResetTransition({
      sourceName: "srv-02",
      current: full2,
      previousState: second.nextState,
      confirmationPolls: 2,
      tolerancePercent: 0,
    })
    const acknowledgedState = {
      ...third.nextState,
      pendingReset: null,
      lastEmittedEventId: third.event?.eventId ?? null,
    }
    const fourth = evaluateResetTransition({
      sourceName: "srv-02",
      current: full3,
      previousState: acknowledgedState,
      confirmationPolls: 2,
      tolerancePercent: 0,
    })

    expect(third.event).not.toBeNull()
    expect(fourth.event).toBeNull()
  })

  test("builds stable idempotency key", () => {
    expect(
      createResetEventId(
        "srv-02",
        "codex-a.json",
        "2026-05-24T10:15:43.123Z"
      )
    ).toBe("srv-02:codex.limit.reset:codex-a.json:2026-05-24T10:15")
  })

  test("groups resets within 30 minutes into one webhook batch", () => {
    const firstEvent: ResetEvent = {
      eventId: "e1",
      accountKey: "codex-a",
      accountLabel: "Account A",
      planType: "plus",
      detectedAt: "2026-05-24T08:30:00.000Z",
      previousObservationAt: "2026-05-24T08:20:00.000Z",
      before: { remaining: 20, limit: 100, availablePercent: 20 },
      after: { remaining: 100, limit: 100, availablePercent: 100 },
      confidence: "high",
      reason: "remaining quota jumped from partial to full",
    }
    const secondEvent: ResetEvent = {
      eventId: "e2",
      accountKey: "codex-b",
      accountLabel: "Account B",
      planType: "team",
      detectedAt: "2026-05-24T08:59:00.000Z",
      previousObservationAt: "2026-05-24T08:50:00.000Z",
      before: { remaining: 10, limit: 100, availablePercent: 10 },
      after: { remaining: 100, limit: 100, availablePercent: 100 },
      confidence: "high",
      reason: "remaining quota jumped from partial to full",
    }

    const grouped = enqueueResetEvent({
      sourceName: "srv-02",
      groupWindowMinutes: 30,
      event: secondEvent,
      groups: enqueueResetEvent({
        sourceName: "srv-02",
        groupWindowMinutes: 30,
        event: firstEvent,
        groups: [],
      }),
    })

    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.events).toHaveLength(2)
  })

  test("separates groups when gap is more than 30 minutes", () => {
    const firstEvent: ResetEvent = {
      eventId: "e1",
      accountKey: "codex-a",
      accountLabel: "Account A",
      planType: "plus",
      detectedAt: "2026-05-24T08:30:00.000Z",
      previousObservationAt: "2026-05-24T08:20:00.000Z",
      before: { remaining: 20, limit: 100, availablePercent: 20 },
      after: { remaining: 100, limit: 100, availablePercent: 100 },
      confidence: "high",
      reason: "remaining quota jumped from partial to full",
    }
    const secondEvent: ResetEvent = {
      eventId: "e2",
      accountKey: "codex-b",
      accountLabel: "Account B",
      planType: "team",
      detectedAt: "2026-05-24T09:05:00.000Z",
      previousObservationAt: "2026-05-24T08:55:00.000Z",
      before: { remaining: 10, limit: 100, availablePercent: 10 },
      after: { remaining: 100, limit: 100, availablePercent: 100 },
      confidence: "high",
      reason: "remaining quota jumped from partial to full",
    }

    const grouped = enqueueResetEvent({
      sourceName: "srv-02",
      groupWindowMinutes: 30,
      event: secondEvent,
      groups: enqueueResetEvent({
        sourceName: "srv-02",
        groupWindowMinutes: 30,
        event: firstEvent,
        groups: [],
      }),
    })

    expect(grouped).toHaveLength(2)
  })

  test("flushes due groups only after the grouping window closes", () => {
    const groups = [
      {
        groupId: "g1",
        firstDetectedAt: "2026-05-24T08:30:00.000Z",
        lastDetectedAt: "2026-05-24T08:59:00.000Z",
        events: [
          {
            eventId: "e1",
            accountKey: "codex-a",
            accountLabel: "Account A",
            planType: "plus",
            detectedAt: "2026-05-24T08:59:00.000Z",
            previousObservationAt: "2026-05-24T08:50:00.000Z",
            before: { remaining: 10, limit: 100, availablePercent: 10 },
            after: { remaining: 100, limit: 100, availablePercent: 100 },
            confidence: "high" as const,
            reason: "remaining quota jumped from partial to full",
          },
        ],
      },
    ]

    const early = extractDueResetGroups({
      nowIso: "2026-05-24T09:20:00.000Z",
      groupWindowMinutes: 30,
      groups,
    })
    const due = extractDueResetGroups({
      nowIso: "2026-05-24T09:29:00.000Z",
      groupWindowMinutes: 30,
      groups,
    })

    expect(early.dueGroups).toHaveLength(0)
    expect(due.dueGroups).toHaveLength(1)
  })
})
