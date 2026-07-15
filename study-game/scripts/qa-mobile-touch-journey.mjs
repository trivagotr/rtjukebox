import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'

const baseUrl = process.env.STUDY_QA_URL ?? 'http://127.0.0.1:4178/'
const outputDir = path.resolve(process.argv[2] ?? '../artifacts/study-game/mobile-touch-journey')
const rawVideoDir = path.join(outputDir, 'raw-video')
const viewport = { width: 393, height: 852 }

await mkdir(rawVideoDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  recordVideo: { dir: rawVideoDir, size: viewport },
})
const page = await context.newPage()
const video = page.video()
const consoleErrors = []
const taps = []
const telemetry = []
const startedAt = Date.now()

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

function elapsedMs() {
  return Date.now() - startedAt
}

async function snapshot(label) {
  const state = await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())
  telemetry.push({ atMs: elapsedMs(), label, ...state })
  return state
}

async function tap(target, label) {
  const before = await snapshot(`${label}:before`)
  await page.touchscreen.tap(target.screen.x, target.screen.y)
  taps.push({
    atMs: elapsedMs(),
    label,
    id: target.id,
    screen: target.screen,
    stateBefore: before.state,
    nodeBefore: before.nodeId,
    seatBefore: before.seatId,
  })
  await page.screenshot({ path: path.join(outputDir, `${String(taps.length).padStart(2, '0')}-${label}.png`) })
}

async function sampleUntil(label, predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await snapshot(label)
    if (predicate(current)) return current
    await page.waitForTimeout(50)
  }
  throw new Error(`Timed out during ${label}`)
}

function visibleFloorTargets(targets, currentNodeId) {
  return targets.nodes
    .filter((node) => node.reachable && node.id !== currentNodeId)
    .filter((node) => node.screen.x > 24 && node.screen.x < viewport.width - 24)
    .filter((node) => node.screen.y > 90 && node.screen.y < viewport.height - 100)
    .map((node) => ({
      ...node,
      seatDistance: Math.min(...targets.seats.map((seat) => Math.hypot(
        seat.screen.x - node.screen.x,
        seat.screen.y - node.screen.y,
      ))),
    }))
    .sort((left, right) => right.seatDistance - left.seatDistance)
}

await page.goto(baseUrl)
await page.locator('html[data-study-ready="true"]').waitFor({ timeout: 30_000 })
await page.screenshot({ path: path.join(outputDir, '00-ready.png') })

const initial = await snapshot('ready')
let targets = await page.evaluate(() => window.__STUDY_GAME_APP__.tapTargets())
const firstFloor = visibleFloorTargets(targets, initial.nodeId)[0]
if (!firstFloor) throw new Error('No visible floor target for mobile QA')

await tap(firstFloor, 'tap-floor')
await sampleUntil('walking-to-floor', (state) => state.state === 'ready' && state.nodeId === firstFloor.id)

targets = await page.evaluate(() => window.__STUDY_GAME_APP__.tapTargets())
const redirectFloors = visibleFloorTargets(targets, firstFloor.id)
const redirectStart = redirectFloors[0]
const redirectFinish = redirectFloors.find((node) => node.id !== redirectStart?.id)
if (!redirectStart || !redirectFinish) throw new Error('Not enough visible floor targets for redirect QA')

await tap(redirectStart, 'tap-redirect-start')
await page.waitForTimeout(260)
await tap(redirectFinish, 'tap-redirect-finish')
await sampleUntil('redirected-walk', (state) => state.state === 'ready' && state.nodeId === redirectFinish.id)

targets = await page.evaluate(() => window.__STUDY_GAME_APP__.tapTargets())
const seat = targets.seats
  .filter((candidate) => candidate.reachable && !candidate.occupied)
  .filter((candidate) => candidate.screen.x > 24 && candidate.screen.x < viewport.width - 24)
  .filter((candidate) => candidate.screen.y > 90 && candidate.screen.y < viewport.height - 100)[0]
if (!seat) throw new Error('No visible available seat for mobile QA')

await tap(seat, 'tap-seat')
await sampleUntil('walking-to-seat', (state) => state.state === 'seated' && state.seatId === seat.id)
await page.waitForTimeout(800)
await snapshot('seated-hold')

await tap(redirectFinish, 'tap-stand')
await sampleUntil('standing', (state) => state.state === 'ready' && state.seatId === null, 10_000)
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(outputDir, '99-final.png') })

await writeFile(path.join(outputDir, 'journey.json'), JSON.stringify({
  baseUrl,
  viewport,
  taps,
  telemetry,
  consoleErrors,
}, null, 2))

await context.close()
await video?.saveAs(path.join(outputDir, 'mobile-touch-journey.webm'))
await browser.close()

console.log(JSON.stringify({
  outputDir,
  taps: taps.length,
  samples: telemetry.length,
  consoleErrors: consoleErrors.length,
  finalState: telemetry.at(-1)?.state,
  seatedObserved: telemetry.some((sample) => sample.state === 'seated'),
}))
