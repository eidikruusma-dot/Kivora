/**
 * Unit tests for backupEncryption.ts.
 *
 * Pure node:crypto, no network, no Firebase. Proves: round-trip fidelity,
 * that a wrong passphrase is rejected (not silently "decrypted" into
 * garbage), and — the specific requirement this test exists for — that
 * tampering with even a single ciphertext byte is caught by GCM's
 * authentication tag at decrypt time, never silently accepted.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/backupEncryption.test.ts --outfile=.tmp-backupEncryption.mjs \
 *       && node .tmp-backupEncryption.mjs
 */

import { encryptBackup, decryptBackup, BackupDecryptionError } from "./backupEncryption.js";

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

await group("1. round-trip: encrypt then decrypt returns the exact original bytes", () => {
  const plaintext = Buffer.from(JSON.stringify({ tasks: [{ id: "t1", title: "Õppida eksamiks" }] }), "utf8");
  const encrypted = encryptBackup(plaintext, "a-strong-passphrase-123");
  const decrypted = decryptBackup(encrypted, "a-strong-passphrase-123");
  assert(decrypted.equals(plaintext), "decrypted bytes are byte-for-byte identical to the original plaintext");
});

await group("2. the passphrase never appears in the encrypted output", () => {
  const passphrase = "unmistakeable-marker-ZZZ999";
  const plaintext = Buffer.from("some backup content", "utf8");
  const encrypted = encryptBackup(plaintext, passphrase);
  assert(!encrypted.toString("latin1").includes(passphrase), "the passphrase string is not present anywhere in the encrypted buffer");
});

await group("3. encrypting the same plaintext twice never produces the same ciphertext", () => {
  const plaintext = Buffer.from("identical content", "utf8");
  const a = encryptBackup(plaintext, "same-passphrase");
  const b = encryptBackup(plaintext, "same-passphrase");
  assert(!a.equals(b), "fresh random salt+IV per call means two encryptions of the same data differ");
  assert(decryptBackup(a, "same-passphrase").equals(plaintext), "the first still decrypts correctly");
  assert(decryptBackup(b, "same-passphrase").equals(plaintext), "the second still decrypts correctly");
});

await group("4. a wrong passphrase is rejected, not silently decrypted into garbage", () => {
  const plaintext = Buffer.from("sensitive content", "utf8");
  const encrypted = encryptBackup(plaintext, "correct-passphrase");
  let threw = false;
  try {
    decryptBackup(encrypted, "wrong-passphrase");
  } catch (err) {
    threw = err instanceof BackupDecryptionError;
  }
  assert(threw, "decrypting with the wrong passphrase throws BackupDecryptionError");
});

await group("5. tampering with the ciphertext is caught by the authentication tag (the AEAD integrity guarantee)", () => {
  const plaintext = Buffer.from("do not let this be silently corrupted", "utf8");
  const encrypted = encryptBackup(plaintext, "passphrase-abc");

  // Flip one bit deep in the ciphertext portion (well past the salt/IV/tag header).
  const tampered = Buffer.from(encrypted);
  const tamperIndex = tampered.length - 1;
  tampered[tamperIndex] = tampered[tamperIndex] ^ 0x01;

  let threw = false;
  try {
    decryptBackup(tampered, "passphrase-abc");
  } catch (err) {
    threw = err instanceof BackupDecryptionError;
  }
  assert(threw, "a single flipped bit in the ciphertext makes decryption throw, never return corrupted plaintext silently");
});

await group("6. a truncated/malformed file is rejected with a clear error, not a crash", () => {
  let threw = false;
  try {
    decryptBackup(Buffer.from("too short"), "any-passphrase");
  } catch (err) {
    threw = err instanceof BackupDecryptionError;
  }
  assert(threw, "a buffer shorter than the salt+IV+tag header throws BackupDecryptionError cleanly");
});

await group("7. an empty passphrase is rejected at encrypt time", () => {
  let threw = false;
  try {
    encryptBackup(Buffer.from("x"), "");
  } catch {
    threw = true;
  }
  assert(threw, "encryptBackup refuses an empty passphrase rather than silently using a weak/no key");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
