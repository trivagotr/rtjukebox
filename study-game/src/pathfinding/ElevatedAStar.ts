export interface GridPoint {
  x: number
  y: number
  z: number
}

export interface DirectedStairEdge {
  from: GridPoint
  to: GridPoint
}

export interface ElevatedAStarOptions {
  blockedTiles?: Iterable<GridPoint | string>
  stairEdges?: Iterable<DirectedStairEdge | readonly [GridPoint, GridPoint]>
  walkableTiles?: Iterable<GridPoint | string>
}

const GRID_SIZE = 12

const keyOf = (point: GridPoint): string => `${point.x},${point.y},${point.z}`

const clonePoint = (point: GridPoint): GridPoint => ({
  x: point.x,
  y: point.y,
  z: point.z,
})

const isWithinBoard = (point: GridPoint): boolean =>
  point.x >= 0 && point.x < GRID_SIZE && point.y >= 0 && point.y < GRID_SIZE

const parseKey = (value: string): GridPoint => {
  const parts = value.split(',')
  const x = Number(parts[0])
  const y = Number(parts[1])
  const z = Number(parts[2])

  return { x, y, z }
}

const pointFromInput = (value: GridPoint | string): GridPoint => {
  if (typeof value === 'string') {
    return parseKey(value)
  }

  return value
}

const buildBlockedSet = (blockedTiles?: Iterable<GridPoint | string>): Set<string> => {
  const blocked = new Set<string>()

  for (const tile of blockedTiles ?? []) {
    blocked.add(keyOf(pointFromInput(tile)))
  }

  return blocked
}

const buildWalkableSet = (walkableTiles?: Iterable<GridPoint | string>): Set<string> | null => {
  if (!walkableTiles) return null
  const walkable = new Set<string>()
  for (const tile of walkableTiles) walkable.add(keyOf(pointFromInput(tile)))
  return walkable
}

const buildStairMap = (
  stairEdges?: Iterable<DirectedStairEdge | readonly [GridPoint, GridPoint]>,
): Map<string, GridPoint[]> => {
  const stairs = new Map<string, GridPoint[]>()

  for (const edge of stairEdges ?? []) {
    const from = 'from' in edge ? edge.from : edge[0]
    const to = 'to' in edge ? edge.to : edge[1]
    const fromKey = keyOf(from)
    const destinations = stairs.get(fromKey)

    if (destinations) {
      destinations.push(to)
    } else {
      stairs.set(fromKey, [to])
    }
  }

  return stairs
}

const heuristic = (from: GridPoint, goal: GridPoint): number =>
  Math.max(Math.abs(goal.x - from.x), Math.abs(goal.y - from.y))

const isDiagonalStep = (from: GridPoint, to: GridPoint): boolean =>
  from.x !== to.x && from.y !== to.y

const hasBlockedCorner = (
  current: GridPoint,
  neighbor: GridPoint,
  blocked: Set<string>,
): boolean => {
  if (!isDiagonalStep(current, neighbor)) {
    return false
  }

  const horizontal: GridPoint = {
    x: neighbor.x,
    y: current.y,
    z: current.z,
  }
  const vertical: GridPoint = {
    x: current.x,
    y: neighbor.y,
    z: current.z,
  }

  return blocked.has(keyOf(horizontal)) || blocked.has(keyOf(vertical))
}

const reconstructPath = (
  cameFrom: Map<string, string>,
  goalKey: string,
): GridPoint[] => {
  const reversed: GridPoint[] = []
  let currentKey: string | undefined = goalKey

  while (currentKey !== undefined) {
    reversed.push(parseKey(currentKey))
    currentKey = cameFrom.get(currentKey)
  }

  return reversed.reverse().map(clonePoint)
}

export function findElevatedAStarPath(
  start: GridPoint,
  goal: GridPoint,
  options: ElevatedAStarOptions = {},
): GridPoint[] {
  if (!isWithinBoard(start) || !isWithinBoard(goal)) {
    return []
  }

  const blocked = buildBlockedSet(options.blockedTiles)
  const walkable = buildWalkableSet(options.walkableTiles)
  const stairMap = buildStairMap(options.stairEdges)
  const startKey = keyOf(start)
  const goalKey = keyOf(goal)

  if (blocked.has(startKey) || blocked.has(goalKey) || (walkable && (!walkable.has(startKey) || !walkable.has(goalKey)))) {
    return []
  }

  const openSet = new Set<string>([startKey])
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[startKey, 0]])
  const fScore = new Map<string, number>([[startKey, heuristic(start, goal)]])

  const neighborOffsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ] as const

  while (openSet.size > 0) {
    let currentKey: string | undefined
    let currentScore = Number.POSITIVE_INFINITY

    for (const candidate of openSet) {
      const score = fScore.get(candidate) ?? Number.POSITIVE_INFINITY
      if (score < currentScore) {
        currentScore = score
        currentKey = candidate
      }
    }

    if (currentKey === undefined) {
      break
    }

    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, goalKey)
    }

    openSet.delete(currentKey)
    const current = parseKey(currentKey)

    for (const [dx, dy] of neighborOffsets) {
      const neighbor: GridPoint = {
        x: current.x + dx,
        y: current.y + dy,
        z: current.z,
      }

      if (!isWithinBoard(neighbor)) {
        continue
      }

      const neighborKey = keyOf(neighbor)

      if (blocked.has(neighborKey) || (walkable && !walkable.has(neighborKey))) {
        continue
      }

      if (hasBlockedCorner(current, neighbor, blocked)) {
        continue
      }

      const tentativeGScore = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + 1
      if (tentativeGScore < (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(neighborKey, currentKey)
        gScore.set(neighborKey, tentativeGScore)
        fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, goal))
        openSet.add(neighborKey)
      }
    }

    for (const stairTarget of stairMap.get(currentKey) ?? []) {
      if (!isWithinBoard(stairTarget)) {
        continue
      }

      const neighborKey = keyOf(stairTarget)

      if (blocked.has(neighborKey) || (walkable && !walkable.has(neighborKey))) {
        continue
      }

      const tentativeGScore = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + 1
      if (tentativeGScore < (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(neighborKey, currentKey)
        gScore.set(neighborKey, tentativeGScore)
        fScore.set(neighborKey, tentativeGScore + heuristic(stairTarget, goal))
        openSet.add(neighborKey)
      }
    }
  }

  return []
}
