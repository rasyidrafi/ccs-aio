export type SourceKind = 'live' | 'snapshot';

export interface UsageEventRecord {
  eventKey: string;
  providerKey: string;
  model: string;
  timestamp: string;
  timestampMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  requestCount: number;
  cost: number;
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
