import {describe, expect, it, vi} from 'vitest'

import {applyStudyRoomResponse} from '../src/chat/StudyChatCoordinator'

describe('applyStudyRoomResponse', () => {
  it('discards a response that resolves after the user changes rooms', () => {
    const apply = vi.fn()

    expect(applyStudyRoomResponse('library', () => 'chim-alan', ['old'], apply)).toBe(false)
    expect(apply).not.toHaveBeenCalled()
    expect(applyStudyRoomResponse('chim-alan', () => 'chim-alan', ['current'], apply)).toBe(true)
    expect(apply).toHaveBeenCalledWith(['current'])
  })
})
