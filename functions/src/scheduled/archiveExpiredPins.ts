// archiveExpiredPins (SPEC §6, "by Nov 7"). Nightly: ACTIVE/HIDDEN pins with
// expiresAt <= now → ARCHIVED, in batches of 500. Uses the
// (status ASC, expiresAt ASC) index. REMOVED pins are left alone (their
// removedBy/hiddenReason still matter); purgeExpiredPins deletes everything later.
// The core takes (db, now) so tests can call it directly.
import type { Firestore } from 'firebase-admin/firestore'
import { Timestamp } from '../lib/admin.js'

export const ARCHIVE_BATCH = 500

export async function archiveExpiredPins(db: Firestore, now: Date): Promise<{ archived: number }> {
  const cutoff = Timestamp.fromDate(now)
  let archived = 0
  for (;;) {
    const page = await db
      .collection('pins')
      .where('status', 'in', ['ACTIVE', 'HIDDEN'])
      .where('expiresAt', '<=', cutoff)
      .limit(ARCHIVE_BATCH)
      .get()
    if (page.empty) break
    const batch = db.batch()
    for (const doc of page.docs) batch.update(doc.ref, { status: 'ARCHIVED' })
    await batch.commit()
    archived += page.size
    if (page.size < ARCHIVE_BATCH) break
  }
  return { archived }
}
