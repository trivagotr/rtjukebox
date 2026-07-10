import {
  cloneAvatarAppearance,
  type AvatarAction,
  type AvatarAppearance,
  type Direction8,
  type WearableSlot,
} from '../avatar/AvatarAppearance'
import {
  DEFAULT_AVATAR_ASSET_MANIFEST,
  findWearableDefinition,
  type AvatarAssetManifest,
} from '../avatar/AvatarAssetManifest'
import { composeAvatarLayers } from '../avatar/AvatarLayerComposer'

type MovementDelta = Readonly<{
  x: number
  y: number
}>

function isMoving(delta: MovementDelta): boolean {
  return delta.x !== 0 || delta.y !== 0
}

function directionFromDelta(delta: MovementDelta, previous: Direction8): Direction8 {
  if (!isMoving(delta)) {
    return previous
  }

  const horizontal = delta.x > 0 ? 'e' : 'w'
  const vertical = delta.y > 0 ? 's' : 'n'

  if (delta.x === 0) {
    return vertical
  }

  if (delta.y === 0) {
    return horizontal
  }

  return `${vertical}${horizontal}` as Direction8
}

function updateAppearanceSlot(
  appearance: AvatarAppearance,
  slot: WearableSlot,
  itemId: string | null,
): AvatarAppearance {
  const next = {
    ...appearance,
    ...(slot === 'hair' ? { hairId: itemId ?? appearance.hairId } : null),
    ...(slot === 'top' ? { topId: itemId ?? appearance.topId } : null),
    ...(slot === 'bottom' ? { bottomId: itemId ?? appearance.bottomId } : null),
    ...(slot === 'shoes' ? { shoesId: itemId ?? appearance.shoesId } : null),
    ...(slot === 'hat' ? { hatId: itemId } : null),
    ...(slot === 'accessory' ? { accessoryId: itemId } : null),
  } as AvatarAppearance

  return cloneAvatarAppearance(next)
}

export class AvatarController {
  readonly #manifest: AvatarAssetManifest
  #appearance: AvatarAppearance
  #action: AvatarAction = 'idle'
  #direction: Direction8 = 's'

  constructor(
    manifest: AvatarAssetManifest = DEFAULT_AVATAR_ASSET_MANIFEST,
    appearance: AvatarAppearance,
  ) {
    if (!manifest.bodyTypes.includes(appearance.bodyType)) {
      throw new Error(`Unknown body type "${appearance.bodyType}"`)
    }

    const equippedWearables: Array<[WearableSlot, string | null]> = [
      ['hair', appearance.hairId],
      ['top', appearance.topId],
      ['bottom', appearance.bottomId],
      ['shoes', appearance.shoesId],
      ['hat', appearance.hatId],
      ['accessory', appearance.accessoryId],
    ]

    for (const [slot, itemId] of equippedWearables) {
      if (!itemId) {
        continue
      }

      const wearable = findWearableDefinition(manifest, slot, itemId)
      if (!wearable) {
        throw new Error(`Unknown wearable "${itemId}" for slot "${slot}"`)
      }

      if (!wearable.compatibleBodyTypes.includes(appearance.bodyType)) {
        throw new Error(`Wearable "${wearable.id}" is incompatible with body type "${appearance.bodyType}"`)
      }
    }

    this.#manifest = manifest
    this.#appearance = cloneAvatarAppearance(appearance)
  }

  get appearance(): AvatarAppearance {
    return this.#appearance
  }

  get action(): AvatarAction {
    return this.#action
  }

  get direction(): Direction8 {
    return this.#direction
  }

  applyMovement(delta: MovementDelta): void {
    if (this.#action === 'sit') {
      return
    }

    if (isMoving(delta)) {
      this.#direction = directionFromDelta(delta, this.#direction)
      this.#action = 'walk'
      return
    }

    if (this.#action === 'walk' || this.#action === 'stand') {
      this.#action = 'idle'
    }
  }

  sit(): void {
    this.#action = 'sit'
  }

  stand(): void {
    if (this.#action === 'sit') {
      this.#action = 'stand'
    }
  }

  equip(slot: WearableSlot, itemId: string): void {
    const wearable = findWearableDefinition(this.#manifest, slot, itemId)
    if (!wearable) {
      throw new Error(`Unknown wearable "${itemId}" for slot "${slot}"`)
    }

    if (!wearable.compatibleBodyTypes.includes(this.#appearance.bodyType)) {
      throw new Error(`Wearable "${wearable.id}" is incompatible with body type "${this.#appearance.bodyType}"`)
    }

    this.#appearance = updateAppearanceSlot(this.#appearance, slot, itemId)
  }

  layers(frameIndex = 0) {
    return composeAvatarLayers(this.#manifest, this.#appearance, this.#action, this.#direction, frameIndex)
  }
}
