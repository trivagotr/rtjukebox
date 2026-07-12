export type NavigationNode = Readonly<{
  id: string
  x: number
  y: number
  z: number
}>

export type NavigationEdge = Readonly<{
  from: string
  to: string
  kind: 'walk' | 'stair'
}>

const distance = (left: NavigationNode, right: NavigationNode): number =>
  Math.hypot(right.x - left.x, right.y - left.y) + Math.abs(right.z - left.z) * 8

export class NavigationGraph {
  readonly #nodes: ReadonlyMap<string, NavigationNode>
  readonly #neighbors: ReadonlyMap<string, readonly string[]>

  constructor(nodes: readonly NavigationNode[], edges: readonly NavigationEdge[]) {
    const nodeMap = new Map<string, NavigationNode>()
    for (const node of nodes) {
      if (nodeMap.has(node.id)) throw new Error(`Duplicate navigation node ${node.id}`)
      nodeMap.set(node.id, Object.freeze({ ...node }))
    }

    const neighbors = new Map<string, string[]>()
    for (const edge of edges) {
      const from = nodeMap.get(edge.from)
      const to = nodeMap.get(edge.to)
      if (!from || !to) throw new Error(`Navigation edge references unknown node ${!from ? edge.from : edge.to}`)
      if (from.z !== to.z && edge.kind !== 'stair') {
        throw new Error(`Navigation elevation change ${edge.from} -> ${edge.to} must use a stair edge`)
      }
      neighbors.set(edge.from, [...(neighbors.get(edge.from) ?? []), edge.to])
      neighbors.set(edge.to, [...(neighbors.get(edge.to) ?? []), edge.from])
    }

    this.#nodes = nodeMap
    this.#neighbors = neighbors
  }

  node(id: string): NavigationNode | undefined {
    return this.#nodes.get(id)
  }

  findPath(startId: string, goalId: string, blocked = new Set<string>()): string[] {
    const start = this.#nodes.get(startId)
    const goal = this.#nodes.get(goalId)
    if (!start || !goal || blocked.has(startId) || blocked.has(goalId)) return []

    const open = new Set<string>([startId])
    const cameFrom = new Map<string, string>()
    const cost = new Map<string, number>([[startId, 0]])
    const estimate = new Map<string, number>([[startId, distance(start, goal)]])

    while (open.size > 0) {
      let currentId: string | undefined
      let currentEstimate = Number.POSITIVE_INFINITY
      for (const candidate of open) {
        const score = estimate.get(candidate) ?? Number.POSITIVE_INFINITY
        if (score < currentEstimate) {
          currentId = candidate
          currentEstimate = score
        }
      }
      if (!currentId) break
      if (currentId === goalId) {
        const path = [goalId]
        while (cameFrom.has(path[0]!)) path.unshift(cameFrom.get(path[0]!)!)
        return path
      }

      open.delete(currentId)
      const current = this.#nodes.get(currentId)!
      for (const neighborId of this.#neighbors.get(currentId) ?? []) {
        if (blocked.has(neighborId)) continue
        const neighbor = this.#nodes.get(neighborId)!
        const nextCost = (cost.get(currentId) ?? Number.POSITIVE_INFINITY) + distance(current, neighbor)
        if (nextCost >= (cost.get(neighborId) ?? Number.POSITIVE_INFINITY)) continue
        cameFrom.set(neighborId, currentId)
        cost.set(neighborId, nextCost)
        estimate.set(neighborId, nextCost + distance(neighbor, goal))
        open.add(neighborId)
      }
    }

    return []
  }
}
