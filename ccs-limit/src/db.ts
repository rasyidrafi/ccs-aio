import { Database } from "bun:sqlite";
import { config } from "./config";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

let db: Database | null = null;

export function getBudgetDb(): Database {
  if (db) return db;

  const dir = path.dirname(config.budgetDbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.budgetDbPath);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");

  db.run(`
    CREATE TABLE IF NOT EXISTS budgets (
      api_key_hash TEXT PRIMARY KEY,
      weekly_limit_usd REAL NOT NULL,
      week_start_date TEXT NOT NULL,
      next_reset_date TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return db;
}

export interface BudgetRow {
  api_key_hash: string;
  weekly_limit_usd: number;
  week_start_date: string;
  next_reset_date: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export function getAllBudgets(): BudgetRow[] {
  const d = getBudgetDb();
  return d.query("SELECT * FROM budgets ORDER BY created_at DESC").all() as BudgetRow[];
}

export function getBudget(hash: string): BudgetRow | null {
  const d = getBudgetDb();
  const rows = d.query("SELECT * FROM budgets WHERE api_key_hash = ?").all(hash) as BudgetRow[];
  return rows[0] ?? null;
}

export function upsertBudget(
  hash: string,
  weeklyLimitUsd: number,
  weekStartDate: string,
  nextResetDate: string,
  enabled = true
): BudgetRow {
  const d = getBudgetDb();
  d.run(
    `INSERT INTO budgets (api_key_hash, weekly_limit_usd, week_start_date, next_reset_date, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(api_key_hash) DO UPDATE SET
       weekly_limit_usd = excluded.weekly_limit_usd,
       week_start_date = excluded.week_start_date,
       next_reset_date = excluded.next_reset_date,
       enabled = excluded.enabled,
       updated_at = datetime('now')`,
    [hash, weeklyLimitUsd, weekStartDate, nextResetDate, enabled ? 1 : 0]
  );
  return getBudget(hash)!;
}

export function updateResetDate(hash: string, nextResetDate: string): BudgetRow | null {
  const d = getBudgetDb();
  const existing = getBudget(hash);
  if (!existing) return null;

  d.run(
    `UPDATE budgets SET next_reset_date = ?, updated_at = datetime('now') WHERE api_key_hash = ?`,
    [nextResetDate, hash]
  );
  return getBudget(hash);
}

export function setBudgetEnabled(hash: string, enabled: boolean): BudgetRow | null {
  const d = getBudgetDb();
  const existing = getBudget(hash);
  if (!existing) return null;

  d.run(
    `UPDATE budgets SET enabled = ?, updated_at = datetime('now') WHERE api_key_hash = ?`,
    [enabled ? 1 : 0, hash]
  );
  return getBudget(hash);
}

export function updateLimit(hash: string, limitUsd: number): BudgetRow | null {
  const d = getBudgetDb();
  const existing = getBudget(hash);
  if (!existing) return null;

  d.run(
    `UPDATE budgets SET weekly_limit_usd = ?, updated_at = datetime('now') WHERE api_key_hash = ?`,
    [limitUsd, hash]
  );
  return getBudget(hash);
}

export function deleteBudget(hash: string): boolean {
  const d = getBudgetDb();
  const result = d.run("DELETE FROM budgets WHERE api_key_hash = ?", [hash]);
  return result.changes > 0;
}

/**
 * Auto-advance the week if next_reset_date has been reached.
 * Returns the (possibly updated) budget row.
 */
export function autoAdvanceWeek(budget: BudgetRow): BudgetRow {
  const today = todayDate();
  if (today < budget.next_reset_date) return budget;

  const d = getBudgetDb();
  const newWeekStart = budget.next_reset_date;
  const newNextReset = addDays(newWeekStart, 7);

  d.run(
    `UPDATE budgets SET week_start_date = ?, next_reset_date = ?, updated_at = datetime('now') WHERE api_key_hash = ?`,
    [newWeekStart, newNextReset, budget.api_key_hash]
  );
  return {
    ...budget,
    week_start_date: newWeekStart,
    next_reset_date: newNextReset,
  };
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
