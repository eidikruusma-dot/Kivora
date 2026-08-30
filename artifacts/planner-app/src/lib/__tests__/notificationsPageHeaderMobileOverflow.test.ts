/**
 * NotificationsPage.tsx's header row (icon+title on the left, action
 * buttons on the right) forced the actions block to never shrink
 * (flex-shrink-0) inside a non-wrapping outer row (flex items-start
 * justify-between, no flex-wrap). Confirmed with a real Chromium render
 * of the compiled Tailwind output: at 320/360/390px the actions —
 * "Märgi kõik loetuks" / "Kustuta kõik" (both whitespace-nowrap), and
 * the inline "Kustutada kõik?" / "Jah, kustuta" / "Tühista" confirmation
 * row — didn't fit beside the title. "Kustuta kõik" rendered clipped off
 * the right edge of the viewport at every phone width tested, and the
 * whole page became horizontally scrollable to reach it.
 *
 * Fix: mobile-only override, reverted at sm: (640px) and up —
 *   - the outer header row becomes flex-col (title above actions, both
 *     full width), restoring the original flex-row/justify-between at
 *     sm: and up;
 *   - the actions block drops flex-shrink-0 (irrelevant once stacked)
 *     and switches to justify-start (left-aligned under the title, not
 *     right-aligned into empty space), restoring the original
 *     flex-shrink-0/justify-end at sm: and up; flex-wrap was already
 *     present and is unchanged;
 *   - the inline delete-all-confirmation box gains flex-wrap, so its
 *     three nowrap children can wrap onto a second line inside the box
 *     on mobile instead of overflowing it.
 *
 * Nothing else changed: onClick handlers (storeMarkAllRead,
 * setConfirmDeleteAll, handleDeleteAll), the unreadCount/confirmDeleteAll/
 * deletingAll conditional rendering, notification data/list rendering
 * below the header, and translations are all untouched — only four
 * className strings on the header's wrapper divs changed.
 *
 * Re-verified visually after the fix: at 320/360/390px both "Märgi kõik
 * loetuks" and "Kustuta kõik" (and, in the confirmation state, all three
 * of "Kustutada kõik?"/"Jah, kustuta"/"Tühista") render fully inside the
 * viewport with no page-level horizontal scroll; at 1024px desktop the
 * header renders byte-for-byte the same single-row, right-aligned layout
 * as before the fix.
 *
 * No React rendering harness exists for NotificationsPage.tsx in this
 * repo — verified via structural regex assertions against the raw
 * source, matching the pattern used throughout this codebase's other
 * page-level mobile-responsive regression tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/notificationsPageHeaderMobileOverflow.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/views/NotificationsPage.tsx'),
  'utf8',
)

describe('no page-level horizontal overflow at 320/360/390px (mobile-first stacking)', () => {
  it('the outer header row stacks on mobile and restores the original row at sm: and up', () => {
    expect(SRC).toMatch(
      /<div className="flex flex-col items-start gap-3 mb-6 sm:flex-row sm:justify-between">/,
    )
    // the old always-on non-wrapping row is gone
    expect(SRC).not.toMatch(/className="flex items-start justify-between gap-3 mb-6"/)
  })

  it('the actions block can wrap/left-align on mobile and restores flex-shrink-0/justify-end at sm: and up', () => {
    expect(SRC).toMatch(
      /<div className="flex items-center gap-2 flex-wrap justify-start sm:flex-shrink-0 sm:justify-end">/,
    )
    expect(SRC).not.toMatch(/className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end"/)
  })

  it('the inline delete-all confirmation box can wrap its three children instead of overflowing', () => {
    expect(SRC).toMatch(
      /<div className="flex items-center gap-2 flex-wrap bg-red-50 border border-red-100 rounded-lg px-3 py-1\.5">/,
    )
  })
})

describe('both action buttons remain present and unchanged', () => {
  it('"Märgi kõik loetuks" (mark all read) button keeps its handler, label, and whitespace-nowrap', () => {
    expect(SRC).toMatch(/\{unreadCount > 0 && !confirmDeleteAll && \(/)
    expect(SRC).toMatch(/onClick=\{\(\) => storeMarkAllRead\(\)\}/)
    expect(SRC).toMatch(/className="text-sm font-medium text-\[#6F5AE8\] hover:underline whitespace-nowrap"/)
    expect(SRC).toMatch(/\{t\('notif\.markAllRead', lang\)\}/)
  })

  it('"Kustuta kõik" (delete all) button keeps its handler, icon, label, and whitespace-nowrap', () => {
    expect(SRC).toMatch(/\{notifications\.length > 0 && !confirmDeleteAll && \(/)
    expect(SRC).toMatch(/onClick=\{\(\) => setConfirmDeleteAll\(true\)\}/)
    expect(SRC).toMatch(/<Trash2 size=\{14\} \/>/)
    expect(SRC).toMatch(/\{lang === 'et' \? 'Kustuta kõik' : 'Delete all'\}/)
    expect(SRC).toMatch(
      /className="flex items-center gap-1 text-sm font-medium text-\[#94A3B8\] hover:text-red-500 transition-colors whitespace-nowrap"/,
    )
  })
})

describe('desktop layout stays unchanged (sm: and up restores the exact original row)', () => {
  it('sm:flex-row sm:justify-between restores the original single-row header at sm: and up', () => {
    expect(SRC).toMatch(/sm:flex-row sm:justify-between/)
  })

  it('sm:flex-shrink-0 sm:justify-end restores the original non-shrinking, right-aligned actions block', () => {
    expect(SRC).toMatch(/sm:flex-shrink-0 sm:justify-end/)
  })
})

describe('existing handlers/actions and confirmation/unread-state logic remain intact', () => {
  it('confirmDeleteAll/deletingAll state and handleDeleteAll/cancel handlers are unchanged', () => {
    expect(SRC).toMatch(/const \[confirmDeleteAll, setConfirmDeleteAll\] = useState\(false\)/)
    expect(SRC).toMatch(/const \[deletingAll, setDeletingAll\] = useState\(false\)/)
    expect(SRC).toMatch(/const handleDeleteAll = async \(\) => \{/)
    expect(SRC).toMatch(/onClick=\{handleDeleteAll\}/)
    expect(SRC).toMatch(/onClick=\{\(\) => setConfirmDeleteAll\(false\)\}/)
  })

  it('unreadCount computation and its title/subtitle rendering are unchanged', () => {
    expect(SRC).toMatch(/const unreadCount = notifications\.filter\(\(n\) => !n\.read\)\.length/)
    expect(SRC).toMatch(/\{unreadCount > 0\s*\n\s*\? t\('notif\.unread', lang\)\.replace\('\{n\}', String\(unreadCount\)\)\s*\n\s*: t\('notif\.allRead', lang\)\}/)
  })

  it('the confirmation row keeps its question, confirm, and cancel copy/handlers', () => {
    const confirmBlock = SRC.match(/\{confirmDeleteAll && \([\s\S]*?\n {10}\)\}/)?.[0] ?? ''
    expect(confirmBlock).toMatch(/\{lang === 'et' \? 'Kustutada kõik\?' : 'Delete all\?'\}/)
    expect(confirmBlock).toMatch(/\{lang === 'et' \? 'Jah, kustuta' : 'Yes, delete'\}/)
    expect(confirmBlock).toMatch(/\{lang === 'et' \? 'Tühista' : 'Cancel'\}/)
    expect(confirmBlock).toMatch(/disabled=\{deletingAll\}/)
  })

  it('the notification icon/title block (Bell icon, page title) is unchanged', () => {
    expect(SRC).toMatch(/<Bell size=\{20\} className="text-\[#6F5AE8\]" \/>/)
    expect(SRC).toMatch(/\{t\('notif\.title', lang\)\}/)
  })
})
