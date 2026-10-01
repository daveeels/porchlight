// Entry point: one export per Cloud Function (SPEC §6). Each callable is a
// thin wrapper; the logic lives in src/pins/*.ts and src/lib/*.ts.
import { setGlobalOptions } from 'firebase-functions/v2'
import { onCall, type CallableOptions } from 'firebase-functions/v2/https'
import { callerOf } from './lib/caller.js'
import { createPin as createPinImpl } from './pins/createPin.js'
import { deletePin as deletePinImpl } from './pins/deletePin.js'
import { updatePin as updatePinImpl } from './pins/updatePin.js'

setGlobalOptions({ region: 'us-central1', minInstances: 0 })

// App Check is enforced on every callable in production (SPEC §6, Phase 2).
// The Functions emulator has no App Check attestation for local clients, so
// it's off there only (FUNCTIONS_EMULATOR is set by the emulator itself).
const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== 'true'

const callable: CallableOptions = { region: 'us-central1', minInstances: 0, enforceAppCheck }

// createPin / updatePin run sharp.
const photoCallable: CallableOptions = { ...callable, memory: '1GiB', timeoutSeconds: 60 }

export const createPin = onCall(photoCallable, (req) => createPinImpl(callerOf(req), req.data))

export const updatePin = onCall(photoCallable, (req) => updatePinImpl(callerOf(req), req.data))

export const deletePin = onCall(callable, (req) => deletePinImpl(callerOf(req), req.data))
