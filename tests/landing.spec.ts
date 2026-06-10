import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Landing page', () => {
  test('loads and shows both role buttons', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')

    // Phaser canvas should be present
    await expect(page.locator('canvas')).toBeVisible()

    // Both DOM buttons rendered inside Phaser DOM layer
    await expect(page.locator('#btn-display')).toBeVisible()
    await expect(page.locator('#btn-player')).toBeVisible()
  })

  test('shows "How to play" modal', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('#btn-howto')

    await page.click('#btn-howto')
    await expect(page.locator('#btn-close-howto')).toBeVisible()
    await expect(page.getByText('How to Play', { exact: true })).toBeVisible()

    await page.click('#btn-close-howto')
    await expect(page.locator('#btn-close-howto')).not.toBeVisible()
  })

  test('shows player form with room code and color picker', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('#btn-player')

    await page.click('#btn-player')
    await expect(page.locator('#player-name')).toBeVisible()
    await expect(page.locator('#room-code')).toBeVisible()
    // 8 color swatches
    await expect(page.locator('[id^="color-"]')).toHaveCount(8)
  })

  test('pre-fills room code from URL query param', async ({ page }) => {
    await page.goto(`${BASE}?room=TEST`)
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('#btn-player')

    await page.click('#btn-player')
    const value = await page.locator('#room-code').inputValue()
    expect(value).toBe('TEST')
  })

  test('shows error when joining without a name', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('#btn-player')

    await page.click('#btn-player')
    await page.click('#btn-start')
    await expect(page.locator('text=Please enter your name')).toBeVisible()
  })

  test('shows error when joining without a room code', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('#btn-player')

    await page.click('#btn-player')
    await page.fill('#player-name', 'TestPlayer')
    await page.click('#btn-start')
    await expect(page.locator('text=4-letter room code')).toBeVisible()
  })
})
