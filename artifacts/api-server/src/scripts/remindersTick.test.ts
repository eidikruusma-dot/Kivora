/**
 * Unit tests for logTickSummary() — the privacy fix that gates the
 * per-user (Firebase uid + raw error text) breakdown behind
 * REMINDERS_TICK_VERBOSE_ERRORS=true, default OFF. This script runs from
 * a public GitHub Actions workflow on a public repository, so its
 * default stdout/stderr is effectively public — the aggregate
 * "per-user errors: N" line must always be visible, but the per-account
 * detail must not print unless explicitly opted into.
 *
 * console.log/console.error are captured directly (no mocking library
 * needed — this repo's test convention is plain assert/group, matching
 * every other *.test.ts in this package) so the exact printed output can
 * be inspected without going through real Admin Firestore/web-push.
 *
 * Compile and run:
 *   cd artifacts/api-server
 *   npx esbuild --bundle --platform=node --format=esm --packages=external \
 *       src/scripts/remindersTick.test.ts --outfile=.tmp-scriptsRemindersTick.mjs \
 *       && node .tmp-scriptsRemindersTick.mjs
 */

import { logTickSummary } from './remindersTick.js'
import type { RemindersTickSummary } from '../reminders/remindersTick.js'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ FAILED: ${label}`)
    failed++
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`)
  fn()
}

function baseSummary(overrides: Partial<RemindersTickSummary> = {}): RemindersTickSummary {
  return {
    usersScanned: 1,
    eventsConsidered: 0,
    remindersSent: 0,
    remindersSuppressed: {
      inAppDisabled: 0,
      moduleDisabled: 0,
      quietHours: 0,
      duplicate: 0,
      noCandidate: 0,
      notYetDue: 0,
      windowMissed: 0,
    },
    subscriptionsCleanedUp: 0,
    errors: [],
    ...overrides,
  }
}

/** Captures every console.log/console.error call made during fn(), restoring the originals afterward. */
function captureLogs(fn: () => void): { logLines: string[]; errorLines: string[] } {
  const logLines: string[] = []
  const errorLines: string[] = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...args: unknown[]) => { logLines.push(args.map(String).join(' ')) }
  console.error = (...args: unknown[]) => { errorLines.push(args.map(String).join(' ')) }
  try {
    fn()
  } finally {
    console.log = originalLog
    console.error = originalError
  }
  return { logLines, errorLines }
}

group('default (no REMINDERS_TICK_VERBOSE_ERRORS): the uid/error breakdown never prints', () => {
  const summaryWithErrors = baseSummary({
    errors: [
      { uid: 'user-abc-123', error: 'permission-denied reading users/user-abc-123' },
      { uid: 'user-def-456', error: 'deadline-exceeded' },
    ],
  })

  const { logLines, errorLines } = captureLogs(() => logTickSummary(summaryWithErrors, {}))

  assert(
    logLines.some((l) => l.includes('per-user errors:          2')),
    'the aggregate per-user-errors COUNT is still printed',
  )
  assert(errorLines.length === 0, 'no console.error call is made at all when errors exist but verbose mode is off')
  assert(
    !logLines.some((l) => l.includes('user-abc-123') || l.includes('user-def-456')),
    'neither Firebase uid appears anywhere in the printed output',
  )
  assert(
    !logLines.some((l) => l.includes('permission-denied') || l.includes('deadline-exceeded')),
    'neither raw error message appears anywhere in the printed output',
  )
})

group('the three new diagnostic counters print as aggregate numbers only', () => {
  const summary = baseSummary({
    remindersSuppressed: {
      inAppDisabled: 0,
      moduleDisabled: 0,
      quietHours: 0,
      duplicate: 0,
      noCandidate: 3,
      notYetDue: 7,
      windowMissed: 2,
    },
  });

  const { logLines } = captureLogs(() => logTickSummary(summary, {}));
  const text = logLines.join('\n');

  assert(text.includes('suppressed (no candidate):3'), 'noCandidate count is printed');
  assert(text.includes('suppressed (not yet due): 7'), 'notYetDue count is printed');
  assert(text.includes('suppressed (window missed):2'), 'windowMissed count is printed');
});

group('REMINDERS_TICK_VERBOSE_ERRORS is anything other than the exact string "true": still silent', () => {
  const summaryWithErrors = baseSummary({ errors: [{ uid: 'user-abc-123', error: 'boom' }] })

  for (const value of ['1', 'TRUE', 'yes', '']) {
    const { errorLines } = captureLogs(() => logTickSummary(summaryWithErrors, { REMINDERS_TICK_VERBOSE_ERRORS: value }))
    assert(errorLines.length === 0, `REMINDERS_TICK_VERBOSE_ERRORS=${JSON.stringify(value)} does not enable verbose output`)
  }
})

group('REMINDERS_TICK_VERBOSE_ERRORS=true: exact prior detailed output is restored', () => {
  const summaryWithErrors = baseSummary({
    errors: [
      { uid: 'user-abc-123', error: 'permission-denied reading users/user-abc-123' },
      { uid: 'user-def-456', error: 'deadline-exceeded' },
    ],
  })

  const { logLines, errorLines } = captureLogs(() =>
    logTickSummary(summaryWithErrors, { REMINDERS_TICK_VERBOSE_ERRORS: 'true' }),
  )

  assert(
    logLines.some((l) => l.includes('per-user errors:          2')),
    'the aggregate count line is unchanged when verbose mode is on',
  )
  assert(errorLines.length === 2, 'exactly one console.error call per errored user')
  assert(
    errorLines[0] === '  - user-abc-123: permission-denied reading users/user-abc-123',
    `first line matches the exact prior format (got ${JSON.stringify(errorLines[0])})`,
  )
  assert(
    errorLines[1] === '  - user-def-456: deadline-exceeded',
    `second line matches the exact prior format (got ${JSON.stringify(errorLines[1])})`,
  )
})

group('no errors at all: identical output regardless of the verbose flag', () => {
  const clean = baseSummary({ remindersSent: 3 })

  const off = captureLogs(() => logTickSummary(clean, {}))
  const on = captureLogs(() => logTickSummary(clean, { REMINDERS_TICK_VERBOSE_ERRORS: 'true' }))

  assert(off.errorLines.length === 0, 'no console.error with the flag off and no errors')
  assert(on.errorLines.length === 0, 'no console.error with the flag on either — nothing to break down')
  assert(off.logLines.join('\n') === on.logLines.join('\n'), 'the summary log line itself is identical either way')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
