import path from 'node:path';
import { access, mkdir } from 'node:fs/promises';
import { Database } from 'bun:sqlite';
import { calculatePricing, PRICING_VERSION } from '@/pricing';
import type { StatusSummary, SyncSummary, UsageEventRecord } from '@/types';

interface ChangeRow {
  changes: number;
}

interface TimestampBoundsRow {
  first_timestamp: string | null;
  last_timestamp: string | null;
}

interface RollupCountRow {
  count: number;
}

interface RollupBoundsRow {
  first_bucket_start: string | null;
  last_bucket_start: string | null;
}

interface ExistingEventRow {
  live_seen: number;
  snapshot_seen: number;
  cost: number;
}

interface RepriceRow {
  event_key: string;
  provider: string;
  service_tier: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  source_cost: number;
  pricing_confidence: string;
}

interface RollupAggregate {
  bucketStart: string;
  providerKey: string;
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  failedCount: number;
  liveRequestCount: number;
  snapshotRequestCount: number;
  lastEventAt: string;
}

interface SourceDeltaEvent {
  providerKey: string;
  model: string;
  timestamp: string;
  timestampMs: number;
  liveRequestCount: number;
  snapshotRequestCount: number;
}

interface RollupSourceDelta {
  bucketStart: string;
  providerKey: string;
  model: string;
  liveRequestCount: number;
  snapshotRequestCount: number;
  lastEventAt: string;
}

interface RollupTableColumnRow {
  name: string;
}

type RollupGranularity = 'hourly' | 'daily' | 'monthly';
type RollupTableName = 'rollup_hourly' | 'rollup_daily' | 'rollup_monthly';

const ROLLUP_SCHEMA_VERSION = '3';
const ROLLUP_TABLES: RollupTableName[] = ['rollup_hourly', 'rollup_daily', 'rollup_monthly'];

export interface RebuildRollupsSummary {
  startedAt: string;
  completedAt: string;
  dbPath: string;
  rawEventCount: number;
  rollups: {
    hourly: number;
    daily: number;
    monthly: number;
  };
}

export interface RepriceUsageSummary extends RebuildRollupsSummary {
  pricingVersion: string;
  repriced: number;
}

