// Seeds the Firestore EMULATOR with demo data (SPEC §8 Phase 1):
// config/app (launchMode 'BETA'), config/testers (tester@example.com,
// owner@example.com), events/HALLOWEEN_2026, ~50 pins around Tauranga (+ a few in
// Rotorua, outside every area, and a few HIDDEN/REMOVED ones) and
// placeIndex/HALLOWEEN_2026. Idempotent: every doc is overwritten, and seed
// pins no longer in the list below are deleted. Deterministic (seeded PRNG).
//
// Run (with the emulators up):  npm run seed
//        print only, no writes:  npm run seed -- --dry-run
//
// Photos are the static SVGs in public/seed/ (served by Vite at /seed/...);
// nothing is uploaded to Storage and no vote/report docs are created.
import { initializeApp } from 'firebase-admin/app'
import { FieldPath, GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { geohashForLocation } from 'geofire-common'
import type { DisplayPin, EventId, PinStatus, PlaceIndex } from '../src/types/models'
import { lookupPlace } from '../functions/src/lib/places.js'
import { DEFAULT_APP_CONFIG, eventDoc, printable, type AdminDoc } from './createEvents'

const PROJECT_ID = 'demo-porchlight'
const SEASON = 'HALLOWEEN'
const YEAR = 2026
const EVENT_ID: EventId = `${SEASON}_${YEAR}`
const OWNER_PREFIX = 'seedUser'
const PHOTO_COUNT = 6
/** config/testers for the emulator (SPEC §5 beta mode), lowercased. */
const SEED_TESTERS = ['tester@example.com', 'owner@example.com']
const DRY_RUN = process.argv.includes('--dry-run')

// --- Safety: emulator only --------------------------------------------------

if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error('seed.ts only runs against a demo-* project on the emulator.')
}
if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST

// --- Deterministic PRNG (mulberry32) ----------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261031)
const randInt = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1))

// --- Seed displays ------------------------------------------------------------

interface SeedSpot {
  lat: number
  lng: number
  title: string
  description: string | null
  status?: Exclude<PinStatus, 'ACTIVE' | 'ARCHIVED'>
}

