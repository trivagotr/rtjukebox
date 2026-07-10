import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

import sharp from 'sharp'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const studyRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(studyRoot, '..')
const prototypeRoot = path.join(repoRoot, 'prototypes', 'library-study')

function extractLiteral(source, name) {
  const marker = `const ${name} =`
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) throw new Error(`Could not find ${name}`)
  let start = markerIndex + marker.length
  while (/\s/.test(source[start] ?? '')) start += 1
  const open = source[start]
  const close = open === '{' ? '}' : open === '[' ? ']' : ''
  if (!close) throw new Error(`${name} is not an object or array literal`)

  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character
      continue
    }
    if (character === open) depth += 1
    if (character === close) {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`Unclosed ${name} literal`)
}

function evaluateLiteral(source, name) {
  return vm.runInNewContext(`(${extractLiteral(source, name)})`, Object.create(null), { timeout: 1_000 })
}

function dedupeEdges(edges) {
  const unique = new Map()
  for (const edge of edges) {
    const ends = [edge.from, edge.to].sort()
    unique.set(`${ends[0]}|${ends[1]}`, { ...edge, from: ends[0], to: ends[1] })
  }
  return [...unique.values()]
}

const facingCode = (facing) => ({ north: 'n', east: 'e', south: 's', west: 'w' })[facing] ?? 's'

async function imageRecord(fileName) {
  const absolutePath = path.join(studyRoot, 'public', 'assets', 'rooms', fileName)
  const bytes = await readFile(absolutePath)
  const metadata = await sharp(bytes).metadata()
  return {
    url: `assets/rooms/${fileName}`,
    width: metadata.width,
    height: metadata.height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sourcePath: absolutePath,
  }
}

const safeFileName = (value) => value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()

