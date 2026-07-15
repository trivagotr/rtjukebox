import type { AvatarAction, AvatarAppearance } from './AvatarAppearance'

const CANONICAL_OUTFIT = Object.freeze({
  bodyType: 'masc',
  skinTone: 'warm',
  hairId: 'short-hair',
  hairColor: 'brown',
  topId: 'radio-hoodie',
  bottomId: 'black-cargos',
  shoesId: 'sneakers',
  hatId: 'bucket-hat',
  accessoryId: null,
}) satisfies AvatarAppearance

export function shouldUseCanonicalAvatar(appearance: AvatarAppearance): boolean {
  return Object.entries(CANONICAL_OUTFIT).every(([key, value]) => (
    appearance[key as keyof AvatarAppearance] === value
  ))
}

export function canonicalAvatarTextureKey(action: AvatarAction): string {
  return `avatar:canonical-${action}`
}

const SEATED_UPPER_BODY_CROP = Object.freeze({ x: 0, y: 0, width: 64, height: 58 })

export function avatarUpperBodyCrop(action: AvatarAction): Readonly<typeof SEATED_UPPER_BODY_CROP> | null {
  return action === 'sit' ? SEATED_UPPER_BODY_CROP : null
}
