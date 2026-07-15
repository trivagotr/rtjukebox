import {describe, expect, it} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))

describe('Study Account-owned Gold contract', () => {
  it('labels the shared spendable balance as Gold and keeps server field mappings', () => {
    const mainSource = fs.readFileSync(path.join(testDir, '..', 'src', 'main.ts'), 'utf8')
    const adapterSource = fs.readFileSync(
      path.join(testDir, '..', 'src', 'adapters', 'RadioTEDUStudyAdapter.ts'),
      'utf8',
    )

    expect(mainSource).toContain('aria-label="Gold balance"')
    expect(mainSource).toContain('<span>Gold</span>')
    expect(mainSource).not.toContain('<span>PTS</span>')
    expect(mainSource).not.toMatch(/\d+ PTS/)
    expect(adapterSource).toContain('profile.points?.spendable_points')
    expect(adapterSource).toContain('data.points?.spendable_points')
    expect(adapterSource).not.toContain('localStorage')
  })
})
