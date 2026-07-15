import {
  isElevatedSegmentWalkable,
  type DirectedStairEdge,
  type ElevatedAStarOptions,
  type GridPoint,
} from './ElevatedAStar'
import type { NavigationEdge, NavigationNode } from './NavigationGraph'

type SegmentProbe<T> = (segment: readonly T[]) => boolean

function smoothRoute<T>(path: readonly T[], canTraverse: SegmentProbe<T>): T[] {
  if (path.length <= 1) return [...path]

  const smoothed: T[] = [path[0]!]
  let anchorIndex = 0

  while (anchorIndex < path.length - 1) {
    let nextIndex = anchorIndex + 1
    for (let candidateIndex = path.length - 1; candidateIndex > anchorIndex + 1; candidateIndex -= 1) {
      if (canTraverse(path.slice(anchorIndex, candidateIndex + 1))) {
        nextIndex = candidateIndex
        break
      }
    }
    smoothed.push(path[nextIndex]!)
    anchorIndex = nextIndex
  }

  return smoothed
}

const gridKey = (point: GridPoint): string => `${point.x},${point.y},${point.z}`
const directedEdgeKey = (from: GridPoint, to: GridPoint): string => `${gridKey(from)}>${gridKey(to)}`

function stairEdgeKeys(
  stairEdges?: Iterable<DirectedStairEdge | readonly [GridPoint, GridPoint]>,
): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const edge of stairEdges ?? []) {
    const from = 'from' in edge ? edge.from : edge[0]
    const to = 'to' in edge ? edge.to : edge[1]
    keys.add(directedEdgeKey(from, to))
    keys.add(directedEdgeKey(to, from))
  }
  return keys
}

export function smoothElevatedRoute(
  path: readonly GridPoint[],
  options: ElevatedAStarOptions = {},
): GridPoint[] {
  const stairs = stairEdgeKeys(options.stairEdges)
  return smoothRoute(path, (segment) => {
    if (segment.length <= 2) return true
    for (let index = 1; index < segment.length; index += 1) {
      const from = segment[index - 1]!
      const to = segment[index]!
      if (from.z !== to.z || stairs.has(directedEdgeKey(from, to))) return false
    }
    return isElevatedSegmentWalkable(segment[0]!, segment.at(-1)!, options)
  })
}

const navigationEdgeKey = (from: string, to: string): string =>
  from < to ? `${from}|${to}` : `${to}|${from}`

function navigationEdgeKinds(edges: readonly NavigationEdge[]): ReadonlyMap<string, NavigationEdge['kind']> {
  return new Map(edges.map((edge) => [navigationEdgeKey(edge.from, edge.to), edge.kind]))
}

export function isNavigationSegmentSafe(
  segment: readonly NavigationNode[],
  edges: readonly NavigationEdge[],
): boolean {
  if (segment.length <= 2) return true
  const edgeKinds = navigationEdgeKinds(edges)
  const first = segment[0]!
  const last = segment.at(-1)!

  for (let index = 1; index < segment.length; index += 1) {
    const from = segment[index - 1]!
    const to = segment[index]!
    if (from.z !== to.z || edgeKinds.get(navigationEdgeKey(from.id, to.id)) !== 'walk') return false
  }

  if (edgeKinds.get(navigationEdgeKey(first.id, last.id)) === 'walk') return true
  if (segment.some((point) => point.z !== first.z)) return false

  const dx = last.x - first.x
  const dy = last.y - first.y
  const lengthSquared = (dx * dx) + (dy * dy)
  if (lengthSquared === 0) return false

  return segment.slice(1, -1).every((point) => {
    const offsetX = point.x - first.x
    const offsetY = point.y - first.y
    const cross = Math.abs((offsetX * dy) - (offsetY * dx))
    const dot = (offsetX * dx) + (offsetY * dy)
    return cross <= 1e-6 && dot > 0 && dot < lengthSquared
  })
}

export function smoothNavigationRoute(
  path: readonly NavigationNode[],
  edges: readonly NavigationEdge[],
): NavigationNode[] {
  return smoothRoute(path, (segment) => isNavigationSegmentSafe(segment, edges))
}
