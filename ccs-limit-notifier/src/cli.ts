import {
  enqueueResetEvent,
  evaluateResetTransition,
  extractDueResetGroups,
} from "./detect.ts"
import { getWeeklyQuotaObservations } from "./codex.ts"
import { resolveConfig } from "./config.ts"
import { loadResetState, saveResetState } from "./state.ts"
import { postResetWebhook } from "./webhook.ts"

async function runCheckReset(): Promise<void> {
  const config = await resolveConfig()
  const state = await loadResetState(config.stateDir)
  const observations = await getWeeklyQuotaObservations(config)

  for (const observation of observations) {
    const previousState = state.accounts[observation.accountKey] ?? null
    const evaluation = evaluateResetTransition({
      sourceName: config.sourceName,
      current: observation,
      previousState,
      confirmationPolls: config.resetConfirmationPolls,
      tolerancePercent: config.resetFullTolerancePercent,
    })

    state.accounts[observation.accountKey] = evaluation.nextState
    await saveResetState(config.stateDir, state)

    if (!evaluation.event) {
      continue
    }

    state.pendingGroups = enqueueResetEvent({
      sourceName: config.sourceName,
      groupWindowMinutes: config.resetGroupWindowMinutes,
      event: evaluation.event,
      groups: state.pendingGroups,
    })
    state.accounts[observation.accountKey] = {
      ...evaluation.nextState,
      pendingReset: null,
      lastEmittedEventId: evaluation.event.eventId,
    }
    await saveResetState(config.stateDir, state)
  }

  const { dueGroups, pendingGroups } = extractDueResetGroups({
    nowIso: new Date().toISOString(),
    groupWindowMinutes: config.resetGroupWindowMinutes,
    groups: state.pendingGroups,
  })
  state.pendingGroups = pendingGroups
  await saveResetState(config.stateDir, state)

  for (const group of dueGroups) {
    const response = await postResetWebhook(config, group)
    if (response.status === 202 || response.status === 409) {
      state.pendingGroups = state.pendingGroups.filter(
        (pendingGroup) => pendingGroup.groupId !== group.groupId
      )
      await saveResetState(config.stateDir, state)
    }
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] || "check-reset"

  switch (command) {
    case "check-reset":
      await runCheckReset()
      break
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