// Points are on residential streets and stand in for the already-offset
// location createPin would store. Each gets up to ~120 m of jitter.
const SPOTS: SeedSpot[] = [
  // Tauranga city
  { lat: -37.6930, lng: 176.1605, title: 'The Haunted Villa', description: 'Full graveyard on the front lawn and a smoke machine that runs from 6pm. Kids get a lolly if they say "boo".' },
  { lat: -37.7050, lng: 176.1590, title: 'Pumpkin Palace', description: '42 carved pumpkins at last count. Best after dark.' },
  { lat: -37.6680, lng: 176.1420, title: 'Ōtūmoetai Ghost Walk', description: 'Ghosts hanging from every tree down the driveway. Mind the one by the letterbox, it talks.' },
  { lat: -37.6620, lng: 176.1330, title: 'Skeleton Sausage Sizzle', description: 'Skeletons manning a barbecue, with a sign saying "back in 5 minutes". Been there since 1998.' },
  { lat: -37.6570, lng: 176.1270, title: 'Matua Moonlight Manor', description: 'Purple floodlights, a fog machine and spooky music on a loop.' },
  { lat: -37.6800, lng: 176.1370, title: 'Bellevue Bat Cave', description: null },
  { lat: -37.6900, lng: 176.1330, title: 'The Cobweb Cottage', description: 'Fake cobwebs over the whole house. Took three weekends.' },
  { lat: -37.6920, lng: 176.1440, title: 'Judea Jack-o\'-Lanterns', description: 'A row of lit pumpkins up the steps and a witch stuck in the gutter.' },
  { lat: -37.7130, lng: 176.1480, title: 'Gate Pā Graveyard', description: 'Tombstones with terrible puns. "Here lies Les. No more, no Les."' },
  { lat: -37.7260, lng: 176.1370, title: 'Greerton Ghoul House', description: 'Motion-sensor zombie hand in the garden. You have been warned.' },
  { lat: -37.7160, lng: 176.1400, title: 'Parkvale Pumpkin Patch', description: null },
  { lat: -37.7080, lng: 176.1880, title: 'Maungatapu Monster Mash', description: 'Dance party playlist and a giant inflatable spider on the roof.' },
  { lat: -37.7430, lng: 176.1880, title: 'Ōhauiti Hollow', description: 'Lanterns along the whole fence line. Lovely on a still night.' },
  // Mount Maunganui
  { lat: -37.6420, lng: 176.1860, title: 'Ghosts of the Mount', description: 'Sheet ghosts on surfboards. Very on brand.' },
  { lat: -37.6480, lng: 176.1920, title: 'The Spooky Bach', description: 'Orange and purple lights on the deck, pumpkins on the steps.' },
  { lat: -37.6560, lng: 176.2010, title: 'Mount Mummy Mansion', description: 'Two mummies in deck chairs having a cheeky one.' },
  { lat: -37.6640, lng: 176.2140, title: 'Ōmanu Haunted Hideaway', description: null },
  { lat: -37.6700, lng: 176.2270, title: 'Bayfair Boo Crew', description: 'The whole cul-de-sac went in together this year. Park at the end and walk.' },
  { lat: -37.6760, lng: 176.2400, title: 'Arataki Terror Tunnel', description: 'Walk-through tunnel of fake cobwebs in the carport. Opens Oct 31, 6–8pm.' },
  { lat: -37.6385, lng: 176.1800, title: 'Witches of Mauao', description: 'Three witches around a bubbling cauldron (it\'s dry ice, relax).' },
  // Pāpāmoa
  { lat: -37.6880, lng: 176.2620, title: 'Pāpāmoa Pumpkin Parade', description: 'A pumpkin for every year the kids have lived here. Twelve and counting.' },
  { lat: -37.6960, lng: 176.2780, title: 'Beachside Boneyard', description: 'Skeleton with a jandal tan and a chilly bin. Sweet as.' },
  { lat: -37.7000, lng: 176.2900, title: 'The Ghostly Garage', description: 'Garage converted into a haunted house. Lights on from 7pm.' },
  { lat: -37.7060, lng: 176.3020, title: 'Creepy Crawly Corner', description: null },
  { lat: -37.7120, lng: 176.3150, title: 'Pāpāmoa East Phantoms', description: 'Glowing eyes in the hedge. Absolutely not a possum.' },
  { lat: -37.7050, lng: 176.2850, title: 'Spider Street Special', description: 'Massive web across the front of the house with a spider the size of a Mini.' },
  { lat: -37.7170, lng: 176.3300, title: 'Wairakei Witch Hut', description: 'Witch on a broom flying over the roof, lit up purple.' },
  // Te Puke
  { lat: -37.7840, lng: 176.3250, title: 'Kiwifruit Capital Creeps', description: 'Kiwifruit carved like pumpkins. Tiny, cursed and brilliant.' },
  { lat: -37.7870, lng: 176.3310, title: 'Te Puke Terror', description: 'Old tractor turned into a hearse. Honestly quite moving.' },
  { lat: -37.7800, lng: 176.3180, title: 'The Hollow Tree House', description: null },
  { lat: -37.7900, lng: 176.3220, title: 'Zombie Orchard', description: 'Zombies climbing out of the garden beds. Ten out of ten from the neighbours.' },
  { lat: -37.7820, lng: 176.3350, title: 'Pumpkin Pete\'s', description: 'Pete grows the pumpkins himself. Bring a torch.' },
  // Bethlehem
  { lat: -37.6950, lng: 176.1080, title: 'Bethlehem Boo-levard', description: 'Every window has a silhouette: a cat, a witch, a werewolf and Nana.' },
  { lat: -37.7000, lng: 176.1120, title: 'Casper\'s Crib', description: 'Friendly ghosts only. Good for little ones.' },
  { lat: -37.6880, lng: 176.1150, title: 'The Pumpkin Porch', description: null },
  { lat: -37.6990, lng: 176.1010, title: 'Frankenstein\'s Flat', description: 'Lab bench on the porch with fizzing potions and a very patient dog in costume.' },
  // The Lakes / Tauriko
  { lat: -37.7240, lng: 176.1030, title: 'Lakeside Lanterns', description: 'Floating lanterns on the pond out front. Stunning on a calm night.' },
  { lat: -37.7290, lng: 176.1080, title: 'The Lakes Lair', description: 'Vampire coffin in the driveway that opens every few minutes.' },
  { lat: -37.7340, lng: 176.0930, title: 'Tauriko Trick-or-Treat Stop', description: 'Lolly chute from the upstairs window, contactless and brilliant.' },
  // Welcome Bay
  { lat: -37.7230, lng: 176.2000, title: 'Welcome Bay Werewolves', description: 'Howling on the hour. The neighbours are thrilled.' },
  { lat: -37.7280, lng: 176.2130, title: 'Spook Central', description: 'Purple lights, orange lights and far too many inflatables.' },
  { lat: -37.7330, lng: 176.2220, title: 'The Creepy Cul-de-sac', description: null },
  { lat: -37.7190, lng: 176.1950, title: 'Hairy Maclary\'s Haunt', description: 'Dog-themed Halloween. Scarface Claw is the villain, obviously.' },
  // Ōmokoroa
  { lat: -37.6380, lng: 176.0450, title: 'Ōmokoroa Ghost Ship', description: 'A pirate ghost ship built out of the old dinghy. Arrr.' },
  { lat: -37.6330, lng: 176.0500, title: 'Peninsula Phantoms', description: 'Ghosts lining the path down to the beach access.' },
  { lat: -37.6440, lng: 176.0400, title: 'The Batty Bungalow', description: 'Hundreds of paper bats across the front of the house.' },
  // Rotorua (outside every area)
  { lat: -38.1370, lng: 176.2510, title: 'Sulphur City Spooks', description: 'Smells spooky all year round, to be fair.' },
  { lat: -38.1500, lng: 176.2400, title: 'Glenholme Ghost House', description: 'Full haunted walkthrough in the garage, gold coin donation to the school.' },
  { lat: -38.1200, lng: 176.2250, title: 'Koutu Creepers', description: null },
  { lat: -38.1550, lng: 176.2700, title: 'Lynmore Lantern Lane', description: 'Pumpkin lanterns all the way up the drive.' },
  // Not ACTIVE: must never show in lists, the map or placeIndex counts
  { lat: -37.7010, lng: 176.2950, title: 'Totally Real Display', description: 'Nothing here but a wheelie bin.', status: 'HIDDEN' },
  { lat: -37.6500, lng: 176.1950, title: 'Buy Cheap Pumpkins', description: 'Visit my website for deals!!!', status: 'HIDDEN' },
  { lat: -37.6850, lng: 176.1380, title: 'Removed Display', description: 'Removed by a moderator.', status: 'REMOVED' },
]

