import type { WearableCatalog, WardrobeSlot } from './WearableCatalog'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export type InventoryState = 'locked' | 'owned' | 'equipped'

type PersistedInventory = { owned: string[]; equipped: Partial<Record<WardrobeSlot, string>> }
export interface InventoryStoreOptions {
  authoritativeEquipped?: readonly string[]
}
const KEY = 'study-game.inventory'

function parsePersistedInventory(value: string | null, fallbackOwned: readonly string[]): PersistedInventory {
  if (!value) return { owned: [...fallbackOwned], equipped: {} }
  try {
    const parsed = JSON.parse(value) as Partial<PersistedInventory>
    return {
      owned: Array.isArray(parsed.owned) ? parsed.owned.filter((id): id is string => typeof id === 'string') : [...fallbackOwned],
      equipped: parsed.equipped && typeof parsed.equipped === 'object' ? parsed.equipped : {},
    }
  } catch {
    return { owned: [...fallbackOwned], equipped: {} }
  }
}

export class InventoryStore {
  readonly storage: KeyValueStorage
  readonly catalog: WearableCatalog
  private readonly owned: Set<string>
  private readonly equipped: Partial<Record<WardrobeSlot, string>>
  constructor(
    catalog: WearableCatalog,
    storage: KeyValueStorage,
    initialOwned: readonly string[],
    options: InventoryStoreOptions = {},
  ) {
    this.catalog = catalog; this.storage = resilientStorage(storage)
    const saved = this.storage.getItem(KEY)
    const hasAuthoritativeInventory = options.authoritativeEquipped !== undefined
    const parsed = hasAuthoritativeInventory
      ? { owned: [...initialOwned], equipped: {} }
      : parsePersistedInventory(saved, initialOwned)
    this.owned = new Set(parsed.owned.filter((id) => this.catalog.findById(id)))
    this.equipped = Object.fromEntries(
      Object.entries(parsed.equipped).filter(([slot, id]) => {
        const item = typeof id === 'string' ? this.catalog.findById(id) : undefined
        return item?.slot === slot && this.owned.has(id)
      }),
    )
    for (const id of options.authoritativeEquipped ?? []) {
      const item = this.catalog.findById(id)
      if (item && this.owned.has(id)) this.equipped[item.slot] = id
    }
    if (hasAuthoritativeInventory) this.persist()
  }
  state(id: string): InventoryState {
    if (Object.values(this.equipped).includes(id)) return 'equipped'
    return this.owned.has(id) ? 'owned' : 'locked'
  }
  addOwned(id: string): void {
    if (!this.catalog.findById(id)) throw new Error(`Unknown wearable ${id}`)
    this.owned.add(id)
    this.persist()
  }
  equip(id: string): void {
    const item = this.catalog.findById(id)
    if (!item) throw new Error(`Unknown wearable ${id}`)
    if (!this.owned.has(id)) throw new Error(`Wearable ${id} is not owned`)
    this.equipped[item.slot] = id; this.persist()
  }
  unequip(id: string): void {
    const slot = (Object.keys(this.equipped) as WardrobeSlot[]).find((key) => this.equipped[key] === id)
    if (slot) { delete this.equipped[slot]; this.persist() }
  }
  equippedId(slot: WardrobeSlot): string | undefined { return this.equipped[slot] }
  private persist(): void { this.storage.setItem(KEY, JSON.stringify({ owned: [...this.owned], equipped: this.equipped })) }
}

function resilientStorage(storage: KeyValueStorage): KeyValueStorage {
  const fallback = new Map<string, string>()
  return {
    getItem(key) {
      try {
        const value = storage.getItem(key)
        if (value !== null) fallback.set(key, value)
        return value
      } catch {
        return fallback.get(key) ?? null
      }
    },
    setItem(key, value) {
      fallback.set(key, value)
      try {
        storage.setItem(key, value)
      } catch {
        // Android WebView can expose localStorage as null when DOM storage is disabled.
      }
    },
  }
}
