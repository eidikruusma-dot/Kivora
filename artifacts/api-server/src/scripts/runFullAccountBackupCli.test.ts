/**
 * Regression test for the exact bug found in GitHub Actions run #2 of
 * "Kivora full account backup": the workflow esbuild-compiled
 * runFullAccountBackup.ts and ran the result with `node`, but that file
 * only EXPORTS main() — it never CALLS it — so the step finished in ~1s
 * having done nothing (no Firebase calls, no backup file written), and
 * the next step failed to find kivora-backup-*.enc.
 *
 * These are pure source-text checks (no Firebase, no network, no
 * filesystem writes) — the same discipline as the other
 * safety-by-source-scan tests in this directory.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/runFullAccountBackupCli.test.ts --outfile=.tmp-runFullAccountBackupCli.test.mjs \
 *       && node .tmp-runFullAccountBackupCli.test.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    failed++;
  }
}

async function group(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  await fn();
}

const cliSrc = readFileSync(resolve(process.cwd(), "src/scripts/runFullAccountBackupCli.ts"), "utf8");
const coreSrc = readFileSync(resolve(process.cwd(), "src/scripts/runFullAccountBackup.ts"), "utf8");
const workflowSrc = readFileSync(resolve(process.cwd(), "../../.github/workflows/full-account-backup.yml"), "utf8");

await group("1. runFullAccountBackupCli.ts actually calls main() at module scope, not just imports it", () => {
  assert(
    cliSrc.includes('import { main } from "./runFullAccountBackup.js"'),
    "imports main from the pure core module",
  );
  assert(
    cliSrc.includes("main(process.argv.slice(2), process.env)"),
    "calls main() with the standard (argv, env) signature — an import with no call is exactly the bug this test exists to catch",
  );
  assert(
    /main\(process\.argv\.slice\(2\),\s*process\.env\)\s*\n?\s*\.then\(/.test(cliSrc),
    "the main() call is chained to .then(...) so a resolved exit code is actually used",
  );
  assert(
    cliSrc.includes("process.exit(exitCode)"),
    "the success path calls process.exit() with main()'s own exit code, so GitHub Actions sees a real pass/fail",
  );
  assert(
    cliSrc.includes(".catch(") && cliSrc.includes("process.exit(1)"),
    "an unexpected rejection also exits non-zero, rather than letting the step report green on a crash",
  );
});

await group("2. runFullAccountBackup.ts (the core) stays side-effect-free — it must NOT self-invoke", () => {
  assert(
    !/\bmain\(process\.argv/.test(coreSrc),
    "the core file never calls its own main() at module scope — that responsibility belongs only to runFullAccountBackupCli.ts, so the core stays safely importable by tests",
  );
  assert(
    !coreSrc.includes("process.exit("),
    "the core file never calls process.exit() itself",
  );
});

await group("3. the workflow actually builds and runs the CLI entry file, not the bare core file", () => {
  assert(
    workflowSrc.includes("src/scripts/runFullAccountBackupCli.ts"),
    "the workflow's esbuild step targets runFullAccountBackupCli.ts — the file that really executes main()",
  );
  assert(
    !workflowSrc.includes("src/scripts/runFullAccountBackup.ts --outfile"),
    "the workflow does NOT bundle the bare core file as if it were runnable on its own — that is precisely the configuration that produced a silent, no-op 'successful' step",
  );
  const runLines = workflowSrc
    .split("\n")
    .filter((line) => line.trim().startsWith("node ") || line.trim().startsWith("npx esbuild"));
  assert(runLines.length >= 2, "the workflow has both a build line and a node-run line for the backup step");
});

await group("4. the encrypted artifact's write path matches the artifact upload glob", () => {
  // runFullAccountBackup.ts writes `kivora-backup-${backupId}.enc` into
  // the process's current working directory; the workflow sets
  // working-directory: artifacts/api-server for the backup step, and the
  // upload step's path is relative to the repo root — they must agree.
  assert(
    coreSrc.includes('`kivora-backup-${backupId}.enc`'),
    "the core writes the encrypted file under the literal name kivora-backup-<id>.enc",
  );
  assert(
    workflowSrc.includes("path: artifacts/api-server/kivora-backup-*.enc"),
    "the upload-artifact step's path glob matches that same directory and filename pattern",
  );
  const backupStepMatch = workflowSrc.match(/name: Run the full account backup[\s\S]*?working-directory:\s*(\S+)/);
  assert(
    backupStepMatch?.[1] === "artifacts/api-server",
    "the backup step's working-directory is artifacts/api-server, so the relative filename the script writes lands exactly where the upload step's path glob looks for it",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
