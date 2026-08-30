/**
 * legacySubjectCleanup.ts
 *
 * Temporary, manually-invoked repair for legacy orphan School Subject
 * documents — same "expose a window global for deliberate console use"
 * pattern as buildInfo.ts, not a permanent or automatically-run system.
 *
 * Background: before commit afc03f7, deleting a Study plan card (a
 * lesson/learning block) never checked whether it was that subject's last
 * remaining lesson — it only ever removed the lesson document, never the
 * separate Subject document the lesson referenced. A subject deleted this
 * way before afc03f7 can be left behind: absent from every Study plan
 * card, yet still a real, undeleted Subject document, so it keeps being
 * offered in "Lisa õppimisblokk". afc03f7 stops this for any new
 * deletion; it does not retroactively fix subjects already orphaned this
 * way. This file exposes exactly the tools needed to find and, once
 * confirmed correct, remove that pre-existing legacy state — nothing else.
 *
 * Usage from the browser console, while signed in (School's subjects/
 * lessons are loaded on sign-in via AuthContext's initSchoolStore, so this
 * works from any page, not just School):
 *
 *   window.__KIVORA_FIND_ORPHANED_SUBJECTS__()
 *     — read-only. Logs and returns the subjects that would be deleted
 *       and why (no lesson references them). Deletes nothing. Run this
 *       first and review the result before ever running the next command.
 *
 *   window.__KIVORA_CLEANUP_ORPHANED_SUBJECTS__()
 *     — deletes exactly those subjects (via the existing, unmodified
 *       deleteSchoolSubject) and logs/returns what it removed. Idempotent:
 *       once no orphans remain, it deletes nothing on subsequent runs.
 *
 * Safe to remove later: delete this file, its one import in main.tsx, and
 * (once no longer needed) schoolStore.tsx's findOrphanedSubjects/
 * cleanupOrphanedLegacySubjects/previewOrphanedSubjects/isSubjectReferenced.
 */

import { previewOrphanedSubjects, cleanupOrphanedLegacySubjects } from '@/lib/schoolStore'

function findOrphanedSubjectsForConsole() {
  const orphaned = previewOrphanedSubjects()
  if (orphaned.length === 0) {
    console.log('[Kivora] No orphaned School subjects found.')
  } else {
    console.log(
      `[Kivora] ${orphaned.length} orphaned School subject(s) — no lesson references any of these, so they no longer appear as Study plan cards but are still offered in "Lisa õppimisblokk":`,
      orphaned.map((s) => ({ id: s.id, name: s.name })),
    )
  }
  return orphaned
}

async function cleanupOrphanedSubjectsForConsole() {
  const deleted = await cleanupOrphanedLegacySubjects()
  if (deleted.length === 0) {
    console.log('[Kivora] No orphaned School subjects to delete.')
  } else {
    console.log(
      `[Kivora] Deleted ${deleted.length} orphaned School subject(s):`,
      deleted.map((s) => ({ id: s.id, name: s.name })),
    )
  }
  return deleted
}

if (typeof window !== 'undefined') {
  ;(window as typeof window & {
    __KIVORA_FIND_ORPHANED_SUBJECTS__?: typeof findOrphanedSubjectsForConsole
    __KIVORA_CLEANUP_ORPHANED_SUBJECTS__?: typeof cleanupOrphanedSubjectsForConsole
  }).__KIVORA_FIND_ORPHANED_SUBJECTS__ = findOrphanedSubjectsForConsole
  ;(window as typeof window & {
    __KIVORA_FIND_ORPHANED_SUBJECTS__?: typeof findOrphanedSubjectsForConsole
    __KIVORA_CLEANUP_ORPHANED_SUBJECTS__?: typeof cleanupOrphanedSubjectsForConsole
  }).__KIVORA_CLEANUP_ORPHANED_SUBJECTS__ = cleanupOrphanedSubjectsForConsole
}
