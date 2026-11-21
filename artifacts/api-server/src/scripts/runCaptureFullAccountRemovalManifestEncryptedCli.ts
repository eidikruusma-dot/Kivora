/**
 * runCaptureFullAccountRemovalManifestEncryptedCli.ts — the actual CLI
 * entry point for captureFullAccountRemovalManifestEncrypted.ts.
 *
 * Kept as a separate, tiny file for the same reason as every other tool
 * in this project: captureFullAccountRemovalManifestEncrypted.ts only
 * DEFINES and EXPORTS main() so it stays side-effect-free and safely
 * importable by its own unit tests; this file is what actually calls
 * main() and sets the process exit code.
 *
 * This always runs in read-only "capture-manifest" mode — there is no
 * environment variable or CLI flag that changes that; see
 * captureFullAccountRemovalManifestEncrypted.ts's own doc comment.
 */

import { main, formatSafeError, ErrorCode } from "./captureFullAccountRemovalManifestEncrypted.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(formatSafeError(ErrorCode.UNEXPECTED_CLI_FAILURE, err));
    process.exit(1);
  });
