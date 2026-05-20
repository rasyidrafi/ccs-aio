import { openDatabase, persistEvents, writeSyncError, writeSyncSummary } from '@/db';
import { resolveConfig } from '@/config';
import { loadLiveSource, loadSnapshotSource, mergeSourceEvents, type SyncSourceMode } from '@/sources';
import type { SyncSummary } from '@/types';

export interface SyncOptions {
  ccsDir?: string;
  dbPath?: string;
  sourceMode?: SyncSourceMode;
}

export async function runSync(options: SyncOptions = {}): Promise<SyncSummary> {
  const startedAt = new Date().toISOString();
  const config = await resolveConfig(options.ccsDir, options.dbPath);
  const db = await openDatabase(config.dbPath);
  const sourceMode = options.sourceMode ?? 'all';

  try {
    const sources = [];
    if (sourceMode === 'all' || sourceMode === 'live') {
      sources.push(loadLiveSource(config));
    }
    if (sourceMode === 'all' || sourceMode === 'snapshot') {
      sources.push(loadSnapshotSource(config));
    }

    const results = await Promise.all(sources);

    if (results.length === 0) {
      throw new Error('No source mode selected');
    }

    if (results.every((source) => !source.ok)) {
      throw new Error(
        results.map((source) => `${source.source}=${source.message ?? 'unknown'}`).join(' ')
      );
    }

    const mergedEvents = mergeSourceEvents(results);
    const { inserted, updated } = persistEvents(db, mergedEvents);
    const completedAt = new Date().toISOString();

    const summary: SyncSummary = {
      startedAt,
      completedAt,
      ccsDir: config.ccsDir,
      dbPath: config.dbPath,
      inserted,
      updated,
      totalInputEvents: results.reduce((sum, source) => sum + source.eventCount, 0),
      dedupedInputEvents: mergedEvents.length,
      sources: results.map((source) => ({
        source: source.source,
        ok: source.ok,
        eventCount: source.eventCount,
        message: source.message,
      })),
    };

    writeSyncSummary(db, summary);
    return summary;
  } catch (error) {
    writeSyncError(db, startedAt, error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    db.close();
  }
}
