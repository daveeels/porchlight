// Entry point: one export per Cloud Function, each implemented in its own
// file (SPEC §6). Phase 2 adds createPin / updatePin / deletePin.
import { setGlobalOptions } from 'firebase-functions/v2'

setGlobalOptions({ region: 'us-central1', minInstances: 0 })
