import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteObject,
  getBytes,
  getMetadata,
  listAll,
  ref,
  uploadBytes,
  type FirebaseStorage,
  type StorageReference,
} from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Storage security rules (SPEC §5 "Storage layout"). Run with `npm run test:rules`,
// which starts the Storage emulator and sets FIREBASE_STORAGE_EMULATOR_HOST.

const PROJECT_ID = 'demo-porchlight'
const OWNER = 'ownerUid0123456789abcdefgh'
const OTHER = 'otherUid0123456789abcdefgh'
const UPLOAD_ID = 'abcDEF_123-xyz7890'
const PIN_ID = `${OWNER}_HALLOWEEN_2026`
const PHOTO = `photos/${PIN_ID}/${UPLOAD_ID}/full.webp`

const JPEG = { contentType: 'image/jpeg' }
const small = (): Uint8Array => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

let testEnv: RulesTestEnvironment

function anonStorage(): FirebaseStorage {
  return testEnv.unauthenticatedContext().storage() as unknown as FirebaseStorage
}

function userStorage(uid: string, claims: Record<string, unknown> = {}): FirebaseStorage {
  return testEnv.authenticatedContext(uid, claims).storage() as unknown as FirebaseStorage
}

async function seedObject(path: string, contentType = 'image/webp'): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const storage = ctx.storage() as unknown as FirebaseStorage
    await uploadBytes(ref(storage, path), small(), { contentType })
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync(fileURLToPath(new URL('../../storage.rules', import.meta.url)), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

// testEnv.clearStorage() only deletes top-level objects; clear nested paths too.
async function clearAll(dir: StorageReference): Promise<void> {
  const { items, prefixes } = await listAll(dir)
  await Promise.all([...items.map((item) => deleteObject(item)), ...prefixes.map(clearAll)])
}

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await clearAll(ref(ctx.storage() as unknown as FirebaseStorage))
  })
})

describe('uploads/{uid}/{uploadId}', () => {
  const path = `uploads/${OWNER}/${UPLOAD_ID}`

  it('the owner can create a small JPEG', async () => {
    await assertSucceeds(uploadBytes(ref(userStorage(OWNER), path), small(), JPEG))
  })

  it('anonymous users cannot upload', async () => {
    await assertFails(uploadBytes(ref(anonStorage(), path), small(), JPEG))
  })

  it("a user cannot upload into someone else's folder", async () => {
    await assertFails(uploadBytes(ref(userStorage(OTHER), path), small(), JPEG))
  })

  it('rejects other content types', async () => {
    const s = userStorage(OWNER)
    await assertFails(uploadBytes(ref(s, path), small(), { contentType: 'image/png' }))
    await assertFails(uploadBytes(ref(s, path), small(), { contentType: 'text/plain' }))
    await assertFails(uploadBytes(ref(s, path), small()))
  })

  it('rejects 10 MB or more', async () => {
    const big = new Uint8Array(10 * 1024 * 1024)
    await assertFails(uploadBytes(ref(userStorage(OWNER), path), big, JPEG))
  })

  it('accepts just under 10 MB', async () => {
    const almost = new Uint8Array(10 * 1024 * 1024 - 1)
    await assertSucceeds(uploadBytes(ref(userStorage(OWNER), path), almost, JPEG))
  })

  it('rejects bad upload ids', async () => {
    const s = userStorage(OWNER)
    await assertFails(uploadBytes(ref(s, `uploads/${OWNER}/short`), small(), JPEG))
    await assertFails(uploadBytes(ref(s, `uploads/${OWNER}/${'a'.repeat(41)}`), small(), JPEG))
    await assertFails(uploadBytes(ref(s, `uploads/${OWNER}/bad.id.with.dots`), small(), JPEG))
    await assertFails(uploadBytes(ref(s, `uploads/${OWNER}/${UPLOAD_ID}/nested`), small(), JPEG))
  })

  it('the owner cannot overwrite, read or delete an upload', async () => {
    const s = userStorage(OWNER)
    await assertSucceeds(uploadBytes(ref(s, path), small(), JPEG))
    await assertFails(uploadBytes(ref(s, path), small(), JPEG))
    await assertFails(getBytes(ref(s, path)))
    await assertFails(getMetadata(ref(s, path)))
    await assertFails(deleteObject(ref(s, path)))
  })

  it('admins get no client access to uploads either', async () => {
    await seedObject(path, 'image/jpeg')
    const s = userStorage(OTHER, { admin: true })
    await assertFails(getBytes(ref(s, path)))
    await assertFails(deleteObject(ref(s, path)))
  })
})

describe('photos/**', () => {
  it('anyone can read photos', async () => {
    await seedObject(PHOTO)
    await assertSucceeds(getBytes(ref(anonStorage(), PHOTO)))
    await assertSucceeds(getMetadata(ref(userStorage(OTHER), PHOTO)))
  })

  it('nobody can list photos (pinIds and HIDDEN pins stay unlisted)', async () => {
    await seedObject(PHOTO)
    await assertFails(listAll(ref(anonStorage(), 'photos')))
    await assertFails(listAll(ref(anonStorage(), `photos/${PIN_ID}`)))
    await assertFails(listAll(ref(userStorage(OWNER), `photos/${PIN_ID}/${UPLOAD_ID}`)))
  })

  it('no client can write or delete photos, even the owner', async () => {
    await seedObject(PHOTO)
    const owner = userStorage(OWNER)
    await assertFails(uploadBytes(ref(owner, `photos/${PIN_ID}/${UPLOAD_ID}/new.webp`), small(), { contentType: 'image/webp' }))
    await assertFails(uploadBytes(ref(owner, PHOTO), small(), { contentType: 'image/webp' }))
    await assertFails(deleteObject(ref(owner, PHOTO)))
    await assertFails(deleteObject(ref(userStorage(OTHER, { admin: true }), PHOTO)))
  })
})

describe('everything else', () => {
  it('is closed', async () => {
    await seedObject('other/file.webp')
    const s = userStorage(OWNER)
    await assertFails(getBytes(ref(s, 'other/file.webp')))
    await assertFails(uploadBytes(ref(s, 'other/new.jpg'), small(), JPEG))
    await assertFails(uploadBytes(ref(s, `${OWNER}/${UPLOAD_ID}`), small(), JPEG))
    await assertFails(getBytes(ref(anonStorage(), 'other/file.webp')))
  })
})
