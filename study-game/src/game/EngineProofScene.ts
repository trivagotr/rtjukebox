import Phaser from 'phaser'

import { DIRECTIONS, type AvatarAction, type AvatarAppearance, type AvatarLayerSlot, type Direction8 } from '../avatar/AvatarAppearance'
import { DEFAULT_AVATAR_ASSET_MANIFEST } from '../avatar/AvatarAssetManifest'
import type { GridPoint, TileDefinition } from '../rooms/RoomDefinition'
import { engineProofRoom, engineProofStairEdges } from '../rooms/engineProof.room'
import { AvatarController } from './AvatarController'
import { DepthController } from './DepthController'
import { InteractionController } from './InteractionController'
import { RoomController } from './RoomController'

const TILE_WIDTH = 72
const TILE_HEIGHT = 36
const ELEVATION_HEIGHT = 28
const ACTION_FRAMES: Record<AvatarAction, number> = { idle: 1, walk: 4, sit: 1, stand: 3 }
const AVATAR_LAYERS: AvatarLayerSlot[] = ['body', 'skin', 'hair', 'top', 'bottom', 'shoes', 'hat']
const AVATAR_ASSET_BASE = `${import.meta.env.BASE_URL}assets/avatars/engine-proof`

type PointLike = { x: number; y: number }

const asVectors = (points: readonly PointLike[]): Phaser.Math.Vector2[] =>
  points.map(({ x, y }) => new Phaser.Math.Vector2(x, y))

type RexQuadGrid = {
  getTileXY(worldX: number, worldY: number): { x: number; y: number }
  getWorldXY(tileX: number, tileY: number): { x: number; y: number }
}

type RexBoardPluginApi = {
  add: {
    quadGrid(config: {
      x: number
      y: number
      cellWidth: number
      cellHeight: number
      type: 'isometric'
    }): RexQuadGrid
  }
}

type GameState = 'ready' | 'walking' | 'stair' | 'seated' | 'standing'

const appearance: AvatarAppearance = {
  bodyType: 'masc',
  skinTone: 'warm',
  hairId: 'short-hair',
  hairColor: 'brown',
  topId: 'radio-hoodie',
  bottomId: 'jeans',
  shoesId: 'sneakers',
  hatId: 'bucket-hat',
  accessoryId: null,
}

function directionDelta(direction: Direction8): { x: number; y: number } {
  return {
    n: { x: 0, y: -1 },
    ne: { x: 1, y: -1 },
    e: { x: 1, y: 0 },
    se: { x: 1, y: 1 },
    s: { x: 0, y: 1 },
    sw: { x: -1, y: 1 },
    w: { x: -1, y: 0 },
    nw: { x: -1, y: -1 },
  }[direction]
}

function pathDirectionTurns(path: readonly GridPoint[]): number {
  let turns = 0
  let previous = ''
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!
    const to = path[index]!
    const direction = `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`
    if (previous && previous !== direction) turns += 1
    previous = direction
  }
  return turns
}

export class EngineProofScene extends Phaser.Scene {
  readonly #roomController = new RoomController(engineProofRoom, engineProofStairEdges)
  readonly #interaction = new InteractionController()
  readonly #depth = new DepthController()
  readonly #avatarController = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, appearance)
  readonly #avatarSprites = new Map<AvatarLayerSlot, Phaser.GameObjects.Sprite>()
  #grid!: RexQuadGrid
  #avatar!: Phaser.GameObjects.Container
  #shadow!: Phaser.GameObjects.Ellipse
  #chairFront!: Phaser.GameObjects.Graphics
  #currentTile: GridPoint = { ...engineProofRoom.spawn }
  #state: GameState = 'ready'
  #movement: Promise<void> | null = null
  #lastPathLength = 0
  #lastDirectionTurns = 0

  constructor() {
    super('engine-proof')
  }

