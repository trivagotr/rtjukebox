import { AVATAR_ACTIONS, DIRECTIONS, type AvatarAction, type Direction8, type WearableDefinition } from '../avatar/AvatarAppearance'

export const WARDROBE_SLOTS = ['hair', 'top', 'bottom', 'shoes', 'hat', 'accessory'] as const
export type WardrobeSlot = (typeof WARDROBE_SLOTS)[number]
export type WardrobeItem = WearableDefinition & { slot: WardrobeSlot }

export function validateWardrobeCoverage(item: WearableDefinition): WearableDefinition {
  if (!item.id || !item.slot || item.compatibleBodyTypes.length === 0) throw new Error(`Wearable ${item.id || 'unknown'} has invalid metadata`)
  for (const action of AVATAR_ACTIONS) {
    if (!item.frames[action]) throw new Error(`Wearable ${item.id} is missing frames for action "${action}"`)
    if (!item.anchors[action]) throw new Error(`Wearable ${item.id} is missing anchors for action "${action}"`)
    for (const direction of DIRECTIONS) {
      const frames = item.frames[action]?.[direction]
      if (!frames?.length) throw new Error(`Wearable ${item.id} is missing frames for action "${action}" and direction "${direction}"`)
      if (!item.anchors[action]?.[direction]) throw new Error(`Wearable ${item.id} is missing anchors for action "${action}" and direction "${direction}"`)
    }
  }
  return item
}

export class WearableCatalog {
  private readonly items: ReadonlyMap<string, WardrobeItem>
  private readonly itemsById: ReadonlyMap<string, WardrobeItem>
  constructor(items: readonly WardrobeItem[]) {
    const map = new Map<string, WardrobeItem>()
    const byId = new Map<string, WardrobeItem>()
    for (const item of items) {
      validateWardrobeCoverage(item)
      if (map.has(`${item.slot}:${item.id}`)) throw new Error(`Duplicate wearable ${item.slot}:${item.id}`)
      if (byId.has(item.id)) throw new Error(`Duplicate wearable id ${item.id}`)
      map.set(`${item.slot}:${item.id}`, item)
      byId.set(item.id, item)
    }
    this.items = map
    this.itemsById = byId
  }
  get(id: string, slot: WardrobeSlot): WardrobeItem
  get(slot: WardrobeSlot, id: string): WardrobeItem
  get(first: string, second: string): WardrobeItem {
    const [id, slot] = WARDROBE_SLOTS.includes(first as WardrobeSlot) ? [second, first] : [first, second]
    const item = this.items.get(`${slot}:${id}`)
    if (!item) throw new Error(`Unknown wearable ${slot}:${id}`)
    return item
  }
  list(slot: WardrobeSlot): readonly WardrobeItem[] {
    return [...this.items.values()].filter((item) => item.slot === slot)
  }
  findById(id: string): WardrobeItem | undefined {
    return this.itemsById.get(id)
  }
}
