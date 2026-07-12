import { expect, test, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

const artifactDir = path.resolve(process.cwd(), '..', 'artifacts', 'study-game', 'engine-spike')

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true })
})

async function captureRenderedFrame(canvas: Locator, filename: string): Promise<Buffer> {
  const image = await canvas.screenshot({ path: filename })
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let blackPixels = 0
  let transparentPixels = 0
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset]! <= 2 && data[offset + 1]! <= 2 && data[offset + 2]! <= 2) blackPixels += 1
    if (data[offset + 3]! < 250) transparentPixels += 1
  }

  expect(blackPixels / (info.width * info.height)).toBeLessThan(0.01)
  expect(transparentPixels / (info.width * info.height)).toBeLessThan(0.01)
  return image
}

test('proves a visible layered avatar can walk stairs, sit, and stand', async ({ page }, testInfo) => {
  const name = testInfo.project.name
  await page.goto('/?scene=engine-proof')
  await expect(page.locator('html')).toHaveAttribute('data-engine-proof', 'ready', { timeout: 30_000 })

  const canvas = page.locator('#game-canvas canvas')
  await expect(canvas).toBeVisible()
  const idleImage = await captureRenderedFrame(canvas, path.join(artifactDir, `${name}-01-idle.png`))
  const idleStats = await sharp(idleImage).stats()
  expect(idleStats.channels.slice(0, 3).some((channel) => channel.stdev > 20)).toBe(true)

  const movement = page.evaluate(() => window.__STUDY_GAME__.walkToSeatApproach())
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'walking', { timeout: 10_000 })
  await captureRenderedFrame(canvas, path.join(artifactDir, `${name}-02-walking.png`))

  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'stair', { timeout: 15_000 })
  await captureRenderedFrame(canvas, path.join(artifactDir, `${name}-03-stair.png`))
  await movement

  const walked = await page.evaluate(() => window.__STUDY_GAME__.snapshot())
  expect(walked.pathLength).toBeGreaterThanOrEqual(10)
  expect(walked.directionTurns).toBeGreaterThanOrEqual(2)
  expect(walked.hatVisible).toBe(true)

  await page.evaluate(() => window.__STUDY_GAME__.sit())
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'seated')
  await captureRenderedFrame(canvas, path.join(artifactDir, `${name}-04-seated.png`))
  expect((await page.evaluate(() => window.__STUDY_GAME__.snapshot())).action).toBe('sit')

  const standing = page.evaluate(() => window.__STUDY_GAME__.stand())
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'standing')
  await captureRenderedFrame(canvas, path.join(artifactDir, `${name}-05-standing.png`))
  await standing

  const finalState = await page.evaluate(() => window.__STUDY_GAME__.snapshot())
  expect(finalState.action).toBe('idle')
  expect(finalState.hatVisible).toBe(true)
  expect(finalState.tile).toEqual({ x: 8, y: 5, z: 1 })
})
