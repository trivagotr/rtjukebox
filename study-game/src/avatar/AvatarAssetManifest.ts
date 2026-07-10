import {
  AVATAR_ACTIONS,
  DIRECTIONS,
  type AvatarAction,
  type Direction8,
  type WearableDefinition,
  type WearableSlot,
} from './AvatarAppearance'

export type AvatarAssetManifest = Readonly<{
  bodyTypes: readonly string[]
  wearables: Readonly<Record<WearableSlot, readonly WearableDefinition[]>>
}>

export type AvatarAssetManifestInput = Readonly<{
  bodyTypes?: readonly string[]
  wearables?: Partial<Record<WearableSlot, readonly WearableDefinition[]>>
}>

const REQUIRED_BODY_TYPES = ['masc', 'fem'] as const

const DEFAULT_WEARABLE_SLOTS: readonly WearableSlot[] = ['hair', 'top', 'bottom', 'shoes', 'hat', 'accessory']

function freezeReadonly<T>(value: T): T {
  return Object.freeze(value)
}

function createFrameMap(id: string): WearableDefinition['frames'] {
  const frames = Object.fromEntries(
    AVATAR_ACTIONS.map((action) => [
      action,
      Object.fromEntries(
        DIRECTIONS.map((direction) => [
          direction,
          freezeReadonly([`${id}:${action}:${direction}:0`]),
        ]),
      ),
    ]),
  ) as unknown as WearableDefinition['frames']

  return freezeReadonly(frames)
}

function createAnchorMap(x: number, y: number): WearableDefinition['anchors'] {
  const anchors = Object.fromEntries(
    AVATAR_ACTIONS.map((action) => [
      action,
      Object.fromEntries(
        DIRECTIONS.map((direction) => [
          direction,
          freezeReadonly({ x, y } satisfies Record<'x' | 'y', number>),
        ]),
      ),
    ]),
  ) as unknown as WearableDefinition['anchors']

  return freezeReadonly(anchors)
}

function createWearable(
  id: string,
  slot: WearableSlot,
  compatibleBodyTypes: readonly string[],
  options: Readonly<{
    layerByDirection?: Partial<Record<Direction8, number>>
    anchor?: { x: number; y: number }
  }> = {},
): WearableDefinition {
  return freezeReadonly({
    id,
    slot,
    compatibleBodyTypes: freezeReadonly([...compatibleBodyTypes]),
    frames: createFrameMap(id),
    anchors: createAnchorMap(options.anchor?.x ?? 0, options.anchor?.y ?? 0),
    layerByDirection: freezeReadonly({ ...(options.layerByDirection ?? {}) }),
  })
}

function ensureActionCoverage(wearable: WearableDefinition, action: AvatarAction): void {
  const frames = wearable.frames[action]
  if (!frames) {
    throw new Error(`Wearable ${wearable.id} is missing frames for action "${action}"`)
  }

  const anchors = wearable.anchors[action]
  if (!anchors) {
    throw new Error(`Wearable ${wearable.id} is missing anchors for action "${action}"`)
  }

  for (const direction of DIRECTIONS) {
    const actionFrames = frames[direction]
    if (!actionFrames || actionFrames.length === 0) {
      throw new Error(`Wearable ${wearable.id} is missing frames for action "${action}" and direction "${direction}"`)
    }

    const anchor = anchors[direction]
    if (!anchor) {
      throw new Error(`Wearable ${wearable.id} is missing anchors for action "${action}" and direction "${direction}"`)
    }
  }
}

function ensureWearableCoverage(wearable: WearableDefinition): WearableDefinition {
  if (!wearable.id) {
    throw new Error('Wearable is missing an id')
  }

  if (!wearable.slot) {
    throw new Error(`Wearable ${wearable.id} is missing a slot`)
  }

  if (!wearable.compatibleBodyTypes || wearable.compatibleBodyTypes.length === 0) {
    throw new Error(`Wearable ${wearable.id} must declare at least one compatible body type`)
  }

  for (const action of AVATAR_ACTIONS) {
    ensureActionCoverage(wearable, action)
  }

  return wearable
}

