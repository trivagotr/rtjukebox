import { expect, test } from '@playwright/test'

test('mobile canvas supports tap-to-move, tap-to-sit, and tap-to-stand', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'touch-only journey')

  await page.goto('/')
  await page.locator('html[data-study-ready="true"]').waitFor({ timeout: 30_000 })
  const viewport = page.viewportSize()!
  const start = await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())
  const targets = await page.evaluate(() => window.__STUDY_GAME_APP__.tapTargets())
  const floor = targets.nodes
    .filter((node) => node.reachable && node.id !== start.nodeId)
    .filter((node) => node.screen.x > 24 && node.screen.x < viewport.width - 24)
    .filter((node) => node.screen.y > 90 && node.screen.y < viewport.height - 100)
    .map((node) => ({
      ...node,
      seatDistance: Math.min(...targets.seats.map((seat) => Math.hypot(
        seat.screen.x - node.screen.x,
        seat.screen.y - node.screen.y,
      ))),
    }))
    .sort((left, right) => right.seatDistance - left.seatDistance)[0]
  if (!floor) throw new Error('Expected a visible floor target away from seats')

  await page.touchscreen.tap(floor.screen.x, floor.screen.y)
  await expect(page.locator('html')).toHaveAttribute('data-game-state', /walking|stair/)
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'ready', { timeout: 30_000 })
  await expect.poll(async () => (await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())).nodeId).toBe(floor.id)

  const refreshedTargets = await page.evaluate(() => window.__STUDY_GAME_APP__.tapTargets())
  const seat = refreshedTargets.seats
    .filter((candidate) => candidate.reachable && !candidate.occupied)
    .filter((candidate) => candidate.screen.x > 24 && candidate.screen.x < viewport.width - 24)
    .filter((candidate) => candidate.screen.y > 90 && candidate.screen.y < viewport.height - 100)[0]
  if (!seat) throw new Error('Expected a visible available seat')

  await page.touchscreen.tap(seat.screen.x, seat.screen.y)
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'seated', { timeout: 30_000 })
  await expect.poll(async () => (await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())).seatId).toBe(seat.id)

  await page.touchscreen.tap(floor.screen.x, floor.screen.y)
  await expect(page.locator('html')).toHaveAttribute('data-game-state', /standing|ready/)
  await expect(page.locator('html')).toHaveAttribute('data-game-state', 'ready', { timeout: 10_000 })
})
