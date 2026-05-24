import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ResetState } from "./types.ts"

function getDefaultState(): ResetState {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    accounts: {},
    pendingGroups: [],
  }
}

export function resolveStateFilePath(stateDir: string): string {
  return path.join(stateDir, "state", "reset-state.json")
}

export async function loadResetState(stateDir: string): Promise<ResetState> {
  const filePath = resolveStateFilePath(stateDir)

  try {
    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw) as Partial<ResetState>
    if (parsed.version !== 1 || !parsed.accounts) {
      return getDefaultState()
    }

    return {
      version: 1,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date(0).toISOString(),
      accounts: parsed.accounts,
      pendingGroups: Array.isArray(parsed.pendingGroups)
        ? parsed.pendingGroups
        : [],
    }
  } catch {
    return getDefaultState()
  }
}

export async function saveResetState(
  stateDir: string,
  state: ResetState
): Promise<void> {
  const filePath = resolveStateFilePath(stateDir)
  const directory = path.dirname(filePath)
  await mkdir(directory, { recursive: true })

  const nextState: ResetState = {
    ...state,
    version: 1,
    updatedAt: new Date().toISOString(),
  }

  const tempFilePath = `${filePath}.tmp`
  await writeFile(tempFilePath, JSON.stringify(nextState, null, 2))
  await rename(tempFilePath, filePath)
}
