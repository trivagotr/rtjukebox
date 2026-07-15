import { describe, expect, it, vi } from 'vitest'

import { getOrCreateStudyClientSessionId } from '../src/adapters/StudyClientSession'

describe('getOrCreateStudyClientSessionId', () => {
  it('reuses the same tab-scoped id after a webview reload', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    const randomId = vi.fn(() => '123e4567-e89b-12d3-a456-426614174000')

    const first = getOrCreateStudyClientSessionId(storage, () => 1000, randomId)
    const reloaded = getOrCreateStudyClientSessionId(storage, () => 2000, randomId)

    expect(reloaded).toBe(first)
    expect(first).toBe('study-room-1000-123e4567-e89b-12d3-a456-426614174000')
    expect(randomId).toHaveBeenCalledTimes(1)
  })
})
