/**
 * Source-scan tests for
 * .github/workflows/capture-full-account-removal-manifest-encrypted.yml
 * — the manually-triggered, read-only, encrypted full-account-removal
 * manifest-capture workflow.
 *
 * Same style as captureManifestEncryptedWorkflow.test.ts: read the YAML
 * file as plain text and assert directly on its content, since actually
 * running the workflow is explicitly out of scope for this task.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/captureFullAccountRemovalManifestEncryptedWorkflow.test.ts --outfile=.tmp-cfarmew.mjs \
 *       && node .tmp-cfarmew.mjs
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

const workflowPath = resolve(process.cwd(), "../../.github/workflows/capture-full-account-removal-manifest-encrypted.yml");
const src = readFileSync(workflowPath, "utf8");

await group("1. Manually triggered only, with NO inputs at all — no schedule, no push, no form fields", () => {
  assert(src.includes("workflow_dispatch"), "workflow_dispatch is present");
  assert(/workflow_dispatch:\s*\{\s*\}/.test(src), "workflow_dispatch declares no inputs — the trigger form has no fields to fill in");
  assert(!/^\s*inputs:/m.test(src), "no 'inputs:' key exists anywhere in this file");
  assert(!src.includes("github.event.inputs"), "no step reads anything from github.event.inputs");
  assert(!/^\s*schedule:/m.test(src), "no cron schedule trigger exists");
  assert(!/^\s*push:/m.test(src), "no push trigger exists");
  assert(!/^\s*pull_request:/m.test(src), "no pull_request trigger exists");
});

await group("2. The capture mode is hardcoded in the run step, never exposed anywhere on this trigger", () => {
  assert(!src.includes("github.event.inputs.mode"), "no step reads a mode value from trigger inputs — there are none");
  assert(
    src.includes("runCaptureFullAccountRemovalManifestEncryptedCli.ts"),
    "the run step invokes the dedicated, mode-hardcoded entry point",
  );
});

await group("3. Deletion-related variables are entirely absent from this workflow's environment", () => {
  assert(!src.includes("CONFIRMATION_PHRASE"), "the delete-confirmation phrase is never defined or referenced");
  assert(!src.includes("BACKUP_ID"), "no backup-id variable is defined");
});

await group("4. Minimum permissions and no write-capable scope anywhere", () => {
  assert(/permissions:\s*\n\s*contents:\s*read/.test(src), 'permissions is exactly "contents: read"');
  assert(!/contents:\s*write/.test(src), "no job or step escalates to write permissions");
});

await group("5. The artifact is encrypted, short-retention, and the upload is gated on success", () => {
  assert(src.includes("retention-days: 1"), "artifact retention is set to exactly 1 day");
  assert(src.includes("kivora-full-removal-manifest-*.enc"), "only the encrypted .enc artifact path is uploaded — never a plaintext file");
  assert(!/path:\s*.*\.json/.test(src), "no plaintext .json manifest file is ever referenced as an upload path");
  assert(/if:\s*success\(\)/.test(src), "the upload step only runs when the capture step itself succeeded");
  assert(src.includes("if-no-files-found: error"), "a missing encrypted artifact fails the job loudly");
});

await group("6. Local files are always removed from the runner, including on failure", () => {
  const cleanupBlock = src.slice(src.indexOf("Clean up local files"));
  assert(cleanupBlock.length > 0 && src.includes("Clean up local files"), "a dedicated cleanup step exists");
  assert(/if:\s*always\(\)/.test(cleanupBlock.slice(0, 200)), "the cleanup step runs with if: always()");
  assert(cleanupBlock.includes("rm -f"), "the cleanup step actually removes files");
  assert(cleanupBlock.includes("kivora-full-removal-manifest-*.enc"), "the cleanup step removes the encrypted artifact file");
});

await group("7. No step ever echoes a secret, and no output channel exists", () => {
  assert(!/echo\s+.*secrets\./.test(src), "no step echoes a GitHub Actions secret value directly");
  assert(!/echo\s+.*passphrase/i.test(src), "no step echoes anything resembling the passphrase");
  assert(!/cat\s+.*\.enc/.test(src), "no step prints the encrypted artifact's bytes to the log");
  assert(!src.includes("outputs:"), "this workflow never defines a job/step output");
});

await group("8. This workflow reuses ONLY existing secrets — none are new", () => {
  const expectedSecretRefs = [
    "secrets.FIREBASE_PROJECT_ID",
    "secrets.FIREBASE_CLIENT_EMAIL",
    "secrets.FIREBASE_PRIVATE_KEY",
    "secrets.EXPECTED_PROJECT_ID",
    "secrets.MANIFEST_ENCRYPTION_PASSPHRASE",
    "secrets.MANIFEST_OWNER_EMAIL",
    "secrets.MANIFEST_EXPECTED_UID",
  ];
  for (const ref of expectedSecretRefs) {
    assert(src.includes(ref), `${ref} is referenced, reusing the secret the sibling manifest-capture workflow already needs`);
  }
  assert(
    !new RegExp(`EXPECTED_PROJECT_ID:\\s*\\$\\{\\{\\s*secrets\\.FIREBASE_PROJECT_ID`).test(src),
    "EXPECTED_PROJECT_ID is NOT wired to the same secret as FIREBASE_PROJECT_ID",
  );
});

await group("9. Verbose Firebase/gRPC/Google-SDK debug logging is never enabled", () => {
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
