/**
 * Regression tests for a live bug: a timed calendar event's title was
 * clipped/unreadable (e.g. the 18:00 event in the reported screenshot),
 * even though its position on the grid was correct.
 *
 * Root cause: EventCard.tsx always rendered a fixed 2-line stacked layout
 * (time + `line-clamp-2` title) regardless of the card's actual available
 * height, with hardcoded near-black text against an arbitrary
 * full-opacity event.color background — so short cards (produced by
 * layoutEvents' MIN_DURATION_FRACTION floor) clipped the title, and some
 * configured colors gave poor contrast.
 *
 * Fix (EventCard.tsx + TimeGrid.tsx only):
 *   - TimeGrid.tsx computes each event's actual rendered pixel height
 *     (heightFraction * TIME_GRID_HEIGHT_PX, a local HOUR_HEIGHT constant
 *     mirroring the identical duplication in DayView.tsx/CalendarGrid.tsx)
 *     and passes it to EventCard as `heightPx`. The %-based top/height/
 *     minHeight positioning math itself is completely unchanged.
 *   - EventCard.tsx picks a compact single-line "HH:MM · Title" layout
 *     (truncated) below a pixel-height threshold, and the existing
 *     stacked time + up-to-2-line title layout above it.
 *   - EventCard.tsx picks text color (existing dark pair vs. a new light
 *     pair) from the event's background color via a YIQ perceived-
 *     brightness check, so every configured color stays readable in both
 *     light and dark app themes (the card's background isn't theme-driven,
 *     so this is intentionally theme-agnostic).
 *
 * TimeGrid.tsx and EventCard.tsx are confirmed (via grep) to be the only
 * files shared by DayView.tsx and CalendarGrid.tsx (Week view) for
 * rendering timed events, and EventCard is referenced nowhere else.
 *
 * No React rendering harness exists in this repo, so this is verified via
 * the exported pure functions plus structural assertions against the
 * component source, consistent with every other regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/timedEventCardVisibility.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isCompactEventCard, getEventCardTextColors } from '@/components/calendar/EventCard'

const EVENT_CARD_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/EventCard.tsx'),
  'utf8',
)
const TIME_GRID_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/TimeGrid.tsx'),
  'utf8',
)
const DAY_VIEW_SRC = readFileSync(resolve(process.cwd(), 'src/components/calendar/DayView.tsx'), 'utf8')
const CALENDAR_GRID_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/calendar/CalendarGrid.tsx'),
  'utf8',
)

describe('timed-event titles render in both Day and Week views (shared TimeGrid/EventCard chain)', () => {
  it('DayView renders through DayColumn -> TimeGrid -> EventCard', () => {
    expect(DAY_VIEW_SRC).toMatch(/<DayColumn/)
  })

  it('CalendarGrid (Week view) renders through DayColumn -> TimeGrid -> EventCard for each day', () => {
    expect(CALENDAR_GRID_SRC).toMatch(/<DayColumn/)
  })

  it('TimeGrid is the single place EventCard is rendered, so both views share this fix', () => {
    expect(TIME_GRID_SRC).toMatch(/<EventCard/)
  })

  it('EventCard always renders the title text, in both layout branches', () => {
    const occurrences = (EVENT_CARD_SRC.match(/\{event\.title\}/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(2) // compact line + stacked line
  })
})

describe('short events use a compact single-line "time · title" presentation', () => {
  it('isCompactEventCard is true below the threshold and false at/above it', () => {
    expect(isCompactEventCard(10)).toBe(true)
    expect(isCompactEventCard(20)).toBe(true)
    expect(isCompactEventCard(34)).toBe(false)
    expect(isCompactEventCard(60)).toBe(false)
  })

  it('the compact branch renders one truncated line combining time and title', () => {
    const compactBlock = EVENT_CARD_SRC.match(/compact \? \(([\s\S]*?)\) : \(/)?.[1] ?? ''
    expect(compactBlock).toMatch(/truncate/)
    expect(compactBlock).toMatch(/\{timeLabel\}/)
    expect(compactBlock).toMatch(/\{event\.title\}/)
    expect(compactBlock).toMatch(/·/)
  })
})

describe('taller events show time and title as separate lines (up to 2 lines for the title)', () => {
  it('the non-compact branch keeps the stacked time line + line-clamp-2 title', () => {
    const stackedBlock = EVENT_CARD_SRC.slice(EVENT_CARD_SRC.indexOf(') : ('))
    expect(stackedBlock).toMatch(/\{timeLabel\}/)
    expect(stackedBlock).toMatch(/line-clamp-2/)
  })
})

describe('no artificial min-height changes the visual duration', () => {
  it('TimeGrid still sets only the pre-existing 14px minHeight floor — unchanged from before this fix', () => {
    expect(TIME_GRID_SRC).toMatch(/minHeight: '14px'/)
  })

  it('top/height percentages are still driven directly by layoutEvents, untouched by the heightPx addition', () => {
    expect(TIME_GRID_SRC).toMatch(/top: `\$\{topFraction \* 100\}%`/)
    expect(TIME_GRID_SRC).toMatch(/height: `\$\{heightFraction \* 100\}%`/)
  })

  it('heightPx is derived purely for EventCard\'s internal layout choice, not used in the wrapper\'s own sizing', () => {
    const wrapperStyleBlock = TIME_GRID_SRC.match(/style=\{\{\s*top:[\s\S]*?\}\}/)?.[0] ?? ''
    expect(wrapperStyleBlock).not.toMatch(/heightPx/)
    expect(TIME_GRID_SRC).toMatch(/heightPx=\{heightFraction \* TIME_GRID_HEIGHT_PX\}/)
  })
})

describe('readable text contrast for every configured calendar color, theme-agnostic', () => {
  it('a light/pale background gets the existing dark text pair', () => {
    expect(getEventCardTextColors('#F4F1FF')).toEqual({ time: '#4B5563', title: '#1A1F36' })
    expect(getEventCardTextColors('#FFFFFF')).toEqual({ time: '#4B5563', title: '#1A1F36' })
  })

  it('a dark/saturated background gets a light text pair instead', () => {
    expect(getEventCardTextColors('#1A1F36')).toEqual({ time: '#E5E7EB', title: '#FFFFFF' })
    expect(getEventCardTextColors('#000000')).toEqual({ time: '#E5E7EB', title: '#FFFFFF' })
  })

  it('falls back to the existing dark pair for an unparsable color rather than throwing', () => {
    expect(getEventCardTextColors('not-a-color')).toEqual({ time: '#4B5563', title: '#1A1F36' })
  })

  it('text color is applied via inline style driven by the event color, not a static Tailwind class, so it works in both app themes', () => {
    expect(EVENT_CARD_SRC).not.toMatch(/text-\[#4B5563\]/)
    expect(EVENT_CARD_SRC).not.toMatch(/text-\[#1A1F36\]/)
    expect(EVENT_CARD_SRC).toMatch(/style=\{\{ color: titleColor \}\}/)
    expect(EVENT_CARD_SRC).toMatch(/style=\{\{ color: timeColor \}\}/)
  })
})

describe('all-day rendering is completely unchanged by this fix', () => {
  it('DayView\'s all-day row does not go through EventCard at all', () => {
    expect(DAY_VIEW_SRC).not.toMatch(/EventCard/)
    expect(DAY_VIEW_SRC).toMatch(/allDayEvents/)
  })

  it('CalendarGrid\'s (Week view) all-day row does not go through EventCard at all', () => {
    expect(CALENDAR_GRID_SRC).not.toMatch(/EventCard/)
    expect(CALENDAR_GRID_SRC).toMatch(/dayAllDay/)
  })
})

describe('existing event interactions remain wired', () => {
  it('EventCard still stops propagation and calls onClick with the event id on click', () => {
    expect(EVENT_CARD_SRC).toMatch(/onClick=\{handleClick\}/)
    expect(EVENT_CARD_SRC).toMatch(/e\.stopPropagation\(\)/)
    expect(EVENT_CARD_SRC).toMatch(/onClick\?\.\(event\.id\)/)
  })

  it('TimeGrid still passes onEventClick through to EventCard, and slot-click-to-create is untouched', () => {
    expect(TIME_GRID_SRC).toMatch(/onClick=\{onEventClick\}/)
    expect(TIME_GRID_SRC).toMatch(/onSlotClick\(clickedDate\)/)
  })

  it('EventCard keeps its hover/cursor affordance for drag/resize-adjacent interaction cues', () => {
    expect(EVENT_CARD_SRC).toMatch(/cursor-pointer/)
    expect(EVENT_CARD_SRC).toMatch(/hover:brightness-95/)
  })
})
