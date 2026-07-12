import type { AvatarAppearance } from '../avatar/AvatarAppearance'
import { WearableCatalog, type WardrobeSlot } from './WearableCatalog'
import { InventoryStore } from './InventoryStore'

const required: ReadonlySet<WardrobeSlot> = new Set(['hair', 'top', 'bottom', 'shoes'])
const appearanceKeys: Record<WardrobeSlot, 'hairId' | 'topId' | 'bottomId' | 'shoesId' | 'hatId' | 'accessoryId'> = { hair: 'hairId', top: 'topId', bottom: 'bottomId', shoes: 'shoesId', hat: 'hatId', accessory: 'accessoryId' }

export class WardrobeController {
  private current: AvatarAppearance
  constructor(readonly catalog: WearableCatalog, readonly inventory: InventoryStore, initial: AvatarAppearance) { this.current = Object.freeze({ ...initial }) }
  get appearance(): AvatarAppearance { return this.current }
  equip(slot: WardrobeSlot, id: string): AvatarAppearance {
    const item = this.catalog.get(slot, id)
    if (!item.compatibleBodyTypes.includes(this.current.bodyType)) throw new Error(`Wearable ${id} is incompatible with body type ${this.current.bodyType}`)
    this.inventory.equip(id)
    this.current = Object.freeze({ ...this.current, [appearanceKeys[slot]]: id })
    return this.current
  }
  unequip(slot: WardrobeSlot): AvatarAppearance {
    if (required.has(slot)) throw new Error(`Slot ${slot} is required`)
    const id = this.current[appearanceKeys[slot]]
    if (id) this.inventory.unequip(id)
    this.current = Object.freeze({ ...this.current, [appearanceKeys[slot]]: null })
    return this.current
  }
}
