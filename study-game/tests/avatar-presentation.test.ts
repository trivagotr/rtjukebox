import { describe, expect, it } from 'vitest'

import type { AvatarAppearance } from '../src/avatar/AvatarAppearance'
import { avatarUpperBodyCrop, shouldUseCanonicalAvatar } from '../src/avatar/AvatarPresentation'

const canonical: AvatarAppearance = {
  bodyType: 'masc',
  skinTone: 'warm',
  hairId: 'short-hair',
  hairColor: 'brown',
  topId: 'radio-hoodie',
  bottomId: 'black-cargos',
  shoesId: 'sneakers',
  hatId: 'bucket-hat',
  accessoryId: null,
}

describe('canonical avatar presentation', () => {
  it('splits only seated art into a furniture-safe upper-body layer', () => {
    expect(avatarUpperBodyCrop('sit')).toEqual({ x: 0, y: 0, width: 64, height: 58 })
    expect(avatarUpperBodyCrop('idle')).toBeNull()
    expect(avatarUpperBodyCrop('walk')).toBeNull()
    expect(avatarUpperBodyCrop('stand')).toBeNull()
  })

  it('uses ImageGen-derived art for the matching RadioTEDU outfit', () => {
    expect(shouldUseCanonicalAvatar(canonical)).toBe(true)
  })

  it.each([
    ['topId', 'varsity-jacket'],
    ['bottomId', 'jeans'],
    ['shoesId', 'boots'],
    ['hatId', 'beanie'],
    ['hatId', null],
  ] as const)('falls back to layered wardrobe art when %s changes', (field, value) => {
    expect(shouldUseCanonicalAvatar({ ...canonical, [field]: value })).toBe(false)
  })
})
