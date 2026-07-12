import {
  AVATAR_ACTIONS,
  DIRECTIONS,
  type AvatarAction,
  type AvatarAppearance,
  type AvatarLayerDescriptor,
  type AvatarLayerSlot,
  type Direction8,
  type SpriteAnchor,
  type WearableSlot,
} from './AvatarAppearance'
import {
  findWearableDefinition,
  type AvatarAssetManifest,
} from './AvatarAssetManifest'

const BASE_LAYER_ORDER: Record<AvatarLayerSlot, number> = {
  body: 0,
  skin: 1,
  bottom: 2,
  shoes: 3,
  top: 4,
  hair: 5,
  hat: 6,
  accessory: 7,
}

const BODY_ANCHOR: SpriteAnchor = Object.freeze({ x: 0, y: 0 })
const SKIN_ANCHOR: SpriteAnchor = Object.freeze({ x: 0, y: 0 })

function freezeReadonly<T>(value: T): T {
  return Object.freeze(value)
}

function resolveFrameIndex(frameCount: number, frameIndex: number): number {
  if (frameCount <= 0) {
    return 0
  }

  const normalized = frameIndex % frameCount
  return normalized < 0 ? normalized + frameCount : normalized
}

function createBodyLayer(
  appearance: AvatarAppearance,
  action: AvatarAction,
  direction: Direction8,
  frameIndex: number,
): AvatarLayerDescriptor {
  const frameKey = `body:${appearance.bodyType}:${action}:${direction}:${frameIndex}`
  return freezeReadonly({
    slot: 'body',
    id: appearance.bodyType,
    direction,
    action,
    frameKey,
    anchor: BODY_ANCHOR,
    order: BASE_LAYER_ORDER.body,
  })
}

function createSkinLayer(
  appearance: AvatarAppearance,
  action: AvatarAction,
  direction: Direction8,
  frameIndex: number,
): AvatarLayerDescriptor {
  const frameKey = `skin:${appearance.skinTone}:${action}:${direction}:${frameIndex}`
  return freezeReadonly({
    slot: 'skin',
    id: appearance.skinTone,
    direction,
    action,
    frameKey,
    anchor: SKIN_ANCHOR,
    order: BASE_LAYER_ORDER.skin,
  })
}

function createWearableLayer(
  manifest: AvatarAssetManifest,
  slot: WearableSlot,
  itemId: string,
  appearance: AvatarAppearance,
  action: AvatarAction,
  direction: Direction8,
  frameIndex: number,
): AvatarLayerDescriptor {
  const wearable = findWearableDefinition(manifest, slot, itemId)
  if (!wearable) {
    throw new Error(`Unknown wearable "${itemId}" for slot "${slot}"`)
  }

  if (!manifest.bodyTypes.includes(appearance.bodyType)) {
    throw new Error(`Unknown body type "${appearance.bodyType}"`)
  }

  if (!wearable.compatibleBodyTypes.includes(appearance.bodyType)) {
    throw new Error(`Wearable "${wearable.id}" is incompatible with body type "${appearance.bodyType}"`)
  }

  const framesForAction = wearable.frames[action]
  if (!framesForAction) {
    throw new Error(`Wearable "${wearable.id}" is missing frames for action "${action}"`)
  }

  const anchorsForAction = wearable.anchors[action]
  if (!anchorsForAction) {
    throw new Error(`Wearable "${wearable.id}" is missing anchors for action "${action}"`)
  }

  const frames = framesForAction[direction]
  if (!frames || frames.length === 0) {
    throw new Error(`Wearable "${wearable.id}" is missing frames for action "${action}" and direction "${direction}"`)
  }

  const anchor = anchorsForAction[direction]
  if (!anchor) {
    throw new Error(`Wearable "${wearable.id}" is missing anchors for action "${action}" and direction "${direction}"`)
  }

  const normalizedFrameIndex = resolveFrameIndex(frames.length, frameIndex)
  const frameKey = frames[normalizedFrameIndex]
  if (!frameKey) {
    throw new Error(`Wearable "${wearable.id}" has no frame at index ${normalizedFrameIndex}`)
  }
  const layerOffset = wearable.layerByDirection[direction] ?? 0

  return freezeReadonly({
    slot,
    id: wearable.id,
    direction,
    action,
    frameKey,
    anchor,
    order: BASE_LAYER_ORDER[slot] + layerOffset,
  })
}

export function composeAvatarLayers(
  manifest: AvatarAssetManifest,
  appearance: AvatarAppearance,
  action: AvatarAction,
  direction: Direction8,
  frameIndex = 0,
): readonly AvatarLayerDescriptor[] {
  if (!AVATAR_ACTIONS.includes(action)) {
    throw new Error(`Unknown avatar action "${action}"`)
  }

  if (!DIRECTIONS.includes(direction)) {
    throw new Error(`Unknown direction "${direction}"`)
  }

  if (!manifest.bodyTypes.includes(appearance.bodyType)) {
    throw new Error(`Unknown body type "${appearance.bodyType}"`)
  }

  const layers: AvatarLayerDescriptor[] = [
    createBodyLayer(appearance, action, direction, frameIndex),
    createSkinLayer(appearance, action, direction, frameIndex),
    createWearableLayer(manifest, 'hair', appearance.hairId, appearance, action, direction, frameIndex),
    createWearableLayer(manifest, 'top', appearance.topId, appearance, action, direction, frameIndex),
    createWearableLayer(manifest, 'bottom', appearance.bottomId, appearance, action, direction, frameIndex),
    createWearableLayer(manifest, 'shoes', appearance.shoesId, appearance, action, direction, frameIndex),
  ]

  if (appearance.hatId) {
    layers.push(createWearableLayer(manifest, 'hat', appearance.hatId, appearance, action, direction, frameIndex))
  }

  if (appearance.accessoryId) {
    layers.push(
      createWearableLayer(manifest, 'accessory', appearance.accessoryId, appearance, action, direction, frameIndex),
    )
  }

  return freezeReadonly(
    [...layers].sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order
      }

      return left.slot.localeCompare(right.slot)
    }),
  )
}
