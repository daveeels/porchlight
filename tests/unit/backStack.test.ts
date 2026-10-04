// src/lib/backStack: overlays own one same-URL history entry; Back closes
// them, closing them another way pops the entry, dead entries are skipped,
// and a gate can refuse Back. Runs against a small fake of window.history.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACK_KEY, openBackEntry, openCount, resetBackStackForTests, settled, watchOpenCount } from '@/lib/backStack'

/** A session history: pushState/replaceState, and back() that pops asynchronously like a browser. */
class FakeHistory {
  entries: unknown[] = [{ position: 1 }]
  index = 0
  get state(): unknown {
    return this.entries[this.index]
  }
  get length(): number {
    return this.entries.length
  }
  pushState(state: unknown): void {
    this.entries = this.entries.slice(0, this.index + 1)
    this.entries.push(state)
    this.index++
  }
  replaceState(state: unknown): void {
    this.entries[this.index] = state
  }
  back(): void {
    this.go(-1)
  }
  forward(): void {
    this.go(1)
  }
  go(delta: number): void {
    setTimeout(() => {
      const next = this.index + delta
      if (next < 0 || next >= this.entries.length) return
      this.index = next
      window.dispatchEvent(new PopStateEvent('popstate', { state: this.state }))
    }, 0)
  }
}

let fake: FakeHistory
let original: PropertyDescriptor | undefined

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

/** The user presses Back and the app has handled it. */
async function userBack(): Promise<void> {
  fake.back()
  await tick()
}

beforeEach(() => {
  resetBackStackForTests()
  fake = new FakeHistory()
  original = Object.getOwnPropertyDescriptor(window, 'history')
  Object.defineProperty(window, 'history', { value: fake, configurable: true })
})

afterEach(() => {
  if (original) Object.defineProperty(window, 'history', original)
})

describe('backStack', () => {
  it('pushes one same-URL entry per overlay, keeping the router state', async () => {
    openBackEntry(() => undefined)
    await settled()
    expect(fake.length).toBe(2)
    expect(fake.state).toMatchObject({ position: 1 })
    expect((fake.state as Record<string, unknown>)[BACK_KEY]).toEqual(expect.any(String))
  })

  it('Back closes the top overlay only', async () => {
    const closed: string[] = []
    openBackEntry(() => void closed.push('card'))
    openBackEntry(() => void closed.push('picker'))
    await settled()
    expect(fake.length).toBe(3)

    await userBack()
    expect(closed).toEqual(['picker'])
    expect(openCount()).toBe(1)

    await userBack()
    expect(closed).toEqual(['picker', 'card'])
    expect(openCount()).toBe(0)
    expect(fake.index).toBe(0)
  })

  it('closing another way pops its entry, so a later Back is not wasted', async () => {
    let backs = 0
    const entry = openBackEntry(() => void backs++)
    await settled()
    await entry.close()
    expect(fake.index).toBe(0)
    expect(backs).toBe(0) // our own pop doesn't count as the user's Back
    expect(openCount()).toBe(0)
  })

  it('returning false keeps the overlay open and puts its entry back (a gate)', async () => {
    let asked = 0
    openBackEntry(() => {
      asked++
      return false
    })
    await settled()
    await userBack()
    expect(asked).toBe(1)
    expect(openCount()).toBe(1)
    expect(fake.index).toBe(1) // entry pushed again
    expect((fake.state as Record<string, unknown>)[BACK_KEY]).toEqual(expect.any(String))
  })

  it('an entry closed while something sits on top is skipped by the next Back', async () => {
    const entry = openBackEntry(() => undefined)
    await settled()
    fake.pushState({ position: 2 }) // e.g. a page pushed over it
    await entry.close() // not on top: left dead
    expect(fake.length).toBe(3)

    await userBack() // lands on the dead entry, which is skipped
    await vi.waitFor(() => expect(fake.index).toBe(0))
  })

  it('settled() pops a dead entry left on top (e.g. from before a reload)', async () => {
    fake.pushState({ position: 1, [BACK_KEY]: 'old.1' })
    await settled()
    expect(fake.index).toBe(0)
  })

  it('reports how many overlays are open (iOS swipe-back is off meanwhile)', async () => {
    const counts: number[] = []
    const stop = watchOpenCount((n) => counts.push(n))
    const entry = openBackEntry(() => undefined)
    await settled()
    await entry.close()
    stop()
    expect(counts).toEqual([0, 1, 0])
  })
})
