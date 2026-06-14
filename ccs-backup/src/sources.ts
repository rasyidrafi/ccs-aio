import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ResolvedConfig } from '@/config';
import {
  mergeEvents,
  normalizeLiveResponse,
  normalizeSnapshotDetails,
  normalizeUsageQueueResponse,
} from '@/events';
import type { SyncSourceResult, UsageEventRecord } from '@/types';

export type SyncSourceMode = 'live' | 'snapshot' | 'all';

const USAGE_QUEUE_BATCH_SIZE = 1000;
const USAGE_QUEUE_MAX_BATCHES = 100;
const USAGE_QUEUE_DRAIN_TIMEOUT_MS = 30_000;

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

async function loadLegacyLiveEvents(config: ResolvedConfig): Promise<UsageEventRecord[]> {
  const payload = await fetchJson<unknown>(
    `${config.managementUrl}/v0/management/usage`,
    config.managementSecret
  );
  return normalizeLiveResponse(payload as any);
}

async function loadUsageQueueEvents(config: ResolvedConfig): Promise<UsageEventRecord[]> {
  const records: unknown[] = [];
  const seenFullBatchSignatures = new Set<string>();
  const drainStartedAt = Date.now();

  for (let batchCount = 0; batchCount < USAGE_QUEUE_MAX_BATCHES; batchCount += 1) {
    const batch = await fetchJson<unknown[]>(
      `${config.managementUrl}/v0/management/usage-queue?count=${USAGE_QUEUE_BATCH_SIZE}`,
      config.managementSecret
    );

    if (!Array.isArray(batch)) {
      throw new Error('usage-queue did not return an array');
    }

    if (batch.length === USAGE_QUEUE_BATCH_SIZE) {
      const signature = JSON.stringify(batch);
      if (seenFullBatchSignatures.has(signature)) {
        throw new Error('usage-queue repeated a full batch while draining');
      }
      seenFullBatchSignatures.add(signature);
    }

    records.push(...batch);

    if (batch.length < USAGE_QUEUE_BATCH_SIZE) {
      return normalizeUsageQueueResponse(records);
    }

    if (Date.now() - drainStartedAt >= USAGE_QUEUE_DRAIN_TIMEOUT_MS) {
      throw new Error('usage-queue draining exceeded timeout');
    }
  }

  throw new Error('usage-queue exceeded maximum drain batches');
}

export async function loadLiveSource(config: ResolvedConfig): Promise<SyncSourceResult> {
  const errors: string[] = [];

  try {
    const events = await loadLegacyLiveEvents(config);
    if (events.length > 0) {
      return {
        source: 'live',
        ok: true,
        eventCount: events.length,
        events,
      };
    }
    errors.push('legacy usage endpoint returned no request details');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown legacy live source error');
  }

  try {
    const events = await loadUsageQueueEvents(config);
    return {
      source: 'live',
      ok: true,
      eventCount: events.length,
      events,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown usage-queue source error');
  }

  return {
    source: 'live',
    ok: false,
    eventCount: 0,
    events: [],
    message: errors.join('; '),
  };
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
