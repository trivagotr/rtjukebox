import { describe, expect, it } from 'vitest'

import type { AvatarAppearance } from '../src/avatar/AvatarAppearance'
import {
  WearableCatalog,
  validateWardrobeCoverage,
  type WardrobeItem,
} from '../src/inventory/WearableCatalog'
import { InventoryStore, type KeyValueStorage } from '../src/inventory/InventoryStore'
import { WardrobeController } from '../src/inventory/WardrobeController'

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
})
