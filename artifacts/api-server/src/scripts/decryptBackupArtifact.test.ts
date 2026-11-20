/**
 * Unit tests for decryptBackupArtifact.ts.
 *
 * Exercises the real encrypt/decrypt/file-I/O path against a temp file —
 * still no Firebase, no network. Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/decryptBackupArtifact.test.ts --outfile=.tmp-decryptBackupArtifact.mjs \
 *       && node .tmp-decryptBackupArtifact.mjs
 */

import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptBackup } from "./backupEncryption.js";
import { parseArgs, decryptFile, main } from "./decryptBackupArtifact.js";

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

await group("1. parseArgs", () => {
  assert(parseArgs([]) === null, "no arguments at all returns null, never guesses an input file");
  const a = parseArgs(["backup-2026.zip.enc"]);
  assert(a?.outputPath === "backup-2026.zip", "default output path strips exactly one trailing .enc");
  const b = parseArgs(["backup-2026.zip.enc", "custom-output.zip"]);
  assert(b?.outputPath === "custom-output.zip", "an explicit second argument overrides the default output path");
});

await group("2. decryptFile round-trips a real file on disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "kivora-backup-test-"));
  try {
    const plaintext = Buffer.from(JSON.stringify({ hello: "varukoopia" }), "utf8");
    const encrypted = encryptBackup(plaintext, "test-passphrase-xyz");
    const inputPath = join(dir, "backup.zip.enc");
    const outputPath = join(dir, "backup.zip");
    writeFileSync(inputPath, encrypted);

    decryptFile(inputPath, outputPath, "test-passphrase-xyz");
    const result = readFileSync(outputPath);
    assert(result.equals(plaintext), "the decrypted file on disk matches the original plaintext exactly");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await group("3. main() fails clearly, without crashing, for missing args/passphrase", async () => {
  const codeNoArgs = await main([], {});
  assert(codeNoArgs === 1, "no input file argument returns exit code 1");

  const codeNoPassphrase = await main(["some-file.enc"], {});
  assert(codeNoPassphrase === 1, "missing BACKUP_ENCRYPTION_PASSPHRASE returns exit code 1, never proceeds without it");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
