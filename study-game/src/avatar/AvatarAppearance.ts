export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type Direction8 = (typeof DIRECTIONS)[number]

export const AVATAR_ACTIONS = ['idle', 'walk', 'sit', 'stand'] as const
export type AvatarAction = (typeof AVATAR_ACTIONS)[number]

export const WEARABLE_SLOTS = ['hair', 'top', 'bottom', 'shoes', 'hat', 'accessory'] as const
export type WearableSlot = (typeof WEARABLE_SLOTS)[number]

export type AvatarAppearance = Readonly<{
  bodyType: string
  skinTone: string
  hairId: string
  hairColor: string
  topId: string
  bottomId: string
  shoesId: string
  hatId: string | null
  accessoryId: string | null
}>

export type SpriteFrameKey = string
export type SpriteAnchor = Readonly<{
  x: number
  y: number
}>

export type WearableDefinition = Readonly<{
  id: string
  slot: WearableSlot
  compatibleBodyTypes: readonly string[]
  frames: Readonly<Record<AvatarAction, Partial<Record<Direction8, readonly string[]>>>>
  anchors: Readonly<Record<AvatarAction, Partial<Record<Direction8, SpriteAnchor>>>>
  layerByDirection: Partial<Record<Direction8, number>>
}>

export type AvatarLayerSlot = WearableSlot | 'body' | 'skin'

export type AvatarLayerDescriptor = Readonly<{
  slot: AvatarLayerSlot
  id: string
  direction: Direction8
  action: AvatarAction
  frameKey: SpriteFrameKey
  anchor: SpriteAnchor
  order: number
}>

export function cloneAvatarAppearance(appearance: AvatarAppearance): AvatarAppearance {
  return Object.freeze({ ...appearance })
}
