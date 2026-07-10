import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import sharp from 'sharp'

export const FRAME_WIDTH = 64
export const FRAME_HEIGHT = 96
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
export const LAYERS = ['body', 'skin', 'hair', 'top', 'bottom', 'shoes', 'hat']
export const ACTION_FRAMES = { idle: 1, walk: 4, sit: 1, stand: 3 }
export const WEARABLE_VARIANTS = Object.freeze({
  top: Object.freeze(['radio-hoodie', 'varsity-jacket']),
  bottom: Object.freeze(['jeans', 'black-cargos']),
  shoes: Object.freeze(['sneakers', 'boots']),
  hat: Object.freeze(['bucket-hat', 'beanie']),
})

const DIRECTION_VECTOR = {
  n: [0, -1],
  ne: [0.7, -0.7],
  e: [1, 0],
  se: [0.7, 0.7],
  s: [0, 1],
  sw: [-0.7, 0.7],
  w: [-1, 0],
  nw: [-0.7, -0.7],
}

const WALK_SWING = [-2, 0, 2, 0]
const WALK_BOB = [0, -1, 0, -1]

function n(value) {
  return Math.round(value * 10) / 10
}

function rect(x, y, width, height, fill, stroke = 'none', strokeWidth = 0) {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
}

function polygon(points, fill, stroke = 'none', strokeWidth = 0) {
  const value = points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
  return `<polygon points="${value}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
}

function seatedAmount(action, frame) {
  if (action === 'sit') return 1
  if (action === 'stand') return 1 - frame / Math.max(1, ACTION_FRAMES.stand - 1)
  return 0
}

function pose(direction, action, frame) {
  const [dx, dy] = DIRECTION_VECTOR[direction]
  const seated = seatedAmount(action, frame)
  const swing = action === 'walk' ? WALK_SWING[frame] : 0
  const bob = action === 'walk' ? WALK_BOB[frame] : 0

  return {
    action,
    bob,
    dx,
    dy,
    faceOffset: dx * 2,
    headY: 14 + seated * 10 + bob,
    hipY: 60 + seated * 7 + bob,
    seated,
    swing,
    torsoY: 38 + seated * 8 + bob,
  }
}

function bodyLayer(p) {
  const ink = '#15232a'
  const headX = 22 + p.faceOffset
  const torsoBottom = p.hipY + 4
  const legLength = 22 - p.seated * 10
  const forwardX = p.dx * p.seated * 9
  const forwardY = Math.max(0, p.dy) * p.seated * 5

  return [
    rect(headX - 2, p.headY - 2, 24, 25, ink),
    polygon(
      [
        [23, p.torsoY - 2],
        [41, p.torsoY - 2],
        [45, torsoBottom],
        [19, torsoBottom],
      ],
      ink,
    ),
    rect(19 + forwardX, torsoBottom - 1 + forwardY, 11, legLength, ink),
    rect(34 + forwardX, torsoBottom - 1 + forwardY, 11, legLength, ink),
    rect(17 + forwardX, torsoBottom + legLength - 3 + forwardY, 14, 7, ink),
    rect(33 + forwardX, torsoBottom + legLength - 3 + forwardY, 14, 7, ink),
  ].join('')
}

function skinLayer(p) {
  const skin = '#d9a178'
  const shade = '#b87558'
  const eye = '#18242b'
  const headX = 22 + p.faceOffset
  const armSwing = p.swing * 0.8
  const armY = p.torsoY + 5
  const showFace = p.dy >= -0.05
  const eyeShift = p.dx * 2

  const shapes = [
    rect(headX, p.headY, 20, 21, skin, shade, 1),
    rect(headX - 2, p.headY + 8, 3, 7, skin),
    rect(headX + 19, p.headY + 8, 3, 7, skin),
    polygon([[23, armY], [28, armY + 1], [25, armY + 22 + armSwing], [20, armY + 21 + armSwing]], skin, shade, 1),
    polygon([[36, armY + 1], [41, armY], [44, armY + 21 - armSwing], [39, armY + 22 - armSwing]], skin, shade, 1),
    rect(20, armY + 20 + armSwing, 6, 5, skin, shade, 1),
    rect(39, armY + 20 - armSwing, 6, 5, skin, shade, 1),
  ]

  if (showFace) {
    shapes.push(rect(headX + 5 + eyeShift, p.headY + 9, 2, 3, eye))
    shapes.push(rect(headX + 13 + eyeShift, p.headY + 9, 2, 3, eye))
    if (p.dy > 0.4) shapes.push(rect(headX + 9 + eyeShift, p.headY + 16, 4, 1.5, shade))
  }

  return shapes.join('')
}

function hairLayer(p) {
  const hair = '#4a2d24'
  const highlight = '#704539'
  const headX = 22 + p.faceOffset
  const fringeY = p.dy >= 0 ? p.headY + 6 : p.headY + 2
  return [
    rect(headX - 1, p.headY - 2, 22, 8, hair),
    rect(headX - 1, p.headY + 3, 5, 10, hair),
    rect(headX + 16, p.headY + 3, 5, 10, hair),
    p.dy >= -0.05 ? polygon([[headX + 3, fringeY], [headX + 9, fringeY], [headX + 7, fringeY + 5], [headX + 13, fringeY], [headX + 18, fringeY]], hair) : '',
    rect(headX + 4, p.headY, 12, 2, highlight),
  ].join('')
}

function topLayer(p, variant = 'radio-hoodie') {
  const varsity = variant === 'varsity-jacket'
  const top = varsity ? '#9e3f4f' : '#2f8f8a'
  const dark = varsity ? '#5f2735' : '#1f5c62'
  const trim = varsity ? '#f2dfbd' : '#f0e9d2'
  const bottom = p.hipY + 2
  return [
    polygon([[24, p.torsoY], [40, p.torsoY], [43, bottom], [21, bottom]], top, dark, 1),
    polygon([[23, p.torsoY + 1], [28, p.torsoY + 2], [26, p.torsoY + 15], [21, p.torsoY + 14]], varsity ? trim : top, dark, 1),
    polygon([[36, p.torsoY + 2], [41, p.torsoY + 1], [43, p.torsoY + 14], [38, p.torsoY + 15]], varsity ? trim : top, dark, 1),
    polygon([[28, p.torsoY], [32, p.torsoY + 5], [36, p.torsoY]], trim),
    rect(31, p.torsoY + 5, 2, Math.max(3, bottom - p.torsoY - 7), dark),
    varsity ? rect(25, bottom - 4, 14, 2, trim) : '',
  ].join('')
}

function bottomLayer(p, variant = 'jeans') {
  const cargo = variant === 'black-cargos'
  const pants = cargo ? '#343942' : '#24466d'
  const shade = cargo ? '#191d24' : '#172d4d'
  const waistY = p.hipY
  const legLength = 20 - p.seated * 9
  const forwardX = p.dx * p.seated * 9
  const forwardY = Math.max(0, p.dy) * p.seated * 5
  const leftSwing = p.action === 'walk' ? p.swing : 0
  const rightSwing = -leftSwing

  return [
    rect(22, waistY - 2, 20, 7, pants, shade, 1),
    polygon([[22, waistY + 3], [31, waistY + 3], [30 + forwardX, waistY + legLength + leftSwing + forwardY], [20 + forwardX, waistY + legLength + leftSwing + forwardY]], pants, shade, 1),
    polygon([[33, waistY + 3], [42, waistY + 3], [44 + forwardX, waistY + legLength + rightSwing + forwardY], [34 + forwardX, waistY + legLength + rightSwing + forwardY]], pants, shade, 1),
    rect(24, waistY, 1.5, Math.max(3, legLength - 2), cargo ? '#555e69' : '#315981'),
    cargo ? rect(35 + forwardX, waistY + 8 + forwardY, 7, 5, '#252a31', shade, 1) : '',
  ].join('')
}

function shoesLayer(p, variant = 'sneakers') {
  const boots = variant === 'boots'
  const shoe = boots ? '#30333a' : '#e7d6b7'
  const sole = boots ? '#11161c' : '#6b5142'
  const legLength = 20 - p.seated * 9
  const forwardX = p.dx * p.seated * 9
  const forwardY = Math.max(0, p.dy) * p.seated * 5
  const leftSwing = p.action === 'walk' ? p.swing : 0
  const rightSwing = -leftSwing
  const leftY = p.hipY + legLength + leftSwing + forwardY - 1
  const rightY = p.hipY + legLength + rightSwing + forwardY - 1
  const directionNudge = p.dx * 2

  return [
    rect(18 + forwardX + directionNudge, leftY - (boots ? 2 : 0), 13, boots ? 8 : 6, shoe, sole, 1),
    rect(33 + forwardX + directionNudge, rightY - (boots ? 2 : 0), 13, boots ? 8 : 6, shoe, sole, 1),
    rect(18 + forwardX + directionNudge, leftY + 5, 13, 2, sole),
    rect(33 + forwardX + directionNudge, rightY + 5, 13, 2, sole),
  ].join('')
}

function hatLayer(p, variant = 'bucket-hat') {
  const beanie = variant === 'beanie'
  const crown = beanie ? '#8f4058' : '#d9ad3d'
  const band = beanie ? '#5e263b' : '#243d55'
  const brim = beanie ? '#5e263b' : '#b78022'
  const headX = 22 + p.faceOffset
  const brimOffset = p.dx * 5
  if (beanie) {
    return [
      polygon([[headX + 3, p.headY - 8], [headX + 16, p.headY - 8], [headX + 20, p.headY], [headX, p.headY]], crown, band, 1),
      rect(headX, p.headY - 2, 20, 4, band, '#351827', 1),
      rect(headX + 8, p.headY - 10, 4, 3, '#bd6a7c'),
    ].join('')
  }
  return [
    polygon([[headX + 2, p.headY - 6], [headX + 17, p.headY - 6], [headX + 20, p.headY + 1], [headX, p.headY + 1]], crown, '#694c1d', 1),
    rect(headX, p.headY - 1, 20, 4, band),
    p.dy >= -0.05 ? rect(headX + 6 + brimOffset, p.headY + 2, 14, 3, brim, '#694c1d', 1) : rect(headX + 3, p.headY + 1, 14, 2, brim),
    rect(headX + 7, p.headY - 8, 6, 2, '#f0d178'),
  ].join('')
}

const LAYER_RENDERER = {
  body: bodyLayer,
  skin: skinLayer,
  hair: hairLayer,
  top: topLayer,
  bottom: bottomLayer,
  shoes: shoesLayer,
  hat: hatLayer,
}

function createSheetSvg(layer, action, frameCount, variant) {
  const width = FRAME_WIDTH * frameCount
  const height = FRAME_HEIGHT * DIRECTIONS.length
  const groups = []

  for (let row = 0; row < DIRECTIONS.length; row += 1) {
    const direction = DIRECTIONS[row]
    for (let frame = 0; frame < frameCount; frame += 1) {
      const x = frame * FRAME_WIDTH
      const y = row * FRAME_HEIGHT
      groups.push(`<g transform="translate(${x} ${y})">${LAYER_RENDERER[layer](pose(direction, action, frame), variant)}</g>`)
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${groups.join('')}</svg>`
}

