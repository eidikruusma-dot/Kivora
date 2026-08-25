/**
 * runExclusive: the synchronous double-click guard used by
 * AIPlanGeneratorModal for both generation and save. Pure and
 * framework-free (a `Lock` is just `{ current: boolean }`, the same shape
 * as a React `useRef`), so it's tested here directly with a plain object
 * rather than by rendering the component.
 */

import { describe, it, expect, vi } from 'vitest'
import { runExclusive, type Lock } from '@/lib/asyncLock'

describe('runExclusive: two same-tick calls invoke fn only once', () => {
  it('the second call made before the first resolves is a no-op', async () => {
    const lock: Lock = { current: false }
    let inFlight = 0
    let maxConcurrent = 0
    const fn = vi.fn(async () => {
      inFlight++
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await Promise.resolve()
      await Promise.resolve()
      inFlight--
      return 'done'
    })

    // Two "same-tick" calls — neither is awaited before the second starts,
    // mirroring two rapid clicks on the same button.
    const p1 = runExclusive(lock, fn)
    const p2 = runExclusive(lock, fn)

    const [r1, r2] = await Promise.all([p1, p2])
    expect(fn).toHaveBeenCalledTimes(1)
    expect(maxConcurrent).toBe(1) // never ran concurrently
    expect(r1).toBe('done')
    expect(r2).toBeUndefined() // the blocked call returns undefined without running fn
  })
})

describe('runExclusive: lock release and retry', () => {
  it('releases the lock on success, permitting a subsequent call', async () => {
    const lock: Lock = { current: false }
    const fn = vi.fn(async () => 'ok')
    await runExclusive(lock, fn)
    expect(lock.current).toBe(false)
    await runExclusive(lock, fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('releases the lock even when fn throws, permitting a retry — proves both "failed generation" and "failed save" release their lock, since both use this same primitive', async () => {
    const lock: Lock = { current: false }
    const failing = vi.fn(async () => {
      throw new Error('synthetic failure')
    })
    await expect(runExclusive(lock, failing)).rejects.toThrow('synthetic failure')
    expect(lock.current).toBe(false)

    const succeeding = vi.fn(async () => 'ok')
    const result = await runExclusive(lock, succeeding)
    expect(succeeding).toHaveBeenCalledTimes(1)
    expect(result).toBe('ok')
  })

  it('a lock never acquired (e.g. modal closed/reopened as a fresh instance) starts unlocked', () => {
    const freshLock: Lock = { current: false }
    expect(freshLock.current).toBe(false)
  })
})