function createSchema(db: Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS raw_usage_events (
      event_key TEXT PRIMARY KEY,
      provider_key TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'unknown',
      service_tier TEXT NOT NULL DEFAULT 'standard',
      endpoint TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      uncached_input_tokens INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL,
      source_cost REAL NOT NULL DEFAULT 0,
      input_cost REAL NOT NULL DEFAULT 0,
      cached_input_cost REAL NOT NULL DEFAULT 0,
      cache_creation_cost REAL NOT NULL DEFAULT 0,
      output_cost REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL,
      pricing_version TEXT NOT NULL DEFAULT '',
      pricing_confidence TEXT NOT NULL DEFAULT 'fallback',
      pricing_context_tier TEXT NOT NULL DEFAULT 'standard',
      failed INTEGER NOT NULL DEFAULT 0,
      live_seen INTEGER NOT NULL DEFAULT 0,
      snapshot_seen INTEGER NOT NULL DEFAULT 0,
      first_ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_raw_usage_events_timestamp_ms ON raw_usage_events (timestamp_ms);
    CREATE INDEX IF NOT EXISTS idx_raw_usage_events_provider_key ON raw_usage_events (provider_key);
    CREATE INDEX IF NOT EXISTS idx_raw_usage_events_model ON raw_usage_events (model);

    CREATE TABLE IF NOT EXISTS rollup_hourly (
      bucket_start TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      model TEXT NOT NULL,
      request_count INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cost REAL NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0,
      live_request_count INTEGER NOT NULL DEFAULT 0,
      snapshot_request_count INTEGER NOT NULL DEFAULT 0,
      last_event_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (bucket_start, provider_key, model)
    );

    CREATE INDEX IF NOT EXISTS idx_rollup_hourly_bucket_start ON rollup_hourly (bucket_start);

    CREATE TABLE IF NOT EXISTS rollup_daily (
      bucket_start TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      model TEXT NOT NULL,
      request_count INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cost REAL NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0,
      live_request_count INTEGER NOT NULL DEFAULT 0,
      snapshot_request_count INTEGER NOT NULL DEFAULT 0,
      last_event_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (bucket_start, provider_key, model)
    );

    CREATE INDEX IF NOT EXISTS idx_rollup_daily_bucket_start ON rollup_daily (bucket_start);

    CREATE TABLE IF NOT EXISTS rollup_monthly (
      bucket_start TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      model TEXT NOT NULL,
      request_count INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cost REAL NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0,
      live_request_count INTEGER NOT NULL DEFAULT 0,
      snapshot_request_count INTEGER NOT NULL DEFAULT 0,
      last_event_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (bucket_start, provider_key, model)
    );

    CREATE INDEX IF NOT EXISTS idx_rollup_monthly_bucket_start ON rollup_monthly (bucket_start);

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function listTableColumns(db: Database, tableName: string): Set<string> {
  const rows = db.query<RollupTableColumnRow>(`PRAGMA table_info(${tableName})`).all();
  return new Set(rows.map((row) => row.name));
}

function ensureRollupColumns(db: Database, tableName: RollupTableName): void {
  const columns = listTableColumns(db, tableName);
  if (!columns.has('live_request_count')) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN live_request_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columns.has('snapshot_request_count')) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN snapshot_request_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columns.has('last_event_at')) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN last_event_at TEXT`);
  }
}

function ensureRawUsageColumns(db: Database): void {
  const columns = listTableColumns(db, 'raw_usage_events');
  const additions: Array<[string, string]> = [
    ['provider', "TEXT NOT NULL DEFAULT 'unknown'"],
    ['service_tier', "TEXT NOT NULL DEFAULT 'standard'"],
    ['endpoint', "TEXT NOT NULL DEFAULT ''"],
    ['request_id', "TEXT NOT NULL DEFAULT ''"],
    ['cache_creation_tokens', 'INTEGER NOT NULL DEFAULT 0'],
    ['uncached_input_tokens', 'INTEGER NOT NULL DEFAULT 0'],
    ['source_cost', 'REAL NOT NULL DEFAULT 0'],
    ['input_cost', 'REAL NOT NULL DEFAULT 0'],
    ['cached_input_cost', 'REAL NOT NULL DEFAULT 0'],
    ['cache_creation_cost', 'REAL NOT NULL DEFAULT 0'],
    ['output_cost', 'REAL NOT NULL DEFAULT 0'],
    ['pricing_version', "TEXT NOT NULL DEFAULT ''"],
    ['pricing_confidence', "TEXT NOT NULL DEFAULT 'fallback'"],
    ['pricing_context_tier', "TEXT NOT NULL DEFAULT 'standard'"],
  ];

  for (const [name, definition] of additions) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE raw_usage_events ADD COLUMN ${name} ${definition}`);
    }
  }

  if (!columns.has('source_cost')) {
    db.exec('UPDATE raw_usage_events SET source_cost = cost');
  }
}

export async function openDatabase(dbPath: string): Promise<Database> {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  createSchema(db);
  ensureRawUsageColumns(db);
  for (const tableName of ROLLUP_TABLES) {
    ensureRollupColumns(db, tableName);
  }
  return db;
}

function formatLocalBucketStart(timestampMs: number, granularity: RollupGranularity): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');

  if (granularity === 'hourly') {
    return `${year}-${month}-${day}T${hour}:00:00`;
  }
  if (granularity === 'daily') {
    return `${year}-${month}-${day}T00:00:00`;
  }
  return `${year}-${month}-01T00:00:00`;
}

