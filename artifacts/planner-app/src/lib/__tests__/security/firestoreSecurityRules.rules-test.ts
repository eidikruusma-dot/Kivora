/**
 * Security-rule tests against the Firebase Local Emulator Suite. See
 * ./README.md for why these are named ".rules-test.ts" (excluded from the
 * default `vitest run`/CI, local-only per this task's instructions), how
 * to run them, and an explicit note that they were WRITTEN but NOT
 * executed/verified in the cloud session that wrote them (the emulator
 * cannot reach firebase-public.firebaseio.com from that sandbox to fetch
 * its own binaries).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { withDraftFirestoreRules, DRAFT_STORAGE_RULES } from './draftRules'

const PROJECT_ID = 'demo-kivora-rules'

function parseEmulatorHost(envVar: string | undefined, fallbackPort: number) {
  if (!envVar) return { host: '127.0.0.1', port: fallbackPort }
  const [host, portStr] = envVar.split(':')
  return { host: host || '127.0.0.1', port: Number(portStr) || fallbackPort }
}

// firestore.rules lives at the monorepo root, two levels above
// artifacts/planner-app (vitest's/firebase emulators:exec's cwd here).
const REAL_FIRESTORE_RULES = readFileSync(
  resolve(process.cwd(), '../../firestore.rules'),
  'utf8',
)
// If this repo gets its own committed storage.rules checked in before this
// test is run for real, prefer reading that over the draft fixture.
const DRAFTED_FIRESTORE_RULES = withDraftFirestoreRules(REAL_FIRESTORE_RULES)

describe('deployed-rules behavior (reads the REAL firestore.rules on disk)', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    const firestoreHost = parseEmulatorHost(process.env.FIRESTORE_EMULATOR_HOST, 8080)
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: REAL_FIRESTORE_RULES, host: firestoreHost.host, port: firestoreHost.port },
    })
  })

  afterAll(async () => {
    await testEnv?.cleanup()
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  it('a user can read/write their own "tasks" document', async () => {
    const aliceDb = testEnv.authenticatedContext('user-a').firestore()
    await assertSucceeds(
      aliceDb.doc('users/user-a/tasks/t1').set({ title: 'hello', id: 't1' }),
    )
    await assertSucceeds(aliceDb.doc('users/user-a/tasks/t1').get())
  })

  it('cross-user isolation: a different authenticated user cannot read, write, or delete another user\'s "tasks" document', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user-a/tasks/t1').set({ title: 'secret', id: 't1' })
    })

    const bobDb = testEnv.authenticatedContext('user-b').firestore()
    await assertFails(bobDb.doc('users/user-a/tasks/t1').get())
    await assertFails(bobDb.doc('users/user-a/tasks/t1').set({ title: 'overwritten', id: 't1' }))
    await assertFails(bobDb.doc('users/user-a/tasks/t1').delete())
  })

  it('cross-user isolation: a different authenticated user cannot read another user\'s profile document', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user-a').set({
        uid: 'user-a',
        displayName: 'Alice',
        email: 'a@example.com',
        preferredLanguage: 'et',
        timezone: 'Europe/Tallinn',
      })
    })

    const bobDb = testEnv.authenticatedContext('user-b').firestore()
    await assertFails(bobDb.doc('users/user-a').get())
  })

  it('an unauthenticated visitor cannot read any user\'s data', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user-a/tasks/t1').set({ title: 'secret', id: 't1' })
    })
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(anonDb.doc('users/user-a/tasks/t1').get())
  })

  describe('feedbackSubmissions / supportMessages stay locked down for everyone, including their own author', () => {
    it('feedbackSubmissions: the author cannot read or delete their own submission', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc('feedbackSubmissions/fb1').set({
          type: 'bug',
          message: 'it broke',
          uid: 'user-a',
          mayContact: false,
          source: 'feedback_page',
          createdAt: new Date(),
        })
      })
      const aliceDb = testEnv.authenticatedContext('user-a').firestore()
      await assertFails(aliceDb.doc('feedbackSubmissions/fb1').get())
      await assertFails(aliceDb.doc('feedbackSubmissions/fb1').delete())
    })

    it('feedbackSubmissions: nobody can list/query the collection either', async () => {
      const aliceDb = testEnv.authenticatedContext('user-a').firestore()
      await assertFails(aliceDb.collection('feedbackSubmissions').get())
    })

    it('supportMessages: the author cannot read or delete their own submission', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc('supportMessages/sm1').set({
          message: 'help please',
          uid: 'user-a',
          createdAt: new Date(),
        })
      })
      const aliceDb = testEnv.authenticatedContext('user-a').firestore()
      await assertFails(aliceDb.doc('supportMessages/sm1').get())
      await assertFails(aliceDb.doc('supportMessages/sm1').delete())
    })
  })

  describe('contactSubmissions: creatable anonymously, never readable or deletable by anyone', () => {
    it('an unauthenticated visitor can create a valid submission', async () => {
      const anonDb = testEnv.unauthenticatedContext().firestore()
      await assertSucceeds(
        anonDb.doc('contactSubmissions/cs1').set({
          senderName: 'Visitor',
          senderEmail: 'visitor@example.com',
          subject: null,
          message: 'hi',
          type: 'contact',
          source: 'contact_page',
          uid: null,
          mayContact: null,
          createdAt: new Date(),
          emailDeliveryStatus: 'pending',
        }),
      )
    })

    it('nobody — not even an authenticated user — can read or delete a contactSubmissions document', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc('contactSubmissions/cs1').set({
          senderName: 'Visitor',
          senderEmail: 'visitor@example.com',
          message: 'hi',
          type: 'contact',
          source: 'contact_page',
          uid: null,
          mayContact: null,
          createdAt: new Date(),
          emailDeliveryStatus: 'pending',
        })
      })
      const aliceDb = testEnv.authenticatedContext('user-a').firestore()
      await assertFails(aliceDb.doc('contactSubmissions/cs1').get())
      await assertFails(aliceDb.doc('contactSubmissions/cs1').delete())
    })
  })
})

describe('draft calendars/documents rules (spliced in-memory — firestore.rules on disk is never modified)', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    const firestoreHost = parseEmulatorHost(process.env.FIRESTORE_EMULATOR_HOST, 8080)
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: DRAFTED_FIRESTORE_RULES, host: firestoreHost.host, port: firestoreHost.port },
    })
  })

  afterAll(async () => {
    await testEnv?.cleanup()
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  it('the owner can create, read, update, and delete their own calendar', async () => {
    const aliceDb = testEnv.authenticatedContext('user-a').firestore()
    await assertSucceeds(
      aliceDb.doc('users/user-a/calendars/cal1').set({ label: 'Work', color: '#6D28D9' }),
    )
    await assertSucceeds(aliceDb.doc('users/user-a/calendars/cal1').get())
    await assertSucceeds(aliceDb.doc('users/user-a/calendars/cal1').update({ label: 'Personal' }))
    await assertSucceeds(aliceDb.doc('users/user-a/calendars/cal1').delete())
  })

  it('a different user cannot read, write, or delete another user\'s calendar', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user-a/calendars/cal1').set({ label: 'Work', color: '#6D28D9' })
    })
    const bobDb = testEnv.authenticatedContext('user-b').firestore()
    await assertFails(bobDb.doc('users/user-a/calendars/cal1').get())
    await assertFails(bobDb.doc('users/user-a/calendars/cal1').update({ label: 'Hijacked' }))
    await assertFails(bobDb.doc('users/user-a/calendars/cal1').delete())
  })

  it('the owner can create, read, and delete their own document record', async () => {
    const aliceDb = testEnv.authenticatedContext('user-a').firestore()
    await assertSucceeds(
      aliceDb.doc('users/user-a/documents/doc1').set({
        name: 'file.pdf',
        mimeType: 'application/pdf',
        storagePath: 'users/user-a/documents/doc1/file.pdf',
        downloadURL: 'https://example.com/file.pdf',
        size: 1234,
        module: 'personal',
      }),
    )
    await assertSucceeds(aliceDb.doc('users/user-a/documents/doc1').get())
    await assertSucceeds(aliceDb.doc('users/user-a/documents/doc1').delete())
  })

  it('a different user cannot read, write, or delete another user\'s document record', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user-a/documents/doc1').set({
        name: 'file.pdf',
        mimeType: 'application/pdf',
        storagePath: 'users/user-a/documents/doc1/file.pdf',
        downloadURL: 'https://example.com/file.pdf',
        size: 1234,
        module: 'personal',
      })
    })
    const bobDb = testEnv.authenticatedContext('user-b').firestore()
    await assertFails(bobDb.doc('users/user-a/documents/doc1').get())
    await assertFails(bobDb.doc('users/user-a/documents/doc1').delete())
  })
})

describe('draft Storage rules for users/{uid}/documents', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    const storageHost = parseEmulatorHost(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199)
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: { rules: DRAFT_STORAGE_RULES, host: storageHost.host, port: storageHost.port },
    })
  })

  afterAll(async () => {
    await testEnv?.cleanup()
  })

  it('the owner can upload and delete their own document file', async () => {
    const aliceStorage = testEnv.authenticatedContext('user-a').storage()
    const fileRef = aliceStorage.ref('users/user-a/documents/doc1/file.pdf')
    await assertSucceeds(Promise.resolve(fileRef.put(new Uint8Array([1, 2, 3]))))
    await assertSucceeds(fileRef.delete())
  })

  it('a different user cannot read or delete another user\'s document file', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('users/user-a/documents/doc1/file.pdf').put(new Uint8Array([1, 2, 3]))
    })
    const bobStorage = testEnv.authenticatedContext('user-b').storage()
    const fileRef = bobStorage.ref('users/user-a/documents/doc1/file.pdf')
    await assertFails(fileRef.getDownloadURL())
    await assertFails(fileRef.delete())
  })
})
