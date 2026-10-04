// My display status in plain words (SPEC F6).
import type { DisplayPin } from '@/types/models'

export type StatusTone = 'success' | 'warning' | 'danger' | 'medium'

export interface PinStatusInfo {
  label: string
  detail: string
  tone: StatusTone
}

type StatusFields = Pick<DisplayPin, 'status' | 'verified' | 'hiddenReason' | 'removedBy'> &
  Partial<Pick<DisplayPin, 'stage'>>

export function pinStatusInfo(pin: StatusFields): PinStatusInfo {
  switch (pin.status) {
    case 'ACTIVE':
      if (pin.stage === 'COMING_SOON') {
        return {
          label: 'Live – Coming soon',
          detail: 'People can find it, listed after the displays that are up. Voting opens once you add a photo of your decorations.',
          tone: 'medium',
        }
      }
      return pin.verified
        ? {
            label: 'Live – Verified',
            detail: 'People have confirmed your display is there. It shows near the top of the list.',
            tone: 'success',
          }
        : {
            label: 'Live – Unverified',
            detail: 'Your display is live. Once a few people tap "It\'s here", it becomes Verified.',
            tone: 'success',
          }
    case 'HIDDEN':
      return pin.hiddenReason === 'NOT_THERE'
        ? {
            label: "Hidden – people said it's not there",
            detail: 'Several people said they couldn\'t find it, so it\'s hidden for now. A moderator will take a look.',
            tone: 'warning',
          }
        : {
            label: 'Hidden – under review',
            detail: "Your display was reported, so it's hidden while a moderator takes a look.",
            tone: 'warning',
          }
    case 'REMOVED':
      return pin.removedBy === 'ADMIN'
        ? {
            label: 'Removed by a moderator',
            detail: "A moderator removed this display because it didn't fit the community guidelines.",
            tone: 'danger',
          }
        : {
            label: 'Removed by you',
            detail: 'You deleted this display. You can add a new one.',
            tone: 'medium',
          }
    default:
      return {
        label: 'Archived',
        detail: "This season is over, so your display has been archived. See you next season!",
        tone: 'medium',
      }
  }
}

/** Edit/delete are offered for live or hidden pins (the server rechecks). */
export function canChangePin(pin: Pick<DisplayPin, 'status'>): boolean {
  return pin.status === 'ACTIVE' || pin.status === 'HIDDEN'
}

/** Hidden after reports: kept as reported until a moderator decides (the server rechecks). */
export function isUnderReview(pin: Pick<DisplayPin, 'status' | 'hiddenReason'>): boolean {
  return pin.status === 'HIDDEN' && pin.hiddenReason === 'REPORTS'
}

/** Edit is offered for live or hidden pins, except while under review. */
export function canEditPin(pin: Pick<DisplayPin, 'status' | 'hiddenReason'>): boolean {
  return canChangePin(pin) && !isUnderReview(pin)
}

/** "Add a new display" is offered after the owner deleted theirs. */
export function canReAdd(pin: Pick<DisplayPin, 'status' | 'removedBy' | 'hiddenReason'>): boolean {
  return pin.status === 'REMOVED' && pin.removedBy === 'OWNER' && pin.hiddenReason !== 'REPORTS'
}

/** The Explore home button (AddDisplayFab): add a display, or go to yours. */
export interface DisplayButton {
  /** True when the user has a live or hidden display this season. */
  mine: boolean
  label: 'Add my display' | 'My display'
  /** A short status word next to "My display", e.g. "Live". */
  hint: string | null
  /** Hidden displays get the ember sticker. */
  attention: boolean
  to: '/submit' | '/me'
}

const ADD_BUTTON: DisplayButton = { mine: false, label: 'Add my display', hint: null, attention: false, to: '/submit' }

/**
 * "My display" (→ /me, where Edit and Remove live) while the user's pin this
 * season is ACTIVE or HIDDEN; otherwise "Add my display" (→ /submit). No pin,
 * removed or archived → add.
 */
export function displayButton(pin: StatusFields | null | undefined): DisplayButton {
  if (!pin || !canChangePin(pin)) return ADD_BUTTON
  if (pin.status === 'ACTIVE') {
    return { mine: true, label: 'My display', hint: pin.verified ? 'Verified' : 'Live', attention: false, to: '/me' }
  }
  return {
    mine: true,
    label: 'My display',
    hint: pin.hiddenReason === 'NOT_THERE' ? 'Hidden' : 'Under review',
    attention: true,
    to: '/me',
  }
}
