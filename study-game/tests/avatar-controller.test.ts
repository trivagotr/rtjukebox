import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AVATAR_ASSET_MANIFEST,
  validateWearableDefinition,
} from '../src/avatar/AvatarAssetManifest'
import { composeAvatarLayers } from '../src/avatar/AvatarLayerComposer'
import type { AvatarAppearance } from '../src/avatar/AvatarAppearance'
import { AvatarController } from '../src/game/AvatarController'

const BASE_APPEARANCE: AvatarAppearance = Object.freeze({
  bodyType: 'masc',
  skinTone: 'tone-1',
  hairId: 'short-hair',
  hairColor: 'black',
  topId: 'radio-hoodie',
  bottomId: 'jeans',
  shoesId: 'sneakers',
  hatId: 'bucket-hat',
  accessoryId: 'headphones',
})

describe('AvatarController', () => {
  it('models idle -> walk -> idle and turns direction from movement delta', () => {
    const controller = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, BASE_APPEARANCE)
    const originalAppearance = controller.appearance

    expect(controller.action).toBe('idle')
    expect(controller.direction).toBe('s')

    controller.applyMovement({ x: 6, y: -2 })
    expect(controller.action).toBe('walk')
    expect(controller.direction).toBe('e')
    expect(controller.appearance).toBe(originalAppearance)

    controller.applyMovement({ x: 0, y: 0 })
    expect(controller.action).toBe('idle')
    expect(controller.direction).toBe('e')
    expect(controller.appearance).toBe(originalAppearance)
  })

  it('uses angular hysteresis so tiny motion jitter does not flip direction rows', () => {
    const controller = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, BASE_APPEARANCE)

    controller.applyMovement({ x: 10, y: 0 })
    expect(controller.direction).toBe('e')

    controller.applyMovement({ x: 10, y: 4 })
    expect(controller.direction).toBe('e')

    controller.applyMovement({ x: 10, y: 7 })
    expect(controller.direction).toBe('se')

    controller.applyMovement({ x: 10, y: 4 })
    expect(controller.direction).toBe('se')

    controller.applyMovement({ x: 10, y: 1 })
    expect(controller.direction).toBe('e')
  })

  it('handles sit -> stand transitions without mutating appearance', () => {
    const controller = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, BASE_APPEARANCE)
    const originalAppearance = controller.appearance

    controller.sit()
    expect(controller.action).toBe('sit')
    expect(controller.appearance).toBe(originalAppearance)

    controller.stand()
    expect(controller.action).toBe('stand')
    expect(controller.appearance).toBe(originalAppearance)

    controller.applyMovement({ x: 0, y: 0 })
    expect(controller.action).toBe('idle')
    expect(controller.appearance).toBe(originalAppearance)
  })

  it('keeps appearance immutable except on explicit equip', () => {
    const controller = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, BASE_APPEARANCE)
    const originalAppearance = controller.appearance

    controller.applyMovement({ x: -2, y: 0 })
    expect(controller.appearance).toBe(originalAppearance)

    controller.equip('hat', 'bucket-hat')
    expect(controller.appearance).not.toBe(originalAppearance)
    expect(controller.appearance.hatId).toBe('bucket-hat')
    expect(controller.appearance.topId).toBe('radio-hoodie')
  })

  it('equips a second complete outfit and hat through every action and direction', () => {
    const controller = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, BASE_APPEARANCE)
    controller.equip('top', 'varsity-jacket')
    controller.equip('bottom', 'black-cargos')
    controller.equip('shoes', 'boots')
    controller.equip('hat', 'beanie')

    expect(controller.appearance).toEqual(expect.objectContaining({
      topId: 'varsity-jacket',
      bottomId: 'black-cargos',
      shoesId: 'boots',
      hatId: 'beanie',
    }))

    for (const action of ['idle', 'walk', 'sit', 'stand'] as const) {
      for (const direction of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const) {
        const layers = composeAvatarLayers(DEFAULT_AVATAR_ASSET_MANIFEST, controller.appearance, action, direction, 0)
        expect(layers.find((layer) => layer.slot === 'top')?.id).toBe('varsity-jacket')
        expect(layers.find((layer) => layer.slot === 'hat')?.id).toBe('beanie')
      }
    }
  })

  it('composes independent body, skin, hair, top, bottom, shoes, hat, and accessory layers', () => {
    const controller = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, BASE_APPEARANCE)

    const northLayers = composeAvatarLayers(
      DEFAULT_AVATAR_ASSET_MANIFEST,
      controller.appearance,
      'walk',
      'n',
      2,
    )
    const southLayers = composeAvatarLayers(
      DEFAULT_AVATAR_ASSET_MANIFEST,
      controller.appearance,
      'walk',
      's',
      2,
    )

    const northHatIndex = northLayers.findIndex((layer) => layer.slot === 'hat')
    const northHairIndex = northLayers.findIndex((layer) => layer.slot === 'hair')
    const southHatIndex = southLayers.findIndex((layer) => layer.slot === 'hat')
    const southHairIndex = southLayers.findIndex((layer) => layer.slot === 'hair')

    expect(northLayers).toHaveLength(8)
    expect(southLayers).toHaveLength(8)
    expect(new Set(northLayers.map((layer) => layer.slot))).toEqual(new Set(['body', 'skin', 'hair', 'top', 'bottom', 'shoes', 'hat', 'accessory']))
    expect(new Set(southLayers.map((layer) => layer.slot))).toEqual(new Set(['body', 'skin', 'hair', 'top', 'bottom', 'shoes', 'hat', 'accessory']))
    expect(northHatIndex).toBeLessThan(northHairIndex)
    expect(southHairIndex).toBeLessThan(southHatIndex)

    for (const action of ['walk', 'sit', 'stand'] as const) {
      const layers = composeAvatarLayers(DEFAULT_AVATAR_ASSET_MANIFEST, controller.appearance, action, 's', 0)
      const hat = layers.find((layer) => layer.slot === 'hat')
      expect(hat).toBeDefined()
      expect(hat?.action).toBe(action)
      expect(hat?.frameKey).toContain(action)
    }
  })

  it('rejects unknown items, incompatible body types, and missing wearable frames or anchors', () => {
    const controller = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, BASE_APPEARANCE)

    expect(() => controller.equip('hat', 'missing-hat')).toThrow(/unknown wearable/i)
    expect(() => controller.equip('top', 'fem-dress-top')).toThrow(/incompatible/i)

    expect(() =>
      validateWearableDefinition({
        id: 'broken-hat',
        slot: 'hat',
        compatibleBodyTypes: ['masc'],
        frames: {
          idle: {
            n: ['broken-idle'],
            ne: ['broken-idle'],
            e: ['broken-idle'],
            se: ['broken-idle'],
            s: ['broken-idle'],
            sw: ['broken-idle'],
            w: ['broken-idle'],
            nw: ['broken-idle'],
          },
          walk: {
            n: ['broken-walk'],
            ne: ['broken-walk'],
            e: ['broken-walk'],
            se: ['broken-walk'],
            s: ['broken-walk'],
            sw: ['broken-walk'],
            w: ['broken-walk'],
          },
          sit: {
            n: ['broken-sit'],
            ne: ['broken-sit'],
            e: ['broken-sit'],
            se: ['broken-sit'],
            s: ['broken-sit'],
            sw: ['broken-sit'],
            w: ['broken-sit'],
            nw: ['broken-sit'],
          },
          stand: {
            n: ['broken-stand'],
            ne: ['broken-stand'],
            e: ['broken-stand'],
            se: ['broken-stand'],
            s: ['broken-stand'],
            sw: ['broken-stand'],
            w: ['broken-stand'],
            nw: ['broken-stand'],
          },
        },
        anchors: {
          idle: {
            n: { x: 0, y: 0 },
            ne: { x: 0, y: 0 },
            e: { x: 0, y: 0 },
            se: { x: 0, y: 0 },
            s: { x: 0, y: 0 },
            sw: { x: 0, y: 0 },
            w: { x: 0, y: 0 },
            nw: { x: 0, y: 0 },
          },
          walk: {
            n: { x: 0, y: 0 },
            ne: { x: 0, y: 0 },
            e: { x: 0, y: 0 },
            se: { x: 0, y: 0 },
            s: { x: 0, y: 0 },
            sw: { x: 0, y: 0 },
            w: { x: 0, y: 0 },
          },
          sit: {
            n: { x: 0, y: 0 },
            ne: { x: 0, y: 0 },
            e: { x: 0, y: 0 },
            se: { x: 0, y: 0 },
            s: { x: 0, y: 0 },
            sw: { x: 0, y: 0 },
            w: { x: 0, y: 0 },
            nw: { x: 0, y: 0 },
          },
          stand: {
            n: { x: 0, y: 0 },
            ne: { x: 0, y: 0 },
            e: { x: 0, y: 0 },
            se: { x: 0, y: 0 },
            s: { x: 0, y: 0 },
            sw: { x: 0, y: 0 },
            w: { x: 0, y: 0 },
            nw: { x: 0, y: 0 },
          },
        },
        layerByDirection: {},
      } as never),
    ).toThrow(/direction "nw"/i)

    expect(() =>
      validateWearableDefinition({
        id: 'broken-anchors',
        slot: 'hat',
        compatibleBodyTypes: ['masc'],
        frames: {
          idle: {
            n: ['broken-idle'],
            ne: ['broken-idle'],
            e: ['broken-idle'],
            se: ['broken-idle'],
            s: ['broken-idle'],
            sw: ['broken-idle'],
            w: ['broken-idle'],
            nw: ['broken-idle'],
          },
          walk: {
            n: ['broken-walk'],
            ne: ['broken-walk'],
            e: ['broken-walk'],
            se: ['broken-walk'],
            s: ['broken-walk'],
            sw: ['broken-walk'],
            w: ['broken-walk'],
            nw: ['broken-walk'],
          },
          sit: {
            n: ['broken-sit'],
            ne: ['broken-sit'],
            e: ['broken-sit'],
            se: ['broken-sit'],
            s: ['broken-sit'],
            sw: ['broken-sit'],
            w: ['broken-sit'],
            nw: ['broken-sit'],
          },
          stand: {
            n: ['broken-stand'],
            ne: ['broken-stand'],
            e: ['broken-stand'],
            se: ['broken-stand'],
            s: ['broken-stand'],
            sw: ['broken-stand'],
            w: ['broken-stand'],
            nw: ['broken-stand'],
          },
        },
        anchors: {
          idle: {
            n: { x: 0, y: 0 },
            ne: { x: 0, y: 0 },
            e: { x: 0, y: 0 },
            se: { x: 0, y: 0 },
            s: { x: 0, y: 0 },
            sw: { x: 0, y: 0 },
            w: { x: 0, y: 0 },
            nw: { x: 0, y: 0 },
          },
          walk: {
            n: { x: 0, y: 0 },
            ne: { x: 0, y: 0 },
            e: { x: 0, y: 0 },
            se: { x: 0, y: 0 },
            s: { x: 0, y: 0 },
            sw: { x: 0, y: 0 },
            w: { x: 0, y: 0 },
            nw: { x: 0, y: 0 },
          },
          sit: {
            n: { x: 0, y: 0 },
            ne: { x: 0, y: 0 },
            e: { x: 0, y: 0 },
            se: { x: 0, y: 0 },
            s: { x: 0, y: 0 },
            sw: { x: 0, y: 0 },
            w: { x: 0, y: 0 },
          },
          stand: {
            n: { x: 0, y: 0 },
            ne: { x: 0, y: 0 },
            e: { x: 0, y: 0 },
            se: { x: 0, y: 0 },
            s: { x: 0, y: 0 },
            sw: { x: 0, y: 0 },
            w: { x: 0, y: 0 },
            nw: { x: 0, y: 0 },
          },
        },
        layerByDirection: {},
      } as never),
    ).toThrow(/missing anchors/i)
  })
})
