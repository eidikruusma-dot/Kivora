/**
 * Unit tests for runCaptureManifestEncryptedCli.ts — same "compiled but
 * never executed" regression check as runTestDataCleanupCli.test.ts /
 * runFullAccountBackupCli.test.ts.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/runCaptureManifestEncryptedCli.test.ts --outfile=.tmp-runCaptureManifestEncryptedCli.mjs \
 *       && node .tmp-runCaptureManifestEncryptedCli.mjs
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

await group("1. runCaptureManifestEncryptedCli.ts actually calls main() at module scope, not just imports it", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/runCaptureManifestEncryptedCli.ts"), "utf8");
  assert(src.includes('import { main } from "./captureManifestEncrypted.js"'), "imports main from the pure core module");
  assert(/main\(process\.argv\.slice\(2\), process\.env\)/.test(src), "calls main() with the standard (argv, env) signature");
  assert(src.includes(".then("), "the main() call is chained to .then(...) so a resolved exit code is actually used");
  assert(/\.then\(\s*\(exitCode\)\s*=>\s*\{\s*process\.exit\(exitCode\)/.test(src), "the success path calls process.exit() with main()'s own exit code");
  assert(src.includes(".catch("), "an unexpected rejection also exits non-zero");
});

await group("2. captureManifestEncrypted.ts (the core) stays side-effect-free — it must NOT self-invoke", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureManifestEncrypted.ts"), "utf8");
  assert(
    !/^\s*main\(/m.test(src.replace(/export async function main[\s\S]*/, "")),
    "the core file never calls its own main() at module scope",
  );
  assert(!src.includes("process.exit("), "the core file never calls process.exit() itself");
});

await group("3. captureManifestEncrypted.ts never reuses or imports accountDeletionService.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/captureManifestEncrypted.ts"), "utf8");
  assert(!src.includes("accountDeletionService"), "no reference anywhere to the account-deletion feature this tool deliberately does not reuse");
  assert(!src.includes("deleteAllUserData"), "never calls the full-account-deletion function");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
