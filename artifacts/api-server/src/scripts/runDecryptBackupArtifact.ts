/**
 * runDecryptBackupArtifact.ts — the CLI entry point for
 * decryptBackupArtifact.ts. Run this on your OWN machine after
 * downloading an encrypted backup artifact — see decryptBackupArtifact.ts's
 * own doc comment for the exact usage.
 */

import { main } from "./decryptBackupArtifact.js";

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