function buildRollupAggregates(
  events: UsageEventRecord[],
  granularity: RollupGranularity
): RollupAggregate[] {
  const aggregates = new Map<string, RollupAggregate>();

  for (const event of events) {
    const bucketStart = formatLocalBucketStart(event.timestampMs, granularity);
    const key = [bucketStart, event.providerKey, event.model].join('|');
    const existing = aggregates.get(key);
    if (existing) {
      existing.requestCount += event.requestCount;
      existing.inputTokens += event.inputTokens;
      existing.outputTokens += event.outputTokens;
      existing.cacheReadTokens += event.cacheReadTokens;
      existing.cost += event.cost;
      existing.failedCount += event.failed ? event.requestCount : 0;
      existing.liveRequestCount += event.liveSeen ? event.requestCount : 0;
      existing.snapshotRequestCount += event.snapshotSeen ? event.requestCount : 0;
      if (event.timestamp > existing.lastEventAt) {
        existing.lastEventAt = event.timestamp;
      }
      continue;
    }

    aggregates.set(key, {
      bucketStart,
      providerKey: event.providerKey,
      model: event.model,
      requestCount: event.requestCount,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
      cost: event.cost,
      failedCount: event.failed ? event.requestCount : 0,
      liveRequestCount: event.liveSeen ? event.requestCount : 0,
      snapshotRequestCount: event.snapshotSeen ? event.requestCount : 0,
      lastEventAt: event.timestamp,
    });
  }

  return Array.from(aggregates.values()).sort((left, right) =>
    left.bucketStart.localeCompare(right.bucketStart)
  );
}

function buildRollupSourceDeltas(
  events: SourceDeltaEvent[],
  granularity: RollupGranularity
): RollupSourceDelta[] {
  const deltas = new Map<string, RollupSourceDelta>();

  for (const event of events) {
    const bucketStart = formatLocalBucketStart(event.timestampMs, granularity);
    const key = [bucketStart, event.providerKey, event.model].join('|');
    const existing = deltas.get(key);
    if (existing) {
      existing.liveRequestCount += event.liveRequestCount;
      existing.snapshotRequestCount += event.snapshotRequestCount;
      if (event.timestamp > existing.lastEventAt) {
        existing.lastEventAt = event.timestamp;
      }
      continue;
    }

    deltas.set(key, {
      bucketStart,
      providerKey: event.providerKey,
      model: event.model,
      liveRequestCount: event.liveRequestCount,
      snapshotRequestCount: event.snapshotRequestCount,
      lastEventAt: event.timestamp,
    });
  }

  return Array.from(deltas.values()).sort((left, right) => left.bucketStart.localeCompare(right.bucketStart));
}

function upsertRollupTable(
  db: Database,
  tableName: RollupTableName,
  rows: RollupAggregate[]
): void {
  if (rows.length === 0) {
    return;
  }

  const upsert = db.query(
    `INSERT INTO ${tableName} (
      bucket_start,
      provider_key,
      model,
      request_count,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cost,
      failed_count,
      live_request_count,
      snapshot_request_count,
      last_event_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bucket_start, provider_key, model) DO UPDATE SET
      request_count = ${tableName}.request_count + excluded.request_count,
      input_tokens = ${tableName}.input_tokens + excluded.input_tokens,
      output_tokens = ${tableName}.output_tokens + excluded.output_tokens,
      cache_read_tokens = ${tableName}.cache_read_tokens + excluded.cache_read_tokens,
      cost = ${tableName}.cost + excluded.cost,
      failed_count = ${tableName}.failed_count + excluded.failed_count,
      live_request_count = ${tableName}.live_request_count + excluded.live_request_count,
      snapshot_request_count = ${tableName}.snapshot_request_count + excluded.snapshot_request_count,
      last_event_at = MAX(COALESCE(${tableName}.last_event_at, ''), COALESCE(excluded.last_event_at, '')),
      updated_at = CURRENT_TIMESTAMP`
  );

  for (const row of rows) {
    upsert.run([
      row.bucketStart,
      row.providerKey,
      row.model,
      row.requestCount,
      row.inputTokens,
      row.outputTokens,
      row.cacheReadTokens,
      row.cost,
      row.failedCount,
      row.liveRequestCount,
      row.snapshotRequestCount,
      row.lastEventAt,
    ]);
  }
}

