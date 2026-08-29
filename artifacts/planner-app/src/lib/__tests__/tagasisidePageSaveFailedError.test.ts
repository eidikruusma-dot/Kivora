/**
 * TagasisidePage.tsx's handleSubmit() silently swallowed a failure of the
 * initial addDoc(collection(db, "feedbackSubmissions"), ...) call: the catch
 * block just reset `submitting` and returned, with no error state and no
 * visible feedback to the user. Every other outcome (success, saved-but-
 * email-unconfirmed) already had its own banner.
 *
 * Fix: add a `saveFailed` state, set only from that one catch block, cleared
 * at the start of every submit attempt (so a retry clears a stale error),
 * and a banner reusing the exact same alert-banner markup/dismiss pattern as
 * the existing success/saveOnly banners (role="alert", AlertCircle icon,
 * dismiss button) — just with the repo's existing red-error color classes
 * (bg-red-50/text-red-700/border-red-200, matching
 * AndmeteKustutaminePage.tsx's error styling) instead of green/amber. The
 * new feedback.error translation key follows the same naming convention as
 * the existing feedback.success/feedback.saved keys and mirrors
 * contact.error's wording for the equivalent failure in Contact.tsx.
 *
 * No other behavior changed: email delivery fallback, the saveOnly
 * (email-failed) path, validation, and all form fields are untouched.
 *
 * No React rendering harness exists for Settings pages in this repo —
 * verified via structural regex assertions against the raw source, matching
 * the pattern used throughout this session's other Settings tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/tagasisidePageSaveFailedError.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/TagasisidePage.tsx'),
  'utf8',
)
const TRANSLATIONS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/translations.ts'),
  'utf8',
)

function handleSubmitBlock(): string {
  return PAGE_SRC.match(/const handleSubmit = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
}

describe('a failed Firestore addDoc() now surfaces an explicit error to the user', () => {
  it('saveFailed state exists and is set in the addDoc catch block, no more silent return', () => {
    expect(PAGE_SRC).toMatch(/const \[saveFailed, setSaveFailed\] = useState\(false\);/)
    const addDocCatch = handleSubmitBlock().match(
      /docRef = await addDoc\(collection\(db, "feedbackSubmissions"\)[\s\S]*?\} catch \{([\s\S]*?)\}\n\n {4}\/\/ 2\./,
    )?.[1] ?? ''
    expect(addDocCatch).toMatch(/setSaveFailed\(true\);/)
    expect(addDocCatch).not.toMatch(/silent fail/)
  })

  it('a saveFailed banner renders feedback.error, using the same alert/dismiss markup as the other banners', () => {
    expect(PAGE_SRC).toMatch(/\{saveFailed && \(/)
    expect(PAGE_SRC).toMatch(/t\("feedback\.error", lang\)/)
    expect(PAGE_SRC).toMatch(/const handleDismissSaveFailed = \(\) => setSaveFailed\(false\);/)
    const bannerBlock = PAGE_SRC.match(/\{saveFailed && \([\s\S]*?\n {8}\)\}/)?.[0] ?? ''
    expect(bannerBlock).toMatch(/role="alert"/)
    expect(bannerBlock).toMatch(/bg-red-50 text-red-700 border-red-200/)
    expect(bannerBlock).toMatch(/onClick=\{handleDismissSaveFailed\}/)
  })

  it('feedback.error exists in both languages, in the TranslationKey union', () => {
    expect(TRANSLATIONS_SRC).toMatch(/\| "feedback\.error"/)
    const matches = TRANSLATIONS_SRC.match(/"feedback\.error":/g) ?? []
    expect(matches.length).toBe(2)
  })

  it('a retry clears any previous saveFailed error at the start of handleSubmit', () => {
    const block = handleSubmitBlock()
    const setSubmittingIdx = block.indexOf('setSubmitting(true);')
    const clearFailedIdx = block.indexOf('setSaveFailed(false);')
    const addDocIdx = block.indexOf('docRef = await addDoc(')
    expect(clearFailedIdx).toBeGreaterThan(setSubmittingIdx)
    expect(clearFailedIdx).toBeLessThan(addDocIdx)
  })
})

describe('successful Firestore save + failed email still shows the existing saved/partial-success state', () => {
  it('saveOnly is still set only from the post-email-attempt else branch, unrelated to the addDoc catch', () => {
    const block = handleSubmitBlock()
    expect(block).toMatch(/\} else \{\s*\n\s*setSaveOnly\(true\);\s*\n\s*\}/)
    const addDocCatch = block.match(
      /docRef = await addDoc\(collection\(db, "feedbackSubmissions"\)[\s\S]*?\} catch \{([\s\S]*?)\}\n\n {4}\/\/ 2\./,
    )?.[1] ?? ''
    expect(addDocCatch).not.toMatch(/setSaveOnly/)
  })

  it('email delivery fetch + emailDeliveryStatus update logic is untouched', () => {
    const block = handleSubmitBlock()
    expect(block).toMatch(/const res = await fetch\("\/api\/feedback", \{/)
    expect(block).toMatch(/emailOk = res\.ok && json\.ok === true;/)
    expect(block).toMatch(/await updateDoc\(docRef, \{\s*\n\s*emailDeliveryStatus: emailOk \? "sent" : "failed",/)
  })

  it('feedback.saved (the existing partial-success copy) is unchanged', () => {
    expect(TRANSLATIONS_SRC).toContain(
      '"feedback.saved": "Tagasiside salvestati, kuid e-posti kättetoimetamist ei saanud kinnitada."',
    )
    expect(TRANSLATIONS_SRC).toContain(
      '"feedback.saved": "Feedback saved but email delivery could not be confirmed."',
    )
  })
})

describe('successful submission behavior is unchanged', () => {
  it('the emailOk branch still resets all fields and shows the success banner with its 5s auto-dismiss', () => {
    const block = handleSubmitBlock()
    const successBranch = block.match(/if \(emailOk\) \{([\s\S]*?)\} else \{/)?.[1] ?? ''
    expect(successBranch).toMatch(/setFeedbackType\("suggestion"\);/)
    expect(successBranch).toMatch(/setSubject\(""\);/)
    expect(successBranch).toMatch(/setMessage\(""\);/)
    expect(successBranch).toMatch(/setEmail\(""\);/)
    expect(successBranch).toMatch(/setMayContact\(false\);/)
    expect(successBranch).toMatch(/setTouched\(false\);/)
    expect(successBranch).toMatch(/setSubmitted\(true\);/)
    expect(successBranch).toMatch(/setTimeout\(\(\) => setSubmitted\(false\), 5000\);/)
  })

  it('validation (touched/isValid) and all form-field state are untouched', () => {
    expect(PAGE_SRC).toMatch(/const trimmedMessage = message\.trim\(\);/)
    expect(PAGE_SRC).toMatch(/const isValid = trimmedMessage\.length > 0;/)
    expect(PAGE_SRC).toMatch(/const showError = touched && !isValid;/)
    expect(PAGE_SRC).toMatch(/const \[feedbackType, setFeedbackType\] = useState<FeedbackType>\("suggestion"\);/)
    expect(PAGE_SRC).toMatch(/const \[subject, setSubject\] = useState\(""\);/)
    expect(PAGE_SRC).toMatch(/const \[email, setEmail\] = useState\(""\);/)
    expect(PAGE_SRC).toMatch(/const \[mayContact, setMayContact\] = useState\(false\);/)
  })
})
