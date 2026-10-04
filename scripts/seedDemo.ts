// Demo displays for the LIVE beta (porchlight-nz), so testers see a populated
// Tauranga instead of an empty list. Every demo pin:
//   - has an owner id starting with "demo" (22 chars, so it can be voted on),
//   - says "Demo display for the Porchlight beta." in its description,
//   - uses a house illustration as its photo, uploaded to Storage like a real
//     photo (photos/{pinId}/demo/full.webp + thumb.webp).
// placeIndex/{eventId} is recounted from all ACTIVE pins afterwards.
//
// Needs Application Default Credentials (gcloud auth application-default login).
//   npm run demo:seed                 # dry run: prints what it would write
//   npm run demo:seed -- --apply      # writes the demo pins + photos
//   npm run demo:seed -- --remove     # dry run of removal
//   npm run demo:seed -- --remove --apply   # deletes every demo pin + photo
// Remove the demo pins before launch (RUNBOOK "Launch day").
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { FieldPath, GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { geohashForLocation } from 'geofire-common'
import sharp from 'sharp'
import { lookupPlace } from '../functions/src/lib/places.js'
import { eventDoc, eventIdOf } from './createEvents'

const PROJECT_ID = 'porchlight-nz'
const BUCKET = 'porchlight-nz.firebasestorage.app'
const SEASON = 'HALLOWEEN' as const
const YEAR = 2026
const EVENT_ID = eventIdOf(SEASON, YEAR)
const OWNER_PREFIX = 'demo'
const DEMO_NOTE = 'Demo display for the Porchlight beta.'
const APPLY = process.argv.includes('--apply')
const REMOVE = process.argv.includes('--remove')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Already-offset stand-in locations on residential streets, with a spread of
// "It's here" counts so testers see verified and new displays side by side.
const SPOTS: { lat: number; lng: number; title: string; description: string; here: number }[] = [
  { lat: -37.693, lng: 176.1605, title: 'The Haunted Villa', description: 'Full graveyard on the front lawn and a smoke machine from 6pm.', here: 6 },
  { lat: -37.668, lng: 176.142, title: 'Ōtūmoetai Ghost Walk', description: 'Ghosts hanging from every tree down the driveway.', here: 4 },
  { lat: -37.657, lng: 176.127, title: 'Matua Moonlight Manor', description: 'Purple floodlights, a fog machine and spooky music on a loop.', here: 1 },
  { lat: -37.713, lng: 176.148, title: 'Gate Pā Graveyard', description: 'Tombstones with terrible puns. "Here lies Les. No more, no Les."', here: 5 },
  { lat: -37.726, lng: 176.137, title: 'Greerton Ghoul House', description: 'Motion-sensor zombie hand in the garden. You have been warned.', here: 0 },
  { lat: -37.708, lng: 176.188, title: 'Maungatapu Monster Mash', description: 'Dance party playlist and a giant inflatable spider on the roof.', here: 3 },
  { lat: -37.6385, lng: 176.18, title: 'Witches of Mauao', description: "Three witches around a bubbling cauldron (it's dry ice, relax).", here: 8 },
  { lat: -37.648, lng: 176.192, title: 'The Spooky Bach', description: 'Orange and purple lights on the deck, pumpkins on the steps.', here: 2 },
  { lat: -37.67, lng: 176.227, title: 'Bayfair Boo Crew', description: 'The whole cul-de-sac went in together. Park at the end and walk.', here: 7 },
  { lat: -37.688, lng: 176.262, title: 'Pāpāmoa Pumpkin Parade', description: 'A pumpkin for every year the kids have lived here.', here: 4 },
  { lat: -37.696, lng: 176.278, title: 'Beachside Boneyard', description: 'Skeleton with a jandal tan and a chilly bin. Sweet as.', here: 0 },
  { lat: -37.717, lng: 176.33, title: 'Wairakei Witch Hut', description: 'Witch on a broom flying over the roof, lit up purple.', here: 3 },
  { lat: -37.784, lng: 176.325, title: 'Kiwifruit Capital Creeps', description: 'Kiwifruit carved like pumpkins. Tiny, cursed and brilliant.', here: 5 },
  { lat: -37.79, lng: 176.322, title: 'Zombie Orchard', description: 'Zombies climbing out of the garden beds.', here: 1 },
  { lat: -37.695, lng: 176.108, title: 'Bethlehem Boo-levard', description: 'Every window has a silhouette: a cat, a witch, a werewolf and Nana.', here: 4 },
  { lat: -37.729, lng: 176.108, title: 'The Lakes Lair', description: 'Vampire coffin in the driveway that opens every few minutes.', here: 2 },
  { lat: -37.728, lng: 176.213, title: 'Welcome Bay Werewolves', description: 'Howling on the hour. The neighbours are thrilled.', here: 6 },
  { lat: -37.633, lng: 176.05, title: 'Peninsula Phantoms', description: 'Ghosts lining the path down to the beach access.', here: 3 },
]

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID, storageBucket: BUCKET })
const db = getFirestore()
const bucket = getStorage().bucket()

