import { describe, expect, it } from 'vitest'

import type { AvatarAppearance } from '../src/avatar/AvatarAppearance'
import {
  WearableCatalog,
  validateWardrobeCoverage,
  type WardrobeItem,
} from '../src/inventory/WearableCatalog'
import { InventoryStore, type KeyValueStorage } from '../src/inventory/InventoryStore'
import { WardrobeController } from '../src/inventory/WardrobeController'
import { resolveInitialAvatarAppearance } from '../src/avatar/InitialAvatarAppearance'

const appearance: AvatarAppearance = Object.freeze({
  bodyType: 'masc', skinTone: 'tone-1', hairId: 'short-hair', hairColor: 'black',
  topId: 'shirt', bottomId: 'jeans', shoesId: 'sneakers', hatId: null, accessoryId: null,
})

const metadata = (id: string) => ({
  id, slot: 'top' as const, compatibleBodyTypes: ['masc'],
  frames: Object.fromEntries(['idle', 'walk', 'sit', 'stand'].map((a) => [a,
    Object.fromEntries(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((d) => [d, [`${id}-${a}-${d}-0`]])),
  ])),
  anchors: Object.fromEntries(['idle', 'walk', 'sit', 'stand'].map((a) => [a,
    Object.fromEntries(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((d) => [d, { x: 0, y: 0 }])),
  ])), layerByDirection: {},
})

const item = (id: string, slot: WardrobeItem['slot'] = 'top', bodyTypes = ['masc']): WardrobeItem => ({
  ...metadata(id), id, slot, compatibleBodyTypes: bodyTypes,
}) as unknown as WardrobeItem

function storage(): KeyValueStorage {
  const values = new Map<string, string>()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

describe('wardrobe domain', () => {
  it('validates complete catalog coverage and exposes independent outfit slots', () => {
    const catalog = new WearableCatalog([item('short-hair', 'hair'), item('shirt'), item('jeans', 'bottom'), item('sneakers', 'shoes'), item('cap', 'hat'), item('beanie', 'hat'), item('scarf', 'accessory')])
    expect(catalog.get('shirt', 'top').id).toBe('shirt')
    expect(catalog.list('hair')).toHaveLength(1)
    expect(catalog.list('hat')).toHaveLength(2)
    expect(() => validateWardrobeCoverage({ ...item('broken'), frames: { ...item('broken').frames, walk: {} } } as unknown as WardrobeItem)).toThrow(/walk.*direction/i)
    expect(() => new WearableCatalog([item('shared'), item('shared', 'hat')])).toThrow(/duplicate.*shared/i)
  })

  it('tracks locked, owned, and equipped states and persists ownership', () => {
    const store = new InventoryStore(new WearableCatalog([item('shirt'), item('cap', 'hat')]), storage(), ['shirt'])
    expect(store.state('cap')).toBe('locked')
    expect(() => store.equip('cap')).toThrow(/owned/i)
    expect(() => store.addOwned('unknown')).toThrow(/unknown/i)
    store.addOwned('cap')
    store.equip('cap')
    expect(store.state('cap')).toBe('equipped')
    expect(new InventoryStore(store.catalog, store.storage, []).state('cap')).toBe('equipped')
    store.unequip('cap')
    expect(store.state('cap')).toBe('owned')
  })

  it('rejects unknown, incompatible, and invalid slot operations', () => {
    const catalog = new WearableCatalog([item('fem-shirt', 'top', ['fem'])])
    const store = new InventoryStore(catalog, storage(), ['fem-shirt'])
    const controller = new WardrobeController(catalog, store, appearance)
    expect(() => controller.equip('top', 'missing')).toThrow(/unknown/i)
    expect(() => controller.equip('top', 'fem-shirt')).toThrow(/body/i)
    expect(() => controller.unequip('top')).toThrow(/required/i)
  })

  it('treats hair as a required independently equipped layer and recovers from corrupt persistence', () => {
    const catalog = new WearableCatalog([item('short-hair', 'hair')])
    const values = storage()
    values.setItem('study-game.inventory', '{bad json')
    const store = new InventoryStore(catalog, values, ['short-hair'])
    const controller = new WardrobeController(catalog, store, appearance)

    expect(store.state('short-hair')).toBe('owned')
    expect(() => controller.unequip('hair')).toThrow(/required/i)
  })

  it('lets authoritative server inventory replace stale local equipment', () => {
    const catalog = new WearableCatalog([
      item('cap', 'hat'), item('hoodie'), item('jacket'),
    ])
    const values = storage()
    values.setItem(
      'study-game.inventory',
      JSON.stringify({
        owned: ['cap', 'hoodie'],
        equipped: {hat: 'cap', top: 'hoodie'},
      }),
    )

    const store = new InventoryStore(catalog, values, ['cap', 'jacket'], {
      authoritativeEquipped: ['cap', 'jacket'],
    })

    expect(store.equippedId('hat')).toBe('cap')
    expect(store.equippedId('top')).toBe('jacket')
    expect(store.state('hoodie')).toBe('locked')
  })

  it('keeps authoritative inventory usable when Android WebView storage is unavailable', () => {
    const unavailableStorage: KeyValueStorage = {
      getItem: () => { throw new TypeError("Cannot read properties of null (reading 'getItem')") },
      setItem: () => { throw new TypeError("Cannot read properties of null (reading 'setItem')") },
    }
    const catalog = new WearableCatalog([item('shirt'), item('cap', 'hat')])

    const store = new InventoryStore(catalog, unavailableStorage, ['shirt'], {
      authoritativeEquipped: ['shirt'],
    })
    store.addOwned('cap')
    store.equip('cap')

    expect(store.state('shirt')).toBe('equipped')
    expect(store.state('cap')).toBe('equipped')
  })

  it('selects only server-owned starter clothes instead of equipping locked defaults', () => {
    const catalog = new WearableCatalog([
      item('short-hair', 'hair'), item('shirt'), item('jeans', 'bottom'),
      item('black-cargos', 'bottom'), item('sneakers', 'shoes'), item('bucket-hat', 'hat'),
    ])
    const inventory = new InventoryStore(
      catalog,
      storage(),
      ['short-hair', 'shirt', 'jeans', 'sneakers'],
      { authoritativeEquipped: [] },
    )

    const resolved = resolveInitialAvatarAppearance(
      { ...appearance, bottomId: 'black-cargos', hatId: 'bucket-hat' },
      catalog,
      inventory,
    )

    expect(resolved).toMatchObject({
      hairId: 'short-hair', topId: 'shirt', bottomId: 'jeans', shoesId: 'sneakers', hatId: null,
    })
    expect(inventory.state('jeans')).toBe('equipped')
    expect(inventory.state('black-cargos')).toBe('locked')
    expect(inventory.state('bucket-hat')).toBe('locked')
  })
})
