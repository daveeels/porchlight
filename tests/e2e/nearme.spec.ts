// Near me (SPEC F1) with mocked geolocation.
import { expect, test } from '@playwright/test'
import { MOUNT_MAUNGANUI, cards, openExplore, placeHeading, snap } from './helpers'

/** "Mount Maunganui · 350 m" → metres. */
function metres(line: string): number {
  const m = /·\s*([\d.]+)\s*(m|km)\s*$/.exec(line.trim())
  if (!m) throw new Error(`No distance in "${line}"`)
  return Number(m[1]) * (m[2] === 'km' ? 1000 : 1)
}

test.describe('location allowed', () => {
  test.use({ geolocation: MOUNT_MAUNGANUI, permissions: ['geolocation'] })

  test('Near me lists pins by distance', async ({ page }, testInfo) => {
    await openExplore(page)
    await page.locator('ion-button', { hasText: 'Near me' }).click()
    await expect(placeHeading(page)).toHaveText('Near you')
    await expect(cards(page).first()).toContainText('·')

    const lines = await cards(page).locator('ion-label > p').allTextContents()
    expect(lines.length).toBeGreaterThan(3)
    const d = lines.map(metres)
    expect(d).toEqual([...d].sort((a, b) => a - b))
    expect(d[0]).toBeLessThan(1000)
    // Near me has no town chips and no paging.
    await expect(page.getByRole('navigation', { name: 'Towns' })).toHaveCount(0)
    await expect(page.locator('ion-button', { hasText: 'Load more' })).toHaveCount(0)
    await snap(page, testInfo, 'near-me')
  })
})

test.describe('location denied', () => {
  test.use({ permissions: [] })

  test('denied geolocation shows the friendly message', async ({ page }, testInfo) => {
    await openExplore(page)
    await page.locator('ion-button', { hasText: 'Near me' }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'Location is turned off for Porchlight' })
    await expect(alert).toBeVisible()
    await snap(page, testInfo, 'near-me-denied')
    // The list keeps showing the area, and the notice can be dismissed.
    await expect(cards(page).first()).toBeVisible()
    await alert.getByRole('button', { name: 'Dismiss' }).click()
    await expect(alert).toHaveCount(0)
  })
})