function upsertRollupSourceDeltas(
  db: Database,
  tableName: RollupTableName,
  rows: RollupSourceDelta[]
): void {
  if (rows.length === 0) {
    return;
  }

  const upsert = db.query(
    `INSERT INTO ${tableName} (
      bucket_start,
      provider_key,
      model,
      request_count,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cost,
      failed_count,
      live_request_count,
      snapshot_request_count,
      last_event_at
    ) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, ?)
    ON CONFLICT(bucket_start, provider_key, model) DO UPDATE SET
      live_request_count = ${tableName}.live_request_count + excluded.live_request_count,
      snapshot_request_count = ${tableName}.snapshot_request_count + excluded.snapshot_request_count,
      last_event_at = MAX(COALESCE(${tableName}.last_event_at, ''), COALESCE(excluded.last_event_at, '')),
      updated_at = CURRENT_TIMESTAMP`
  );

  for (const row of rows) {
    upsert.run([
      row.bucketStart,
      row.providerKey,
      row.model,
      row.liveRequestCount,
      row.snapshotRequestCount,
      row.lastEventAt,
    ]);
  }
}

function writeSyncValues(db: Database, entries: Array<[string, string]>): void {
  const upsert = db.query(
    `INSERT INTO sync_state (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP`
  );

  const runBatch = db.transaction((pairs: Array<[string, string]>) => {
    for (const [key, value] of pairs) {
      upsert.run([key, value]);
    }
  });

  runBatch(entries);
}

function readSyncValue(db: Database, key: string): string | null {
  const row = db.query<{ value: string }>('SELECT value FROM sync_state WHERE key = ?').get([key]);
  return row?.value ?? null;
}

function localBucketExpression(granularity: RollupGranularity): string {
  if (granularity === 'hourly') {
    return "strftime('%Y-%m-%dT%H:00:00', timestamp_ms / 1000, 'unixepoch', 'localtime')";
  }
  if (granularity === 'daily') {
    return "strftime('%Y-%m-%dT00:00:00', timestamp_ms / 1000, 'unixepoch', 'localtime')";
  }
  return "strftime('%Y-%m-01T00:00:00', timestamp_ms / 1000, 'unixepoch', 'localtime')";
}

function clearRollupTables(db: Database): void {
  db.exec(`
    DELETE FROM rollup_hourly;
    DELETE FROM rollup_daily;
    DELETE FROM rollup_monthly;
  `);
}

function rebuildRollupTable(
  db: Database,
  tableName: RollupTableName,
  bucketExpression: string
): number {
  db.exec(
    `INSERT INTO ${tableName} (
      bucket_start,
      provider_key,
      model,
      request_count,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cost,
      failed_count,
      live_request_count,
      snapshot_request_count,
      last_event_at,
      updated_at
    )
    SELECT
      ${bucketExpression} as bucket_start,
      provider_key,
      model,
      SUM(request_count) as request_count,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      SUM(cost) as cost,
      SUM(CASE WHEN failed = 1 THEN request_count ELSE 0 END) as failed_count,
      SUM(CASE WHEN live_seen = 1 THEN request_count ELSE 0 END) as live_request_count,
      SUM(CASE WHEN snapshot_seen = 1 THEN request_count ELSE 0 END) as snapshot_request_count,
      MAX(timestamp) as last_event_at,
      CURRENT_TIMESTAMP as updated_at
    FROM raw_usage_events
    GROUP BY bucket_start, provider_key, model`
  );

  const row = db.query<RollupCountRow>(`SELECT COUNT(*) as count FROM ${tableName}`).get();
  return row?.count ?? 0;
}

export function ensureServingTables(db: Database): void {
  if (readSyncValue(db, 'serving.schema_version') === ROLLUP_SCHEMA_VERSION) {
    return;
  }

  const runBatch = db.transaction(() => {
    clearRollupTables(db);
    rebuildRollupTable(db, 'rollup_hourly', localBucketExpression('hourly'));
    rebuildRollupTable(db, 'rollup_daily', localBucketExpression('daily'));
    rebuildRollupTable(db, 'rollup_monthly', localBucketExpression('monthly'));
    const now = new Date().toISOString();
    writeSyncValues(db, [
      ['serving.schema_version', ROLLUP_SCHEMA_VERSION],
      ['serving.last_rebuilt_at', now],
      ['serving.last_updated_at', now],
    ]);
  });

  runBatch();
}

