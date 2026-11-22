/**
 * Pure sanity check for draftRules.ts's withDraftFirestoreRules() — no
 * emulator needed, so (unlike firestoreSecurityRules.rules-test.ts) this
 * DOES run as part of the normal `vitest run`/CI. It only proves the
 * splice point still exists in the real firestore.rules file and that the
 * real file itself is never mutated; it says nothing about whether the
 * drafted rules are semantically correct (that needs the emulator — see
 * firestoreSecurityRules.rules-test.ts).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withDraftFirestoreRules, DRAFT_CALENDARS_AND_DOCUMENTS_FIRESTORE_RULES } from './draftRules'

// firestore.rules lives at the monorepo root, two levels above
// artifacts/planner-app (vitest's cwd here) — NOT inside planner-app.
const REAL_RULES_PATH = resolve(process.cwd(), '../../firestore.rules')

describe('withDraftFirestoreRules()', () => {
  it('splices in the draft calendars/documents rules without throwing', () => {
    const real = readFileSync(REAL_RULES_PATH, 'utf8')
    const spliced = withDraftFirestoreRules(real)
    expect(spliced).toContain('match /users/{uid}/calendars/{calId}')
    expect(spliced).toContain('match /users/{uid}/documents/{docId}')
    expect(spliced).toContain(DRAFT_CALENDARS_AND_DOCUMENTS_FIRESTORE_RULES)
  })

  it('never mutates the real firestore.rules file on disk', () => {
    const before = readFileSync(REAL_RULES_PATH, 'utf8')
    withDraftFirestoreRules(before)
    const after = readFileSync(REAL_RULES_PATH, 'utf8')
    expect(after).toBe(before)
  })

  it('the real file still has no live rule for calendars or documents (confirms the gap this draft fixes still exists)', () => {
    const real = readFileSync(REAL_RULES_PATH, 'utf8')
    expect(real).not.toMatch(/match \/users\/\{uid\}\/calendars\//)
    expect(real).not.toMatch(/match \/users\/\{uid\}\/documents\//)
  })
})
