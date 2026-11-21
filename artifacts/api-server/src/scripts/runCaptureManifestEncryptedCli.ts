/**
 * runCaptureManifestEncryptedCli.ts — the actual CLI entry point for
 * captureManifestEncrypted.ts.
 *
 * Kept as a separate, tiny file for the same reason as every other tool
 * in this project (runTestDataCleanupCli.ts, runFullAccountBackupCli.ts,
 * runFirestoreOnlyBackupCli.ts): captureManifestEncrypted.ts only DEFINES
 * and EXPORTS main() so it stays side-effect-free and safely importable
 * by its own unit tests; this file is what actually calls main() and
 * sets the process exit code.
 *
 * Usage (from artifacts/api-server):
 *
 *   EXPECTED_UID=<uid> EXPECTED_PROJECT_ID=<project-id> \
 *     MANIFEST_ENCRYPTION_PASSPHRASE=<passphrase> OWNER_EMAIL=<email> \
 *     npx esbuild --bundle --platform=node --format=esm --packages=external \
 *     src/scripts/runCaptureManifestEncryptedCli.ts --outfile=.tmp-runCaptureManifestEncryptedCli.mjs \
 *     && node .tmp-runCaptureManifestEncryptedCli.mjs
 *
 * This always runs in read-only "capture-manifest" mode — there is no
 * environment variable or CLI flag that changes that; see
 * captureManifestEncrypted.ts's own doc comment.
 */

import { main, formatSafeError, ErrorCode } from "./captureManifestEncrypted.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    // Same sanitized reporting as every error path inside main() itself —
    // this is the backstop for anything main() did not already catch, so
    // it must never fall back to printing the raw exception. See
    // captureManifestEncrypted.ts's own doc comment on formatSafeError().
    console.error(formatSafeError(ErrorCode.UNEXPECTED_CLI_FAILURE, err));
    process.exit(1);
  });
