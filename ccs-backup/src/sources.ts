import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ResolvedConfig } from '@/config';
import { mergeEvents, normalizeLiveResponse, normalizeSnapshotDetails } from '@/events';
import type { SyncSourceResult, UsageEventRecord } from '@/types';

interface SnapshotPayload {
  details?: Array<{
    provider?: string;
    model?: string;
    timestamp?: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    requestCount?: number;
    cost?: number;
    failed?: boolean;
  }>;
}

async function fetchJson<T>(url: string, secret: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadLiveSource(config: ResolvedConfig): Promise<SyncSourceResult> {
  try {
    const payload = await fetchJson<unknown>(
      `${config.managementUrl}/v0/management/usage`,
      config.managementSecret
    );
    const events = normalizeLiveResponse(payload as any);
    return {
      source: 'live',
      ok: true,
      eventCount: events.length,
      events,
    };
  } catch (error) {
    return {
      source: 'live',
      ok: false,
      eventCount: 0,
      events: [],
      message: error instanceof Error ? error.message : 'Unknown live source error',
    };
  }
}

export async function loadSnapshotSource(config: ResolvedConfig): Promise<SyncSourceResult> {
  const snapshotPath = path.join(config.ccsDir, 'cache', 'cliproxy-usage', 'latest.json');

  try {
    const text = await readFile(snapshotPath, 'utf8');
    const payload = JSON.parse(text) as SnapshotPayload;
    const events = normalizeSnapshotDetails(Array.isArray(payload.details) ? payload.details : []);
    return {
      source: 'snapshot',
      ok: true,
      eventCount: events.length,
      events,
    };
  } catch (error) {
    return {
      source: 'snapshot',
      ok: false,
      eventCount: 0,
      events: [],
      message: error instanceof Error ? error.message : 'Unknown snapshot source error',
    };
  }
}

export function mergeSourceEvents(results: SyncSourceResult[]): UsageEventRecord[] {
  return mergeEvents(results.flatMap((result) => result.events));
}
