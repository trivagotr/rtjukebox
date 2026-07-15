export type TouchWorldPoint = Readonly<{ x: number; y: number }>

export type TouchNodeTarget = Readonly<{
  id: string
  x: number
  y: number
  reachable: boolean
}>

export type TouchSeatTarget = Readonly<{
  id: string
  x: number
  y: number
  reachable: boolean
  occupied: boolean
}>

export type TouchPlayerTarget = Readonly<{
  userId: string
  x: number
  y: number
}>

export type TouchIntentResolverInput = Readonly<{
  world: TouchWorldPoint
  uiConsumed: boolean
  seated: boolean
  activeSeatIntentId: string | null
  nodes: readonly TouchNodeTarget[]
  seats: readonly TouchSeatTarget[]
  players: readonly TouchPlayerTarget[]
  seatRadius?: number
  playerRadius?: number
  nodeRadius?: number
}>

export type TouchIntent =
  | Readonly<{ kind: 'ignored'; reason: 'ui-consumed' | 'duplicate-seat' }>
  | Readonly<{ kind: 'stand' }>
  | Readonly<{ kind: 'sit'; seatId: string; target: TouchWorldPoint }>
  | Readonly<{ kind: 'walk'; nodeId: string; target: TouchWorldPoint }>
  | Readonly<{ kind: 'interact-player'; userId: string }>
  | Readonly<{ kind: 'blocked'; reason: 'occupied-seat' | 'unreachable' | 'no-target'; target: TouchWorldPoint }>

function distance(left: TouchWorldPoint, right: TouchWorldPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function nearest<T extends TouchWorldPoint>(world: TouchWorldPoint, targets: readonly T[]): T | null {
  let result: T | null = null
  let resultDistance = Number.POSITIVE_INFINITY
  for (const target of targets) {
    const candidateDistance = distance(world, target)
    if (candidateDistance < resultDistance) {
      result = target
      resultDistance = candidateDistance
    }
  }
  return result
}

const pointOf = (target: TouchWorldPoint): TouchWorldPoint => ({ x: target.x, y: target.y })

export function resolveTouchIntent(input: TouchIntentResolverInput): TouchIntent {
  if (input.uiConsumed) return { kind: 'ignored', reason: 'ui-consumed' }
  if (input.seated) return { kind: 'stand' }

  const player = nearest(input.world, input.players)
  if (player && distance(input.world, player) <= (input.playerRadius ?? 44)) {
    return { kind: 'interact-player', userId: player.userId }
  }

  const seat = nearest(input.world, input.seats)
  if (seat && distance(input.world, seat) <= (input.seatRadius ?? 58)) {
    if (seat.id === input.activeSeatIntentId) return { kind: 'ignored', reason: 'duplicate-seat' }
    if (seat.occupied) return { kind: 'blocked', reason: 'occupied-seat', target: pointOf(seat) }
    if (!seat.reachable) return { kind: 'blocked', reason: 'unreachable', target: pointOf(seat) }
    return { kind: 'sit', seatId: seat.id, target: pointOf(seat) }
  }

  const node = nearest(input.world, input.nodes)
  if (node && distance(input.world, node) <= (input.nodeRadius ?? 180)) {
    if (!node.reachable) return { kind: 'blocked', reason: 'unreachable', target: pointOf(node) }
    return { kind: 'walk', nodeId: node.id, target: pointOf(node) }
  }

  return { kind: 'blocked', reason: 'no-target', target: pointOf(input.world) }
}
