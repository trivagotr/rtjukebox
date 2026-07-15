import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.STUDY_QA_URL ?? 'http://127.0.0.1:4174/?scene=study'
const outputDir = path.resolve(process.argv[2] ?? '../artifacts/study-game/chim-depth-repro')
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })
const errors = []
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', (error) => errors.push(error.message))

await page.goto(baseUrl)
await page.locator('html[data-study-ready="true"]').waitFor({ timeout: 30_000 })
await page.evaluate(() => window.__STUDY_GAME_APP__.switchRoom('chim-alan'))

const captures = []
for (const nodeId of ['row-1-left', 'row-1-mid', 'row-1-right', 'row-2-mid', 'row-3-mid']) {
  await page.evaluate((target) => window.__STUDY_GAME_APP__.walkToNode(target), nodeId)
  await page.waitForTimeout(250)
  const snapshot = await page.evaluate(() => window.__STUDY_GAME_APP__.snapshot())
  const file = `${nodeId}.png`
  await page.screenshot({ path: path.join(outputDir, file) })
  captures.push({ nodeId, file, snapshot })
}

await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify({ captures, errors }, null, 2)}\n`)
await browser.close()
console.log(JSON.stringify({ outputDir, captures: captures.length, errors: errors.length }))
