/**
 * runFirestoreOnlyBackupCli.ts — the actual CLI entry point for
 * firestoreOnlyBackup.ts.
 *
 * Kept as a separate, tiny file for the same reason as
 * runFullAccountBackupCli.ts / runFullAccountBackup.ts: firestoreOnlyBackup.ts
 * only DEFINES and EXPORTS main() so it stays side-effect-free and safely
 * importable by its own unit tests; this file is what actually calls
 * main() and sets the process exit code. This is the file
 * .github/workflows/firestore-only-backup.yml bundles and runs with
 * `node` — see runFirestoreOnlyBackupCli.test.ts for the regression test
 * that catches a compiled-but-never-executed script (the exact bug found
 * in "Kivora full account backup" run #2).
 *
 * Usage (from artifacts/api-server) — matches
 * .github/workflows/firestore-only-backup.yml:
 *
 *   OWNER_UID=<uid> BACKUP_ENCRYPTION_PASSPHRASE=<passphrase> \
 *     npx esbuild --bundle --platform=node --format=esm --packages=external \
 *     src/scripts/runFirestoreOnlyBackupCli.ts --outfile=.tmp-runFirestoreOnlyBackupCli.mjs \
 *     && node .tmp-runFirestoreOnlyBackupCli.mjs
 */

import { main } from "./firestoreOnlyBackup.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
