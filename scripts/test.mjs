import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
await build({
  absWorkingDir: projectRoot,
  entryPoints: ["./tests/assessment.test.ts", "./tests/resilience.test.ts"],
  outdir: "./test-results",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: "inline",
});
const r = spawnSync(
  process.execPath,
  [
    "--test",
    "test-results/assessment.test.mjs",
    "test-results/resilience.test.mjs",
  ],
  { stdio: "inherit" },
);
process.exitCode = r.status ?? 1;