export async function generateAvatarAssets(outputDir) {
  await mkdir(outputDir, { recursive: true })
  const sheets = Object.fromEntries(LAYERS.map((layer) => [layer, {}]))
  const sha256 = Object.fromEntries(LAYERS.map((layer) => [layer, {}]))
  const wearables = Object.fromEntries(Object.keys(WEARABLE_VARIANTS).map((slot) => [slot, {}]))
  const wearableSha256 = Object.fromEntries(Object.keys(WEARABLE_VARIANTS).map((slot) => [slot, {}]))

  for (const layer of LAYERS) {
    for (const [action, frameCount] of Object.entries(ACTION_FRAMES)) {
      const fileName = `${layer}-${action}.png`
      const svg = createSheetSvg(layer, action, frameCount)
      const image = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
      await writeFile(path.join(outputDir, fileName), image)
      sheets[layer][action] = fileName
      sha256[layer][action] = createHash('sha256').update(image).digest('hex')
    }
  }

  for (const [slot, itemIds] of Object.entries(WEARABLE_VARIANTS)) {
    for (const itemId of itemIds) {
      wearables[slot][itemId] = {}
      wearableSha256[slot][itemId] = {}
      for (const [action, frameCount] of Object.entries(ACTION_FRAMES)) {
        const fileName = `${slot}-${itemId}-${action}.png`
        const svg = createSheetSvg(slot, action, frameCount, itemId)
        const image = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
        await writeFile(path.join(outputDir, fileName), image)
        wearables[slot][itemId][action] = fileName
        wearableSha256[slot][itemId][action] = createHash('sha256').update(image).digest('hex')
      }
    }
  }

  const manifest = {
    schemaVersion: 2,
    provenance: {
      generator: 'study-game/scripts/generate-engine-avatar-assets.mjs',
      license: 'RadioTEDU project-owned original procedural artwork',
      thirdPartyArtwork: false,
    },
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    directions: DIRECTIONS,
    layers: LAYERS,
    actionFrames: ACTION_FRAMES,
    sheets,
    sha256,
    wearables,
    wearableSha256,
  }
  const manifestPath = path.join(outputDir, 'manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifestPath
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  const outputDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve('public', 'assets', 'avatars', 'engine-proof')
  const manifestPath = await generateAvatarAssets(outputDir)
  process.stdout.write(`${manifestPath}\n`)
}
