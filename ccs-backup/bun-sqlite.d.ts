declare module 'bun:sqlite' {
  export class Database {
    constructor(path?: string, options?: { create?: boolean; readwrite?: boolean });
    exec(sql: string): void;
    query<T = unknown>(sql: string): {
      get(params?: unknown[] | Record<string, unknown>): T | null;
      all(params?: unknown[] | Record<string, unknown>): T[];
      run(params?: unknown[] | Record<string, unknown>): unknown;
    };
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    close(): void;
  }
}
