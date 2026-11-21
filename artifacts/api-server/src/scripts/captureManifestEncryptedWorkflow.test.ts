/**
 * Source-scan tests for .github/workflows/capture-manifest-encrypted.yml —
 * the manually-triggered, read-only, encrypted manifest-capture workflow.
 *
 * Same style as the existing *.test.ts source-scan tests in this
 * directory (e.g. runFullAccountBackup.test.ts's test 4/5), applied to a
 * YAML file instead of a .ts one: read the file as plain text and assert
 * directly on its content. This is the only practical way to verify a
 * GitHub Actions workflow's shape without actually running it, which
 * this task is explicitly not allowed to do.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/captureManifestEncryptedWorkflow.test.ts --outfile=.tmp-captureManifestEncryptedWorkflow.mjs \
 *       && node .tmp-captureManifestEncryptedWorkflow.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const workflowPath = resolve(process.cwd(), "../../.github/workflows/capture-manifest-encrypted.yml");
const src = readFileSync(workflowPath, "utf8");

await group("1. Manually triggered only — no schedule, no push, no other automatic trigger", () => {
  assert(src.includes("workflow_dispatch"), "workflow_dispatch is present");
  assert(!/^\s*schedule:/m.test(src), "no cron schedule trigger exists in this file");
  assert(!/^\s*push:/m.test(src), "no push trigger exists in this file");
  assert(!/^\s*pull_request:/m.test(src), "no pull_request trigger exists in this file");
});

await group("2. The capture mode is hardcoded in the run step, never exposed as a workflow input", () => {
  assert(!src.includes("github.event.inputs.mode"), "no step reads a mode value from the trigger inputs");
  assert(
    src.includes("runCaptureManifestEncryptedCli.ts"),
    "the run step invokes the dedicated, mode-hardcoded entry point (see that file's own source-scan tests) rather than the general-purpose CLI",
  );
});

await group("2b. The target account (email + expected uid) is no longer a workflow_dispatch input at all — it comes from secrets instead", () => {
  assert(/workflow_dispatch:\s*\{\s*\}/.test(src), "workflow_dispatch declares no inputs — the trigger form has no fields to fill in");
  assert(!/^\s*inputs:/m.test(src), "no 'inputs:' key exists anywhere in this file");
  assert(!src.includes("github.event.inputs"), "no step reads anything from github.event.inputs — that whole mechanism is unused now");
  assert(!src.includes("owner_email:"), "the old owner_email input field definition is gone");
  assert(!src.includes("expected_uid:"), "the old expected_uid input field definition is gone");
});

await group("3. Deletion-related variables are entirely absent from this workflow's environment", () => {
  assert(!src.includes("CONFIRMATION_PHRASE"), "the delete-confirmation phrase is never defined or referenced");
  assert(!src.includes("BACKUP_ID"), "no backup-id variable is defined — this read-only capture needs no backup gate");
  assert(!src.includes("CONFIRM_FINANCE_DELETION"), "the finance deletion-confirmation variable is never defined");
  assert(!src.includes("CONFIRM_DOCUMENTS_DELETION"), "the documents deletion-confirmation variable is never defined");
});

await group("4. Minimum permissions and no write-capable scope anywhere", () => {
  assert(/permissions:\s*\n\s*contents:\s*read/.test(src), 'permissions is exactly "contents: read"');
  assert(!/contents:\s*write/.test(src), "no job or step escalates to write permissions");
});

await group("5. The artifact is encrypted, short-retention, and the upload is gated on success", () => {
  assert(src.includes("retention-days: 1"), "artifact retention is set to exactly 1 day");
  assert(src.includes("kivora-manifest-*.enc"), "only the encrypted .enc artifact path is uploaded — never a plaintext file");
  assert(!/path:\s*.*\.json/.test(src), "no plaintext .json manifest file is ever referenced as an upload path");
  assert(/if:\s*success\(\)/.test(src), "the upload step only runs when the capture step itself succeeded");
  assert(src.includes("if-no-files-found: error"), "a missing encrypted artifact fails the job loudly, instead of silently uploading nothing");
});

await group("6. Local files are always removed from the runner, including on failure", () => {
  const cleanupStepMatch = src.match(/Clean up local files[\s\S]*?run:\s*(.*)/);
  assert(cleanupStepMatch !== null, "a dedicated cleanup step exists");
  const cleanupBlock = src.slice(src.indexOf("Clean up local files"));
  assert(/if:\s*always\(\)/.test(cleanupBlock.slice(0, 200)), "the cleanup step runs with if: always() — it runs even if an earlier step failed");
  assert(cleanupBlock.includes("rm -f"), "the cleanup step actually removes files, not just logs an intention to");
  assert(cleanupBlock.includes("kivora-manifest-*.enc"), "the cleanup step removes the encrypted artifact file from the runner's disk");
});

await group("7. No step ever echoes a secret or the passphrase into the log", () => {
  assert(!/echo\s+.*secrets\./.test(src), "no step echoes a GitHub Actions secret value directly — this generic check covers every secret this workflow uses, including MANIFEST_OWNER_EMAIL and MANIFEST_EXPECTED_UID");
  assert(!/echo\s+.*passphrase/i.test(src), "no step echoes anything resembling the passphrase");
  assert(!/cat\s+.*\.enc/.test(src), "no step prints the encrypted artifact's bytes to the log either");
  assert(!/echo\s+.*MANIFEST_OWNER_EMAIL/.test(src), "no step echoes the MANIFEST_OWNER_EMAIL secret by name either");
  assert(!/echo\s+.*MANIFEST_EXPECTED_UID/.test(src), "no step echoes the MANIFEST_EXPECTED_UID secret by name either");
  assert(!src.includes("outputs:"), "this workflow never defines a job/step output — the account identity and uid can never leak through that channel");
});

await group("8. New secrets this workflow depends on are each referenced exactly where expected", () => {
  assert(src.includes("secrets.EXPECTED_PROJECT_ID"), "EXPECTED_PROJECT_ID is sourced from a secret, not hardcoded in this file");
  assert(src.includes("secrets.MANIFEST_ENCRYPTION_PASSPHRASE"), "MANIFEST_ENCRYPTION_PASSPHRASE is sourced from a secret, not hardcoded in this file");
  assert(
    !new RegExp(`EXPECTED_PROJECT_ID:\\s*\\$\\{\\{\\s*secrets\\.FIREBASE_PROJECT_ID`).test(src),
    "EXPECTED_PROJECT_ID is NOT wired to the same secret as FIREBASE_PROJECT_ID — comparing a secret to itself would validate nothing",
  );
});

await group("8b. The target account's email and expected uid come from their OWN new secrets, passed through as environment variables", () => {
  assert(
    /OWNER_EMAIL:\s*\$\{\{\s*secrets\.MANIFEST_OWNER_EMAIL\s*\}\}/.test(src),
    "the OWNER_EMAIL environment variable the CLI reads is sourced from the MANIFEST_OWNER_EMAIL secret",
  );
  assert(
    /EXPECTED_UID:\s*\$\{\{\s*secrets\.MANIFEST_EXPECTED_UID\s*\}\}/.test(src),
    "the EXPECTED_UID environment variable the CLI reads is sourced from the MANIFEST_EXPECTED_UID secret",
  );
  assert(
    !/OWNER_EMAIL:\s*\$\{\{\s*github\.event/.test(src) && !/EXPECTED_UID:\s*\$\{\{\s*github\.event/.test(src),
    "neither environment variable is sourced from a workflow_dispatch input anymore",
  );
  assert(
    !new RegExp(`MANIFEST_OWNER_EMAIL:\\s*\\$\\{\\{\\s*secrets\\.MANIFEST_EXPECTED_UID`).test(src) &&
      !new RegExp(`MANIFEST_EXPECTED_UID:\\s*\\$\\{\\{\\s*secrets\\.MANIFEST_OWNER_EMAIL`).test(src),
    "sanity check: the two new secrets are not accidentally cross-wired to each other",
  );
});

await group("9. Verbose Firebase/gRPC/Google-SDK debug logging is never enabled — the SDK's own internal logs could otherwise bypass this project's own sanitized error reporting entirely", () => {
  const verboseLoggingVars = [
    "GRPC_VERBOSITY",
    "GRPC_TRACE",
    "GOOGLE_SDK_NODE_LOGGING",
    "FIRESTORE_ENABLE_LOGGING",
    "DEBUG",
    "NODE_DEBUG",
    "ACTIONS_STEP_DEBUG",
    "ACTIONS_RUNNER_DEBUG",
  ];
  for (const varName of verboseLoggingVars) {
    assert(!src.includes(varName), `${varName} is never set anywhere in this workflow`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
