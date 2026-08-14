---
name: esbuild CJS package pattern
description: How to use CJS-only Node packages (pdf-parse, mammoth, xlsx) in the api-server ESM esbuild bundle
---

The api-server builds to ESM via esbuild with a banner that injects `globalThis.require = createRequire(import.meta.url)`.

**Rule:** CJS-only packages that cannot be statically bundled must be:
1. Listed in the `external` array in `artifacts/api-server/build.mjs`
2. Accessed at runtime via `(globalThis as any).require('pkg-name')` (not static `import`)

**Why:** esbuild bundles to ESM; CJS packages accessed via static import can fail on tree-shaking or require() calls. The banner provides a working `require` at runtime, so externalized packages resolve correctly from node_modules.

**How to apply:** When adding a new heavy/CJS server package (pdf-parse, mammoth, xlsx, etc.):
- Install it in api-server with pnpm
- Add its name to the `external` array in build.mjs
- Access it as: `const mod = (globalThis as any).require('pkg-name');`
- TypeScript: add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above that line

Currently externalized for file parsing: `pdf-parse`, `mammoth`, `xlsx`
