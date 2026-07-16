import type { AvatarAppearance } from './AvatarAppearance'
import type { InventoryStore } from '../inventory/InventoryStore'
import type { WearableCatalog, WardrobeSlot } from '../inventory/WearableCatalog'

const APPEARANCE_KEY = Object.freeze({
  hair: 'hairId',
  top: 'topId',
  bottom: 'bottomId',
  shoes: 'shoesId',
  hat: 'hatId',
}) satisfies Readonly<Record<Exclude<WardrobeSlot, 'accessory'>, keyof AvatarAppearance>>

const INITIAL_SLOTS = Object.freeze(['hair', 'top', 'bottom', 'shoes', 'hat'] as const)

export function resolveInitialAvatarAppearance(
  preferred: AvatarAppearance,
  catalog: WearableCatalog,
  inventory: InventoryStore,
): AvatarAppearance {
  const appearance = { ...preferred }
  for (const slot of INITIAL_SLOTS) {
    const key = APPEARANCE_KEY[slot]
    const preferredId = appearance[key]
    const alreadyEquipped = inventory.equippedId(slot)
    const ownedFallback = catalog.list(slot).find((item) => inventory.state(item.id) !== 'locked')?.id
    const selected = alreadyEquipped
      ?? (typeof preferredId === 'string' && inventory.state(preferredId) !== 'locked' ? preferredId : ownedFallback)

    if (selected) {
      if (!alreadyEquipped) inventory.equip(selected)
      Object.assign(appearance, { [key]: selected })
    } else if (slot === 'hat') {
      appearance.hatId = null
    }
  }
  return appearance
}
