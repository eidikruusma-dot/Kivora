/**
 * Unit tests for webPushSend.ts's sendWebPush() — specifically the
 * sent/failed counting and "gone" (404/410) subscription detection that
 * remindersTick.ts relies on to clean up stale subscriptions. This is a
 * behavior-preserving extraction from routes/push.ts's previously-inline
 * logic (which had no test file of its own); this file is new coverage,
 * not a port of an existing test.
 *
 * VAPID keys are read at module-load time (eager, matching the original
 * routes/push.ts behavior), so a real-shaped (freshly generated, never
 * reused) key pair is set in the environment BEFORE importing
 * webPushSend.ts — an arbitrary string fails web-push's own strict format
 * validation inside setVapidDetails(). webPush.sendNotification() itself
 * is monkey-patched on the shared module object (safe here: web-push is a
 * CJS package with no named exports, so `import webPush from 'web-push'`
 * binds directly to its `module.exports` object, which both this test and
 * webPushSend.ts share via Node's module cache) to simulate success,
 * permanent (404/410), and transient failures without any real network
 * call.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/lib/webPushSend.test.ts --outfile=.tmp-webPushSend.mjs \
 *       && node .tmp-webPushSend.mjs
 */

import webPush from "web-push";

const vapidKeys = webPush.generateVAPIDKeys();
process.env["VAPID_PUBLIC_KEY"] = vapidKeys.publicKey;
process.env["VAPID_PRIVATE_KEY"] = vapidKeys.privateKey;

const { isWebPushConfigured, sendWebPush } = await import("./webPushSend.js");

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

function group(name: string, fn: () => Promise<void> | void): Promise<void> | void {
  console.log(`\n${name}`);
  return fn();
}

function fakeSub(id: string) {
  return { endpoint: `https://push.example.com/${id}`, keys: { auth: "a", p256dh: "p" } };
}

function statusError(statusCode: number): Error & { statusCode: number } {
  const err = new Error(`push failed with ${statusCode}`) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

await group("module load", () => {
  assert(isWebPushConfigured === true, "configured when valid-shaped VAPID keys are present");
});

await group("sendWebPush — all succeed", async () => {
  const original = webPush.sendNotification;
  webPush.sendNotification = (async () => ({})) as unknown as typeof webPush.sendNotification;
  try {
    const result = await sendWebPush([fakeSub("a"), fakeSub("b")], { title: "T", body: "B" });
    assert(result.sent === 2, "both sends counted as sent");
    assert(result.failed === 0, "no failures");
    assert(result.goneEndpoints.length === 0, "no gone endpoints");
  } finally {
    webPush.sendNotification = original;
  }
});

await group("sendWebPush — a 410 is reported as gone; a non-410 failure is not", async () => {
  const original = webPush.sendNotification;
  webPush.sendNotification = (async (sub: { endpoint: string }) => {
    if (sub.endpoint.endsWith("/gone-410")) throw statusError(410);
    if (sub.endpoint.endsWith("/gone-404")) throw statusError(404);
    if (sub.endpoint.endsWith("/transient-500")) throw statusError(500);
    return {};
  }) as unknown as typeof webPush.sendNotification;

  try {
    const subs = [fakeSub("ok"), fakeSub("gone-410"), fakeSub("gone-404"), fakeSub("transient-500")];
    const result = await sendWebPush(subs, { title: "T", body: "B" });
    assert(result.sent === 1, "exactly one send succeeded");
    assert(result.failed === 3, "three sends failed");
    assert(result.goneEndpoints.length === 2, "exactly two endpoints reported as gone");
    assert(
      result.goneEndpoints.includes("https://push.example.com/gone-410") &&
        result.goneEndpoints.includes("https://push.example.com/gone-404"),
      "the 410 and 404 endpoints are the ones reported gone",
    );
    assert(
      !result.goneEndpoints.includes("https://push.example.com/transient-500"),
      "a transient 500 is NOT reported as gone — its subscription must not be deleted",
    );
  } finally {
    webPush.sendNotification = original;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