// --- Build docs ---------------------------------------------------------------

type SeedPin = AdminDoc<DisplayPin>

const JITTER_DEG = 0.0011 // ~120 m

function buildPins(): Map<string, SeedPin> {
  const event = eventDoc(SEASON, YEAR)
  const openMs = event.submissionsOpenAt.toMillis()
  const pins = new Map<string, SeedPin>()

  SPOTS.forEach((spot, i) => {
    const ownerId = `${OWNER_PREFIX}${String(i + 1).padStart(2, '0')}`
    const pinId = `${ownerId}_${EVENT_ID}`
    const lat = Number((spot.lat + (rand() - 0.5) * 2 * JITTER_DEG).toFixed(6))
    const lng = Number((spot.lng + (rand() - 0.5) * 2 * JITTER_DEG).toFixed(6))
    const status: PinStatus = spot.status ?? 'ACTIVE'

    // ~35% of pins are new (0–2 "It's here"), the rest have 3–15.
    let hereVotes = rand() < 0.35 ? randInt(0, 2) : randInt(3, 15)
    let notThereVotes = randInt(0, 2)
    let reportsCount = 0
    let hiddenReason: SeedPin['hiddenReason'] = null
    let removedBy: SeedPin['removedBy'] = null
    let moderation: SeedPin['moderation'] = { decision: 'NONE', reviewedBy: null, reviewedAt: null, note: null }

    const createdAt = Timestamp.fromMillis(openMs + Math.floor(rand() * 10 * 60) * 60_000) // first 10 h
    const updatedAt = Timestamp.fromMillis(createdAt.toMillis() + randInt(0, 120) * 60_000)

    if (status === 'HIDDEN' && spot.title.startsWith('Totally')) {
      // F7: notThere >= 3 && notThere > here
      hereVotes = 1
      notThereVotes = 4
      hiddenReason = 'NOT_THERE'
    } else if (status === 'HIDDEN') {
      // F8: 3 counted reports
      hereVotes = 0
      notThereVotes = 1
      reportsCount = 3
      hiddenReason = 'REPORTS'
    } else if (status === 'REMOVED') {
      removedBy = 'ADMIN'
      moderation = { decision: 'REJECTED', reviewedBy: 'seedAdmin', reviewedAt: updatedAt, note: 'Not a display (seed data)' }
    }

    const verified = hereVotes >= 3 && hereVotes >= 2 * notThereVotes
    const isFeatured = false
    const rankScore = (isFeatured ? 100000 : 0) + (verified ? 10000 : 0) + hereVotes - notThereVotes
    const photo = `/seed/house-${(i % PHOTO_COUNT) + 1}.svg`

    pins.set(pinId, {
      ownerId,
      eventId: EVENT_ID,
      season: SEASON,
      seasonYear: YEAR,
      title: spot.title,
      description: spot.description,
      photoPath: `photos/${pinId}/seed/full.webp`,
      thumbPath: `photos/${pinId}/seed/thumb.webp`,
      photoUrl: photo,
      thumbUrl: photo,
      geo: new GeoPoint(lat, lng),
      geohash: geohashForLocation([lat, lng], 9),
      place: lookupPlace(lat, lng),
      status,
      hiddenReason,
      removedBy,
      consentAt: createdAt,
      voteRound: 0,
      hereVotes,
      notThereVotes,
      verified,
      reportsCount,
      rankScore,
      isFeatured,
      featuredUntil: null,
      moderation,
      createdAt,
      updatedAt,
      expiresAt: event.expiresAt,
      purgeAt: event.purgeAt,
    })
  })
  return pins
}

