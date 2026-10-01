// Lazy MapLibre loader shared by the browse map (useMap) and the add-display
// location picker (useLocationPicker), so MapLibre stays out of the entry
// chunk and both maps get the bundled worker.
type MapLibre = typeof import('maplibre-gl')

let loading: Promise<MapLibre> | null = null

/** Loads maplibre-gl, its CSS and its worker once; later calls reuse it. */
export function loadMapLibre(): Promise<MapLibre> {
  loading ??= (async () => {
    const [maplibre, { default: workerUrl }] = await Promise.all([
      import('maplibre-gl'),
      // MapLibre finds its worker next to its own module, which bundling breaks:
      // let Vite build the worker and hand over its URL instead.
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ])
    maplibre.setWorkerUrl(workerUrl)
    return maplibre
  })().catch((e: unknown) => {
    // Let a later attempt (e.g. after going back online) try again.
    loading = null
    throw e
  })
  return loading
}
