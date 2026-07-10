export type SourceKind = 'live' | 'snapshot';

import type { PricingConfidence, PricingContextTier } from '@/pricing';

export interface UsageEventRecord {
  eventKey: string;
  providerKey: string;
  provider: string;
  serviceTier: string;
  endpoint: string;
  requestId: string;
  model: string;
  timestamp: string;
  timestampMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  uncachedInputTokens: number;
  requestCount: number;
  sourceCost: number;
  inputCost: number;
  cachedInputCost: number;
  cacheCreationCost: number;
  outputCost: number;
  cost: number;
  pricingVersion: string;
  pricingConfidence: PricingConfidence;
  pricingContextTier: PricingContextTier;
  failed: boolean;
  liveSeen: boolean;
  snapshotSeen: boolean;
}

export interface SyncSourceResult {
  source: SourceKind;
  ok: boolean;
  eventCount: number;
  events: UsageEventRecord[];
  message?: string;
}

export interface SyncSourceReport {
  source: SourceKind;
  ok: boolean;
  eventCount: number;
  message?: string;
}

export interface SyncSummary {
  startedAt: string;
  completedAt: string;
  ccsDir: string;
  dbPath: string;
  inserted: number;
  updated: number;
  totalInputEvents: number;
  dedupedInputEvents: number;
  sources: SyncSourceReport[];
}

export interface StatusSourceState {
  source: SourceKind;
  status: string | null;
  eventCount: number | null;
  message: string | null;
}

export interface RollupStatusSummary {
  rowCount: number;
  firstBucketStart: string | null;
  lastBucketStart: string | null;
}

export interface StatusSummary {
  dbPath: string;
  exists: boolean;
  rawEventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  serving: {
    schemaVersion: string | null;
    lastRebuiltAt: string | null;
    lastUpdatedAt: string | null;
  };
  rollups: {
    hourly: RollupStatusSummary;
    daily: RollupStatusSummary;
    monthly: RollupStatusSummary;
  };
  sync: {
    status: string | null;
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
    inserted: number | null;
    updated: number | null;
    totalInputEvents: number | null;
    dedupedInputEvents: number | null;
  };
  sources: StatusSourceState[];
}
