import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Firestore security rules (SPEC §6). Run with `npm run test:rules`, which
// starts the emulators and sets FIRESTORE_EMULATOR_HOST for us.

const PROJECT_ID = 'demo-porchlight'
const EVENT_ID = 'halloween-2026'
const OTHER_EVENT_ID = 'christmas-2026'

const OWNER = 'owner-uid'
const OTHER = 'other-uid'
const ADMIN = 'admin-uid'

const ACTIVE_PIN = `${OTHER}_${EVENT_ID}`
const HIDDEN_PIN = `${OWNER}_${EVENT_ID}`
const OTHER_EVENT_PIN = `${OTHER}_${OTHER_EVENT_ID}`
const MISSING_PIN = `${OWNER}_${OTHER_EVENT_ID}`

let testEnv: RulesTestEnvironment

function pinData(ownerId: string, eventId: string, status: string) {
  const now = Timestamp.now()
  return {
    ownerId,
    eventId,
    season: 'HALLOWEEN',
    seasonYear: 2026,
    title: 'Spooky porch',
    description: null,
    status,
    hiddenReason: status === 'HIDDEN' ? 'REPORTS' : null,
    removedBy: null,
    geohash: 'rckq2yzbc',
    place: {
      areaKey: 'tauranga',
      area: 'Tauranga & surrounds',
      townKey: 'papamoa-beach-bop-nz',
      town: 'Pāpāmoa Beach',
      region: 'Bay of Plenty',
      countryCode: 'NZ',
    },
    rankScore: 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: now,
    purgeAt: now,
  }
}

function anonDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore
}

function userDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore
}

function adminDb(): Firestore {
  return testEnv.authenticatedContext(ADMIN, { admin: true }).firestore() as unknown as Firestore
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore
    await setDoc(doc(db, 'config/app'), {
      mapAccess: 'ACCOUNT',
      launchCenter: { lat: -37.6878, lng: 176.1651, zoom: 11 },
      defaultAreaKey: 'tauranga',
    })
    await setDoc(doc(db, 'events', EVENT_ID), { season: 'HALLOWEEN', seasonYear: 2026, isActive: true })
    await setDoc(doc(db, 'placeIndex', EVENT_ID), { areas: {}, towns: {}, updatedAt: Timestamp.now() })
    await setDoc(doc(db, 'pins', ACTIVE_PIN), pinData(OTHER, EVENT_ID, 'ACTIVE'))
    await setDoc(doc(db, 'pins', HIDDEN_PIN), pinData(OWNER, EVENT_ID, 'HIDDEN'))
    await setDoc(doc(db, 'pins', OTHER_EVENT_PIN), pinData(OTHER, OTHER_EVENT_ID, 'ACTIVE'))
    await setDoc(doc(db, 'pins', ACTIVE_PIN, 'votes', OWNER), { value: 'HERE', counted: true, round: 0 })
    await setDoc(doc(db, 'pins', ACTIVE_PIN, 'votes', OTHER), { value: 'NOT_THERE', counted: true, round: 0 })
    await setDoc(doc(db, 'pins', ACTIVE_PIN, 'reports', OWNER), { reason: 'SPAM', counted: true })
    await setDoc(doc(db, 'pins', ACTIVE_PIN, 'reports', OTHER), { reason: 'SPAM', counted: true })
    await setDoc(doc(db, 'users', OWNER), { banned: false, pinCreatesByEvent: {} })
    await setDoc(doc(db, 'users', OTHER), { banned: false, pinCreatesByEvent: {} })
    await setDoc(doc(db, 'rateLimits', OWNER), { day: '2026-10-01', createPin: 0, updatePin: 0, castVote: 0, reportPin: 0 })
    await setDoc(doc(db, 'moderationActions', 'action-1'), {
      pinId: HIDDEN_PIN,
      adminUid: ADMIN,
      action: 'REMOVE',
      note: null,
      createdAt: Timestamp.now(),
    })
  })
})

