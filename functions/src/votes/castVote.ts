// castVote (SPEC §6, F7). Steps, in this order:
// 1. auth + validate input; getAuth().getUser BEFORE the transaction
//    (countedIfNew, authCreatedAt); beta gate
// 2. one transaction reading users/{uid}, rateLimits/{uid}, the pin and
//    pins/{pinId}/votes/{uid} first. A vote whose round != pin.voteRound is no vote.
// 3. checks: not banned, community rules agreed (TERMS_REQUIRED), castVote
//    < 40 today, pin ACTIVE, caller isn't the owner, pin not COMING_SOON (NOT_VOTABLE). Same value as the current-round vote → no-op (nothing written).
// 4. counted = the current-round vote's `counted` when changing, else countedIfNew
// 5–6. counted votes move the counters; recompute verified + rankScore; the
//    F7 "not there" rule moves ACTIVE → HIDDEN (hiddenReason 'NOT_THERE')
// 7. write the vote (round = pin.voteRound), pin, rate limit, lazy users doc.
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore'
import { db, Timestamp } from '../lib/admin.js'
import { assertCanWrite } from '../lib/beta.js'
import { requireAuth, type Caller } from '../lib/caller.js'
import { fail } from '../lib/errors.js'
import { takeRateLimit, type RateLimitDoc } from '../lib/rateLimit.js'
import { tallyVote, type CurrentVote } from '../lib/thresholds.js'
import { assertNotBanned, assertTermsAccepted, lookupAuthUser, userFromSnap, type UserDoc } from '../lib/users.js'
import { parseCastVoteInput, type VoteValue } from '../lib/validation.js'
import type { PinDoc, PinStatus } from '../pins/model.js'
import { engageablePin, engagementRefs } from './shared.js'

export interface VoteDoc {
  value: VoteValue
  counted: boolean
  round: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface CastVoteResult {
  pinId: string
  myVote: VoteValue
  counted: boolean
  hereVotes: number
  notThereVotes: number
  verified: boolean
  status: PinStatus
}

/** The caller's vote in the pin's current round, or null (missing or an older round). */
export function currentVoteOf(vote: Partial<VoteDoc> | undefined, voteRound: number): CurrentVote | null {
  if (!vote || vote.round !== voteRound) return null
  if (vote.value !== 'HERE' && vote.value !== 'NOT_THERE') return null
  return { value: vote.value, counted: vote.counted === true }
}

export async function castVote(callerIn: Caller | null, data: unknown): Promise<CastVoteResult> {
  // 1. Auth, input, Auth lookup and beta gate — all before the transaction.
  const caller = requireAuth(callerIn)
  const input = parseCastVoteInput(data)
  const uid = caller.uid
  const authInfo = await lookupAuthUser(uid)
  await assertCanWrite(caller, authInfo)

  const r = engagementRefs(uid, input.pinId)
  const voteRef = r.pin.collection('votes').doc(uid) as DocumentReference<VoteDoc>

  return db().runTransaction(async (tx) => {
    // 2. Reads first.
    const [userSnap, rateSnap, pinSnap, voteSnap] = (await tx.getAll(
      r.user as DocumentReference,
      r.rateLimit as DocumentReference,
      r.pin as DocumentReference,
      voteRef as DocumentReference,
    )) as [DocumentSnapshot<UserDoc>, DocumentSnapshot<Partial<RateLimitDoc>>, DocumentSnapshot<PinDoc>, DocumentSnapshot<VoteDoc>]
    const now = new Date()
    const ts = Timestamp.fromDate(now)

    // 3. Checks, in SPEC order.
    const { user, exists: userExists } = userFromSnap(userSnap, authInfo.authCreatedAt)
    assertNotBanned(user)
    assertTermsAccepted(user)
    const rateLimit = takeRateLimit(rateSnap.data(), 'castVote', now)
    const pin = engageablePin(pinSnap, uid, 'vote')
    if (pin.stage === 'COMING_SOON') {
      fail('NOT_VOTABLE', 'failed-precondition', 'Voting opens when the decorations are up.')
    }
    const round = typeof pin.voteRound === 'number' ? pin.voteRound : 0
    const current = currentVoteOf(voteSnap.data(), round)

    // 4–6.
    const outcome = tallyVote(pin, current, input.value, authInfo.countedIfNew)
    const result: CastVoteResult = {
      pinId: input.pinId,
      myVote: input.value,
      counted: outcome.counted,
      hereVotes: outcome.hereVotes,
      notThereVotes: outcome.notThereVotes,
      verified: outcome.verified,
      status: outcome.hide ? 'HIDDEN' : pin.status,
    }
    if (outcome.noop) return result

    // 7. Writes.
    const existing = voteSnap.data()
    const vote: VoteDoc = {
      value: input.value,
      counted: outcome.counted,
      round,
      createdAt: existing?.createdAt instanceof Timestamp ? existing.createdAt : ts,
      updatedAt: ts,
    }
    tx.set(voteRef, vote)
    if (outcome.counted) {
      const update: Record<string, unknown> = {
        hereVotes: outcome.hereVotes,
        notThereVotes: outcome.notThereVotes,
        verified: outcome.verified,
        rankScore: outcome.rankScore,
      }
      if (outcome.hide) {
        update.status = 'HIDDEN'
        update.hiddenReason = 'NOT_THERE'
      }
      tx.update(r.pin, update)
    }
    if (!userExists) tx.set(r.user, user)
    tx.set(r.rateLimit, rateLimit)
    return result
  })
}
