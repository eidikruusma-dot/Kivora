/**
 * A synchronous double-invoke guard for async work triggered from UI event
 * handlers (e.g. a button's onClick). React state (`useState`) alone is not
 * a synchronous lock — two rapid clicks in the same tick can both read the
 * old state before either setState call is applied, letting both through.
 *
 * `Lock` is intentionally just `{ current: boolean }` — the exact shape of
 * a React `useRef(false)` — so a real component can pass its ref directly,
 * while this file stays a plain, framework-free, directly-testable utility.
 *
 * The lock is acquired synchronously (before `fn` starts) and released in a
 * `finally` (so a thrown/rejected `fn` still releases it, permitting a
 * retry). A call made while the lock is already held is a silent no-op —
 * it returns `undefined` without invoking `fn`.
 */

export interface Lock {
  current: boolean
}

export async function runExclusive<T>(lock: Lock, fn: () => Promise<T>): Promise<T | undefined> {
  if (lock.current) return undefined
  lock.current = true
  try {
    return await fn()
  } finally {
    lock.current = false
  }
}
