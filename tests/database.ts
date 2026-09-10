import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
// Real SQLite, with only D1's transport interface adapted. Tests execute the same
// generated migration and parameterized SQL used by the deployed application.
export function database(filename = ":memory:") {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync("drizzle").filter((f) => f.endsWith(".sql")))
    sqlite.exec(readFileSync(`drizzle/${f}`, "utf8"));
  return wrap(sqlite);
}
export function reopen(filename: string) {
  return wrap(new DatabaseSync(filename));
}
function wrap(sqlite: DatabaseSync) {
  function statement(sql: string, args: any[] = []): any {
    return {
      bind: (...values: any[]) => statement(sql, values),
      async first() {
        return sqlite.prepare(sql).get(...args) ?? null;
      },
      async all() {
        return {
          results: sqlite.prepare(sql).all(...args),
          success: true,
          meta: {},
        };
      },
      async run() {
        const r = sqlite.prepare(sql).run(...args);
        return {
          results: [],
          success: true,
          meta: { changes: Number(r.changes) },
        };
      },
      _sql: sql,
      _args: args,
    };
  }
  const db = {
    prepare: statement,
    async batch(list: any[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = [];
        for (const s of list) {
          if (/^\s*SELECT/i.test(s._sql)) result.push(await s.all());
          else result.push(await s.run());
        }
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    sqlite,
    close: () => sqlite.close(),
  };
  return db as unknown as D1Database & {
    sqlite: DatabaseSync;
    close: () => void;
  };
}
