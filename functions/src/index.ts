// Entry point: one export per Cloud Function (SPEC §6). Each callable is a
// thin wrapper; the logic lives in src/pins/*.ts, src/votes/*.ts,
// src/moderation/*.ts, src/users/*.ts, src/scheduled/*.ts and src/lib/*.ts.
import { logger, setGlobalOptions } from 'firebase-functions/v2'
import { onCall, type CallableOptions } from 'firebase-functions/v2/https'
import { onSchedule, type ScheduleOptions } from 'firebase-functions/v2/scheduler'
import { db } from './lib/admin.js'
import { callerOf } from './lib/caller.js'
import { moderatePin as moderatePinImpl } from './moderation/moderatePin.js'
import { createPin as createPinImpl } from './pins/createPin.js'
import { deletePin as deletePinImpl } from './pins/deletePin.js'
import { updatePin as updatePinImpl } from './pins/updatePin.js'
import { archiveExpiredPins as archiveExpiredPinsImpl } from './scheduled/archiveExpiredPins.js'
import { rebuildPlaceIndex as rebuildPlaceIndexImpl } from './scheduled/rebuildPlaceIndex.js'
import { castVote as castVoteImpl } from './votes/castVote.js'
import { acceptTerms as acceptTermsImpl } from './users/acceptTerms.js'
import { reportPin as reportPinImpl } from './votes/reportPin.js'

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

// Phase 3: votes, reports, moderation.
export const castVote = onCall(callable, (req) => castVoteImpl(callerOf(req), req.data))

export const reportPin = onCall(callable, (req) => reportPinImpl(callerOf(req), req.data))

export const moderatePin = onCall(callable, (req) => moderatePinImpl(callerOf(req), req.data))

// Community rules: required before createPin / updatePin / castVote / reportPin.
export const acceptTerms = onCall(callable, (req) => acceptTermsImpl(callerOf(req), req.data))

// Scheduled jobs (UTC).
const scheduled = (schedule: string): ScheduleOptions => ({
  schedule,
  timeZone: 'UTC',
  region: 'us-central1',
  minInstances: 0,
  timeoutSeconds: 540,
})

export const rebuildPlaceIndex = onSchedule(scheduled('every day 02:00'), async () => {
  const summary = await rebuildPlaceIndexImpl(db(), new Date())
  logger.info('rebuildPlaceIndex done', summary)
})

export const archiveExpiredPins = onSchedule(scheduled('every day 00:30'), async () => {
  const summary = await archiveExpiredPinsImpl(db(), new Date())
  logger.info('archiveExpiredPins done', summary)
})