export function validateWearableDefinition(wearable: WearableDefinition): WearableDefinition {
  return ensureWearableCoverage(wearable)
}

function buildDefaultWearables(): Record<WearableSlot, readonly WearableDefinition[]> {
  const hatLayerOffsets: Partial<Record<Direction8, number>> = {
    n: -2,
    ne: -1,
    e: 4,
    se: 5,
    s: 6,
    sw: 5,
    w: 4,
    nw: -1,
  }

  const hairLayerOffsets: Partial<Record<Direction8, number>> = {
    n: 5,
    ne: 4,
    e: -1,
    se: -2,
    s: -3,
    sw: -2,
    w: -1,
    nw: 4,
  }

  const wearables: Record<WearableSlot, readonly WearableDefinition[]> = {
    hair: freezeReadonly([
      createWearable('short-hair', 'hair', REQUIRED_BODY_TYPES, { layerByDirection: hairLayerOffsets, anchor: { x: 2, y: 3 } }),
    ]),
    top: freezeReadonly([
      createWearable('radio-hoodie', 'top', REQUIRED_BODY_TYPES, { anchor: { x: 1, y: 4 } }),
      createWearable('varsity-jacket', 'top', REQUIRED_BODY_TYPES, { anchor: { x: 1, y: 4 } }),
      createWearable('fem-dress-top', 'top', ['fem'], { anchor: { x: 1, y: 4 } }),
    ]),
    bottom: freezeReadonly([
      createWearable('jeans', 'bottom', REQUIRED_BODY_TYPES, { anchor: { x: 1, y: 5 } }),
      createWearable('black-cargos', 'bottom', REQUIRED_BODY_TYPES, { anchor: { x: 1, y: 5 } }),
    ]),
    shoes: freezeReadonly([
      createWearable('sneakers', 'shoes', REQUIRED_BODY_TYPES, { anchor: { x: 0, y: 6 } }),
      createWearable('boots', 'shoes', REQUIRED_BODY_TYPES, { anchor: { x: 0, y: 6 } }),
    ]),
    hat: freezeReadonly([
      createWearable('bucket-hat', 'hat', REQUIRED_BODY_TYPES, { layerByDirection: hatLayerOffsets, anchor: { x: 2, y: 1 } }),
      createWearable('beanie', 'hat', REQUIRED_BODY_TYPES, { layerByDirection: hatLayerOffsets, anchor: { x: 2, y: 1 } }),
    ]),
    accessory: freezeReadonly([
      createWearable('headphones', 'accessory', REQUIRED_BODY_TYPES, { anchor: { x: 3, y: 2 } }),
    ]),
  }

  return wearables
}

export function createAvatarAssetManifest(input: AvatarAssetManifestInput = {}): AvatarAssetManifest {
  const wearables = buildDefaultWearables()
  const mergedWearables = { ...wearables, ...(input.wearables ?? {}) } satisfies Record<WearableSlot, readonly WearableDefinition[]>

  for (const slot of DEFAULT_WEARABLE_SLOTS) {
    const slotWearables = mergedWearables[slot] ?? []
    for (const wearable of slotWearables) {
      if (wearable.slot !== slot) {
        throw new Error(`Wearable ${wearable.id} is declared under ${slot} but its slot is ${wearable.slot}`)
      }
      ensureWearableCoverage(wearable)
    }
    mergedWearables[slot] = freezeReadonly([...slotWearables])
  }

  const bodyTypes = freezeReadonly([...(input.bodyTypes ?? REQUIRED_BODY_TYPES)])
  if (bodyTypes.length === 0) {
    throw new Error('Avatar asset manifest must declare at least one body type')
  }

  return freezeReadonly({
    bodyTypes,
    wearables: freezeReadonly(mergedWearables),
  })
}

export const DEFAULT_AVATAR_ASSET_MANIFEST = createAvatarAssetManifest()

export function findWearableDefinition(
  manifest: AvatarAssetManifest,
  slot: WearableSlot,
  id: string,
): WearableDefinition | undefined {
  return manifest.wearables[slot].find((wearable) => wearable.id === id)
}
