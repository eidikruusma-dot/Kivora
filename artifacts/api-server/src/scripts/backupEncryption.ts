/**
 * backupEncryption.ts — authenticated encryption for the full-account-
 * backup artifact uploaded to GitHub Actions.
 *
 * AES-256-GCM via Node's built-in `crypto` module — no external binary
 * (no OpenSSL subprocess), no new npm dependency. GCM is an AEAD
 * (authenticated encryption with associated data) cipher: it produces an
 * authentication tag alongside the ciphertext, and decryption verifies
 * that tag before returning anything. A corrupted or tampered ciphertext
 * — even a single flipped byte — makes decryptBackup() throw instead of
 * silently returning garbage. This is the integrity check on decryption
 * requirement, not a separate step bolted on afterward.
 *
 * The encryption key itself is never generated or stored by this file —
 * it is derived (via PBKDF2-SHA256, a random salt per encryption) from a
 * passphrase the caller already holds (the GitHub Actions secret
 * BACKUP_ENCRYPTION_PASSPHRASE, which the account owner chose and typed
 * in themselves). This file never logs, returns, or embeds that
 * passphrase anywhere in its output — only the derived ciphertext bytes.
 *
 * Output format (all in one self-contained Buffer, nothing else needed
 * besides the passphrase to decrypt later):
 *   [ 16-byte salt | 12-byte IV | 16-byte auth tag | ciphertext... ]
 */

import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // 96-bit IV — the size GCM is designed for
const SALT_LENGTH_BYTES = 16;
const AUTH_TAG_LENGTH_BYTES = 16;
/** PBKDF2 iteration count — in line with current (2026) OWASP guidance for PBKDF2-HMAC-SHA256. */
const PBKDF2_ITERATIONS = 600_000;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH_BYTES, "sha256");
}

/**
 * Encrypts `plaintext` with AES-256-GCM. A fresh random salt and IV are
 * generated on every call — encrypting the same plaintext twice with the
 * same passphrase never produces the same ciphertext, and no secret
 * state is reused across calls.
 */
export function encryptBackup(plaintext: Buffer, passphrase: string): Buffer {
  if (passphrase.length === 0) {
    throw new Error("encryptBackup: passphrase must not be empty.");
  }
  const salt = randomBytes(SALT_LENGTH_BYTES);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, ciphertext]);
}

export class BackupDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupDecryptionError";
  }
}

/**
 * Decrypts a buffer produced by encryptBackup(). Throws
 * BackupDecryptionError — never returns a partial or corrupted result —
 * when the passphrase is wrong, or the file is truncated, or any byte of
 * it was altered: GCM's authentication tag check happens inside
 * decipher.final(), before any plaintext is released to the caller.
 */
export function decryptBackup(encrypted: Buffer, passphrase: string): Buffer {
  const headerLength = SALT_LENGTH_BYTES + IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES;
  if (encrypted.length < headerLength) {
    throw new BackupDecryptionError(
      `Krüpteeritud fail on liiga lühike (${encrypted.length} baiti) — see ei saa olla kehtiv varukoopia.`,
    );
  }

  const salt = encrypted.subarray(0, SALT_LENGTH_BYTES);
  const iv = encrypted.subarray(SALT_LENGTH_BYTES, SALT_LENGTH_BYTES + IV_LENGTH_BYTES);
  const authTag = encrypted.subarray(
    SALT_LENGTH_BYTES + IV_LENGTH_BYTES,
    headerLength,
  );
  const ciphertext = encrypted.subarray(headerLength);

  const key = deriveKey(passphrase, salt);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    // node:crypto throws a generic "Unsupported state or unable to
    // authenticate data" on a bad passphrase or any tampering — translate
    // it into this module's own error type so callers never need to know
    // node:crypto's internal error message shape, and so this message
    // never includes the passphrase or any derived key material.
    throw new BackupDecryptionError(
      "Varukoopia dekrüpteerimine ebaõnnestus — vale parool või fail on rikutud/muudetud.",
    );
  }
}
