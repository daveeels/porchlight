import { describe, expect, it } from 'vitest'
import { displayButton } from '@/components/mypin/status'
import type { DisplayPin } from '@/types/models'

type Fields = Pick<DisplayPin, 'status' | 'verified' | 'hiddenReason' | 'removedBy'>
const pin = (over: Partial<Fields>): Fields => ({
  status: 'ACTIVE',
  verified: false,
  hiddenReason: null,
  removedBy: null,
  ...over,
})

describe('displayButton (Explore home button)', () => {
  it('offers "Add my display" with no pin', () => {
    expect(displayButton(null)).toEqual({ mine: false, label: 'Add my display', hint: null, attention: false, to: '/submit' })
    expect(displayButton(undefined).to).toBe('/submit')
  })

  it('goes to My display while the pin is live, with a status hint', () => {
    expect(displayButton(pin({}))).toMatchObject({ mine: true, label: 'My display', hint: 'Live', to: '/me' })
    expect(displayButton(pin({ verified: true }))).toMatchObject({ label: 'My display', hint: 'Verified', to: '/me' })
  })

  it('goes to My display while hidden, flagged', () => {
    expect(displayButton(pin({ status: 'HIDDEN', hiddenReason: 'REPORTS' }))).toMatchObject({
      label: 'My display',
      hint: 'Under review',
      attention: true,
      to: '/me',
    })
    expect(displayButton(pin({ status: 'HIDDEN', hiddenReason: 'NOT_THERE' })).hint).toBe('Hidden')
  })

  it('offers "Add my display" again once removed or archived', () => {
    expect(displayButton(pin({ status: 'REMOVED', removedBy: 'OWNER' })).label).toBe('Add my display')
    expect(displayButton(pin({ status: 'REMOVED', removedBy: 'ADMIN' })).to).toBe('/submit')
    expect(displayButton(pin({ status: 'ARCHIVED' })).label).toBe('Add my display')
  })
})
