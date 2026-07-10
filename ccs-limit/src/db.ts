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

  db.run(`
    CREATE TABLE IF NOT EXISTS budget_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS budget_bypass_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  backfillActiveBudgetBypassSession(db);

  return db;
}

export interface BudgetWindow {
  week_start_date: string;
  next_reset_date: string;
  bypass_limit_enabled: boolean;
  bypass_session_started_at: string | null;
  bypass_session_ended_at: string | null;
}

export interface BudgetBypassSession {
  id: number | null;
  started_at: string;
  ended_at: string | null;
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

function backfillActiveBudgetBypassSession(d: Database): void {
  const setting = d
    .query(
      "SELECT value, updated_at FROM budget_settings WHERE key = 'bypass_limit_enabled'",
    )
    .get() as { value: string; updated_at: string } | null;
  if (setting?.value !== "true") return;

  const active = d
    .query(
      "SELECT id FROM budget_bypass_sessions WHERE ended_at IS NULL LIMIT 1",
    )
    .get() as { id: number } | null;
  if (active) return;

  d.run("INSERT INTO budget_bypass_sessions (started_at) VALUES (?)", [
    setting.updated_at,
  ]);
}

function readSettingRow(
  d: Database,
  key: string,
): { value: string; updated_at: string } | null {
  const row = d
    .query("SELECT value, updated_at FROM budget_settings WHERE key = ?")
    .get(key) as { value: string; updated_at: string } | null;
  return row;
}

function readSetting(d: Database, key: string): string | null {
  return readSettingRow(d, key)?.value ?? null;
}

function writeSetting(d: Database, key: string, value: string): void {
  d.run(
    `INSERT INTO budget_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, value],
  );
}

function readBudgetWindow(d: Database): BudgetWindow | null {
  const rows = d
    .query(
      "SELECT key, value FROM budget_settings WHERE key IN ('week_start_date', 'next_reset_date')",
    )
    .all() as Array<{ key: string; value: string }>;
  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const weekStart = settings.get("week_start_date");
  const nextReset = settings.get("next_reset_date");

  if (!weekStart || !nextReset) return null;
  return {
    week_start_date: weekStart,
    next_reset_date: nextReset,
    bypass_limit_enabled: readBudgetBypassEnabled(d),
    bypass_session_started_at: readActiveBudgetBypassSession(d)?.started_at ?? null,
    bypass_session_ended_at: null,
  };
}

function writeBudgetWindow(d: Database, window: BudgetWindow): void {
  writeSetting(d, "week_start_date", window.week_start_date);
  writeSetting(d, "next_reset_date", window.next_reset_date);
}

function readBudgetBypassEnabled(d: Database): boolean {
  return readSetting(d, "bypass_limit_enabled") === "true";
}

function readActiveBudgetBypassSession(d: Database): BudgetBypassSession | null {
  const active = d
    .query(
      `SELECT id, started_at, ended_at
       FROM budget_bypass_sessions
       WHERE ended_at IS NULL
       ORDER BY started_at DESC, id DESC
       LIMIT 1`,
    )
    .get() as BudgetBypassSession | null;

  if (active) return active;

  const bypassSetting = readSettingRow(d, "bypass_limit_enabled");
  if (bypassSetting?.value === "true") {
    return {
      id: null,
      started_at: bypassSetting.updated_at,
      ended_at: null,
    };
  }

  return null;
}

export function isBudgetBypassEnabled(): boolean {
  return readBudgetBypassEnabled(getBudgetDb());
}

export function getActiveBudgetBypassSession(): BudgetBypassSession | null {
  return readActiveBudgetBypassSession(getBudgetDb());
}

export function setBudgetBypassEnabled(
  enabled: boolean,
): { enabled: boolean; activeSession: BudgetBypassSession | null } {
  const d = getBudgetDb();
  const currentEnabled = readBudgetBypassEnabled(d);
  const activeSession = readActiveBudgetBypassSession(d);

  if (enabled && activeSession?.id === null) {
    d.run(
      `INSERT INTO budget_bypass_sessions (started_at)
       VALUES (?)`,
      [activeSession.started_at],
    );
  } else if (enabled && !activeSession) {
    d.run(
      `INSERT INTO budget_bypass_sessions (started_at)
       VALUES (datetime('now'))`,
    );
  }

  if (!enabled && activeSession) {
    if (activeSession.id === null) {
      d.run(
        `INSERT INTO budget_bypass_sessions (started_at, ended_at)
         VALUES (?, datetime('now'))`,
        [activeSession.started_at],
      );
    } else {
      d.run(
        `UPDATE budget_bypass_sessions
         SET ended_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND ended_at IS NULL`,
        [activeSession.id],
      );
    }
  }

  if (enabled !== currentEnabled) {
    writeSetting(
      d,
      "bypass_limit_enabled",
      enabled ? "true" : "false",
    );
  }

  const nextActiveSession = enabled ? readActiveBudgetBypassSession(d) : null;
  return { enabled, activeSession: nextActiveSession };
}

