import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Use Wrangler's migration ledger rather than replaying CREATE TABLE statements.
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
const binding = config.d1_databases?.find((x) => x.binding === "DB");
if (!binding) throw Error("Build the project with the DB binding first.");
const files = readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort();
// Drizzle-generated files are applied once through a small local ledger.
const run = (args) => {
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "./node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
      ...args,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    process.stderr.write(r.stderr);
    process.stdout.write(r.stdout);
    throw Error("Local migration failed");
  }
  return r.stdout;
};
run([
  "--command",
  "CREATE TABLE IF NOT EXISTS carecloud_local_migrations (name TEXT PRIMARY KEY)",
]);
for (const file of files) {
  const result = run([
    "--command",
    `SELECT name FROM carecloud_local_migrations WHERE name = '${file.replaceAll("'", "''")}'`,
    "--json",
  ]);
  const parsed = JSON.parse(result);
  if (parsed.some((x) => x.results?.length)) continue;
  run(["--file", "drizzle/" + file]);
  run([
    "--command",
    `INSERT INTO carecloud_local_migrations (name) VALUES ('${file.replaceAll("'", "''")}')`,
  ]);
  console.log("Applied " + file);
}
console.log("Local database is ready.");
