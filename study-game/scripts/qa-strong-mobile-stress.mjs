import { chromium } from 'playwright'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.STUDY_QA_URL ?? 'http://127.0.0.1:4174/?scene=study'
const outputDir = path.resolve(process.argv[2] ?? '../artifacts/study-game/strong-mobile-stress-2026-07-15')
const viewport = { width: 393, height: 852 }
const defaultSeeds = [0x52414449, 0x54454455, 0x53545544]
const seeds = process.env.STUDY_QA_SEEDS
  ? process.env.STUDY_QA_SEEDS.split(',').map((value) => Number(value.trim())).filter(Number.isSafeInteger)
  : defaultSeeds
if (seeds.length === 0) throw new Error('STUDY_QA_SEEDS did not contain a valid integer seed')
const allowedStates = new Set(['ready', 'walking', 'stair', 'sitting', 'seated', 'standing', 'spark', 'rock'])

await mkdir(outputDir, { recursive: true })

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

async function waitForSettled(page, timeoutMs = 20_000) {
  await page.waitForFunction(() => {
    const state = window.__STUDY_GAME_APP__?.snapshot?.()
    return state && (state.state === 'ready' || state.state === 'seated')
  }, undefined, { timeout: timeoutMs, polling: 50 })
  await page.waitForTimeout(300)
  return page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())
}

async function touchLocator(page, locator) {
  const count = await locator.count()
  if (count !== 1) throw new Error(`Expected one touch target, received ${count}`)
  const box = await locator.boundingBox()
  if (!box) throw new Error('Touch target has no visible bounds')
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}

async function visibleTargets(page) {
  return page.evaluate(({ width, height }) => {
    const targets = window.__STUDY_GAME_APP__.tapTargets()
    const visible = (target) => (
      target.screen.x > 20
      && target.screen.x < width - 20
      && target.screen.y > 88
      && target.screen.y < height - 102
    )
    const unobscured = (target) => {
      const element = document.elementFromPoint(target.screen.x, target.screen.y)
      return !(element instanceof Element && element.closest('[data-study-ui]'))
    }
    return {
      nodes: targets.nodes.filter((target) => target.reachable && visible(target) && unobscured(target)),
      seats: targets.seats.filter((target) => target.reachable && !target.occupied && visible(target) && unobscured(target)),
    }
  }, viewport)
}

