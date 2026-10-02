// reportPin (SPEC §6, F8). One report per user per pin (doc ID = uid), can't
// be undone. Steps:
// 1. auth + validate input; getAuth().getUser BEFORE the transaction; beta gate
// 2. one transaction reading users/{uid}, rateLimits/{uid}, the pin and
//    pins/{pinId}/reports/{uid} first
// 3. checks: not banned, community rules agreed (TERMS_REQUIRED), reportPin
//    < 20 today, pin ACTIVE, not the owner, no existing report. counted = countedIfNew; if counted, reportsCount + 1
// 4. reportsCount >= threshold (3, or 8 once APPROVED) → HIDDEN, 'REPORTS'
// 5. write the report doc, pin, rate limit, lazy users doc.
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore'
import { db, Timestamp } from '../lib/admin.js'
import { assertCanWrite } from '../lib/beta.js'
import { requireAuth, type Caller } from '../lib/caller.js'
import { fail } from '../lib/errors.js'
import { takeRateLimit, type RateLimitDoc } from '../lib/rateLimit.js'
import { hiddenByReports } from '../lib/thresholds.js'
import { assertNotBanned, assertTermsAccepted, lookupAuthUser, userFromSnap, type UserDoc } from '../lib/users.js'
import { parseReportPinInput, type ReportReason } from '../lib/validation.js'
import type { PinDoc } from '../pins/model.js'
import { engageablePin, engagementRefs } from './shared.js'

export interface ReportDoc {
  reason: ReportReason
  counted: boolean
  createdAt: Timestamp
}

export interface ReportPinResult {
  pinId: string
  counted: boolean
  hidden: boolean
}

export async function reportPin(callerIn: Caller | null, data: unknown): Promise<ReportPinResult> {
  const caller = requireAuth(callerIn)
  const input = parseReportPinInput(data)
  const uid = caller.uid
  const authInfo = await lookupAuthUser(uid)
  await assertCanWrite(caller, authInfo)

  const r = engagementRefs(uid, input.pinId)
  const reportRef = r.pin.collection('reports').doc(uid) as DocumentReference<ReportDoc>

  return db().runTransaction(async (tx) => {
    const [userSnap, rateSnap, pinSnap, reportSnap] = (await tx.getAll(
      r.user as DocumentReference,
      r.rateLimit as DocumentReference,
      r.pin as DocumentReference,
      reportRef as DocumentReference,
    )) as [DocumentSnapshot<UserDoc>, DocumentSnapshot<Partial<RateLimitDoc>>, DocumentSnapshot<PinDoc>, DocumentSnapshot<ReportDoc>]
    const now = new Date()

    const { user, exists: userExists } = userFromSnap(userSnap, authInfo.authCreatedAt)
    assertNotBanned(user)
    assertTermsAccepted(user)
    const rateLimit = takeRateLimit(rateSnap.data(), 'reportPin', now)
    const pin = engageablePin(pinSnap, uid, 'report')
    if (reportSnap.exists) fail('ALREADY_REPORTED', 'already-exists', "You've already reported this display.")

    const counted = authInfo.countedIfNew
    let hidden = false
    if (counted) {
      const reportsCount = (typeof pin.reportsCount === 'number' && pin.reportsCount > 0 ? pin.reportsCount : 0) + 1
      hidden = hiddenByReports(reportsCount, pin.moderation?.decision)
      tx.update(r.pin, hidden ? { reportsCount, status: 'HIDDEN', hiddenReason: 'REPORTS' } : { reportsCount })
    }
    tx.create(reportRef, { reason: input.reason, counted, createdAt: Timestamp.fromDate(now) })
    if (!userExists) tx.set(r.user, user)
    tx.set(r.rateLimit, rateLimit)
    return { pinId: input.pinId, counted, hidden }
  })
}
