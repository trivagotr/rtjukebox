import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

const artifactDir = path.resolve(process.cwd(), '..', 'artifacts', 'study-game', 'exact-rooms')

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true })
})

test('plays the two exact user-supplied rooms with persistent wardrobe and elevated sitting', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-study-ready', 'true', { timeout: 30_000 })
  await expect(page.locator('html')).toHaveAttribute('data-room-id', 'library')
  const libraryOverview = await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())
  expect(libraryOverview.camera.worldViewWidth).toBeGreaterThanOrEqual(libraryOverview.roomSize.width - 1)
  expect(libraryOverview.camera.worldViewHeight).toBeGreaterThanOrEqual(libraryOverview.roomSize.height - 1)

  const canvas = page.locator('#game-canvas canvas')
  await expect(canvas).toBeVisible()
  const libraryIdle = await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-01-library.png`) })
  const libraryStats = await sharp(libraryIdle).stats()
  expect(libraryStats.channels.slice(0, 3).some((channel) => channel.stdev > 35)).toBe(true)

  await page.getByTestId('wardrobe-toggle').click()
  await page.getByTestId('wearable-beanie').click()
  await expect(page.locator('html')).toHaveAttribute('data-hat-id', 'beanie')
  await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-02-wardrobe.png`) })
  await page.getByTestId('wardrobe-toggle').click()

  const libraryMovement = page.evaluate(() => window.__STUDY_GAME_APP__.walkToSeat('front-left'))
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'walking', { timeout: 10_000 })
  const libraryWalking = await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-03-library-walking.png`) })
  const idlePixels = await sharp(libraryIdle).raw().toBuffer()
  const walkingPixels = await sharp(libraryWalking).raw().toBuffer()
  let changedBytes = 0
  for (let index = 0; index < idlePixels.length; index += 1) {
    if (idlePixels[index] !== walkingPixels[index]) changedBytes += 1
  }
  expect(changedBytes).toBeGreaterThan(1_000)
  await libraryMovement
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'seated')
  await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-04-library-seated.png`) })

  await page.getByRole('tab', { name: 'Cim Alan' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-room-id', 'chim-alan')
  await expect(page.locator('html')).toHaveAttribute('data-hat-id', 'beanie')
  await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-05-chim.png`) })

  const chimMovement = page.evaluate(() => window.__STUDY_GAME_APP__.walkToSeat('amfi-c2'))
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'stair', { timeout: 20_000 })
  await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-06-chim-stair.png`) })
  await chimMovement
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'seated')
  const snapshot = await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())
  expect(snapshot.roomId).toBe('chim-alan')
  expect(snapshot.z).toBe(3)
  expect(snapshot.hatId).toBe('beanie')
  expect(snapshot.sparkLabel).toBe('rtAI - AI Host')
  await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-07-chim-seated.png`) })
  expect(errors).toEqual([])
})

test('opens the requested packaged-app room directly', async ({ page }) => {
  await page.goto('/?embedded=mobile&room=chim-alan')
  await expect(page.locator('html')).toHaveAttribute('data-study-ready', 'true', { timeout: 30_000 })
  await expect(page.locator('html')).toHaveAttribute('data-room-id', 'chim-alan')
  await expect(page.getByRole('tab', { name: 'Cim Alan' })).toHaveAttribute('aria-selected', 'true')
})
