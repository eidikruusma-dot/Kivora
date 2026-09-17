/**
 * runRemindersTick.ts — the actual CLI entry point for remindersTick.ts.
 * Kept as a separate, tiny file for the same reason as
 * runGrantOwnerRole.ts (see that file's doc comment): the real work lives
 * in a side-effect-free main(), safe to import from a test; only this
 * file calls process.exit().
 *
 * Usage (from artifacts/api-server), intended to be the Render Cron
 * Job's "Command":
 *
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/runRemindersTick.ts --outfile=.tmp-runRemindersTick.mjs \
 *       && node .tmp-runRemindersTick.mjs
 *
 * or simply:
 *
 *   pnpm run reminders-tick
 */

import { main } from './remindersTick.js'

main(process.argv.slice(2), process.env)
  .then((exitCode) => {
    process.exit(exitCode)
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
