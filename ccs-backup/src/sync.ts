import { openDatabase, persistEvents, writeSyncError, writeSyncSummary } from '@/db';
import { resolveConfig } from '@/config';
import { loadLiveSource, loadSnapshotSource, mergeSourceEvents } from '@/sources';
import type { SyncSummary } from '@/types';

export interface SyncOptions {
  ccsDir?: string;
  dbPath?: string;
}

export async function runSync(options: SyncOptions = {}): Promise<SyncSummary> {
  const startedAt = new Date().toISOString();
  const config = await resolveConfig(options.ccsDir, options.dbPath);
  const db = await openDatabase(config.dbPath);

  try {
    const [live, snapshot] = await Promise.all([
      loadLiveSource(config),
      loadSnapshotSource(config),
    ]);

    if (!live.ok && !snapshot.ok) {
      throw new Error(
        `No usable source available. live=${live.message ?? 'unknown'} snapshot=${snapshot.message ?? 'unknown'}`
      );
    }

    const sources = [live, snapshot];
    const mergedEvents = mergeSourceEvents(sources);
    const { inserted, updated } = persistEvents(db, mergedEvents);
    const completedAt = new Date().toISOString();

    const summary: SyncSummary = {
      startedAt,
      completedAt,
      ccsDir: config.ccsDir,
      dbPath: config.dbPath,
      inserted,
      updated,
      totalInputEvents: sources.reduce((sum, source) => sum + source.eventCount, 0),
      dedupedInputEvents: mergedEvents.length,
      sources: sources.map((source) => ({
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
