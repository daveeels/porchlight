// Builds functions/data/places.json from GeoNames (SPEC §5 "Place data").
// Run: npm run places:build
//
// Data: GeoNames NZ.zip + admin1CodesASCII.txt, CC-BY 4.0 (credit GeoNames on
// the About page). Downloads are cached under .cache/geonames/ — delete that
// folder to force a fresh download.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = resolve(ROOT, '.cache/geonames')
const OUT_FILE = resolve(ROOT, 'functions/data/places.json')
const COUNTRY = 'NZ'
const BASE_URL = 'https://download.geonames.org/export/dump'

// Populated places we don't want: historical, abandoned, destroyed, religious centres.
const DROPPED_CODES = new Set(['PPLH', 'PPLQ', 'PPLW', 'PPLCH'])

// GeoNames has no macron spelling for some launch-area places. These are the
// official / council spellings; each must fold back to the GeoNames ascii name
// (checked below), so they can only add macrons or fix capitalisation.
const NAME_OVERRIDES: Record<string, string> = {
  'Papamoa': 'Pāpāmoa',
  'Papamoa Beach': 'Pāpāmoa Beach',
  'Upper Papamoa': 'Upper Pāpāmoa',
  'Omokoroa': 'Ōmokoroa',
  'Omokoroa Beach': 'Ōmokoroa Beach',
  'Otumoetai': 'Ōtūmoetai',
  'Maketu': 'Maketū',
  'Paengaroa': 'Pāengaroa',
  'Oropi': 'Ōropi',
  'Ohauiti': 'Ōhauiti',
  'Omanu': 'Ōmanu',
  'Omanu Beach': 'Ōmanu Beach',
  'The lakes': 'The Lakes',
}

export interface PlaceRecord {
  id: number
  name: string
  ascii: string
  region: string
  cc: string
  lat: number
  lng: number
  slug: string
  pop: number
}

const MACRON = /[āēīōūĀĒĪŌŪ]/

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function cached(fileName: string, url: string): Promise<Buffer> {
  const path = resolve(CACHE_DIR, fileName)
  if (existsSync(path)) return readFileSync(path)
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(path, buf)
  return buf
}

function displayName(name: string, ascii: string, alternates: string[]): string {
  const override = NAME_OVERRIDES[ascii]
  if (override !== undefined) {
    if (stripDiacritics(override).toLowerCase() !== ascii.toLowerCase()) {
      throw new Error(`Override '${override}' does not fold to '${ascii}'`)
    }
    return override
  }
  if (MACRON.test(name)) return name
  const macronAlt = alternates.find((alt) => MACRON.test(alt) && stripDiacritics(alt) === ascii)
  return macronAlt ?? name
}

async function main(): Promise<void> {
  const admin1Txt = (await cached('admin1CodesASCII.txt', `${BASE_URL}/admin1CodesASCII.txt`)).toString('utf8')
  const admin1 = new Map<string, string>()
  for (const line of admin1Txt.split('\n')) {
    const [code, name] = line.split('\t')
    if (code && name && code.startsWith(`${COUNTRY}.`)) admin1.set(code, name)
  }

  const zip = new AdmZip(await cached(`${COUNTRY}.zip`, `${BASE_URL}/${COUNTRY}.zip`))
  const entry = zip.getEntry(`${COUNTRY}.txt`)
  if (!entry) throw new Error(`${COUNTRY}.txt missing from ${COUNTRY}.zip`)
  const rows = entry.getData().toString('utf8').split('\n')

  // GeoNames columns: 0 geonameid, 1 name, 2 asciiname, 3 alternatenames,
  // 4 lat, 5 lng, 6 feature class, 7 feature code, 8 country code,
  // 9 cc2, 10 admin1 code, ..., 14 population.
  const places: Array<Omit<PlaceRecord, 'slug'> & { admin1Code: string }> = []
  for (const row of rows) {
    const c = row.split('\t')
    if (c.length < 15 || c[6] !== 'P' || DROPPED_CODES.has(c[7] ?? '')) continue
    const id = Number(c[0])
    const name = c[1] ?? ''
    const ascii = c[2] || stripDiacritics(name)
    const lat = Number(c[4])
    const lng = Number(c[5])
    if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lng) || !ascii) continue
    const cc = c[8] || COUNTRY
    const admin1Code = c[10] ?? ''
    places.push({
      id,
      name: displayName(name, ascii, (c[3] ?? '').split(',').filter(Boolean)),
      ascii,
      region: admin1.get(`${cc}.${admin1Code}`) ?? '',
      cc,
      lat,
      lng,
      pop: Number(c[14]) || 0,
      admin1Code,
    })
  }

  // A few places (outlying islands, one Banks Peninsula bay) have no admin1
  // code: borrow the region of the nearest place that has one.
  const withRegion = places.filter((p) => p.region)
  for (const p of places) {
    if (p.region) continue
    let bestDeg = Infinity
    for (const q of withRegion) {
      const deg = Math.hypot(q.lat - p.lat, (q.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180))
      if (deg < bestDeg) {
        bestDeg = deg
        p.region = q.region
      }
    }
  }

  // Slugs: the biggest place keeps the plain slug; later ones get -geonameid.
  // Stable across rebuilds unless GeoNames reorders populations.
  places.sort((a, b) => b.pop - a.pop || a.id - b.id)
  const used = new Set<string>()
  const out: PlaceRecord[] = places.map(({ admin1Code, ...p }) => {
    let slug = slugify(`${p.ascii}-${admin1Code}-${p.cc}`)
    if (used.has(slug)) slug = `${slug}-${p.id}`
    used.add(slug)
    return { id: p.id, name: p.name, ascii: p.ascii, region: p.region, cc: p.cc, lat: p.lat, lng: p.lng, slug, pop: p.pop }
  })
  out.sort((a, b) => a.id - b.id)

  // One object per line: compact, but diffs stay readable.
  writeFileSync(OUT_FILE, `[\n${out.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`)
  const macrons = out.filter((p) => MACRON.test(p.name)).length
  console.log(`Wrote ${out.length} places (${macrons} with macrons) to ${OUT_FILE}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