function buildPlaceIndex(pins: Iterable<SeedPin>): AdminDoc<PlaceIndex> {
  const index: AdminDoc<PlaceIndex> = { areas: {}, towns: {}, updatedAt: Timestamp.now() }
  for (const pin of pins) {
    if (pin.status !== 'ACTIVE') continue
    const p = pin.place
    if (p.areaKey && p.area) {
      const a = (index.areas[p.areaKey] ??= { area: p.area, count: 0 })
      a.count++
    }
    const t = (index.towns[p.townKey] ??= {
      town: p.town,
      areaKey: p.areaKey,
      region: p.region,
      countryCode: p.countryCode,
      count: 0,
    })
    t.count++
  }
  return index
}

// --- Write ----------------------------------------------------------------------

async function assertEmulatorUp(): Promise<void> {
  try {
    await fetch(`http://${EMULATOR_HOST}/`, { signal: AbortSignal.timeout(3000) })
  } catch {
    console.error(`\nCan't reach the Firestore emulator at ${EMULATOR_HOST}. Start it with: npm run emulators\n`)
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const pins = buildPins()
  const placeIndex = buildPlaceIndex(pins.values())
  const event = eventDoc(SEASON, YEAR)

  const all = [...pins.values()]
  const active = all.filter((p) => p.status === 'ACTIVE')
  console.log(`\nSeed for ${PROJECT_ID} @ ${EMULATOR_HOST}${DRY_RUN ? ' (dry run)' : ''}`)
  console.log(`events/${EVENT_ID}`, printable(event))
  console.log(
    `${all.length} pins: ${active.length} ACTIVE (${active.filter((p) => p.verified).length} verified), ` +
      `${all.length - active.length} not active, ${active.filter((p) => !p.place.areaKey).length} outside any area`,
  )
  console.log('placeIndex areas:', placeIndex.areas)
  console.log(
    'placeIndex towns:',
    Object.entries(placeIndex.towns)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, t]) => `${t.town} (${key}, ${t.areaKey ?? 'no area'}): ${t.count}`)
      .join('\n  '),
  )
  if (DRY_RUN) return

  await assertEmulatorUp()
  const app = initializeApp({ projectId: PROJECT_ID }, 'seed')
  const db = getFirestore(app)

  // Delete seed pins from earlier runs that are no longer in SPOTS.
  const existing = await db
    .collection('pins')
    .where(FieldPath.documentId(), '>=', OWNER_PREFIX)
    .where(FieldPath.documentId(), '<', `${OWNER_PREFIX}`)
    .get()
  const stale = existing.docs.filter((d) => !pins.has(d.id))
  for (const doc of stale) await db.recursiveDelete(doc.ref)

  const batch = db.batch()
  // DEFAULT_APP_CONFIG includes launchMode 'BETA' + feedbackEmail; the testers
  // below are the emulator accounts allowed to write during the beta.
  batch.set(db.collection('config').doc('app'), DEFAULT_APP_CONFIG)
  batch.set(db.collection('config').doc('testers'), { emails: SEED_TESTERS })
  batch.set(db.collection('events').doc(EVENT_ID), event)
  for (const [id, pin] of pins) batch.set(db.collection('pins').doc(id), pin)
  batch.set(db.collection('placeIndex').doc(EVENT_ID), placeIndex)
  await batch.commit()

  console.log(`\nWrote config/app, config/testers, events/${EVENT_ID}, ${pins.size} pins, placeIndex/${EVENT_ID}` +
    (stale.length ? `; deleted ${stale.length} stale seed pins` : '') + '.\n')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