async function createCutout(sourcePath, image, points, destinationPath) {
  const pixelPoints = points.map((point) => ({ x: (point.x / 100) * image.width, y: (point.y / 100) * image.height }))
  const left = Math.max(0, Math.floor(Math.min(...pixelPoints.map((point) => point.x))))
  const top = Math.max(0, Math.floor(Math.min(...pixelPoints.map((point) => point.y))))
  const right = Math.min(image.width, Math.ceil(Math.max(...pixelPoints.map((point) => point.x))) + 1)
  const bottom = Math.min(image.height, Math.ceil(Math.max(...pixelPoints.map((point) => point.y))) + 1)
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const polygon = pixelPoints.map((point) => `${point.x - left},${point.y - top}`).join(' ')
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><polygon points="${polygon}" fill="#fff"/></svg>`)
  await sharp(sourcePath)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toFile(destinationPath)
  return { x: left, y: top, width, height }
}

function seatForegroundPoints(seat) {
  if (seat.foregroundMask?.length >= 3) return seat.foregroundMask
  if (seat.occlusion) {
    return [
      { x: seat.occlusion.x1, y: seat.occlusion.y1 }, { x: seat.occlusion.x2, y: seat.occlusion.y1 },
      { x: seat.occlusion.x2, y: seat.occlusion.y2 }, { x: seat.occlusion.x1, y: seat.occlusion.y2 },
    ]
  }
  return [
    { x: seat.sit.x - 4, y: seat.sit.y - 1 }, { x: seat.sit.x + 4, y: seat.sit.y - 1 },
    { x: seat.sit.x + 4, y: seat.sit.y + 4 }, { x: seat.sit.x - 4, y: seat.sit.y + 4 },
  ]
}

async function compileRoomCutouts(room, image, assetOutputRoot) {
  const roomOutput = path.join(assetOutputRoot, room.id)
  await mkdir(roomOutput, { recursive: true })
  const occluders = []
  for (const occluder of room.occluders) {
    const fileName = `object-${safeFileName(occluder.id)}.png`
    const placement = await createCutout(image.sourcePath, image, occluder.points, path.join(roomOutput, fileName))
    occluders.push({
      ...occluder,
      asset: { url: `assets/rooms/occlusion/${room.id}/${fileName}`, ...placement },
    })
  }
  const seats = []
  for (const seat of room.seats) {
    const fileName = `seat-${safeFileName(seat.id)}.png`
    const placement = await createCutout(image.sourcePath, image, seatForegroundPoints(seat), path.join(roomOutput, fileName))
    seats.push({
      ...seat,
      foregroundAsset: { url: `assets/rooms/occlusion/${room.id}/${fileName}`, ...placement },
    })
  }
  const { sourcePath: _sourcePath, ...publicImage } = image
  return { ...room, image: publicImage, occluders, seats }
}

function libraryRoomData(appSource, mapMask) {
  const walkableTiles = evaluateLiteral(appSource, 'WALKABLE_TILES')
  const chairTargets = evaluateLiteral(appSource, 'CHAIR_SEAT_TARGETS')
  const nodes = Object.entries(walkableTiles).map(([id, node]) => ({ id, x: node.x, y: node.y, z: 0 }))
  const edges = []
  for (const [id, node] of Object.entries(walkableTiles)) {
    for (const neighbor of node.neighbors ?? []) {
      if (walkableTiles[neighbor]) edges.push({ from: id, to: neighbor, kind: 'walk' })
    }
  }

  const seats = chairTargets.map((seat) => {
    const approachNodeId = `approach:${seat.seatId}`
    nodes.push({ id: approachNodeId, x: seat.standX, y: seat.standY, z: 0 })
    const entryNodeId = walkableTiles[seat.entryTileId] ? seat.entryTileId : 'bottom-center-aisle'
    edges.push({ from: entryNodeId, to: approachNodeId, kind: 'walk' })
    return {
      id: seat.seatId,
      label: seat.label,
      approachNodeId,
      sit: { x: seat.sitX, y: seat.sitY, z: Number(seat.seatZ ?? 0) },
      facing: facingCode(seat.facing),
      foregroundMask: seat.foregroundMask ?? null,
      occlusion: seat.occlusion ?? null,
    }
  })
  const occluderTypes = new Set(['desk', 'sofa', 'shelf', 'plant', 'wall-fixture'])
  const occluders = mapMask.blockedPolygons.filter((zone) => occluderTypes.has(zone.type)).map((zone) => ({
    id: zone.id,
    type: zone.type,
    points: zone.points.map((point) => ({
      x: (point.x / mapMask.imageWidth) * 100,
      y: (point.y / mapMask.imageHeight) * 100,
    })),
    depthY: (Math.max(...zone.points.map((point) => point.y)) / mapMask.imageHeight) * 100,
  }))

  return {
    id: 'library',
    title: 'Library',
    spawnNodeId: 'bottom-center-aisle',
    nodes,
    edges: dedupeEdges(edges),
    seats,
    occluders,
    actors: {},
  }
}

function chimNodeElevation(id) {
  if (/row-1|stair-1/.test(id)) return 1
  if (/row-2|stair-2/.test(id)) return 2
  if (/row-3|stair-[34]|courtyard|spark/.test(id)) return 3
  return 0
}

function chimRoomData(chimSource) {
  const walkNodes = evaluateLiteral(chimSource, 'WALK_NODES')
  const walkEdges = evaluateLiteral(chimSource, 'WALK_EDGES')
  const nodes = Object.entries(walkNodes).map(([id, node]) => ({ id, x: node.x, y: node.y, z: chimNodeElevation(id) }))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const edges = walkEdges.map(([from, to]) => ({
    from,
    to,
    kind: nodeById.get(from).z === nodeById.get(to).z ? 'walk' : 'stair',
  }))
  const seats = []
  for (let row = 1; row <= 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const approachNodeId = `row-${row}-${['left', 'mid', 'right'][column]}`
      const node = nodeById.get(approachNodeId)
      seats.push({
        id: `amfi-${['a', 'b', 'c'][row - 1]}${column + 1}`,
        label: `Amphitheatre row ${row}`,
        approachNodeId,
        sit: { x: node.x, y: node.y - 0.7, z: node.z },
        facing: 's',
        foregroundMask: [
          { x: node.x - 5, y: node.y - 0.2 },
          { x: node.x + 5, y: node.y - 0.2 },
          { x: node.x + 5, y: node.y + 2.2 },
          { x: node.x - 5, y: node.y + 2.2 },
        ],
        occlusion: null,
      })
    }
  }

  return {
    id: 'chim-alan',
    title: 'Cim Alan',
    spawnNodeId: 'entrance',
    nodes,
    edges,
    seats,
    occluders: [
      { id: 'amphi-row-front-1', type: 'amphitheatre-front', points: [{ x: 34, y: 48 }, { x: 85, y: 44.5 }, { x: 85, y: 48 }, { x: 34, y: 52 }], depthY: 52 },
      { id: 'amphi-row-front-2', type: 'amphitheatre-front', points: [{ x: 34, y: 41 }, { x: 85, y: 37.5 }, { x: 85, y: 41 }, { x: 34, y: 45 }], depthY: 45 },
      { id: 'amphi-row-front-3', type: 'amphitheatre-front', points: [{ x: 34, y: 34 }, { x: 85, y: 30.5 }, { x: 85, y: 34 }, { x: 34, y: 38 }], depthY: 38 },
    ],
    actors: {
      spark: { nodeId: 'spark', name: 'Spark', label: 'rtAI - AI Host' },
      rock: { nodeId: 'rock', name: 'Rock', label: 'Rock' },
    },
  }
}

export async function generateImageRoomData(
  outputPath = path.join(studyRoot, 'src', 'rooms', 'data', 'image-rooms.generated.json'),
  assetOutputRoot = path.join(studyRoot, 'public', 'assets', 'rooms', 'occlusion'),
) {
  const [appSource, chimSource, libraryMapMask, libraryImage, chimImage] = await Promise.all([
    readFile(path.join(prototypeRoot, 'app.js'), 'utf8'),
    readFile(path.join(prototypeRoot, 'chim.js'), 'utf8'),
    readFile(path.join(prototypeRoot, 'data', 'library-habbo-map-mask.json'), 'utf8').then(JSON.parse),
    imageRecord('library.png'),
    imageRecord('chim-alan.png'),
  ])
  const library = await compileRoomCutouts(libraryRoomData(appSource, libraryMapMask), libraryImage, assetOutputRoot)
  const chim = await compileRoomCutouts(chimRoomData(chimSource), chimImage, assetOutputRoot)
  const output = {
    schemaVersion: 1,
    provenance: {
      authorization: 'User supplied these exact two room images for RadioTEDU Study on 2026-07-10.',
      navigationSource: 'Preserved project-authored prototype semantic maps; renderer/runtime code is not reused.',
    },
    rooms: { library, 'chim-alan': chim },
  }
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  return outputPath
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) {
  const outputPath = await generateImageRoomData(process.argv[2] ? path.resolve(process.argv[2]) : undefined)
  process.stdout.write(`${outputPath}\n`)
}
