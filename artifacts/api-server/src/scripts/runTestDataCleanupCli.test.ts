/**
 * Regression test (same class as runFullAccountBackupCli.test.ts and
 * runFirestoreOnlyBackupCli.test.ts): proves runTestDataCleanupCli.ts
 * actually calls main(), not just imports it, and that testDataCleanup.ts
 * itself stays side-effect-free.
 *
 * Pure source-text checks — no Firebase, no network, no filesystem writes.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/runTestDataCleanupCli.test.ts --outfile=.tmp-runTestDataCleanupCli.test.mjs \
 *       && node .tmp-runTestDataCleanupCli.test.mjs
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

const cliSrc = readFileSync(resolve(process.cwd(), "src/scripts/runTestDataCleanupCli.ts"), "utf8");
const coreSrc = readFileSync(resolve(process.cwd(), "src/scripts/testDataCleanup.ts"), "utf8");

await group("1. runTestDataCleanupCli.ts actually calls main() at module scope, not just imports it", () => {
  assert(cliSrc.includes('import { main } from "./testDataCleanup.js"'), "imports main from the pure core module");
  assert(cliSrc.includes("main(process.argv.slice(2), process.env)"), "calls main() with the standard (argv, env) signature");
  assert(/main\(process\.argv\.slice\(2\),\s*process\.env\)\s*\n?\s*\.then\(/.test(cliSrc), "the main() call is chained to .then(...) so a resolved exit code is actually used");
  assert(cliSrc.includes("process.exit(exitCode)"), "the success path calls process.exit() with main()'s own exit code");
  assert(cliSrc.includes(".catch(") && cliSrc.includes("process.exit(1)"), "an unexpected rejection also exits non-zero");
});

await group("2. testDataCleanup.ts (the core) stays side-effect-free — it must NOT self-invoke", () => {
  assert(!/\bmain\(process\.argv/.test(coreSrc), "the core file never calls its own main() at module scope");
  assert(!coreSrc.includes("process.exit("), "the core file never calls process.exit() itself");
});

await group("3. testDataCleanup.ts never reuses or imports accountDeletionService.ts", () => {
  assert(!coreSrc.includes("accountDeletionService"), "no reference anywhere to the account-deletion feature this tool deliberately does not reuse");
  assert(!coreSrc.includes("deleteAllUserData"), "never calls the full-account-deletion function");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