export function persistEvents(db: Database, events: UsageEventRecord[]): { inserted: number; updated: number } {
  ensureServingTables(db);

  if (events.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const insert = db.query(
    `INSERT INTO raw_usage_events (
      event_key,
      provider_key,
      provider,
      service_tier,
      endpoint,
      request_id,
      model,
      timestamp,
      timestamp_ms,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_creation_tokens,
      uncached_input_tokens,
      request_count,
      source_cost,
      input_cost,
      cached_input_cost,
      cache_creation_cost,
      output_cost,
      cost,
      pricing_version,
      pricing_confidence,
      pricing_context_tier,
      failed,
      live_seen,
      snapshot_seen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) DO UPDATE SET
      provider = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.provider ELSE raw_usage_events.provider END,
      service_tier = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.service_tier ELSE raw_usage_events.service_tier END,
      endpoint = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.endpoint ELSE raw_usage_events.endpoint END,
      request_id = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.request_id ELSE raw_usage_events.request_id END,
      cache_creation_tokens = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.cache_creation_tokens ELSE raw_usage_events.cache_creation_tokens END,
      uncached_input_tokens = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.uncached_input_tokens ELSE raw_usage_events.uncached_input_tokens END,
      source_cost = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.source_cost ELSE raw_usage_events.source_cost END,
      input_cost = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.input_cost ELSE raw_usage_events.input_cost END,
      cached_input_cost = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.cached_input_cost ELSE raw_usage_events.cached_input_cost END,
      cache_creation_cost = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.cache_creation_cost ELSE raw_usage_events.cache_creation_cost END,
      output_cost = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.output_cost ELSE raw_usage_events.output_cost END,
      cost = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.cost ELSE raw_usage_events.cost END,
      pricing_version = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.pricing_version ELSE raw_usage_events.pricing_version END,
      pricing_confidence = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.pricing_confidence ELSE raw_usage_events.pricing_confidence END,
      pricing_context_tier = CASE WHEN excluded.live_seen = 1 OR raw_usage_events.live_seen = 0 THEN excluded.pricing_context_tier ELSE raw_usage_events.pricing_context_tier END,
      live_seen = MAX(raw_usage_events.live_seen, excluded.live_seen),
      snapshot_seen = MAX(raw_usage_events.snapshot_seen, excluded.snapshot_seen),
      last_ingested_at = CURRENT_TIMESTAMP`
  );
  const readChanges = db.query<ChangeRow>('SELECT changes() as changes');
  const existing = db.query<ExistingEventRow>(
    'SELECT live_seen, snapshot_seen, cost FROM raw_usage_events WHERE event_key = ?'
  );

  let inserted = 0;
  let updated = 0;
  const insertedEvents: UsageEventRecord[] = [];
  const pricingDeltaEvents: UsageEventRecord[] = [];
  const sourceDeltaEvents: SourceDeltaEvent[] = [];

  const runBatch = db.transaction((rows: UsageEventRecord[]) => {
    for (const row of rows) {
      const existingRow = existing.get([row.eventKey]);
      insert.run([
        row.eventKey,
        row.providerKey,
        row.provider,
        row.serviceTier,
        row.endpoint,
        row.requestId,
        row.model,
        row.timestamp,
        row.timestampMs,
        row.inputTokens,
        row.outputTokens,
        row.cacheReadTokens,
        row.cacheCreationTokens,
        row.uncachedInputTokens,
        row.requestCount,
        row.sourceCost,
        row.inputCost,
        row.cachedInputCost,
        row.cacheCreationCost,
        row.outputCost,
        row.cost,
        row.pricingVersion,
        row.pricingConfidence,
        row.pricingContextTier,
        row.failed ? 1 : 0,
        row.liveSeen ? 1 : 0,
        row.snapshotSeen ? 1 : 0,
      ]);

      if ((readChanges.get()?.changes ?? 0) === 0) {
        continue;
      }

      if (!existingRow) {
        inserted += 1;
        insertedEvents.push(row);
        continue;
      }

      updated += 1;
      if ((row.liveSeen || existingRow.live_seen === 0) && row.cost !== existingRow.cost) {
        pricingDeltaEvents.push({
          ...row,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          uncachedInputTokens: 0,
          requestCount: 0,
          sourceCost: 0,
          inputCost: 0,
          cachedInputCost: 0,
          cacheCreationCost: 0,
          outputCost: 0,
          cost: row.cost - existingRow.cost,
          failed: false,
          liveSeen: false,
          snapshotSeen: false,
        });
      }
      const liveRequestCount = row.liveSeen && existingRow.live_seen === 0 ? row.requestCount : 0;
      const snapshotRequestCount =
        row.snapshotSeen && existingRow.snapshot_seen === 0 ? row.requestCount : 0;

      if (liveRequestCount > 0 || snapshotRequestCount > 0) {
        sourceDeltaEvents.push({
          providerKey: row.providerKey,
          model: row.model,
          timestamp: row.timestamp,
          timestampMs: row.timestampMs,
          liveRequestCount,
          snapshotRequestCount,
        });
      }
    }

    upsertRollupTable(db, 'rollup_hourly', buildRollupAggregates(insertedEvents, 'hourly'));
    upsertRollupTable(db, 'rollup_daily', buildRollupAggregates(insertedEvents, 'daily'));
    upsertRollupTable(db, 'rollup_monthly', buildRollupAggregates(insertedEvents, 'monthly'));
    upsertRollupTable(db, 'rollup_hourly', buildRollupAggregates(pricingDeltaEvents, 'hourly'));
    upsertRollupTable(db, 'rollup_daily', buildRollupAggregates(pricingDeltaEvents, 'daily'));
    upsertRollupTable(db, 'rollup_monthly', buildRollupAggregates(pricingDeltaEvents, 'monthly'));

    upsertRollupSourceDeltas(db, 'rollup_hourly', buildRollupSourceDeltas(sourceDeltaEvents, 'hourly'));
    upsertRollupSourceDeltas(db, 'rollup_daily', buildRollupSourceDeltas(sourceDeltaEvents, 'daily'));
    upsertRollupSourceDeltas(db, 'rollup_monthly', buildRollupSourceDeltas(sourceDeltaEvents, 'monthly'));

    if (inserted > 0 || updated > 0) {
      writeSyncValues(db, [
        ['serving.schema_version', ROLLUP_SCHEMA_VERSION],
        ['serving.last_updated_at', new Date().toISOString()],
        ['pricing.version', PRICING_VERSION],
      ]);
    }
  });

  runBatch(events);
  return { inserted, updated };
}

export async function repriceUsage(dbPath: string): Promise<RepriceUsageSummary> {
  const startedAt = new Date().toISOString();
  const db = await openDatabase(dbPath);

  try {
    const rows = db
      .query<RepriceRow>(
        `SELECT
          event_key,
          provider,
          service_tier,
          model,
          input_tokens,
          output_tokens,
          cache_read_tokens,
          cache_creation_tokens,
          source_cost,
          pricing_confidence
        FROM raw_usage_events`
      )
      .all();
    const update = db.query(
      `UPDATE raw_usage_events SET
        provider = ?,
        service_tier = ?,
        uncached_input_tokens = ?,
        input_cost = ?,
        cached_input_cost = ?,
        cache_creation_cost = ?,
        output_cost = ?,
        cost = ?,
        pricing_version = ?,
        pricing_confidence = ?,
        pricing_context_tier = ?,
        last_ingested_at = CURRENT_TIMESTAMP
      WHERE event_key = ?`
    );

    const runBatch = db.transaction((items: RepriceRow[]) => {
      for (const row of items) {
        const pricing = calculatePricing({
          model: row.model,
          provider:
            row.provider === 'unknown' ||
            row.pricing_confidence === 'provider-assumed' ||
            row.pricing_confidence === 'fallback'
              ? undefined
              : row.provider,
          serviceTier:
            row.pricing_confidence === 'standard-assumed' ||
            row.pricing_confidence === 'fallback'
              ? undefined
              : row.service_tier,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          cachedInputTokens: row.cache_read_tokens,
          cacheCreationTokens: row.cache_creation_tokens,
          sourceCost: row.source_cost,
        });
        update.run([
          pricing.provider,
          pricing.serviceTier,
          pricing.uncachedInputTokens,
          pricing.inputCost,
          pricing.cachedInputCost,
          pricing.cacheCreationCost,
          pricing.outputCost,
          pricing.cost,
          pricing.pricingVersion,
          pricing.pricingConfidence,
          pricing.pricingContextTier,
          row.event_key,
        ]);
      }

      clearRollupTables(db);
      const hourly = rebuildRollupTable(db, 'rollup_hourly', localBucketExpression('hourly'));
      const daily = rebuildRollupTable(db, 'rollup_daily', localBucketExpression('daily'));
      const monthly = rebuildRollupTable(db, 'rollup_monthly', localBucketExpression('monthly'));
      const now = new Date().toISOString();
      writeSyncValues(db, [
        ['serving.schema_version', ROLLUP_SCHEMA_VERSION],
        ['serving.last_rebuilt_at', now],
        ['serving.last_updated_at', now],
        ['pricing.version', PRICING_VERSION],
        ['pricing.last_repriced_at', now],
      ]);
      return { hourly, daily, monthly };
    });
    const rollups = runBatch(rows);

    return {
      startedAt,
      completedAt: new Date().toISOString(),
      dbPath,
      pricingVersion: PRICING_VERSION,
      repriced: rows.length,
      rawEventCount: rows.length,
      rollups,
    };
  } finally {
    db.close();
  }
}

export async function rebuildRollups(dbPath: string): Promise<RebuildRollupsSummary> {
  const startedAt = new Date().toISOString();
  const db = await openDatabase(dbPath);

  try {
    let rawEventCount = 0;
    let hourly = 0;
    let daily = 0;
    let monthly = 0;

    const runBatch = db.transaction(() => {
      rawEventCount = db.query<RollupCountRow>('SELECT COUNT(*) as count FROM raw_usage_events').get()?.count ?? 0;
      clearRollupTables(db);
      hourly = rebuildRollupTable(db, 'rollup_hourly', localBucketExpression('hourly'));
      daily = rebuildRollupTable(db, 'rollup_daily', localBucketExpression('daily'));
      monthly = rebuildRollupTable(db, 'rollup_monthly', localBucketExpression('monthly'));
      const now = new Date().toISOString();
      writeSyncValues(db, [
        ['serving.schema_version', ROLLUP_SCHEMA_VERSION],
        ['serving.last_rebuilt_at', now],
        ['serving.last_updated_at', now],
      ]);
    });

    runBatch();

    return {
      startedAt,
      completedAt: new Date().toISOString(),
      dbPath,
      rawEventCount,
      rollups: { hourly, daily, monthly },
    };
  } finally {
    db.close();
  }
}

export function writeSyncSummary(db: Database, summary: SyncSummary): void {
  const entries: Array<[string, string]> = [
    ['last_run_started_at', summary.startedAt],
    ['last_run_completed_at', summary.completedAt],
    ['last_run_status', 'success'],
    ['last_run_error', ''],
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

  writeSyncValues(db, entries);
}

export function writeSyncError(db: Database, startedAt: string, error: Error): void {
  writeSyncValues(db, [
    ['last_run_started_at', startedAt],
    ['last_run_completed_at', new Date().toISOString()],
    ['last_run_status', 'error'],
    ['last_run_error', error.message],
  ]);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseNullableInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readRollupStatus(
  db: Database,
  tableName: RollupTableName
): StatusSummary['rollups']['hourly'] {
  const countRow = db.query<RollupCountRow>(`SELECT COUNT(*) as count FROM ${tableName}`).get();
  const bounds = db
    .query<RollupBoundsRow>(
      `SELECT MIN(bucket_start) as first_bucket_start, MAX(bucket_start) as last_bucket_start FROM ${tableName}`
    )
    .get();

  return {
    rowCount: countRow?.count ?? 0,
    firstBucketStart: bounds?.first_bucket_start ?? null,
    lastBucketStart: bounds?.last_bucket_start ?? null,
  };
}

export async function readStatus(dbPath: string): Promise<StatusSummary> {
  const exists = await fileExists(dbPath);
  if (!exists) {
    return {
      dbPath,
      exists: false,
      rawEventCount: 0,
      firstEventAt: null,
      lastEventAt: null,
      serving: {
        schemaVersion: null,
        lastRebuiltAt: null,
        lastUpdatedAt: null,
      },
      rollups: {
        hourly: { rowCount: 0, firstBucketStart: null, lastBucketStart: null },
        daily: { rowCount: 0, firstBucketStart: null, lastBucketStart: null },
        monthly: { rowCount: 0, firstBucketStart: null, lastBucketStart: null },
      },
      sync: {
        status: null,
        startedAt: null,
        completedAt: null,
        error: null,
        inserted: null,
        updated: null,
        totalInputEvents: null,
        dedupedInputEvents: null,
      },
      sources: [
        { source: 'live', status: null, eventCount: null, message: null },
        { source: 'snapshot', status: null, eventCount: null, message: null },
      ],
    };
  }

  const db = await openDatabase(dbPath);

  try {
    const countRow = db.query<{ count: number }>('SELECT COUNT(*) as count FROM raw_usage_events').get();
    const bounds = db
      .query<TimestampBoundsRow>(
        'SELECT MIN(timestamp) as first_timestamp, MAX(timestamp) as last_timestamp FROM raw_usage_events'
      )
      .get();

    return {
      dbPath,
      exists: true,
      rawEventCount: countRow?.count ?? 0,
      firstEventAt: bounds?.first_timestamp ?? null,
      lastEventAt: bounds?.last_timestamp ?? null,
      serving: {
        schemaVersion: readSyncValue(db, 'serving.schema_version'),
        lastRebuiltAt: readSyncValue(db, 'serving.last_rebuilt_at'),
        lastUpdatedAt: readSyncValue(db, 'serving.last_updated_at'),
      },
      rollups: {
        hourly: readRollupStatus(db, 'rollup_hourly'),
        daily: readRollupStatus(db, 'rollup_daily'),
        monthly: readRollupStatus(db, 'rollup_monthly'),
      },
      sync: {
        status: readSyncValue(db, 'last_run_status'),
        startedAt: readSyncValue(db, 'last_run_started_at'),
        completedAt: readSyncValue(db, 'last_run_completed_at'),
        error: readSyncValue(db, 'last_run_error'),
        inserted: parseNullableInt(readSyncValue(db, 'last_run_inserted')),
        updated: parseNullableInt(readSyncValue(db, 'last_run_updated')),
        totalInputEvents: parseNullableInt(readSyncValue(db, 'last_run_total_input_events')),
        dedupedInputEvents: parseNullableInt(readSyncValue(db, 'last_run_deduped_input_events')),
      },
      sources: [
        {
          source: 'live',
          status: readSyncValue(db, 'source.live.status'),
          eventCount: parseNullableInt(readSyncValue(db, 'source.live.event_count')),
          message: readSyncValue(db, 'source.live.message'),
        },
        {
          source: 'snapshot',
          status: readSyncValue(db, 'source.snapshot.status'),
          eventCount: parseNullableInt(readSyncValue(db, 'source.snapshot.event_count')),
          message: readSyncValue(db, 'source.snapshot.message'),
        },
      ],
    };
  } finally {
    db.close();
  }
}
