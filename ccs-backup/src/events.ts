import { createHash } from 'node:crypto';

import type { SourceKind, UsageEventRecord } from '@/types';

interface SnapshotDetail {
  provider?: string;
  model?: string;
  timestamp?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
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
  tokens?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    cached_tokens?: unknown;
  } | null;
  failed?: unknown;
}

const PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number; cacheReadPerMillion: number }
> = {
  'claude-sonnet-4-6': { inputPerMillion: 3.0, outputPerMillion: 15.0, cacheReadPerMillion: 0.3 },
  'claude-sonnet-4-6-thinking': { inputPerMillion: 3.0, outputPerMillion: 15.0, cacheReadPerMillion: 0.3 },
  'claude-sonnet-4-5': { inputPerMillion: 3.0, outputPerMillion: 15.0, cacheReadPerMillion: 0.3 },
  'claude-opus-4-6': { inputPerMillion: 5.0, outputPerMillion: 25.0, cacheReadPerMillion: 0.5 },
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0.125 },
  'gpt-5-codex': { inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0.125 },
  'gpt-5.2': { inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0.125 },
  'gpt-5.3-codex': { inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0.125 },
  'gpt-5.4': { inputPerMillion: 3.0, outputPerMillion: 15.0, cacheReadPerMillion: 0.3 },
  'gpt-5.4-mini': { inputPerMillion: 3.0, outputPerMillion: 15.0, cacheReadPerMillion: 0.3 },
  'gpt-5.5': { inputPerMillion: 5.0, outputPerMillion: 25.0, cacheReadPerMillion: 0.5 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10.0, cacheReadPerMillion: 0.3125 },
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5, cacheReadPerMillion: 0.075 },
  'gemini-2.5-flash-lite': { inputPerMillion: 0.1, outputPerMillion: 0.4, cacheReadPerMillion: 0.025 },
  'gemini-3-pro-preview': { inputPerMillion: 2.0, outputPerMillion: 12.0, cacheReadPerMillion: 0.0 },
  'gemini-3-flash-preview': { inputPerMillion: 0.3, outputPerMillion: 2.5, cacheReadPerMillion: 0.075 },
};

const PRICING_ALIASES: Record<string, string> = {
  'gemini-3.1-pro-preview': 'gemini-3-pro-preview',
  'gemini-3.1-flash-preview': 'gemini-3-flash-preview',
  'gemini-3-1-pro-preview': 'gemini-3-pro-preview',
  'gemini-3-1-flash-preview': 'gemini-3-flash-preview',
};

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

function calculateCost(model: string, inputTokens: number, outputTokens: number, cacheReadTokens: number): number {
  const pricingKey = PRICING_ALIASES[model] ?? model;
  const pricing = PRICING[pricingKey] ?? {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
  };
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion +
    (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion
  );
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
  model: string,
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  requestCount: number,
  cost: number,
  failed: boolean
): UsageEventRecord | null {
  const timestampMs = Date.parse(timestamp);
  if (!providerKey.startsWith('api-key:') || !model || !Number.isFinite(timestampMs)) {
    return null;
  }

  const event: Omit<UsageEventRecord, 'eventKey'> = {
    providerKey,
    model,
    timestamp,
    timestampMs,
    inputTokens: Math.max(0, Math.trunc(inputTokens)),
    outputTokens: Math.max(0, Math.trunc(outputTokens)),
    cacheReadTokens: Math.max(0, Math.trunc(cacheReadTokens)),
    requestCount: Math.max(1, Math.trunc(requestCount)),
    cost: Number.isFinite(cost) ? cost : 0,
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
    const requestCount = toNumber(detail.requestCount) || 1;
    const cost =
      typeof detail.cost === 'number'
        ? detail.cost
        : calculateCost(model, inputTokens, outputTokens, cacheReadTokens);
    const event = normalizeBase(
      'snapshot',
      providerKey,
      model,
      timestamp,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      requestCount,
      cost,
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
        const event = normalizeBase(
          'live',
          providerKey,
          model,
          typeof detail.timestamp === 'string' ? detail.timestamp : '',
          inputTokens,
          outputTokens,
          cacheReadTokens,
          1,
          calculateCost(model, inputTokens, outputTokens, cacheReadTokens),
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

    const event = normalizeBase(
      'live',
      providerKey,
      model,
      timestamp,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      1,
      calculateCost(model, inputTokens, outputTokens, cacheReadTokens),
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
      continue;
    }
    merged.set(event.eventKey, { ...event });
  }
  return Array.from(merged.values()).sort((left, right) => left.timestampMs - right.timestampMs);
}
