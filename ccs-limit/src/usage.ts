import { Database } from "bun:sqlite";
import { config } from "./config";

let usageDb: Database | null = null;

export function getUsageDb(): Database {
  if (usageDb) return usageDb;
  usageDb = new Database(config.usageDbPath, { readonly: true });
  return usageDb;
}

/**
 * Get total cost for a provider_key between two dates (inclusive).
 * Queries rollup_daily which uses bucket_start as date strings.
 */
export function getWeeklyCost(
  providerKey: string,
  weekStartDate: string,
  weekEndDate: string
): number {
  const db = getUsageDb();
  const row = db
    .query(
      `SELECT COALESCE(SUM(cost), 0) as total
       FROM rollup_daily
       WHERE provider_key = ?
         AND bucket_start >= ?
         AND bucket_start <= ?`
    )
    .get(providerKey, weekStartDate, weekEndDate) as { total: number } | null;
  return row?.total ?? 0;
}
