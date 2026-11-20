/**
 * runFullAccountBackupCli.ts — the actual CLI entry point for
 * runFullAccountBackup.ts.
 *
 * Kept as a separate, tiny file — the same split dataCleanupDryRun.ts /
 * runDataCleanupDryRun.ts and decryptBackupArtifact.ts /
 * runDecryptBackupArtifact.ts already use — so that runFullAccountBackup.ts
 * itself has zero side effects on import and can be safely unit-tested.
 *
 * This is the file .github/workflows/full-account-backup.yml actually
 * bundles and runs with `node`. Without this file, esbuild-compiling
 * runFullAccountBackup.ts on its own produces a module that only DEFINES
 * and EXPORTS main() without ever CALLING it — `node` then loads it,
 * finds nothing to run at module scope, and exits in a few milliseconds
 * having never touched Firebase or written a backup file. See
 * runFullAccountBackupCli.test.ts for the test that catches exactly that
 * failure mode.
 *
 * Usage (from artifacts/api-server) — matches
 * .github/workflows/full-account-backup.yml:
 *
 *   OWNER_UID=<uid> BACKUP_ENCRYPTION_PASSPHRASE=<passphrase> \
 *     npx esbuild --bundle --platform=node --format=esm --packages=external \
 *     src/scripts/runFullAccountBackupCli.ts --outfile=.tmp-runFullAccountBackupCli.mjs \
 *     && node .tmp-runFullAccountBackupCli.mjs
 */

import { main } from "./runFullAccountBackup.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