function syncBudgetsToWindow(d: Database, window: BudgetWindow): void {
  d.run(
    `UPDATE budgets
     SET week_start_date = ?, next_reset_date = ?, updated_at = datetime('now')
     WHERE week_start_date != ? OR next_reset_date != ?`,
    [
      window.week_start_date,
      window.next_reset_date,
      window.week_start_date,
      window.next_reset_date,
    ],
  );
}

export function getBudgetWindow(): BudgetWindow {
  const d = getBudgetDb();
  let window = readBudgetWindow(d);

  if (!window) {
    const existing = d
      .query(
        "SELECT week_start_date, next_reset_date FROM budgets ORDER BY created_at DESC LIMIT 1",
      )
      .get() as BudgetWindow | null;
    window = existing ?? {
      week_start_date: todayDate(),
      next_reset_date: addDays(todayDate(), 7),
      bypass_limit_enabled: readBudgetBypassEnabled(d),
      bypass_session_started_at: readActiveBudgetBypassSession(d)?.started_at ?? null,
      bypass_session_ended_at: null,
    };
    writeBudgetWindow(d, window);
  }

  let weekStart = window.week_start_date;
  let nextReset = window.next_reset_date;
  const today = todayDate();
  while (today >= nextReset) {
    weekStart = nextReset;
    nextReset = addDays(nextReset, 7);
  }

  const advanced = {
    week_start_date: weekStart,
    next_reset_date: nextReset,
    bypass_limit_enabled: readBudgetBypassEnabled(d),
    bypass_session_started_at: readActiveBudgetBypassSession(d)?.started_at ?? null,
    bypass_session_ended_at: null,
  };
  if (
    advanced.week_start_date !== window.week_start_date ||
    advanced.next_reset_date !== window.next_reset_date
  ) {
    writeBudgetWindow(d, advanced);
  }

  syncBudgetsToWindow(d, advanced);
  return advanced;
}

export function setBudgetWindow(
  weekStartDate: string,
  nextResetDate: string,
): BudgetWindow {
  const d = getBudgetDb();
  const window = {
    week_start_date: weekStartDate,
    next_reset_date: nextResetDate,
    bypass_limit_enabled: readBudgetBypassEnabled(d),
    bypass_session_started_at: readActiveBudgetBypassSession(d)?.started_at ?? null,
    bypass_session_ended_at: null,
  };
  writeBudgetWindow(d, window);
  syncBudgetsToWindow(d, window);
  return window;
}

export function getAllBudgets(): BudgetRow[] {
  getBudgetWindow();
  const d = getBudgetDb();
  return d
    .query("SELECT * FROM budgets ORDER BY created_at DESC")
    .all() as BudgetRow[];
}

export function getBudget(hash: string): BudgetRow | null {
  getBudgetWindow();
  const d = getBudgetDb();
  const rows = d
    .query("SELECT * FROM budgets WHERE api_key_hash = ?")
    .all(hash) as BudgetRow[];
  return rows[0] ?? null;
}

export function upsertBudget(
  hash: string,
  weeklyLimitUsd: number,
  enabled = true,
): BudgetRow {
  const d = getBudgetDb();
  const window = getBudgetWindow();
  d.run(
    `INSERT INTO budgets (api_key_hash, weekly_limit_usd, week_start_date, next_reset_date, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(api_key_hash) DO UPDATE SET
       weekly_limit_usd = excluded.weekly_limit_usd,
       week_start_date = excluded.week_start_date,
       next_reset_date = excluded.next_reset_date,
       enabled = excluded.enabled,
       updated_at = datetime('now')`,
    [
      hash,
      weeklyLimitUsd,
      window.week_start_date,
      window.next_reset_date,
      enabled ? 1 : 0,
    ],
  );
  return getBudget(hash)!;
}

export function updateResetDate(
  hash: string,
  nextResetDate: string,
): BudgetRow | null {
  const existing = getBudget(hash);
  if (!existing) return null;

  setBudgetWindow(existing.week_start_date, nextResetDate);
  return getBudget(hash);
}

export function updateBudgetDateRange(
  hash: string,
  weekStartDate: string,
  nextResetDate: string,
): BudgetRow | null {
  const existing = getBudget(hash);
  if (!existing) return null;

  setBudgetWindow(weekStartDate, nextResetDate);
  return getBudget(hash);
}

export function setBudgetEnabled(
  hash: string,
  enabled: boolean,
): BudgetRow | null {
  const d = getBudgetDb();
  const existing = getBudget(hash);
  if (!existing) return null;

  d.run(
    `UPDATE budgets SET enabled = ?, updated_at = datetime('now') WHERE api_key_hash = ?`,
    [enabled ? 1 : 0, hash],
  );
  return getBudget(hash);
}

export function updateLimit(hash: string, limitUsd: number): BudgetRow | null {
  const d = getBudgetDb();
  const existing = getBudget(hash);
  if (!existing) return null;

  d.run(
    `UPDATE budgets SET weekly_limit_usd = ?, updated_at = datetime('now') WHERE api_key_hash = ?`,
    [limitUsd, hash],
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
  const window = getBudgetWindow();
  return {
    ...budget,
    week_start_date: window.week_start_date,
    next_reset_date: window.next_reset_date,
  };
}

export function todayDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
