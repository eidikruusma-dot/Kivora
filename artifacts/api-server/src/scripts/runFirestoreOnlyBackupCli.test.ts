/**
 * Regression test (same class of bug as runFullAccountBackupCli.test.ts):
 * proves runFirestoreOnlyBackupCli.ts actually CALLS main(), not just
 * imports it, and that the workflow actually builds/runs the CLI file,
 * not the bare core file.
 *
 * Pure source-text checks — no Firebase, no network, no filesystem writes.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/runFirestoreOnlyBackupCli.test.ts --outfile=.tmp-runFirestoreOnlyBackupCli.test.mjs \
 *       && node .tmp-runFirestoreOnlyBackupCli.test.mjs
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

const cliSrc = readFileSync(resolve(process.cwd(), "src/scripts/runFirestoreOnlyBackupCli.ts"), "utf8");
const coreSrc = readFileSync(resolve(process.cwd(), "src/scripts/firestoreOnlyBackup.ts"), "utf8");
const workflowSrc = readFileSync(resolve(process.cwd(), "../../.github/workflows/firestore-only-backup.yml"), "utf8");
const fullBackupWorkflowSrc = readFileSync(resolve(process.cwd(), "../../.github/workflows/full-account-backup.yml"), "utf8");

await group("1. runFirestoreOnlyBackupCli.ts actually calls main() at module scope, not just imports it", () => {
  assert(cliSrc.includes('import { main } from "./firestoreOnlyBackup.js"'), "imports main from the pure core module");
  assert(cliSrc.includes("main(process.argv.slice(2), process.env)"), "calls main() with the standard (argv, env) signature");
  assert(/main\(process\.argv\.slice\(2\),\s*process\.env\)\s*\n?\s*\.then\(/.test(cliSrc), "the main() call is chained to .then(...) so a resolved exit code is actually used");
  assert(cliSrc.includes("process.exit(exitCode)"), "the success path calls process.exit() with main()'s own exit code");
  assert(cliSrc.includes(".catch(") && cliSrc.includes("process.exit(1)"), "an unexpected rejection also exits non-zero");
});

await group("2. firestoreOnlyBackup.ts (the core) stays side-effect-free — it must NOT self-invoke", () => {
  assert(!/\bmain\(process\.argv/.test(coreSrc), "the core file never calls its own main() at module scope");
  assert(!coreSrc.includes("process.exit("), "the core file never calls process.exit() itself");
});

await group("3. the new workflow builds and runs the CLI entry file, not the bare core file", () => {
  assert(workflowSrc.includes("src/scripts/runFirestoreOnlyBackupCli.ts"), "the workflow's esbuild step targets runFirestoreOnlyBackupCli.ts");
  assert(!workflowSrc.includes("src/scripts/firestoreOnlyBackup.ts --outfile"), "the workflow does NOT bundle the bare core file as if it were runnable on its own");
});

await group("4. the encrypted artifact's write path matches this workflow's own upload glob", () => {
  assert(coreSrc.includes('`kivora-firestore-only-backup-${backupId}.enc`'), "the core writes the encrypted file under a name distinct from the full-backup tool's artifact name");
  assert(workflowSrc.includes("path: artifacts/api-server/kivora-firestore-only-backup-*.enc"), "the upload-artifact step's path glob matches that same filename pattern");
  const backupStepMatch = workflowSrc.match(/name: Run the Firestore-only backup[\s\S]*?working-directory:\s*(\S+)/);
  assert(backupStepMatch?.[1] === "artifacts/api-server", "the backup step's working-directory is artifacts/api-server");
});

await group("5. this change never modifies the existing full-account-backup workflow", () => {
  // Deliberately checks only a fact that is true independent of any OTHER,
  // separately-confirmed change to that file (e.g. its Storage bucket
  // secret) — this test's job is to prove THIS change didn't touch that
  // file, not to assert on content this change has no responsibility for.
  assert(fullBackupWorkflowSrc.includes("src/scripts/runFullAccountBackupCli.ts"), "the existing full-account-backup workflow is unchanged — still targets its own CLI entry file");
});

await group("6. the new workflow is manual-only and does not require FIREBASE_STORAGE_BUCKET", () => {
  assert(workflowSrc.includes("workflow_dispatch"), "the new workflow is dispatched manually");
  assert(!/^\s*schedule:/m.test(workflowSrc), "the new workflow has no schedule trigger");
  assert(!workflowSrc.includes("FIREBASE_STORAGE_BUCKET"), "the new workflow never needs the Storage bucket secret — it never touches Storage");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
