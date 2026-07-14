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

test('redirects an active walk to the latest destination without teleporting', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-study-ready', 'true', { timeout: 30_000 })

  await page.evaluate(() => { void window.__STUDY_GAME_APP__.walkToNode('upper-center-aisle') })
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'walking', { timeout: 10_000 })
  await page.waitForTimeout(250)

  const redirected = page.evaluate(() => window.__STUDY_GAME_APP__.walkToNode('bottom-right-aisle'))
  const positions: Array<{ x: number; y: number; at: number }> = []
  for (let sample = 0; sample < 14; sample += 1) {
    positions.push(await page.evaluate(() => ({
      ...window.__STUDY_GAME_APP__.snapshot().position,
      at: performance.now(),
    })))
    await page.waitForTimeout(50)
  }
  await redirected
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'ready', { timeout: 20_000 })

  const finalSnapshot = await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())
  const maxSpeed = Math.max(...positions.slice(1).map((position, index) => (
    Math.hypot(position.x - positions[index]!.x, position.y - positions[index]!.y)
    / ((position.at - positions[index]!.at) / 1_000)
  )))
  expect(finalSnapshot.nodeId).toBe('bottom-right-aisle')
  expect(maxSpeed).toBeLessThan(500)
})

test('runs a seated Study timer and supports player interactions from the HUD', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-study-ready', 'true', { timeout: 30_000 })

  if (testInfo.project.name === 'mobile-chromium') {
    const viewport = page.viewportSize()!
    const gameBounds = await page.locator('#game-canvas').boundingBox()
    const chatBounds = await page.locator('.chat-dock').boundingBox()

    expect(gameBounds?.y).toBeLessThanOrEqual(1)
    expect(gameBounds?.height).toBeGreaterThanOrEqual(viewport.height - 1)
    expect(chatBounds?.x).toBeGreaterThanOrEqual(6)
    expect(chatBounds?.width).toBeLessThan(viewport.width)
    expect(chatBounds?.height).toBeLessThanOrEqual(68)
    await expect(page.getByTestId('people-toggle').locator('svg.lucide-users-round')).toBeVisible()
    await expect(page.getByTestId('wardrobe-toggle').locator('svg.lucide-shirt')).toBeVisible()
  }

  await page.getByTestId('people-toggle').click()
  await page.getByTestId('presence-local-selin').click()
  await expect(page.getByTestId('player-card')).toBeVisible()
  if (testInfo.project.name === 'mobile-chromium') {
    await expect(page.locator('#presence-panel')).toBeHidden()
  }
  await expect(page.getByTestId('player-card')).toContainText('Selin')
  await page.getByTestId('player-wave').click()
  await expect(page.getByTestId('chat-log')).toContainText('waves to Selin')
  await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-08-player-card.png`) })
  await page.getByRole('tab', { name: 'Cim Alan' }).click()
  await expect(page.getByTestId('player-card')).toBeHidden()
  await page.getByRole('tab', { name: 'Library' }).click()
  await page.getByTestId('people-toggle').click()

  await page.evaluate(() => window.__STUDY_GAME_APP__.walkToSeat('front-left'))
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'seated', { timeout: 30_000 })
  await expect(page.getByTestId('study-timer')).toHaveAttribute('data-running', 'true')
  await page.waitForTimeout(1_100)
  await expect(page.getByTestId('study-timer')).not.toHaveText('00:00:00')
  await expect(page.getByTestId('study-summary')).toContainText('Today')
  await expect(page.getByTestId('study-summary')).toContainText('Month')
  await page.screenshot({ path: path.join(artifactDir, `${testInfo.project.name}-09-study-timer.png`) })

  await page.evaluate(() => window.__STUDY_GAME_APP__.stand())
  await expect(page.getByTestId('study-timer')).toHaveAttribute('data-running', 'false')
})