  preload(): void {
    for (const layer of AVATAR_LAYERS) {
      for (const [action, frames] of Object.entries(ACTION_FRAMES) as Array<[AvatarAction, number]>) {
        this.load.spritesheet(
          this.#textureKey(layer, action),
          `${AVATAR_ASSET_BASE}/${layer}-${action}.png`,
          { frameWidth: 64, frameHeight: 96, endFrame: DIRECTIONS.length * frames - 1 },
        )
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b151b')
    this.cameras.main.setRoundPixels(true)
    this.#grid = (this as unknown as { rexBoard: RexBoardPluginApi }).rexBoard.add.quadGrid({
      x: 550,
      y: 104,
      cellWidth: TILE_WIDTH,
      cellHeight: TILE_HEIGHT,
      type: 'isometric',
    })

    this.#drawRoom()
    this.#createAvatar()
    this.#bindPointerMovement()
    this.#bindHud()
    this.#exposeDebugApi()
    this.#setState('ready')
    document.documentElement.dataset.engineProof = 'ready'
  }

  #textureKey(layer: AvatarLayerSlot, action: AvatarAction): string {
    return `avatar-${layer}-${action}`
  }

  #tileWorld(point: GridPoint): { x: number; y: number } {
    const world = this.#grid.getWorldXY(point.x, point.y)
    return { x: world.x, y: world.y - point.z * ELEVATION_HEIGHT }
  }

  #diamond(point: GridPoint): Phaser.Math.Vector2[] {
    const center = this.#tileWorld(point)
    return asVectors([
      { x: center.x, y: center.y - TILE_HEIGHT / 2 },
      { x: center.x + TILE_WIDTH / 2, y: center.y },
      { x: center.x, y: center.y + TILE_HEIGHT / 2 },
      { x: center.x - TILE_WIDTH / 2, y: center.y },
    ])
  }

  #drawRoom(): void {
    const roomBackdrop = this.add.graphics().setDepth(-1000)
    roomBackdrop.fillStyle(0x0e2028, 1)
    roomBackdrop.fillRect(0, 0, 1100, 760)
    roomBackdrop.fillStyle(0x122f38, 1)
    roomBackdrop.fillRect(0, 560, 1100, 200)

    const floor = this.add.graphics().setDepth(-500)
    const orderedTiles = [...engineProofRoom.tiles].sort(
      (left, right) => left.position.x + left.position.y - (right.position.x + right.position.y),
    )
    for (const tile of orderedTiles) {
      const { position } = tile
      const points = this.#diamond(position)
      const raised = position.z === 1

      if (raised) {
        const center = this.#tileWorld(position)
        floor.fillStyle(0x173a42, 1)
        floor.fillPoints(asVectors([
          points[1]!,
          points[2]!,
          { x: center.x, y: center.y + TILE_HEIGHT / 2 + ELEVATION_HEIGHT },
          { x: center.x + TILE_WIDTH / 2, y: center.y + ELEVATION_HEIGHT },
        ]), true)
        floor.fillStyle(0x1c4649, 1)
        floor.fillPoints(asVectors([
          points[2]!,
          points[3]!,
          { x: center.x - TILE_WIDTH / 2, y: center.y + ELEVATION_HEIGHT },
          { x: center.x, y: center.y + TILE_HEIGHT / 2 + ELEVATION_HEIGHT },
        ]), true)
      }

      const checker = (position.x + position.y) % 2 === 0
      floor.fillStyle(raised ? (checker ? 0x5c8d72 : 0x568268) : checker ? 0x285d68 : 0x2d6872, 1)
      floor.lineStyle(1, raised ? 0x9abf8e : 0x72a9ad, 0.38)
      floor.fillPoints(points, true)
      floor.strokePoints(points, true)
    }

    this.#drawStairs()
    for (const object of engineProofRoom.objects.filter((item) => item.id.startsWith('proof-block'))) {
      this.#drawBlock(object.tile, object.id === 'proof-block-c' ? 0x865c73 : 0xc18b45)
    }
    this.#drawChair()

    this.add.text(32, 30, 'RADIOTEDU STUDY', {
      color: '#dff5ed',
      fontFamily: 'Consolas, monospace',
      fontSize: '15px',
    }).setDepth(3000)
    this.add.text(32, 52, 'ENGINE PROOF / LAYERED AVATAR', {
      color: '#7fa7aa',
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: '12px',
    }).setDepth(3000)
  }

  #drawStairs(): void {
    const stairs = this.add.graphics().setDepth(this.#depth.tile({ x: 10, y: 5, z: 1 }, 10))
    const from = this.#tileWorld({ x: 11, y: 5, z: 0 })
    const to = this.#tileWorld({ x: 10, y: 5, z: 1 })
    for (let step = 0; step < 5; step += 1) {
      const progress = step / 4
      const x = Phaser.Math.Linear(from.x, to.x, progress)
      const y = Phaser.Math.Linear(from.y, to.y, progress)
      const width = 38
      const height = 10
      stairs.fillStyle(step % 2 === 0 ? 0xd4d0ad : 0xb9b996, 1)
      stairs.lineStyle(1, 0x4a5b56, 1)
      const points = asVectors([
        { x, y: y - height / 2 },
        { x: x + width / 2, y },
        { x, y: y + height / 2 },
        { x: x - width / 2, y },
      ])
      stairs.fillPoints(points, true)
      stairs.strokePoints(points, true)
    }
  }

  #drawBlock(tile: GridPoint, color: number): void {
    const center = this.#tileWorld(tile)
    const height = 58
    const graphics = this.add.graphics().setDepth(this.#depth.tile(tile, 20))
    graphics.fillStyle(0x3a2f35, 1)
    graphics.fillPoints(asVectors([
      { x: center.x - 25, y: center.y - 2 },
      { x: center.x, y: center.y + 11 },
      { x: center.x, y: center.y - height + 11 },
      { x: center.x - 25, y: center.y - height - 2 },
    ]), true)
    graphics.fillStyle(0x563f3d, 1)
    graphics.fillPoints(asVectors([
      { x: center.x, y: center.y + 11 },
      { x: center.x + 25, y: center.y - 2 },
      { x: center.x + 25, y: center.y - height - 2 },
      { x: center.x, y: center.y - height + 11 },
    ]), true)
    graphics.fillStyle(color, 1)
    graphics.lineStyle(2, 0x312a2c, 1)
    graphics.fillPoints(asVectors([
      { x: center.x, y: center.y - height - 15 },
      { x: center.x + 25, y: center.y - height - 2 },
      { x: center.x, y: center.y - height + 11 },
      { x: center.x - 25, y: center.y - height - 2 },
    ]), true)
    graphics.strokePoints(asVectors([
      { x: center.x, y: center.y - height - 15 },
      { x: center.x + 25, y: center.y - height - 2 },
      { x: center.x, y: center.y - height + 11 },
      { x: center.x - 25, y: center.y - height - 2 },
    ]), true)
  }

  #drawChair(): void {
    const seat = engineProofRoom.seats[0]!
    const center = this.#tileWorld(seat.tile)
    const back = this.add.graphics().setDepth(this.#depth.tile(seat.tile, 34))
    back.fillStyle(0x6c4938, 1)
    back.lineStyle(2, 0x2b2422, 1)
    back.fillPoints(asVectors([
      { x: center.x - 23, y: center.y - 49 },
      { x: center.x + 2, y: center.y - 36 },
      { x: center.x + 2, y: center.y - 5 },
      { x: center.x - 23, y: center.y - 18 },
    ]), true)
    back.strokePoints(asVectors([
      { x: center.x - 23, y: center.y - 49 },
      { x: center.x + 2, y: center.y - 36 },
      { x: center.x + 2, y: center.y - 5 },
      { x: center.x - 23, y: center.y - 18 },
    ]), true)
    back.fillStyle(0x2f6f68, 1)
    back.fillPoints(asVectors([
      { x: center.x, y: center.y - 15 },
      { x: center.x + 27, y: center.y - 2 },
      { x: center.x, y: center.y + 11 },
      { x: center.x - 27, y: center.y - 2 },
    ]), true)

    this.#chairFront = this.add.graphics().setDepth(this.#depth.foreground(seat.tile))
    this.#chairFront.fillStyle(0x4a3028, 1)
    this.#chairFront.fillRect(center.x - 25, center.y - 2, 6, 30)
    this.#chairFront.fillRect(center.x + 19, center.y - 2, 6, 30)
    this.#chairFront.fillRect(center.x - 22, center.y + 6, 44, 7)
  }

  #createAvatar(): void {
    const world = this.#tileWorld(this.#currentTile)
    this.#shadow = this.add.ellipse(world.x, world.y + 8, 38, 14, 0x020609, 0.4)
    this.#shadow.setDepth(this.#depth.tile(this.#currentTile, 42))

    this.#avatar = this.add.container(world.x, world.y)
    this.#avatar.setScale(1.32)
    for (const layer of AVATAR_LAYERS) {
      const sprite = this.add.sprite(0, 0, this.#textureKey(layer, 'idle'))
      sprite.setOrigin(0.5, 0.88)
      this.#avatarSprites.set(layer, sprite)
    }
    this.#avatar.setDepth(this.#depth.avatar(this.#currentTile))
    this.#updateAvatarFrame(0)
  }

  #updateAvatarFrame(frame: number): void {
    const action = this.#avatarController.action
    const direction = this.#avatarController.direction
    const frameCount = ACTION_FRAMES[action]
    const directionIndex = DIRECTIONS.indexOf(direction)
    const sheetFrame = directionIndex * frameCount + (frame % frameCount)
    const orderedSprites = this.#avatarController.layers(frame).map((layer) => this.#avatarSprites.get(layer.slot)).filter((sprite): sprite is Phaser.GameObjects.Sprite => Boolean(sprite))

    this.#avatar.removeAll(false)
    for (const sprite of orderedSprites) {
      const layer = [...this.#avatarSprites.entries()].find(([, value]) => value === sprite)?.[0]
      if (!layer) continue
      sprite.setTexture(this.#textureKey(layer, action), sheetFrame)
      sprite.setVisible(true)
      this.#avatar.add(sprite)
    }
  }

  #setState(state: GameState): void {
    this.#state = state
    document.documentElement.dataset.gameState = state
    const status = document.querySelector<HTMLElement>('#game-status')
    if (status) {
      status.textContent = state.toUpperCase()
      status.dataset.state = state
    }
  }

  #setAvatarWorld(point: GridPoint, x: number, y: number): void {
    this.#avatar.setPosition(x, y)
    this.#avatar.setDepth(this.#depth.avatar(point))
    this.#shadow.setPosition(x, y + 8)
    this.#shadow.setDepth(this.#depth.tile(point, 42))
  }

  async #walkTo(target: GridPoint): Promise<void> {
    if (this.#movement || this.#state === 'seated' || this.#state === 'standing') return
    const path = this.#roomController.findPath(this.#currentTile, target)
    if (path.length < 2) return

    this.#lastPathLength = path.length
    this.#lastDirectionTurns = pathDirectionTurns(path)
    this.#movement = this.#walkPath(path)
    try {
      await this.#movement
    } finally {
      this.#movement = null
    }
  }

  async #walkPath(path: readonly GridPoint[]): Promise<void> {
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1]!
      const to = path[index]!
      const delta = { x: to.x - from.x, y: to.y - from.y }
      const stair = from.z !== to.z
      this.#avatarController.applyMovement(delta)
      this.#setState(stair ? 'stair' : 'walking')
      this.#updateAvatarFrame(0)
      const targetWorld = this.#tileWorld(to)

      await new Promise<void>((resolve) => {
        let displayedFrame = -1
        const tween = this.tweens.add({
          targets: this.#avatar,
          x: targetWorld.x,
          y: targetWorld.y,
          duration: stair ? 760 : 300,
          ease: 'Linear',
          onUpdate: () => {
            const nextFrame = Math.min(3, Math.floor(tween.progress * 4))
            if (nextFrame !== displayedFrame) {
              displayedFrame = nextFrame
              this.#updateAvatarFrame(nextFrame)
            }
            this.#shadow.setPosition(this.#avatar.x, this.#avatar.y + 8)
          },
          onComplete: () => resolve(),
        })
      })

      this.#currentTile = { ...to }
      this.#setAvatarWorld(this.#currentTile, targetWorld.x, targetWorld.y)
    }

    this.#avatarController.applyMovement({ x: 0, y: 0 })
    this.#updateAvatarFrame(0)
    this.#setState('ready')
  }

  async walkToSeatApproach(): Promise<void> {
    const seat = engineProofRoom.seats[0]!
    if (this.#interaction.phase === 'idle') this.#interaction.beginSit(seat)
    await this.#walkTo(seat.approach)
  }

  async sit(): Promise<void> {
    if (this.#state === 'seated') return
    const seat = engineProofRoom.seats[0]!
    if (this.#interaction.phase === 'idle') {
      this.#interaction.beginSit(seat)
      await this.#walkTo(seat.approach)
    }
    const alignment = this.#interaction.arriveAtApproach(this.#currentTile)
    const delta = directionDelta(alignment.direction)
    this.#avatarController.applyMovement(delta)
    this.#avatarController.applyMovement({ x: 0, y: 0 })
    const command = this.#interaction.completeAlignment()
    this.#avatarController.sit()
    const seatWorld = this.#tileWorld(command.seatTile)
    this.#currentTile = { ...command.seatTile }
    this.#setAvatarWorld(command.seatTile, seatWorld.x + command.anchor.x, seatWorld.y + command.anchor.y)
    this.#shadow.setVisible(false)
    this.#updateAvatarFrame(0)
    this.#setState('seated')
  }

  async stand(): Promise<void> {
    if (this.#state !== 'seated') return
    const command = this.#interaction.beginStand()
    this.#avatarController.stand()
    this.#setState('standing')
    for (let frame = 0; frame < ACTION_FRAMES.stand; frame += 1) {
      this.#updateAvatarFrame(frame)
      await new Promise<void>((resolve) => this.time.delayedCall(170, () => resolve()))
    }
    const returnWorld = this.#tileWorld(command.returnTo)
    this.#currentTile = { ...command.returnTo }
    this.#setAvatarWorld(command.returnTo, returnWorld.x, returnWorld.y)
    this.#shadow.setVisible(true)
    this.#interaction.completeStand(command.returnTo)
    this.#avatarController.applyMovement({ x: 0, y: 0 })
    this.#updateAvatarFrame(0)
    this.#setState('ready')
  }

  #bindPointerMovement(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.#movement || this.#state === 'standing') return
      const raw = this.#grid.getTileXY(pointer.worldX, pointer.worldY)
      const raisedCandidate = this.#grid.getTileXY(pointer.worldX, pointer.worldY + ELEVATION_HEIGHT)
      const raised = this.#roomController.tileAt(Math.round(raisedCandidate.x), Math.round(raisedCandidate.y))
      const base = this.#roomController.tileAt(Math.round(raw.x), Math.round(raw.y))
      const tile: TileDefinition | null = raised?.position.z === 1 ? raised : base
      if (!tile) return

      const seat = engineProofRoom.seats[0]!
      if (tile.position.x === seat.tile.x && tile.position.y === seat.tile.y) {
        void this.walkToSeatApproach().then(() => this.sit())
        return
      }
      if (!tile.walkable || this.#roomController.isBlocked(tile.position)) return
      if (this.#state === 'seated') {
        void this.stand().then(() => this.#walkTo(tile.position))
      } else {
        void this.#walkTo(tile.position)
      }
    })
  }

  #bindHud(): void {
    document.querySelector('#run-proof')?.addEventListener('click', () => {
      void this.walkToSeatApproach().then(() => this.sit())
    })
    document.querySelector('#sit-toggle')?.addEventListener('click', () => {
      if (this.#state === 'seated') void this.stand()
      else void this.walkToSeatApproach().then(() => this.sit())
    })
  }

  #exposeDebugApi(): void {
    window.__STUDY_GAME__ = {
      walkToSeatApproach: () => this.walkToSeatApproach(),
      sit: () => this.sit(),
      stand: () => this.stand(),
      snapshot: () => ({
        action: this.#avatarController.action,
        direction: this.#avatarController.direction,
        directionTurns: this.#lastDirectionTurns,
        hatVisible: this.#avatarSprites.get('hat')?.visible === true,
        pathLength: this.#lastPathLength,
        state: this.#state,
        tile: { ...this.#currentTile },
      }),
    }
  }
}

declare global {
  interface Window {
    __STUDY_GAME__: {
      walkToSeatApproach(): Promise<void>
      sit(): Promise<void>
      stand(): Promise<void>
      snapshot(): {
        action: AvatarAction
        direction: Direction8
        directionTurns: number
        hatVisible: boolean
        pathLength: number
        state: GameState
        tile: GridPoint
      }
    }
  }
}
