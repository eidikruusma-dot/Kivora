/**
 * decryptBackupArtifact.ts — standalone, LOCAL-ONLY helper to decrypt a
 * downloaded Kivora backup artifact.
 *
 * Needs no Firebase credentials and makes no network call at all —
 * decryption is pure node:crypto (see backupEncryption.ts). This is meant
 * to be run on your OWN machine, after downloading the encrypted
 * artifact file from the GitHub Actions run's "Artifacts" section.
 *
 * Usage (from artifacts/api-server, or anywhere once built — this file
 * has no dependency on being run from this repo):
 *
 *   BACKUP_ENCRYPTION_PASSPHRASE='your-passphrase' \
 *     node runDecryptBackupArtifact.mjs kivora-backup-2026-01-01.zip.enc
 *
 * Writes the decrypted bytes to the same name with ".enc" stripped
 * (kivora-backup-2026-01-01.zip in the example above), or to an explicit
 * second argument if given. Never logs the passphrase, and never embeds
 * it in the output file.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { decryptBackup } from "./backupEncryption.js";

export interface ParsedArgs {
  inputPath: string;
  outputPath: string;
}

/** Returns null (never throws) when no input path was given — the caller decides how to report that. */
export function parseArgs(argv: string[]): ParsedArgs | null {
  const inputPath = argv[0];
  if (!inputPath) return null;
  const outputPath = argv[1] ?? (inputPath.endsWith(".enc") ? inputPath.slice(0, -".enc".length) : `${inputPath}.decrypted`);
  return { inputPath, outputPath };
}

/** Reads, decrypts, and writes — throws BackupDecryptionError (via decryptBackup) on a wrong passphrase or corrupted/tampered input. */
export function decryptFile(inputPath: string, outputPath: string, passphrase: string): void {
  const encrypted = readFileSync(inputPath);
  const decrypted = decryptBackup(encrypted, passphrase);
  writeFileSync(outputPath, decrypted);
}

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const args = parseArgs(argv);
  if (!args) {
    console.error(
      "Kasutus: node runDecryptBackupArtifact.mjs <sisend.enc> [väljund-fail]\n" +
        "Vajalik keskkonnamuutuja: BACKUP_ENCRYPTION_PASSPHRASE",
    );
    return 1;
  }

  const passphrase = env["BACKUP_ENCRYPTION_PASSPHRASE"];
  if (!passphrase) {
    console.error(
      "Keskkonnamuutuja BACKUP_ENCRYPTION_PASSPHRASE on vajalik — see on Teie enda valitud parool, " +
        "mida kasutati varukoopia krüpteerimisel.",
    );
    return 1;
  }

  try {
    decryptFile(args.inputPath, args.outputPath, passphrase);
    console.log(`Dekrüpteeritud: ${args.outputPath}`);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
