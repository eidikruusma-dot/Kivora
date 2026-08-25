/**
 * Structural test for routes/index.ts — proves requireFirebaseAuth is
 * mounted exactly once, wraps every current /api/ai router, and never
 * wraps any non-AI router. Source-level rather than a live Express
 * integration test, matching this file's role as pure route wiring with
 * no logic of its own to exercise at runtime.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=cjs \
 *       src/routes/index.test.ts | node
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolved relative to process.cwd(), matching this repo's convention of
// always running these test scripts from the api-server package root (see
// package.json's test:* scripts) — not relative to import.meta.url, whose
// post-bundle location is the esbuild output file, not this source file.
const ROUTES_INDEX_PATH = resolve(process.cwd(), "src/routes/index.ts");

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

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

const src = readFileSync(ROUTES_INDEX_PATH, "utf8");

group("1. requireFirebaseAuth is imported and mounted exactly once", () => {
  assert(/import\s*\{\s*requireFirebaseAuth\s*\}\s*from\s*["']\.\.\/middleware\/requireFirebaseAuth\.js["']/.test(src), "imports requireFirebaseAuth from the middleware module");
  const useCount = (src.match(/\.use\(requireFirebaseAuth\)/g) ?? []).length;
  assert(useCount === 1, `requireFirebaseAuth is applied via .use() exactly once (found ${useCount})`);
});

group("2. all current AI routers are mounted on the same boundary as requireFirebaseAuth", () => {
  // Everything between "aiBoundary.use(requireFirebaseAuth)" and the next
  // "router.use(aiBoundary)" (or end of file) is the protected boundary's body.
  const boundaryStart = src.indexOf(".use(requireFirebaseAuth)");
  assert(boundaryStart !== -1, "found the requireFirebaseAuth mount point");
  const afterBoundary = src.slice(boundaryStart);
  const boundaryEnd = afterBoundary.indexOf("router.use(aiBoundary)");
  const boundaryBody = boundaryEnd === -1 ? afterBoundary : afterBoundary.slice(0, boundaryEnd);

  assert(boundaryBody.includes("aiRouter"), "aiRouter (chat, plan preview) is inside the protected boundary");
  assert(boundaryBody.includes("aiUploadRouter"), "aiUploadRouter (upload, bank-import, bank-import/revalidate, upload-direct-test) is inside the protected boundary");
});

group("3. non-AI routers are mounted directly on the top-level router — never behind requireFirebaseAuth", () => {
  const boundaryStart = src.indexOf(".use(requireFirebaseAuth)");
  const afterBoundary = src.slice(boundaryStart);
  const boundaryEnd = afterBoundary.indexOf("router.use(aiBoundary)");
  const boundaryBody = boundaryEnd === -1 ? afterBoundary : afterBoundary.slice(0, boundaryEnd);

  for (const nonAiRouter of ["healthRouter", "contactRouter", "supportRouter", "feedbackRouter", "pushRouter"]) {
    assert(!boundaryBody.includes(nonAiRouter), `${nonAiRouter} is NOT inside the requireFirebaseAuth-protected boundary`);
    assert(src.includes(`router.use(${nonAiRouter})`), `${nonAiRouter} is still mounted directly, unauthenticated, on the top-level router`);
  }
});

console.log(`\n${"═".repeat(48)}`);
console.log(`  routes/index structural check: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(48)}`);
if (failed > 0) process.exit(1);
