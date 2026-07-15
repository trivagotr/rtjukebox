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
