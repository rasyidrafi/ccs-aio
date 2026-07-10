import { createHash } from 'node:crypto';

import { calculatePricing } from '@/pricing';
import type { SourceKind, UsageEventRecord } from '@/types';

interface SnapshotDetail {
  provider?: string;
  model?: string;
  timestamp?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  requestCount?: number;
  cost?: number;
  failed?: boolean;
}

interface LiveUsageResponse {
  usage?: {
    apis?: Record<
      string,
      {
        models?: Record<
          string,
          {
            details?: Array<{
              timestamp?: string;
              failed?: boolean;
              tokens?: {
                input_tokens?: number;
                output_tokens?: number;
                cached_tokens?: number;
                cache_creation_tokens?: number;
              };
            }>;
          }
        >;
      }
    >;
  };
}

interface UsageQueueRecord {
  timestamp?: unknown;
  provider?: unknown;
  model?: unknown;
  alias?: unknown;
  api_key?: unknown;
  executor_type?: unknown;
  endpoint?: unknown;
  request_id?: unknown;
  service_tier?: unknown;
  tokens?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    cached_tokens?: unknown;
    cache_read_tokens?: unknown;
    cache_creation_tokens?: unknown;
  } | null;
  failed?: unknown;
}

function toNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 8);
}

function queueRecordProviderKey(record: UsageQueueRecord): string {
  const rawApiKey = toTrimmedString(record.api_key);
  if (rawApiKey) {
    return `api-key:${hashApiKey(rawApiKey)}`;
  }

  const provider = toTrimmedString(record.provider);
  if (provider.startsWith('api-key:')) {
    return provider;
  }

  return '';
}

export function buildEventKey(event: Omit<UsageEventRecord, 'eventKey'>): string {
  return [
    event.providerKey,
    event.model,
    event.timestamp,
    event.inputTokens,
    event.outputTokens,
    event.cacheReadTokens,
    event.requestCount,
    event.failed ? '1' : '0',
  ].join('|');
}

function normalizeBase(
  source: SourceKind,
  providerKey: string,
  provider: string,
  serviceTier: string,
  endpoint: string,
  requestId: string,
  model: string,
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  requestCount: number,
  sourceCost: number,
  failed: boolean
): UsageEventRecord | null {
  const timestampMs = Date.parse(timestamp);
  if (!providerKey.startsWith('api-key:') || !model || !Number.isFinite(timestampMs)) {
    return null;
  }

  const pricing = calculatePricing({
    model,
    provider,
    serviceTier,
    inputTokens,
    outputTokens,
    cachedInputTokens: cacheReadTokens,
    cacheCreationTokens,
    sourceCost,
  });
  const event: Omit<UsageEventRecord, 'eventKey'> = {
    providerKey,
    provider: pricing.provider,
    serviceTier: pricing.serviceTier,
    endpoint,
    requestId,
    model,
    timestamp,
    timestampMs,
    inputTokens: Math.max(0, Math.trunc(inputTokens)),
    outputTokens: Math.max(0, Math.trunc(outputTokens)),
    cacheReadTokens: Math.max(0, Math.trunc(cacheReadTokens)),
    cacheCreationTokens: Math.max(0, Math.trunc(cacheCreationTokens)),
    uncachedInputTokens: pricing.uncachedInputTokens,
    requestCount: Math.max(1, Math.trunc(requestCount)),
    sourceCost: Number.isFinite(sourceCost) ? sourceCost : 0,
    inputCost: pricing.inputCost,
    cachedInputCost: pricing.cachedInputCost,
    cacheCreationCost: pricing.cacheCreationCost,
    outputCost: pricing.outputCost,
    cost: pricing.cost,
    pricingVersion: pricing.pricingVersion,
    pricingConfidence: pricing.pricingConfidence,
    pricingContextTier: pricing.pricingContextTier,
    failed,
    liveSeen: source === 'live',
    snapshotSeen: source === 'snapshot',
  };

  return { ...event, eventKey: buildEventKey(event) };
}

