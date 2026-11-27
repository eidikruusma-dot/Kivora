/**
 * Kivora 2.0, Etapp 2.2 — calendarStore.ts's addCalendarEvent()/
 * updateCalendarEvent() now stamp `updatedAt` (ISO string) on every write,
 * so a future revert of an autonomously-created event can detect "has this
 * document been touched since Kivora's own write" before deleting it (see
 * MockCalendarEvent's doc comment and automaticLinking.ts's AiAction
 * logging). This is additive — every existing field/behavior is unchanged,
 * and an event with no `updatedAt` (pre-existing data) remains valid.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const setDocMock = vi.fn(() => Promise.resolve())
const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(() => unsubscribeMock)

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initCalendarStore, addCalendarEvent, updateCalendarEvent } from '@/lib/calendarStore'

function baseEvent(overrides: Partial<MockCalendarEvent> = {}): MockCalendarEvent {
  return {
    id: 'cal-1', title: 'Team sync', date: '2026-09-01',
    startTime: '10:00', endTime: '11:00', color: '#6F5AE8',
    ...overrides,
  }
}

beforeEach(() => {
  setDocMock.mockClear()
  initCalendarStore(null)
  initCalendarStore('user-a')
})

describe('addCalendarEvent stamps updatedAt', () => {
  it('writes an ISO-string updatedAt even though the caller never supplied one', async () => {
    const written = await addCalendarEvent(baseEvent())
    expect(typeof written.updatedAt).toBe('string')
    expect(() => new Date(written.updatedAt!).toISOString()).not.toThrow()

    const [, data] = setDocMock.mock.calls[0] as [unknown, MockCalendarEvent]
    expect(typeof data.updatedAt).toBe('string')
  })

  it('every other field is passed through unchanged', async () => {
    const event = baseEvent({ title: 'Osta lilled', allDay: true, startTime: '', endTime: '' })
    const written = await addCalendarEvent(event)
    expect(written.title).toBe('Osta lilled')
    expect(written.allDay).toBe(true)
    expect(written.id).toBe('cal-1')
  })
})

describe('updateCalendarEvent stamps a fresh updatedAt on every call', () => {
  it('bumps updatedAt even when no other field changed', async () => {
    await updateCalendarEvent(baseEvent({ updatedAt: '2020-01-01T00:00:00.000Z' }))
    const [, data] = setDocMock.mock.calls[0] as [unknown, MockCalendarEvent]
    expect(data.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
    expect(typeof data.updatedAt).toBe('string')
  })

  it('a legacy event with no prior updatedAt field still gets stamped on its next update', async () => {
    const legacyEvent = baseEvent()
    delete (legacyEvent as { updatedAt?: string }).updatedAt
    await updateCalendarEvent(legacyEvent)
    const [, data] = setDocMock.mock.calls[0] as [unknown, MockCalendarEvent]
    expect(typeof data.updatedAt).toBe('string')
  })
})
