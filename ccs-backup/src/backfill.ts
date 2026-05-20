import path from 'node:path';
import { homedir } from 'node:os';
import { Database as BunDatabase } from 'bun:sqlite';
import { openDatabase, persistEvents } from '@/db';
import { resolveConfig } from '@/config';
import type { UsageEventRecord } from '@/types';

interface OldUsageRow {
  event_key: string;
  key_id: string;
  model: string;
  timestamp: string;
  timestamp_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  request_count: number;
  cost: number;
  failed: number;
  source_state: string;
}

export interface BackfillOptions {
  ccsDir?: string;
  dbPath?: string;
  sourceDir?: string;
}

export interface BackfillSummary {
  startedAt: string;
  completedAt: string;
  sourceDbPath: string;
  targetDbPath: string;
  importedDates: string[];
  candidateRows: number;
  inserted: number;
  updated: number;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveSourceDbPath(sourceDir?: string): string {
  const root = sourceDir
    ? path.resolve(sourceDir)
    : path.join(process.cwd(), '..', 'ccs-old-data');
  return path.join(root, '.ccs', 'cache', 'ccs-dashboard-usage-v1', 'usage.db');
}

function toUsageEventRecord(row: OldUsageRow): UsageEventRecord {
  return {
    eventKey: row.event_key,
    providerKey: row.key_id,
    model: row.model,
    timestamp: row.timestamp,
    timestampMs: row.timestamp_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    requestCount: row.request_count,
    cost: row.cost,
    failed: row.failed === 1,
    liveSeen: row.source_state === 'live',
    snapshotSeen: row.source_state !== 'live',
  };
}

export async function runBackfillOldData(options: BackfillOptions = {}): Promise<BackfillSummary> {
  const startedAt = new Date().toISOString();
  const config = await resolveConfig(options.ccsDir, options.dbPath);
  const sourceDbPath = resolveSourceDbPath(options.sourceDir);

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const allowedDates = new Set([formatLocalDate(now), formatLocalDate(yesterday)]);

  const sourceDb = new BunDatabase(sourceDbPath);
  const targetDb = await openDatabase(config.dbPath);

  try {
    const rows = sourceDb
      .query<OldUsageRow>(
        `SELECT
          event_key,
          key_id,
          model,
          timestamp,
          timestamp_ms,
          input_tokens,
          output_tokens,
          cache_read_tokens,
          request_count,
          cost,
          failed,
          source_state
        FROM usage_events
        ORDER BY timestamp_ms ASC`
      )
      .all();

    const filtered = rows.filter((row) => {
      const parsed = new Date(row.timestamp);
      return allowedDates.has(formatLocalDate(parsed));
    });

    const { inserted, updated } = persistEvents(
      targetDb,
      filtered.map(toUsageEventRecord)
    );

    return {
      startedAt,
      completedAt: new Date().toISOString(),
      sourceDbPath,
      targetDbPath: config.dbPath,
      importedDates: Array.from(allowedDates).sort(),
      candidateRows: filtered.length,
      inserted,
      updated,
    };
  } finally {
    sourceDb.close();
    targetDb.close();
  }
}