describe('public reads', () => {
  it('anonymous can read config/app, events and placeIndex', async () => {
    const db = anonDb()
    await assertSucceeds(getDoc(doc(db, 'config/app')))
    await assertSucceeds(getDoc(doc(db, 'events', EVENT_ID)))
    await assertSucceeds(getDocs(collection(db, 'events')))
    await assertSucceeds(getDoc(doc(db, 'placeIndex', EVENT_ID)))
  })

  it('anonymous can get an ACTIVE pin', async () => {
    const snap = await assertSucceeds(getDoc(doc(anonDb(), 'pins', ACTIVE_PIN)))
    expect(snap.data()?.status).toBe('ACTIVE')
  })

  it('anonymous can list pins filtered by status ACTIVE', async () => {
    const db = anonDb()
    const all = await assertSucceeds(getDocs(query(collection(db, 'pins'), where('status', '==', 'ACTIVE'))))
    expect(all.size).toBe(2)
    const forEvent = await assertSucceeds(
      getDocs(query(collection(db, 'pins'), where('eventId', '==', EVENT_ID), where('status', '==', 'ACTIVE'))),
    )
    expect(forEvent.docs.map((d) => d.id)).toEqual([ACTIVE_PIN])
  })

  it('anonymous cannot get a HIDDEN pin', async () => {
    await assertFails(getDoc(doc(anonDb(), 'pins', HIDDEN_PIN)))
  })

  it('anonymous cannot list pins without the status filter', async () => {
    const db = anonDb()
    await assertFails(getDocs(collection(db, 'pins')))
    await assertFails(getDocs(query(collection(db, 'pins'), where('eventId', '==', EVENT_ID))))
  })

  it('a signed-in non-owner cannot get a HIDDEN pin', async () => {
    await assertFails(getDoc(doc(userDb(OTHER), 'pins', HIDDEN_PIN)))
  })
})

describe('owner reads', () => {
  it('owner can get their own HIDDEN pin', async () => {
    const snap = await assertSucceeds(getDoc(doc(userDb(OWNER), 'pins', HIDDEN_PIN)))
    expect(snap.data()?.status).toBe('HIDDEN')
  })

  it('owner can list their own pins with an ownerId filter', async () => {
    const snap = await assertSucceeds(getDocs(query(collection(userDb(OWNER), 'pins'), where('ownerId', '==', OWNER))))
    expect(snap.docs.map((d) => d.id)).toEqual([HIDDEN_PIN])
  })

  it('signed-in user can get their own non-existent pin and sees exists=false', async () => {
    const snap = await assertSucceeds(getDoc(doc(userDb(OWNER), 'pins', MISSING_PIN)))
    expect(snap.exists()).toBe(false)
  })

  it('users can read their own users doc but not others', async () => {
    await assertSucceeds(getDoc(doc(userDb(OWNER), 'users', OWNER)))
    await assertFails(getDoc(doc(userDb(OWNER), 'users', OTHER)))
    await assertFails(getDoc(doc(anonDb(), 'users', OWNER)))
  })

  it('users can read their own vote and report, not others', async () => {
    const db = userDb(OWNER)
    await assertSucceeds(getDoc(doc(db, 'pins', ACTIVE_PIN, 'votes', OWNER)))
    await assertSucceeds(getDoc(doc(db, 'pins', ACTIVE_PIN, 'reports', OWNER)))
    await assertFails(getDoc(doc(db, 'pins', ACTIVE_PIN, 'votes', OTHER)))
    await assertFails(getDoc(doc(db, 'pins', ACTIVE_PIN, 'reports', OTHER)))
    await assertFails(getDocs(collection(db, 'pins', ACTIVE_PIN, 'votes')))
  })

  it('anonymous cannot read votes or reports', async () => {
    const db = anonDb()
    await assertFails(getDoc(doc(db, 'pins', ACTIVE_PIN, 'votes', OWNER)))
    await assertFails(getDoc(doc(db, 'pins', ACTIVE_PIN, 'reports', OWNER)))
  })
})

