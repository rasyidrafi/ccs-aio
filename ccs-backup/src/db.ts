import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Database } from 'bun:sqlite';
import type { SyncSummary, UsageEventRecord } from '@/types';

interface ChangeRow {
  changes: number;
}

function createSchema(db: Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS raw_usage_events (
      event_key TEXT PRIMARY KEY,
      provider_key TEXT NOT NULL,
      model TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      request_count INTEGER NOT NULL,
      cost REAL NOT NULL,
      failed INTEGER NOT NULL DEFAULT 0,
      live_seen INTEGER NOT NULL DEFAULT 0,
      snapshot_seen INTEGER NOT NULL DEFAULT 0,
      first_ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_raw_usage_events_timestamp_ms ON raw_usage_events (timestamp_ms);
    CREATE INDEX IF NOT EXISTS idx_raw_usage_events_provider_key ON raw_usage_events (provider_key);
    CREATE INDEX IF NOT EXISTS idx_raw_usage_events_model ON raw_usage_events (model);

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function openDatabase(dbPath: string): Promise<Database> {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  createSchema(db);
  return db;
}

export function persistEvents(db: Database, events: UsageEventRecord[]): { inserted: number; updated: number } {
  if (events.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const insert = db.query(
    `INSERT INTO raw_usage_events (
      event_key,
      provider_key,
      model,
      timestamp,
      timestamp_ms,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      request_count,
      cost,
      failed,
      live_seen,
      snapshot_seen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) DO UPDATE SET
      live_seen = MAX(raw_usage_events.live_seen, excluded.live_seen),
      snapshot_seen = MAX(raw_usage_events.snapshot_seen, excluded.snapshot_seen),
      last_ingested_at = CURRENT_TIMESTAMP`
  );
  const readChanges = db.query<ChangeRow>('SELECT changes() as changes');
  const existing = db.query<{ count: number }>('SELECT COUNT(*) as count FROM raw_usage_events WHERE event_key = ?');

  let inserted = 0;
  let updated = 0;
  const runBatch = db.transaction((rows: UsageEventRecord[]) => {
    for (const row of rows) {
      const existedBefore = (existing.get([row.eventKey])?.count ?? 0) > 0;
      insert.run([
        row.eventKey,
        row.providerKey,
        row.model,
        row.timestamp,
        row.timestampMs,
        row.inputTokens,
        row.outputTokens,
        row.cacheReadTokens,
        row.requestCount,
        row.cost,
        row.failed ? 1 : 0,
        row.liveSeen ? 1 : 0,
        row.snapshotSeen ? 1 : 0,
      ]);
      if ((readChanges.get()?.changes ?? 0) > 0) {
        if (existedBefore) updated += 1;
        else inserted += 1;
      }
    }
  });

  runBatch(events);
  return { inserted, updated };
}

export function writeSyncSummary(db: Database, summary: SyncSummary): void {
  const upsert = db.query(
    `INSERT INTO sync_state (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP`
  );

  const entries: Array<[string, string]> = [
    ['last_run_started_at', summary.startedAt],
    ['last_run_completed_at', summary.completedAt],
    ['last_run_status', 'success'],
    ['last_run_db_path', summary.dbPath],
    ['last_run_ccs_dir', summary.ccsDir],
    ['last_run_inserted', String(summary.inserted)],
    ['last_run_updated', String(summary.updated)],
    ['last_run_total_input_events', String(summary.totalInputEvents)],
    ['last_run_deduped_input_events', String(summary.dedupedInputEvents)],
    ['last_run_summary_json', JSON.stringify(summary)],
  ];

  for (const source of summary.sources) {
    entries.push([`source.${source.source}.status`, source.ok ? 'ok' : 'error']);
    entries.push([`source.${source.source}.event_count`, String(source.eventCount)]);
    entries.push([`source.${source.source}.message`, source.message ?? '']);
  }

  const runBatch = db.transaction((pairs: Array<[string, string]>) => {
    for (const [key, value] of pairs) {
      upsert.run([key, value]);
    }
  });

  runBatch(entries);
}

export function writeSyncError(db: Database, startedAt: string, error: Error): void {
  const upsert = db.query(
    `INSERT INTO sync_state (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP`
  );

  const entries: Array<[string, string]> = [
    ['last_run_started_at', startedAt],
    ['last_run_completed_at', new Date().toISOString()],
    ['last_run_status', 'error'],
    ['last_run_error', error.message],
  ];

  for (const [key, value] of entries) {
    upsert.run([key, value]);
  }
}