export function normalizeSnapshotDetails(details: SnapshotDetail[]): UsageEventRecord[] {
  const events: UsageEventRecord[] = [];
  for (const detail of details) {
    const providerKey = typeof detail.provider === 'string' ? detail.provider : '';
    const model = typeof detail.model === 'string' ? detail.model : '';
    const timestamp = typeof detail.timestamp === 'string' ? detail.timestamp : '';
    const inputTokens = toNumber(detail.inputTokens);
    const outputTokens = toNumber(detail.outputTokens);
    const cacheReadTokens = toNumber(detail.cacheReadTokens);
    const cacheCreationTokens = toNumber(detail.cacheCreationTokens);
    const requestCount = toNumber(detail.requestCount) || 1;
    const sourceCost = typeof detail.cost === 'number' ? detail.cost : 0;
    const event = normalizeBase(
      'snapshot',
      providerKey,
      '',
      '',
      '',
      '',
      model,
      timestamp,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      requestCount,
      sourceCost,
      detail.failed === true
    );
    if (event) events.push(event);
  }
  return events;
}

export function normalizeLiveResponse(payload: LiveUsageResponse): UsageEventRecord[] {
  const events: UsageEventRecord[] = [];
  for (const [providerKey, providerData] of Object.entries(payload.usage?.apis ?? {})) {
    for (const [model, modelData] of Object.entries(providerData.models ?? {})) {
      for (const detail of modelData.details ?? []) {
        const inputTokens = toNumber(detail.tokens?.input_tokens);
        const outputTokens = toNumber(detail.tokens?.output_tokens);
        const cacheReadTokens = toNumber(detail.tokens?.cached_tokens);
        const cacheCreationTokens = toNumber(detail.tokens?.cache_creation_tokens);
        const event = normalizeBase(
          'live',
          providerKey,
          '',
          '',
          '',
          '',
          model,
          typeof detail.timestamp === 'string' ? detail.timestamp : '',
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          1,
          0,
          detail.failed === true
        );
        if (event) events.push(event);
      }
    }
  }
  return events;
}

export function normalizeUsageQueueResponse(records: unknown[]): UsageEventRecord[] {
  const events: UsageEventRecord[] = [];

  for (const rawRecord of records) {
    const record = rawRecord as UsageQueueRecord | null;
    if (!record || typeof record !== 'object') {
      continue;
    }

    const providerKey = queueRecordProviderKey(record);
    const model =
      typeof record.model === 'string' && record.model.trim()
        ? record.model.trim()
        : typeof record.alias === 'string'
          ? record.alias.trim()
          : '';
    const timestamp =
      typeof record.timestamp === 'string' ? record.timestamp.trim() : '';
    const inputTokens = toNumber(record.tokens?.input_tokens);
    const outputTokens = toNumber(record.tokens?.output_tokens);
    const cacheReadTokens = toNumber(record.tokens?.cached_tokens);
    const cacheCreationTokens = toNumber(record.tokens?.cache_creation_tokens);

    const event = normalizeBase(
      'live',
      providerKey,
      toTrimmedString(record.provider) || toTrimmedString(record.executor_type),
      toTrimmedString(record.service_tier),
      toTrimmedString(record.endpoint),
      toTrimmedString(record.request_id),
      model,
      timestamp,
      inputTokens,
      outputTokens,
      cacheReadTokens || toNumber(record.tokens?.cache_read_tokens),
      cacheCreationTokens,
      1,
      0,
      record.failed === true
    );
    if (event) {
      events.push(event);
    }
  }

  return events;
}

export function mergeEvents(events: UsageEventRecord[]): UsageEventRecord[] {
  const merged = new Map<string, UsageEventRecord>();
  for (const event of events) {
    const existing = merged.get(event.eventKey);
    if (existing) {
      existing.liveSeen ||= event.liveSeen;
      existing.snapshotSeen ||= event.snapshotSeen;
      if (
        existing.sourceCost === 0 &&
        event.sourceCost > 0 &&
        (existing.pricingConfidence === 'fallback' || existing.pricingConfidence === 'unsupported')
      ) {
        const pricing = calculatePricing({
          model: existing.model,
          provider: existing.provider,
          serviceTier: existing.serviceTier,
          inputTokens: existing.inputTokens,
          outputTokens: existing.outputTokens,
          cachedInputTokens: existing.cacheReadTokens,
          cacheCreationTokens: existing.cacheCreationTokens,
          sourceCost: event.sourceCost,
        });
        existing.sourceCost = event.sourceCost;
        existing.inputCost = pricing.inputCost;
        existing.cachedInputCost = pricing.cachedInputCost;
        existing.cacheCreationCost = pricing.cacheCreationCost;
        existing.outputCost = pricing.outputCost;
        existing.cost = pricing.cost;
      }
      continue;
    }
    merged.set(event.eventKey, { ...event });
  }
  return Array.from(merged.values()).sort((left, right) => left.timestampMs - right.timestampMs);
}
