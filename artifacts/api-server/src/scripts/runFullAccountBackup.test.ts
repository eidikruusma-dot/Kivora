/**
 * Unit tests for runFullAccountBackup.ts's main() — specifically its
 * fail-fast validation order, the same testing philosophy as
 * dataCleanupDryRun.test.ts and grantOwnerRole.test.ts: only the
 * failure paths that genuinely need no real Firebase credentials are
 * exercised here. The orchestration's actual successful path (discovery,
 * writes, encryption, the restorability check) is already covered by
 * fullAccountBackup.test.ts, restoreVerification.test.ts,
 * backupEncryption.test.ts, and fullBackupRestoreChain.test.ts against
 * fakes — main() itself is thin glue over those already-proven pieces.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/runFullAccountBackup.test.ts --outfile=.tmp-runFullAccountBackup.mjs \
 *       && node .tmp-runFullAccountBackup.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { main } from "./runFullAccountBackup.js";

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

await group("1. main() fails safely with no target account and no Admin calls", async () => {
  const code = await main([], { BACKUP_ENCRYPTION_PASSPHRASE: "irrelevant-here" });
  assert(code === 1, "returns exit code 1 when no account is resolvable");
});

await group("2. main() fails fast on a missing passphrase — BEFORE attempting any Firebase Admin call", async () => {
  // Real FIREBASE_* env vars are absent in this test process too, but the
  // point of this test is the ORDER: the error message must name the
  // passphrase specifically, proving that check runs first, rather than
  // being masked by (or racing) the generic "Admin unavailable" failure.
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (msg: unknown) => { messages.push(String(msg)); };
  try {
    const code = await main(["someone@example.com"], {});
    assert(code === 1, "returns exit code 1 when the passphrase is missing");
    assert(
      messages.some((m) => m.includes("BACKUP_ENCRYPTION_PASSPHRASE")),
      "the specific, named error mentions BACKUP_ENCRYPTION_PASSPHRASE, not a generic failure",
    );
  } finally {
    console.error = originalError;
  }
});

await group("3. main() fails safely when Admin credentials are absent, once the passphrase check has passed", async () => {
  const code = await main(["someone@example.com"], { BACKUP_ENCRYPTION_PASSPHRASE: "a-passphrase" });
  assert(code === 1, "returns exit code 1 when Admin is unavailable, without contacting Firebase");
});

await group("4. runFullAccountBackup.ts never calls restoreFromBackup against the real users/{uid} root", () => {
  const src = readFileSync(resolve(process.cwd(), "src/scripts/runFullAccountBackup.ts"), "utf8");
  assert(
    !src.includes("restoreFromBackup("),
    "this file never imports/calls restoreFromBackup() directly — the only restore-shaped call anywhere in the chain is inside verifyRestorability(), which is scratch-path-only",
  );
  assert(src.includes("verifyRestorability("), "it does call the scratch-only restorability check, as intended");
  assert(!src.includes(".delete("), "this orchestration file itself never calls delete — cleanup, if any, lives entirely inside restoreVerification.ts");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