const pinIdOf = (i: number): string => `${OWNER_PREFIX}${String(i + 1).padStart(18, '0')}_${EVENT_ID}`

async function uploadPhoto(pinId: string, svgIndex: number): Promise<{ path: string; url: string }[]> {
  const svg = readFileSync(resolve(ROOT, 'public', 'seed', `house-${(svgIndex % 6) + 1}.svg`))
  const out: { path: string; url: string }[] = []
  for (const [name, width] of [['full', 1600], ['thumb', 400]] as const) {
    const buf = await sharp(svg, { density: 300 }).resize({ width }).webp({ quality: 82 }).toBuffer()
    const path = `photos/${pinId}/demo/${name}.webp`
    const token = randomUUID()
    await bucket.file(path).save(buf, {
      contentType: 'image/webp',
      metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: token } },
    })
    out.push({ path, url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}` })
  }
  return out
}

async function rebuildPlaceIndex(): Promise<void> {
  const snap = await db.collection('pins').where('eventId', '==', EVENT_ID).where('status', '==', 'ACTIVE').get()
  const areas: Record<string, { area: string; count: number }> = {}
  const towns: Record<string, { town: string; areaKey: string | null; region: string; countryCode: string; count: number }> = {}
  for (const d of snap.docs) {
    const p = d.get('place')
    if (!p) continue
    if (p.areaKey) areas[p.areaKey] = { area: p.area, count: (areas[p.areaKey]?.count ?? 0) + 1 }
    towns[p.townKey] = { town: p.town, areaKey: p.areaKey, region: p.region, countryCode: p.countryCode, count: (towns[p.townKey]?.count ?? 0) + 1 }
  }
  await db.doc(`placeIndex/${EVENT_ID}`).set({ areas, towns, updatedAt: Timestamp.now() })
  console.log(`placeIndex/${EVENT_ID}: ${snap.size} active pins, ${Object.keys(towns).length} towns`)
}

async function remove(): Promise<void> {
  const snap = await db
    .collection('pins')
    .where(FieldPath.documentId(), '>=', OWNER_PREFIX)
    .where(FieldPath.documentId(), '<', `${OWNER_PREFIX}~`)
    .get()
  console.log(`${APPLY ? 'Deleting' : 'Would delete'} ${snap.size} demo pins`)
  if (!APPLY) return
  for (const d of snap.docs) {
    await bucket.deleteFiles({ prefix: `photos/${d.id}/` }).catch(() => undefined)
    await db.recursiveDelete(d.ref)
  }
  await rebuildPlaceIndex()
}

async function seed(): Promise<void> {
  const event = eventDoc(SEASON, YEAR)
  console.log(`${APPLY ? 'APPLYING to' : 'DRY RUN against'} ${PROJECT_ID}: ${SPOTS.length} demo pins for ${EVENT_ID}`)
  for (const [i, s] of SPOTS.entries()) {
    const pinId = pinIdOf(i)
    const place = lookupPlace(s.lat, s.lng)
    const verified = s.here >= 3
    console.log(`  ${pinId}  ${s.title}  (${place.town})  ${verified ? `✓ ${s.here}` : 'new'}`)
    if (!APPLY) continue
    const [full, thumb] = await uploadPhoto(pinId, i)
    const createdAt = Timestamp.now()
    await db.doc(`pins/${pinId}`).set({
      ownerId: pinId.slice(0, pinId.indexOf('_')),
      eventId: EVENT_ID,
      season: SEASON,
      seasonYear: YEAR,
      title: s.title,
      description: `${s.description} ${DEMO_NOTE}`,
      photoPath: full!.path,
      thumbPath: thumb!.path,
      photoUrl: full!.url,
      thumbUrl: thumb!.url,
      geo: new GeoPoint(s.lat, s.lng),
      geohash: geohashForLocation([s.lat, s.lng], 9),
      place,
      status: 'ACTIVE',
      hiddenReason: null,
      removedBy: null,
      consentAt: createdAt,
      voteRound: 0,
      hereVotes: s.here,
      notThereVotes: 0,
      verified,
      reportsCount: 0,
      rankScore: (verified ? 10000 : 0) + s.here,
      isFeatured: false,
      featuredUntil: null,
      moderation: { decision: 'NONE', reviewedBy: null, reviewedAt: null, note: null },
      createdAt,
      updatedAt: createdAt,
      expiresAt: event.expiresAt,
      purgeAt: event.purgeAt,
    })
  }
  if (APPLY) await rebuildPlaceIndex()
  else console.log('\nDry run only. Re-run with --apply to write.')
}

await (REMOVE ? remove() : seed())