describe('admin reads', () => {
  it('admin can get and list HIDDEN pins', async () => {
    const db = adminDb()
    await assertSucceeds(getDoc(doc(db, 'pins', HIDDEN_PIN)))
    const snap = await assertSucceeds(getDocs(query(collection(db, 'pins'), where('status', '==', 'HIDDEN'))))
    expect(snap.size).toBe(1)
  })

  it('admin can read anyone\'s votes and reports', async () => {
    const db = adminDb()
    await assertSucceeds(getDoc(doc(db, 'pins', ACTIVE_PIN, 'votes', OTHER)))
    await assertSucceeds(getDocs(collection(db, 'pins', ACTIVE_PIN, 'reports')))
  })

  it('only admin can read moderationActions', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'moderationActions')))
    await assertSucceeds(getDoc(doc(adminDb(), 'moderationActions', 'action-1')))
    await assertFails(getDocs(collection(userDb(OWNER), 'moderationActions')))
    await assertFails(getDoc(doc(anonDb(), 'moderationActions', 'action-1')))
  })

  it('a false admin claim is not admin', async () => {
    const db = testEnv.authenticatedContext(OTHER, { admin: false }).firestore() as unknown as Firestore
    await assertFails(getDoc(doc(db, 'pins', HIDDEN_PIN)))
    await assertFails(getDoc(doc(db, 'moderationActions', 'action-1')))
  })
})

describe('rateLimits', () => {
  it('is unreadable by everyone', async () => {
    await assertFails(getDoc(doc(anonDb(), 'rateLimits', OWNER)))
    await assertFails(getDoc(doc(userDb(OWNER), 'rateLimits', OWNER)))
    await assertFails(getDoc(doc(adminDb(), 'rateLimits', OWNER)))
    await assertFails(getDocs(collection(adminDb(), 'rateLimits')))
  })
})

describe('unknown collections', () => {
  it('are denied by default', async () => {
    await assertFails(getDoc(doc(adminDb(), 'somethingElse', 'x')))
    await assertFails(setDoc(doc(adminDb(), 'somethingElse', 'x'), { a: 1 }))
  })
})

describe('client writes', () => {
  const actors: Array<[string, () => Firestore]> = [
    ['anonymous', anonDb],
    ['signed-in user', () => userDb(OWNER)],
    ['admin', adminDb],
  ]

  for (const [name, getDb] of actors) {
    describe(name, () => {
      it('cannot write pins (create, update, delete)', async () => {
        const db = getDb()
        await assertFails(setDoc(doc(db, 'pins', `${OWNER}_new-event`), pinData(OWNER, 'new-event', 'ACTIVE')))
        await assertFails(setDoc(doc(db, 'pins', MISSING_PIN), pinData(OWNER, OTHER_EVENT_ID, 'ACTIVE')))
        await assertFails(updateDoc(doc(db, 'pins', HIDDEN_PIN), { status: 'ACTIVE' }))
        await assertFails(updateDoc(doc(db, 'pins', ACTIVE_PIN), { rankScore: 999999 }))
        await assertFails(deleteDoc(doc(db, 'pins', ACTIVE_PIN)))
      })

      it('cannot write votes or reports', async () => {
        const db = getDb()
        await assertFails(setDoc(doc(db, 'pins', ACTIVE_PIN, 'votes', OWNER), { value: 'HERE', counted: true, round: 0 }))
        await assertFails(setDoc(doc(db, 'pins', ACTIVE_PIN, 'reports', OWNER), { reason: 'SPAM', counted: true }))
        await assertFails(deleteDoc(doc(db, 'pins', ACTIVE_PIN, 'votes', OWNER)))
      })

      it('cannot write config, events, placeIndex or moderationActions', async () => {
        const db = getDb()
        await assertFails(setDoc(doc(db, 'config/app'), { mapAccess: 'PUBLIC' }))
        await assertFails(updateDoc(doc(db, 'config/app'), { mapAccess: 'OFF' }))
        await assertFails(setDoc(doc(db, 'events', 'new-event'), { isActive: true }))
        await assertFails(updateDoc(doc(db, 'events', EVENT_ID), { isActive: false }))
        await assertFails(setDoc(doc(db, 'placeIndex', EVENT_ID), { areas: {}, towns: {} }))
        await assertFails(setDoc(doc(db, 'moderationActions', 'action-2'), { action: 'APPROVE' }))
      })

      it('cannot write users or rateLimits', async () => {
        const db = getDb()
        await assertFails(setDoc(doc(db, 'users', OWNER), { banned: false }))
        await assertFails(updateDoc(doc(db, 'users', OWNER), { banned: false }))
        await assertFails(setDoc(doc(db, 'rateLimits', OWNER), { day: '2026-10-01', createPin: 0 }))
        await assertFails(deleteDoc(doc(db, 'rateLimits', OWNER)))
      })
    })
  }
})
