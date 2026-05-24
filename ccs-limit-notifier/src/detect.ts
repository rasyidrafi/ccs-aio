import type {
  AccountResetState,
  GroupedResetEvent,
  PendingReset,
  PendingResetGroup,
  ResetEvent,
  WeeklyQuotaObservation,
} from "./types.ts"

export function createResetEventId(
  sourceName: string,
  accountKey: string,
  detectedAt: string
): string {
  const minute = detectedAt.slice(0, 16)
  return `${sourceName}:codex.limit.reset:${accountKey}:${minute}`
}

export function createResetGroupId(
  sourceName: string,
  detectedAt: string
): string {
  const minute = detectedAt.slice(0, 16)
  return `${sourceName}:codex.limit.reset.group:${minute}`
}

function buildConfidence(
  confirmationPolls: number,
  tolerancePercent: number
): "low" | "medium" | "high" {
  if (confirmationPolls >= 2) return "high"
  if (tolerancePercent > 0) return "low"
  return "medium"
}

function clonePendingReset(pending: PendingReset | null): PendingReset | null {
  return pending ? { ...pending, before: { ...pending.before } } : null
}

function cloneObservation(
  observation: WeeklyQuotaObservation | null
): WeeklyQuotaObservation | null {
  return observation ? { ...observation } : null
}

export function getEmptyAccountState(): AccountResetState {
  return {
    lastObservation: null,
    pendingReset: null,
    lastEmittedEventId: null,
  }
}

export function evaluateResetTransition(args: {
  sourceName: string
  current: WeeklyQuotaObservation
  previousState: AccountResetState | null | undefined
  confirmationPolls: number
  tolerancePercent: number
}): {
  nextState: AccountResetState
  event: ResetEvent | null
} {
  const state = args.previousState
    ? {
        lastObservation: cloneObservation(args.previousState.lastObservation),
        pendingReset: clonePendingReset(args.previousState.pendingReset),
        lastEmittedEventId: args.previousState.lastEmittedEventId,
      }
    : getEmptyAccountState()

  const previousObservation = state.lastObservation
  let pendingReset = state.pendingReset

  if (!args.current.isFull) {
    return {
      nextState: {
        lastObservation: { ...args.current },
        pendingReset: null,
        lastEmittedEventId: state.lastEmittedEventId,
      },
      event: null,
    }
  }

  if (previousObservation && !previousObservation.isFull) {
    pendingReset = {
      firstFullObservedAt: args.current.observedAt,
      consecutiveFullObservations: 1,
      before: { ...previousObservation },
      detectedAt:
        args.confirmationPolls <= 1 ? args.current.observedAt : undefined,
    }
  } else if (previousObservation?.isFull && pendingReset) {
    pendingReset = {
      ...pendingReset,
      consecutiveFullObservations: pendingReset.consecutiveFullObservations + 1,
    }
  }

  if (
    pendingReset &&
    !pendingReset.detectedAt &&
    pendingReset.consecutiveFullObservations >= args.confirmationPolls
  ) {
    pendingReset = {
      ...pendingReset,
      detectedAt: args.current.observedAt,
    }
  }

  const nextState: AccountResetState = {
    lastObservation: { ...args.current },
    pendingReset,
    lastEmittedEventId: state.lastEmittedEventId,
  }

  if (!pendingReset?.detectedAt) {
    return {
      nextState,
      event: null,
    }
  }

  const eventId = createResetEventId(
    args.sourceName,
    args.current.accountKey,
    pendingReset.detectedAt
  )
  if (state.lastEmittedEventId === eventId) {
    return {
      nextState: {
        ...nextState,
        pendingReset: null,
      },
      event: null,
    }
  }

  return {
    nextState,
      event: {
        eventId,
        accountKey: args.current.accountKey,
        accountLabel: args.current.accountLabel,
        planType: args.current.planType,
        detectedAt: pendingReset.detectedAt,
        previousObservationAt: pendingReset.before.observedAt,
        before: {
        remaining: pendingReset.before.remaining,
        limit: pendingReset.before.limit,
        availablePercent: pendingReset.before.availablePercent,
      },
      after: {
        remaining: args.current.remaining,
        limit: args.current.limit,
        availablePercent: args.current.availablePercent,
      },
      confidence: buildConfidence(
        args.confirmationPolls,
        args.tolerancePercent
      ),
      reason: "remaining quota jumped from partial to full",
    },
  }
}

function diffMinutes(leftIso: string, rightIso: string): number {
  return Math.abs(
    new Date(leftIso).getTime() - new Date(rightIso).getTime()
  ) / 60_000
}

export function enqueueResetEvent(args: {
  sourceName: string
  groupWindowMinutes: number
  event: ResetEvent
  groups: PendingResetGroup[]
}): PendingResetGroup[] {
  const groups = args.groups.map((group) => ({
    ...group,
    events: group.events.map((event) => ({ ...event })),
  }))
  const matchingGroup = groups.find(
    (group) =>
      diffMinutes(group.lastDetectedAt, args.event.detectedAt) <=
      args.groupWindowMinutes
  )

  if (!matchingGroup) {
    return [
      ...groups,
      {
        groupId: createResetGroupId(args.sourceName, args.event.detectedAt),
        firstDetectedAt: args.event.detectedAt,
        lastDetectedAt: args.event.detectedAt,
        events: [{ ...args.event }],
      },
    ]
  }

  if (!matchingGroup.events.some((event) => event.eventId === args.event.eventId)) {
    matchingGroup.events.push({ ...args.event })
  }
  matchingGroup.lastDetectedAt = args.event.detectedAt

  return groups
}

export function extractDueResetGroups(args: {
  nowIso: string
  groupWindowMinutes: number
  groups: PendingResetGroup[]
}): {
  dueGroups: GroupedResetEvent[]
  pendingGroups: PendingResetGroup[]
} {
  const dueGroups: GroupedResetEvent[] = []
  const pendingGroups: PendingResetGroup[] = []

  for (const group of args.groups) {
    const idleMinutes = diffMinutes(args.nowIso, group.lastDetectedAt)
    if (idleMinutes >= args.groupWindowMinutes) {
      dueGroups.push({
        groupId: group.groupId,
        firstDetectedAt: group.firstDetectedAt,
        lastDetectedAt: group.lastDetectedAt,
        events: group.events.map((event) => ({ ...event })),
      })
      continue
    }

    pendingGroups.push({
      ...group,
      events: group.events.map((event) => ({ ...event })),
    })
  }

  return { dueGroups, pendingGroups }
}