async function runSeed(browser, seed, runIndex) {
  const random = mulberry32(seed)
  const runDir = path.join(outputDir, `seed-${runIndex + 1}-${seed.toString(16)}`)
  const videoDir = path.join(runDir, 'raw-video')
  await mkdir(videoDir, { recursive: true })
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: viewport },
  })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  const requestFailures = []
  const httpErrors = []
  const screenshotErrors = []
  const actions = []
  let canvasTapCount = 0
  let hudTouchCount = 0
  let roomSwitchCount = 0
  let successfulSitStandCycles = 0
  const startedAt = Date.now()

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => requestFailures.push({
    url: request.url(),
    error: request.failure()?.errorText ?? 'unknown',
  }))
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() })
  })

  async function captureScreenshot(filename, options = {}) {
    const previousPhase = await page.evaluate((captureName) => {
      const metrics = window.__STRESS_METRICS__
      if (!metrics) return null
      const phase = metrics.currentPhase
      metrics.currentPhase = `qa-screenshot:${captureName}`
      return phase
    }, filename).catch(() => null)
    try {
      await page.screenshot({
        path: path.join(runDir, filename),
        timeout: 45_000,
        ...options,
      })
    } catch (error) {
      screenshotErrors.push({ filename, message: error.message.split('\n')[0] })
    } finally {
      if (previousPhase !== null) {
        await page.evaluate((phase) => {
          if (window.__STRESS_METRICS__) window.__STRESS_METRICS__.currentPhase = phase
        }, previousPhase).catch(() => {})
      }
    }
  }

  await page.addInitScript(() => {
    const metrics = {
      rafCount: 0,
      rafGapTotalMs: 0,
      maxRafGapMs: 0,
      rafGapsOver100Ms: 0,
      rafGapsOver250Ms: 0,
      rafGapsOver1000Ms: 0,
      longTaskCount: 0,
      maxLongTaskMs: 0,
      currentPhase: 'startup',
      rafGapEvents: [],
      longTasks: [],
      samples: [],
      invariantErrors: [],
    }
    window.__STRESS_METRICS__ = metrics
    let previousFrame = performance.now()
    const frame = (now) => {
      const gap = now - previousFrame
      previousFrame = now
      metrics.rafCount += 1
      metrics.rafGapTotalMs += gap
      metrics.maxRafGapMs = Math.max(metrics.maxRafGapMs, gap)
      if (gap > 100) metrics.rafGapsOver100Ms += 1
      if (gap > 250) metrics.rafGapsOver250Ms += 1
      if (gap > 1000) metrics.rafGapsOver1000Ms += 1
      if (gap > 250) metrics.rafGapEvents.push({ atMs: now, durationMs: gap, phase: metrics.currentPhase })
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.longTaskCount += 1
          metrics.maxLongTaskMs = Math.max(metrics.maxLongTaskMs, entry.duration)
          metrics.longTasks.push({ atMs: entry.startTime, durationMs: entry.duration, phase: metrics.currentPhase })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch {}
  })

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.locator('html[data-study-ready="true"]').waitFor({ timeout: 30_000 })
    await page.waitForFunction(() => typeof window.__STUDY_GAME_APP__?.snapshot === 'function')
    await page.evaluate(() => {
      const allowed = new Set(['ready', 'walking', 'stair', 'sitting', 'seated', 'standing', 'spark', 'rock'])
      window.__STRESS_SAMPLE_TIMER__ = setInterval(() => {
        const metrics = window.__STRESS_METRICS__
        try {
          const state = window.__STUDY_GAME_APP__.snapshot()
          const compact = {
            atMs: performance.now(),
            roomId: state.roomId,
            state: state.state,
            nodeId: state.nodeId,
            seatId: state.seatId,
            x: state.position?.x,
            y: state.position?.y,
            z: state.z,
          }
          metrics.samples.push(compact)
          if (!allowed.has(state.state)) metrics.invariantErrors.push({ type: 'invalid-state', ...compact })
          if (![state.position?.x, state.position?.y, state.z].every(Number.isFinite)) {
            metrics.invariantErrors.push({ type: 'non-finite-position', ...compact })
          }
          if (
            state.position?.x < -1
            || state.position?.y < -1
            || state.position?.x > state.roomSize.width + 1
            || state.position?.y > state.roomSize.height + 1
          ) metrics.invariantErrors.push({ type: 'out-of-room-position', ...compact })
          if (state.state === 'seated' && !state.seatId) {
            metrics.invariantErrors.push({ type: 'seated-without-seat', ...compact })
          }
          if (!state.nodeId) metrics.invariantErrors.push({ type: 'missing-node', ...compact })
        } catch (error) {
          metrics.invariantErrors.push({ type: 'sample-error', message: error.message })
        }
      }, 50)
    })

    const initial = await page.evaluate(() => ({
      snapshot: window.__STUDY_GAME_APP__.snapshot(),
      heap: performance.memory?.usedJSHeapSize ?? null,
    }))
    await captureScreenshot('00-start.png')

    const canvas = page.locator('#game-canvas canvas')
    const canvasBounds = await canvas.boundingBox()
    if (!canvasBounds) throw new Error('Study canvas has no visible bounds')

    const setPhase = (label) => page.evaluate((phase) => { window.__STRESS_METRICS__.currentPhase = phase }, label)

    async function randomCanvasBurst(label, count, intervalMs) {
      await setPhase(label)
      const phaseStart = Date.now()
      for (let index = 0; index < count; index += 1) {
        const x = canvasBounds.x + 10 + random() * (canvasBounds.width - 20)
        const y = canvasBounds.y + 92 + random() * (canvasBounds.height - 198)
        await page.touchscreen.tap(x, y)
        canvasTapCount += 1
        if (intervalMs) await page.waitForTimeout(intervalMs)
      }
      actions.push({ label, count, intervalMs, durationMs: Date.now() - phaseStart })
    }

    async function sitStandCycle(label) {
      await setPhase(label)
      let state = await waitForSettled(page)
      let targets = await visibleTargets(page)
      if (state.state === 'seated') {
        const floor = targets.nodes.find((node) => node.id !== state.nodeId)
        if (!floor) throw new Error(`${label}: no visible floor target to stand`)
        await page.touchscreen.tap(floor.screen.x, floor.screen.y)
        canvasTapCount += 1
        state = await waitForSettled(page, 12_000)
      }
      targets = await visibleTargets(page)
      const seat = targets.seats[Math.floor(random() * targets.seats.length)]
      if (!seat) throw new Error(`${label}: no visible reachable seat`)
      await page.touchscreen.tap(seat.screen.x, seat.screen.y)
      canvasTapCount += 1
      await page.waitForFunction((seatId) => {
        const current = window.__STUDY_GAME_APP__.snapshot()
        return current.state === 'seated' && current.seatId === seatId
      }, seat.id, { timeout: 20_000, polling: 50 })
      await page.waitForTimeout(180)
      targets = await visibleTargets(page)
      const floor = targets.nodes.find((node) => node.id !== seat.id)
      if (!floor) throw new Error(`${label}: no visible floor target after sitting`)
      await page.touchscreen.tap(floor.screen.x, floor.screen.y)
      canvasTapCount += 1
      await page.waitForFunction(() => {
        const current = window.__STUDY_GAME_APP__.snapshot()
        return current.state === 'ready' && current.seatId === null
      }, undefined, { timeout: 12_000, polling: 50 })
      await page.waitForTimeout(300)
      const standingResult = await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())
      if (standingResult.state !== 'ready' || standingResult.seatId !== null) {
        throw new Error(`${label}: stand recovery ended in ${standingResult.state}/${standingResult.seatId}`)
      }
      successfulSitStandCycles += 1
      actions.push({ label, seatId: seat.id, finalNodeId: standingResult.nodeId })
    }

    async function panelHammer(buttonName, closeName, cycles) {
      await setPhase(`${buttonName}-panel-hammer`)
      for (let index = 0; index < cycles; index += 1) {
        await touchLocator(page, page.getByRole('button', { name: buttonName, exact: true }))
        hudTouchCount += 1
        await page.waitForTimeout(20)
        await touchLocator(page, page.getByRole('button', { name: closeName, exact: true }))
        hudTouchCount += 1
      }
      actions.push({ label: `${buttonName}-panel-hammer`, cycles })
    }

    async function switchRoom(tabName) {
      await setPhase(`switch-to-${tabName}`)
      await touchLocator(page, page.getByRole('tab', { name: tabName, exact: true }))
      hudTouchCount += 1
      roomSwitchCount += 1
      await page.waitForTimeout(70)
    }

    await randomCanvasBurst('library-zero-delay', 120, 0)
    await randomCanvasBurst('library-rapid', 180, 14)
    await randomCanvasBurst('library-mixed', 100, 42)
    await waitForSettled(page)
    await captureScreenshot('01-library-after-400-taps.png')

    await sitStandCycle('library-sit-stand-1')
    await sitStandCycle('library-sit-stand-2')
    await panelHammer('People', 'Close people panel', 6)
    await panelHammer('Wardrobe', 'Close wardrobe', 6)
    await panelHammer('Chat', 'Close chat', 6)

    const movingTarget = (await visibleTargets(page)).nodes.at(-1)
    if (!movingTarget) throw new Error('No floor target for room-switch-during-movement stress')
    await page.touchscreen.tap(movingTarget.screen.x, movingTarget.screen.y)
    canvasTapCount += 1
    for (let index = 0; index < 20; index += 1) {
      await switchRoom(index % 2 === 0 ? 'Cim Alan' : 'Library')
    }
    await switchRoom('Cim Alan')
    await waitForSettled(page)

    await randomCanvasBurst('garden-zero-delay', 120, 0)
    await randomCanvasBurst('garden-rapid', 180, 14)
    await randomCanvasBurst('garden-mixed', 100, 42)
    await waitForSettled(page)
    await captureScreenshot('02-garden-after-400-taps.png')
    await sitStandCycle('garden-sit-stand-1')
    await sitStandCycle('garden-sit-stand-2')

    for (let index = 0; index < 20; index += 1) {
      await switchRoom(index % 2 === 0 ? 'Library' : 'Cim Alan')
    }
    await switchRoom('Library')
    const finalState = await waitForSettled(page)
    await page.waitForTimeout(800)
    await captureScreenshot('99-final.png')

    const final = await page.evaluate(() => {
      clearInterval(window.__STRESS_SAMPLE_TIMER__)
      return {
        snapshot: window.__STUDY_GAME_APP__.snapshot(),
        metrics: window.__STRESS_METRICS__,
        heap: performance.memory?.usedJSHeapSize ?? null,
      }
    })
    const stateCounts = {}
    let longestMovingSampleRun = 0
    let movingSampleRun = 0
    for (const sample of final.metrics.samples) {
      stateCounts[sample.state] = (stateCounts[sample.state] ?? 0) + 1
      if (['walking', 'stair', 'sitting', 'standing'].includes(sample.state)) {
        movingSampleRun += 1
        longestMovingSampleRun = Math.max(longestMovingSampleRun, movingSampleRun)
      } else movingSampleRun = 0
    }
    const run = {
      seed,
      runIndex,
      durationMs: Date.now() - startedAt,
      viewport,
      initial,
      finalState,
      final,
      stateCounts,
      longestMovingSampleRunMs: longestMovingSampleRun * 50,
      canvasTapCount,
      hudTouchCount,
      roomSwitchCount,
      successfulSitStandCycles,
      actions,
      consoleErrors,
      pageErrors,
      requestFailures,
      httpErrors,
      screenshotErrors,
    }
    await writeFile(path.join(runDir, 'stress-report.json'), `${JSON.stringify(run, null, 2)}\n`)

    return { run, page, context, runDir }
  } catch (error) {
    await captureScreenshot('failure.png', { fullPage: true })
    const failure = {
      seed,
      runIndex,
      durationMs: Date.now() - startedAt,
      message: error.message,
      stack: error.stack,
      canvasTapCount,
      hudTouchCount,
      roomSwitchCount,
      successfulSitStandCycles,
      actions,
      consoleErrors,
      pageErrors,
      requestFailures,
      httpErrors,
      screenshotErrors,
    }
    await writeFile(path.join(runDir, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`)
    throw Object.assign(error, { stressFailure: failure, page, context, runDir })
  }
}

const browser = await chromium.launch({ headless: true })
const completedRuns = []
const failures = []
try {
  for (let index = 0; index < seeds.length; index += 1) {
    let result
    try {
      result = await runSeed(browser, seeds[index], index)
      const video = result.page.video()
      await result.context.close()
      if (video) await copyFile(await video.path(), path.join(result.runDir, 'stress-run.webm'))
      completedRuns.push(result.run)
      console.log(JSON.stringify({
        event: 'seed-complete',
        seed: seeds[index],
        taps: result.run.canvasTapCount,
        hudTouches: result.run.hudTouchCount,
        roomSwitches: result.run.roomSwitchCount,
        sitStandCycles: result.run.successfulSitStandCycles,
        consoleErrors: result.run.consoleErrors.length,
        invariantErrors: result.run.final.metrics.invariantErrors.length,
        maxRafGapMs: Number(result.run.final.metrics.maxRafGapMs.toFixed(1)),
      }))
    } catch (error) {
      failures.push(error.stressFailure ?? { seed: seeds[index], message: error.message })
      const failedContext = error.context
      const failedPage = error.page
      const failedRunDir = error.runDir
      const video = failedPage?.video?.()
      await failedContext?.close().catch(() => {})
      if (video && failedRunDir) {
        await copyFile(await video.path(), path.join(failedRunDir, 'stress-run.webm')).catch(() => {})
      }
      console.log(JSON.stringify({ event: 'seed-failure', seed: seeds[index], message: error.message }))
    }
  }
} finally {
  await browser.close()
}

const isGameplayPhase = (phase) => (
  typeof phase === 'string'
  && phase !== 'startup'
  && !phase.startsWith('qa-')
)
const gameplayRafGapEvents = completedRuns.flatMap((run) => (
  run.final.metrics.rafGapEvents.filter((event) => isGameplayPhase(event.phase))
))
const gameplayLongTasks = completedRuns.flatMap((run) => (
  run.final.metrics.longTasks.filter((event) => isGameplayPhase(event.phase))
))

const aggregate = {
  baseUrl,
  viewport,
  seeds,
  completedSeeds: completedRuns.length,
  failedSeeds: failures.length,
  totalCanvasTaps: completedRuns.reduce((sum, run) => sum + run.canvasTapCount, 0),
  totalHudTouches: completedRuns.reduce((sum, run) => sum + run.hudTouchCount, 0),
  totalRoomSwitches: completedRuns.reduce((sum, run) => sum + run.roomSwitchCount, 0),
  totalSitStandCycles: completedRuns.reduce((sum, run) => sum + run.successfulSitStandCycles, 0),
  totalTelemetrySamples: completedRuns.reduce((sum, run) => sum + run.final.metrics.samples.length, 0),
  consoleErrors: completedRuns.flatMap((run) => run.consoleErrors),
  pageErrors: completedRuns.flatMap((run) => run.pageErrors),
  requestFailures: completedRuns.flatMap((run) => run.requestFailures),
  httpErrors: completedRuns.flatMap((run) => run.httpErrors),
  invariantErrors: completedRuns.flatMap((run) => run.final.metrics.invariantErrors),
  maxRafGapMs: Math.max(0, ...gameplayRafGapEvents.map((event) => event.durationMs)),
  rafGapsOver1000Ms: gameplayRafGapEvents.filter((event) => event.durationMs > 1000).length,
  maxLongTaskMs: Math.max(0, ...gameplayLongTasks.map((event) => event.durationMs)),
  rawMaxRafGapMs: Math.max(0, ...completedRuns.map((run) => run.final.metrics.maxRafGapMs)),
  rawRafGapsOver1000Ms: completedRuns.reduce((sum, run) => sum + run.final.metrics.rafGapsOver1000Ms, 0),
  rawMaxLongTaskMs: Math.max(0, ...completedRuns.map((run) => run.final.metrics.maxLongTaskMs)),
  maxHeapGrowthBytes: Math.max(0, ...completedRuns.map((run) => (
    run.initial.heap === null || run.final.heap === null ? 0 : run.final.heap - run.initial.heap
  ))),
  failures,
}
aggregate.passed = (
  aggregate.completedSeeds === seeds.length
  && aggregate.failedSeeds === 0
  && aggregate.totalCanvasTaps >= seeds.length * 800
  && aggregate.totalSitStandCycles >= seeds.length * 4
  && aggregate.consoleErrors.length === 0
  && aggregate.pageErrors.length === 0
  && aggregate.requestFailures.length === 0
  && aggregate.httpErrors.length === 0
  && aggregate.invariantErrors.length === 0
  && aggregate.rafGapsOver1000Ms === 0
  && aggregate.maxHeapGrowthBytes < 64 * 1024 * 1024
  && completedRuns.every((run) => allowedStates.has(run.finalState.state))
)
await writeFile(path.join(outputDir, 'aggregate-report.json'), `${JSON.stringify(aggregate, null, 2)}\n`)

console.log(JSON.stringify({
  event: 'aggregate',
  passed: aggregate.passed,
  completedSeeds: aggregate.completedSeeds,
  failedSeeds: aggregate.failedSeeds,
  totalCanvasTaps: aggregate.totalCanvasTaps,
  totalHudTouches: aggregate.totalHudTouches,
  totalRoomSwitches: aggregate.totalRoomSwitches,
  totalSitStandCycles: aggregate.totalSitStandCycles,
  totalTelemetrySamples: aggregate.totalTelemetrySamples,
  consoleErrors: aggregate.consoleErrors.length,
  pageErrors: aggregate.pageErrors.length,
  invariantErrors: aggregate.invariantErrors.length,
  maxRafGapMs: Number(aggregate.maxRafGapMs.toFixed(1)),
  maxLongTaskMs: Number(aggregate.maxLongTaskMs.toFixed(1)),
  maxHeapGrowthMb: Number((aggregate.maxHeapGrowthBytes / 1024 / 1024).toFixed(2)),
}))

if (!aggregate.passed) process.exitCode = 1
