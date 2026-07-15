import Phaser from 'phaser'

import { LocalStudyAdapter } from '../adapters/LocalStudyAdapter'
import type { StudyAdapter, StudyPresence } from '../adapters/StudyAdapter'
import { DIRECTIONS, type AvatarAction, type AvatarAppearance, type AvatarLayerSlot, type Direction8 } from '../avatar/AvatarAppearance'
import { DEFAULT_AVATAR_ASSET_MANIFEST } from '../avatar/AvatarAssetManifest'
import { InventoryStore } from '../inventory/InventoryStore'
import { WearableCatalog, type WardrobeItem, type WardrobeSlot } from '../inventory/WearableCatalog'
import { WardrobeController } from '../inventory/WardrobeController'
import { NavigationGraph, type NavigationNode } from '../pathfinding/NavigationGraph'
import { smoothNavigationRoute } from '../pathfinding/RouteSmoother'
import { IMAGE_ROOMS, roomPointToPixel, type ImageRoomDefinition, type ImageRoomId, type ImageRoomSeat } from '../rooms/ImageRoomDefinition'
import type { StudySessionTracker } from '../session/StudySessionTracker'
import { StudyPresenceLoop } from '../session/StudyPresenceLoop'
import { AvatarController } from './AvatarController'
import { AvatarActivityMachine, type ActivityToken } from './AvatarActivityMachine'
import { calculateOverviewZoom } from './CameraFraming'
import { buildMotionPath, sampleMotionPath } from './PathMotion'

const ACTION_FRAMES: Record<AvatarAction, number> = { idle: 1, walk: 4, sit: 1, stand: 3 }
const RENDERED_LAYERS: AvatarLayerSlot[] = ['body', 'skin', 'hair', 'top', 'bottom', 'shoes', 'hat']
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/avatars/engine-proof`
const ROOM_BASE = import.meta.env.BASE_URL
const SUPPORTED_ITEMS = ['short-hair', 'radio-hoodie', 'varsity-jacket', 'jeans', 'black-cargos', 'sneakers', 'boots', 'bucket-hat', 'beanie'] as const

type GameState = 'ready' | 'walking' | 'stair' | 'sitting' | 'seated' | 'standing' | 'spark' | 'rock'

const DEFAULT_APPEARANCE: AvatarAppearance = Object.freeze({
  bodyType: 'masc',
  skinTone: 'warm',
  hairId: 'short-hair',
  hairColor: 'brown',
  topId: 'radio-hoodie',
  bottomId: 'jeans',
  shoesId: 'sneakers',
  hatId: 'bucket-hat',
  accessoryId: null,
})

const FACING_DELTA: Record<Direction8, { x: number; y: number }> = {
  n: { x: 0, y: -1 }, ne: { x: 1, y: -1 }, e: { x: 1, y: 0 }, se: { x: 1, y: 1 },
  s: { x: 0, y: 1 }, sw: { x: -1, y: 1 }, w: { x: -1, y: 0 }, nw: { x: -1, y: -1 },
}

function textureFile(layer: AvatarLayerSlot, action: AvatarAction, appearance: AvatarAppearance): string | null {
  if (layer === 'body' || layer === 'skin' || layer === 'hair') return `${layer}-${action}.png`
  if (layer === 'top') return `top-${appearance.topId}-${action}.png`
  if (layer === 'bottom') return `bottom-${appearance.bottomId}-${action}.png`
  if (layer === 'shoes') return `shoes-${appearance.shoesId}-${action}.png`
  if (layer === 'hat' && appearance.hatId) return `hat-${appearance.hatId}-${action}.png`
  return null
}

function textureKey(layer: AvatarLayerSlot, action: AvatarAction, appearance: AvatarAppearance): string | null {
  const file = textureFile(layer, action, appearance)
  return file ? `avatar:${file.slice(0, -4)}` : null
}

function appearanceForPresence(presence: StudyPresence): AvatarAppearance {
  const appearance = { ...DEFAULT_APPEARANCE }
  for (const id of presence.equippedWearableIds ?? []) {
    if (['short-hair'].includes(id)) appearance.hairId = id
    if (['radio-hoodie', 'varsity-jacket'].includes(id)) appearance.topId = id
    if (['jeans', 'black-cargos'].includes(id)) appearance.bottomId = id
    if (['sneakers', 'boots'].includes(id)) appearance.shoesId = id
    if (['bucket-hat', 'beanie'].includes(id)) appearance.hatId = id
  }
  return appearance
}

export class ImageRoomScene extends Phaser.Scene {
  #roomId: ImageRoomId = 'library'
  #room: ImageRoomDefinition = IMAGE_ROOMS.library
  #graph = new NavigationGraph(this.#room.nodes, this.#room.edges)
  #currentNodeId = this.#room.spawnNodeId
  #state: GameState = 'ready'
  #activity = new AvatarActivityMachine()
  #routeTween: Phaser.Tweens.Tween | null = null
  #activeSegmentFromId: string | null = null
  #activeSegmentToId: string | null = null
  #seatTransitionPromise: Promise<void> | null = null
  #standPromise: Promise<void> | null = null
  #seatedSeat: ImageRoomSeat | null = null
  #background!: Phaser.GameObjects.Image
  #avatar!: Phaser.GameObjects.Container
  #shadow!: Phaser.GameObjects.Ellipse
  #avatarSprites = new Map<AvatarLayerSlot, Phaser.GameObjects.Sprite>()
  #avatarController!: AvatarController
  #wardrobe!: WardrobeController
  #roomObjects: Phaser.GameObjects.GameObject[] = []
  #seatForegroundObjects: Phaser.GameObjects.GameObject[] = []
  #socialObjects: Phaser.GameObjects.GameObject[] = []
  #presenceRefreshBusy = false
  #presenceLoop: StudyPresenceLoop | null = null
  readonly #adapter: StudyAdapter
  readonly #initialRoom: ImageRoomId
  readonly #sessionTracker?: StudySessionTracker

  constructor(adapter: StudyAdapter = new LocalStudyAdapter(), initialRoom: ImageRoomId = 'library', sessionTracker?: StudySessionTracker) {
    super('image-rooms')
    this.#adapter = adapter
    this.#initialRoom = initialRoom
    this.#sessionTracker = sessionTracker
  }

  preload(): void {
    for (const room of Object.values(IMAGE_ROOMS)) {
      this.load.image(`room:${room.id}`, `${ROOM_BASE}${room.image.url}`)
      for (const occluder of room.occluders) {
        this.load.image(`occluder:${room.id}:${occluder.id}`, `${ROOM_BASE}${occluder.asset.url}`)
      }
      for (const seat of room.seats) {
        this.load.image(`seat-foreground:${room.id}:${seat.id}`, `${ROOM_BASE}${seat.foregroundAsset.url}`)
      }
    }
    for (const action of Object.keys(ACTION_FRAMES) as AvatarAction[]) {
      for (const layer of ['body', 'skin', 'hair'] as const) {
        this.load.spritesheet(`avatar:${layer}-${action}`, `${ASSET_BASE}/${layer}-${action}.png`, {
          frameWidth: 64, frameHeight: 96, endFrame: DIRECTIONS.length * ACTION_FRAMES[action] - 1,
        })
      }
      for (const [slot, ids] of Object.entries({
        top: ['radio-hoodie', 'varsity-jacket'],
        bottom: ['jeans', 'black-cargos'],
        shoes: ['sneakers', 'boots'],
        hat: ['bucket-hat', 'beanie'],
      })) {
        for (const id of ids) {
          const file = `${slot}-${id}-${action}`
          this.load.spritesheet(`avatar:${file}`, `${ASSET_BASE}/${file}.png`, {
            frameWidth: 64, frameHeight: 96, endFrame: DIRECTIONS.length * ACTION_FRAMES[action] - 1,
          })
        }
      }
    }
  }

  create(): void {
    const catalogItems = Object.values(DEFAULT_AVATAR_ASSET_MANIFEST.wearables)
      .flat()
      .filter((item) => SUPPORTED_ITEMS.includes(item.id as (typeof SUPPORTED_ITEMS)[number])) as WardrobeItem[]
    const catalog = new WearableCatalog(catalogItems)
    const storage = {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    }
    const session = this.#adapter.session()
    const inventory = new InventoryStore(catalog, storage, session.ownedWearableIds, {
      authoritativeEquipped: this.#adapter.authoritativeInventory
        ? session.equippedWearableIds
        : undefined,
    })
    const appearance = { ...DEFAULT_APPEARANCE }
    for (const slot of ['hair', 'top', 'bottom', 'shoes', 'hat'] as const) {
      const persisted = inventory.equippedId(slot)
      if (persisted) {
        const key = ({ hair: 'hairId', top: 'topId', bottom: 'bottomId', shoes: 'shoesId', hat: 'hatId' } as const)[slot]
        Object.assign(appearance, { [key]: persisted })
      } else {
        const id = appearance[({ hair: 'hairId', top: 'topId', bottom: 'bottomId', shoes: 'shoesId', hat: 'hatId' } as const)[slot]]
        if (id) inventory.equip(id)
      }
    }
    this.#wardrobe = new WardrobeController(catalog, inventory, appearance)
    this.#avatarController = new AvatarController(DEFAULT_AVATAR_ASSET_MANIFEST, this.#wardrobe.appearance)

    this.#createAvatar()
    this.#renderRoom(this.#initialRoom)
    this.#bindPointerMovement()
    this.#bindHud()
    this.#exposeDebugApi()
    this.#presenceLoop = new StudyPresenceLoop(
      () => this.#pushPresence(),
      () => this.#refreshSocialActors(),
    )
    this.#presenceLoop.start()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.#presenceLoop?.stop()
      this.#presenceLoop = null
    })
    this.scale.on(Phaser.Scale.Events.RESIZE, this.#fitCamera, this)
    document.documentElement.dataset.studyReady = 'true'
  }

  #createAvatar(): void {
    this.#shadow = this.add.ellipse(0, 0, 38, 14, 0x020609, 0.42)
    this.#avatar = this.add.container(0, 0).setScale(1.08)
    for (const layer of RENDERED_LAYERS) {
      const key = textureKey(layer, 'idle', this.#avatarController.appearance)
      if (!key) continue
      const sprite = this.add.sprite(0, 0, key).setOrigin(0.5, 0.88)
      this.#avatarSprites.set(layer, sprite)
    }
    this.#updateAvatarFrame(0)
  }

  #clearRoomObjects(): void {
    for (const object of [...this.#roomObjects, ...this.#seatForegroundObjects, ...this.#socialObjects]) object.destroy()
    this.#roomObjects = []
    this.#seatForegroundObjects = []
    this.#socialObjects = []
  }

  #renderRoom(roomId: ImageRoomId): void {
    this.#activity.cancel()
    this.#routeTween?.stop()
    this.#routeTween = null
    this.tweens.killTweensOf([this.#avatar, this.#shadow])
    this.#clearRoomObjects()
    this.#roomId = roomId
    this.#room = IMAGE_ROOMS[roomId]
    this.#graph = new NavigationGraph(this.#room.nodes, this.#room.edges)
    this.#currentNodeId = this.#room.spawnNodeId
    this.#seatedSeat = null

    this.#background = this.add.image(0, 0, `room:${roomId}`).setOrigin(0).setDepth(-100_000)
    this.#roomObjects.push(this.#background)
    this.#createOcclusionLayers()
    this.#createWorldActors()
    this.#createSocialActors()

    const spawn = this.#graph.node(this.#currentNodeId)!
    const pixel = roomPointToPixel(this.#room, spawn)
    this.#avatar.setPosition(pixel.x, pixel.y)
    this.#shadow.setPosition(pixel.x, pixel.y + 5).setVisible(true)
    this.#setAvatarDepth(spawn.y)
    this.#avatarController.applyMovement({ x: 0, y: 0 })
    this.#updateAvatarFrame(0)
    void Promise.resolve(this.#adapter.enterRoom(this.#roomId, this.#currentNodeId))

    this.cameras.main.stopFollow()
    this.cameras.main.removeBounds()
    this.#fitCamera()
    this.#setState('ready')
    this.#syncHud()
    window.dispatchEvent(new CustomEvent('radiotedu:study-room-changed', { detail: { roomId: this.#roomId } }))
    void this.#pushPresence()
  }

  #fitCamera(): void {
    const viewport = this.scale.gameSize
    const zoom = calculateOverviewZoom(viewport, this.#room.image)
    this.cameras.main.setZoom(zoom)
    this.cameras.main.centerOn(this.#room.image.width / 2, this.#room.image.height / 2)
  }

  #createOcclusionLayers(): void {
    for (const occluder of this.#room.occluders) {
      const image = this.add.image(occluder.asset.x, occluder.asset.y, `occluder:${this.#roomId}:${occluder.id}`).setOrigin(0)
      image.setDepth(occluder.depthY * 100)
      this.#roomObjects.push(image)
    }
  }

  #createWorldActors(): void {
    for (const [actorId, actor] of Object.entries(this.#room.actors)) {
      if (!actor) continue
      const node = this.#graph.node(actor.nodeId)
      if (!node) continue
      const pixel = roomPointToPixel(this.#room, node)
      const container = this.add.container(pixel.x, pixel.y).setDepth(90_000)
      const badge = this.add.graphics()
      if (actorId === 'spark') {
        badge.fillStyle(0x84f1e5, 1)
        badge.fillPoints([
          new Phaser.Math.Vector2(0, -18), new Phaser.Math.Vector2(5, -5), new Phaser.Math.Vector2(18, 0),
          new Phaser.Math.Vector2(5, 5), new Phaser.Math.Vector2(0, 18), new Phaser.Math.Vector2(-5, 5),
          new Phaser.Math.Vector2(-18, 0), new Phaser.Math.Vector2(-5, -5),
        ], true)
      } else {
        badge.fillStyle(0x6a625f, 1).fillRoundedRect(-17, -13, 34, 26, 7)
        badge.lineStyle(2, 0x272728, 1).strokeRoundedRect(-17, -13, 34, 26, 7)
      }
      const name = this.add.text(26, -19, actor.name, { color: '#ffffff', fontFamily: 'Segoe UI, sans-serif', fontSize: '15px', fontStyle: 'bold' })
      const label = this.add.text(26, 1, actor.label, {
        color: '#d3efea', fontFamily: 'Segoe UI, sans-serif', fontSize: '10px',
        backgroundColor: '#10242ddd', padding: { x: 3, y: 1 },
      })
      container.add([badge, name, label]).setSize(170, 48).setInteractive({ useHandCursor: true })
      container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation()
        void this.#walkToNode(actor.nodeId).then(() => this.#setState(actorId === 'spark' ? 'spark' : 'rock'))
      })
      this.#roomObjects.push(container)
    }
  }

  #createSocialActors(): void {
    for (const object of this.#socialObjects) object.destroy()
    this.#socialObjects = []
    for (const presence of this.#adapter.presence(this.#roomId)) {
      const seat = presence.seatId ? this.#room.seats.find((candidate) => candidate.id === presence.seatId) ?? null : null
      const node = this.#graph.node(presence.nodeId)
      const anchor = seat?.sit ?? node
      if (!anchor) continue
      const action: AvatarAction = seat ? 'sit' : 'idle'
      const direction = seat?.facing ?? 's'
      const appearance = appearanceForPresence(presence)
      const pixel = roomPointToPixel(this.#room, anchor)
      const container = this.add.container(pixel.x, pixel.y).setDepth(anchor.y * 100 + 12).setScale(0.88)
      const shadow = this.add.ellipse(0, 5, 34, 11, 0x020609, 0.35)
      shadow.setVisible(!seat)
      const layers: Phaser.GameObjects.Sprite[] = []
      for (const layer of RENDERED_LAYERS) {
        const key = textureKey(layer, action, appearance)
        if (!key) continue
        const sprite = this.add.sprite(0, 0, key).setOrigin(0.5, 0.88).setFrame(DIRECTIONS.indexOf(direction) * ACTION_FRAMES[action])
        if (layer === 'top' && !(presence.equippedWearableIds?.length)) sprite.setTint(presence.color)
        layers.push(sprite)
      }
      const name = this.add.text(0, -86, presence.displayName, {
        color: '#ffffff', fontFamily: 'Segoe UI, sans-serif', fontSize: '10px',
        backgroundColor: '#152126cc', padding: { x: 4, y: 2 },
      }).setOrigin(0.5)
      container.add([shadow, ...layers, name]).setSize(72, 100).setInteractive({ useHandCursor: true })
      container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation()
        window.dispatchEvent(new CustomEvent('radiotedu:study-player-selected', { detail: { presence } }))
      })
      this.#socialObjects.push(container)
    }
  }

  async #refreshSocialActors(): Promise<void> {
    if (this.#presenceRefreshBusy) return
    this.#presenceRefreshBusy = true
    const roomId = this.#roomId
    try {
      await this.#adapter.refreshPresence?.(roomId)
      if (roomId !== this.#roomId) return
      this.#createSocialActors()
      window.dispatchEvent(new CustomEvent('radiotedu:study-presence-updated', {
        detail: { roomId, presence: this.#adapter.presence(roomId) },
      }))
    } finally {
      this.#presenceRefreshBusy = false
    }
  }

  async #pushPresence(): Promise<void> {
    if (!this.#adapter.heartbeatPresence) return
    const point = this.#seatedSeat?.sit ?? this.#graph.node(this.#currentNodeId) ?? { x: 0, y: 0 }
    await this.#adapter.heartbeatPresence({
      roomId: this.#roomId,
      nodeId: this.#seatedSeat ? `seat:${this.#seatedSeat.id}` : this.#currentNodeId,
      seatId: this.#seatedSeat?.id ?? null,
      position: { x: point.x, y: point.y },
    })
  }

  #setSeatForeground(seat: ImageRoomSeat | null): void {
    for (const object of this.#seatForegroundObjects) object.destroy()
    this.#seatForegroundObjects = []
    if (!seat) return
    const asset = seat.foregroundAsset
    const image = this.add.image(asset.x, asset.y, `seat-foreground:${this.#roomId}:${seat.id}`).setOrigin(0).setDepth(seat.sit.y * 100 + 20)
    this.#seatForegroundObjects.push(image)
  }

  #updateAvatarFrame(frameIndex: number): void {
    const action = this.#avatarController.action
    const direction = this.#avatarController.direction
    const frameCount = ACTION_FRAMES[action]
    const sheetFrame = DIRECTIONS.indexOf(direction) * frameCount + (frameIndex % frameCount)
    const orderedSlots = this.#avatarController.layers(frameIndex).map((layer) => layer.slot)
    this.#avatar.removeAll(false)
    for (const sprite of this.#avatarSprites.values()) sprite.setVisible(false)
    for (const slot of orderedSlots) {
      const sprite = this.#avatarSprites.get(slot)
      const key = textureKey(slot, action, this.#avatarController.appearance)
      if (!sprite || !key) continue
      sprite.setTexture(key, sheetFrame).setVisible(true)
      this.#avatar.add(sprite)
    }
  }

  #setAvatarDepth(yPercent: number): void {
    const depth = yPercent * 100 + 10
    this.#avatar.setDepth(depth)
    this.#shadow.setDepth(depth - 2)
  }

  #setState(state: GameState): void {
    this.#state = state
    document.documentElement.dataset.gameState = state
    const output = document.querySelector<HTMLOutputElement>('#game-status')
    if (output) {
      output.value = state.toUpperCase()
      output.textContent = state.toUpperCase()
      output.dataset.state = state
    }
  }

  async #walkToNode(targetId: string, activityToken: ActivityToken = this.#activity.beginWalk()): Promise<void> {
    const resumeState = this.#activity.snapshot().state
    this.#cancelActiveRoute()
    if (this.#seatTransitionPromise) await this.#seatTransitionPromise
    if (!this.#activity.isCurrent(activityToken)) return
    if (this.#seatedSeat || this.#standPromise) {
      this.#activity.transition(activityToken, 'standing')
      await this.stand(activityToken)
      if (!this.#activity.isCurrent(activityToken)) return
      this.#activity.transition(activityToken, resumeState)
    }
    const path = smoothNavigationRoute(
      this.#graph.findPath(this.#currentNodeId, targetId).map((id) => this.#graph.node(id)!),
      this.#room.edges,
    ).map((node) => node.id)
    const routePoints = path.map((id) => {
      const node = this.#graph.node(id)!
      const pixel = roomPointToPixel(this.#room, node)
      return { id, x: pixel.x, y: pixel.y, z: node.z }
    })
    const currentZ = this.#graph.node(this.#currentNodeId)?.z ?? 0
    const firstPoint = routePoints[0]
    if (firstPoint && Math.hypot(firstPoint.x - this.#avatar.x, firstPoint.y - this.#avatar.y) > 1) {
      routePoints.unshift({ id: `route-start-${activityToken}`, x: this.#avatar.x, y: this.#avatar.y, z: currentZ })
    }
    if (routePoints.length < 2) {
      if (resumeState === 'walking') this.#activity.transition(activityToken, 'idle')
      return
    }
    const motion = buildMotionPath(routePoints)
    if (motion.totalLength === 0) return
    const travel = { distance: 0 }
    let activeSegmentIndex = -1
    const updateMotion = () => {
      const sample = sampleMotionPath(motion, travel.distance)
      if (sample.segmentIndex !== activeSegmentIndex) {
        activeSegmentIndex = sample.segmentIndex
        this.#activeSegmentFromId = this.#graph.node(sample.from.id) ? sample.from.id : this.#currentNodeId
        this.#activeSegmentToId = this.#graph.node(sample.to.id) ? sample.to.id : this.#currentNodeId
        if (this.#graph.node(sample.from.id)) this.#currentNodeId = sample.from.id
        this.#avatarController.applyMovement({ x: sample.to.x - sample.from.x, y: sample.to.y - sample.from.y })
        this.#setState(sample.from.z !== sample.to.z ? 'stair' : 'walking')
      }
      this.#avatar.setPosition(sample.x, sample.y)
      this.#shadow.setPosition(sample.x, sample.y + 5)
      this.#updateAvatarFrame(Math.floor(travel.distance / 18) % ACTION_FRAMES.walk)
      this.#setAvatarDepth((sample.y / this.#room.image.height) * 100)
    }
    updateMotion()
    await new Promise<void>((resolve) => {
      let routeTween!: Phaser.Tweens.Tween
      routeTween = this.tweens.add({
        targets: travel,
        distance: motion.totalLength,
        duration: Phaser.Math.Clamp(Math.round(motion.totalLength * 3.2), 320, 8_000),
        ease: 'Linear',
        onUpdate: () => {
          if (!this.#activity.isCurrent(activityToken)) {
            routeTween.stop()
            return
          }
          updateMotion()
        },
        onComplete: () => {
          if (this.#routeTween === routeTween) {
            this.#routeTween = null
            this.#activeSegmentFromId = null
            this.#activeSegmentToId = null
          }
          resolve()
        },
        onStop: () => {
          if (this.#routeTween === routeTween) this.#routeTween = null
          resolve()
        },
      })
      this.#routeTween = routeTween
    })
    if (!this.#activity.isCurrent(activityToken)) return
    this.#currentNodeId = targetId
    this.#avatarController.applyMovement({ x: 0, y: 0 })
    this.#updateAvatarFrame(0)
    this.#setState('ready')
    if (resumeState === 'walking') this.#activity.transition(activityToken, 'idle')
    void this.#pushPresence()
  }

  #cancelActiveRoute(): void {
    if (!this.#routeTween) return
    const candidates = [...new Set([this.#activeSegmentFromId, this.#activeSegmentToId])]
      .filter((id): id is string => Boolean(id))
      .map((id) => this.#graph.node(id))
      .filter((node): node is NavigationNode => Boolean(node))
    if (candidates.length > 0) {
      const nearest = candidates
        .map((node) => ({ node, pixel: roomPointToPixel(this.#room, node) }))
        .sort((left, right) => (
          Math.hypot(left.pixel.x - this.#avatar.x, left.pixel.y - this.#avatar.y)
          - Math.hypot(right.pixel.x - this.#avatar.x, right.pixel.y - this.#avatar.y)
        ))[0]
      this.#currentNodeId = nearest!.node.id
    }
    const tween = this.#routeTween
    this.#routeTween = null
    this.#activeSegmentFromId = null
    this.#activeSegmentToId = null
    tween.stop()
  }

  async walkToSeat(seatId: string): Promise<void> {
    const seat = this.#room.seats.find((candidate) => candidate.id === seatId)
    if (!seat) throw new Error(`Unknown seat ${this.#roomId}:${seatId}`)
    const activityToken = this.#activity.beginSeatApproach(seat.id)
    const movement = this.#walkToNode(seat.approachNodeId, activityToken)
    await movement
    if (!this.#activity.isCurrent(activityToken) || this.#currentNodeId !== seat.approachNodeId) return
    await this.#adapter.reserveSeat(this.#roomId, seat.id)
    if (!this.#activity.isCurrent(activityToken) || this.#routeTween) {
      await this.#adapter.releaseSeat()
      return
    }
    this.#activity.transition(activityToken, 'aligning-seat')
    await this.#sit(seat, activityToken)
    if (!this.#activity.isCurrent(activityToken)) {
      await this.#adapter.releaseSeat()
      return
    }
    await this.#sessionTracker?.seated(this.#roomId, seat.id, { x: seat.sit.x, y: seat.sit.y })
    void this.#pushPresence()
  }

  async #sit(seat: ImageRoomSeat, activityToken: ActivityToken): Promise<void> {
    this.#avatarController.applyMovement(FACING_DELTA[seat.facing])
    this.#avatarController.sit()
    const sitPixel = roomPointToPixel(this.#room, seat.sit)
    const distance = Math.hypot(sitPixel.x - this.#avatar.x, sitPixel.y - this.#avatar.y)
    this.#setState('sitting')
    this.#shadow.setVisible(false)
    const transition = new Promise<void>((resolve) => this.tweens.add({
      targets: this.#avatar,
      x: sitPixel.x,
      y: sitPixel.y,
      duration: Phaser.Math.Clamp(Math.round(distance * 3.2), 220, 700),
      ease: 'Sine.easeOut',
      onComplete: () => resolve(),
    }))
    this.#seatTransitionPromise = transition
    try {
      await transition
    } finally {
      if (this.#seatTransitionPromise === transition) this.#seatTransitionPromise = null
    }
    if (!this.#activity.isCurrent(activityToken)) return
    this.#seatedSeat = seat
    this.#activity.transition(activityToken, 'seated')
    this.#setState('seated')
    this.#setAvatarDepth(seat.sit.y)
    this.#setSeatForeground(seat)
    this.#updateAvatarFrame(0)
  }

  async stand(activityToken: ActivityToken = this.#activity.beginStand()): Promise<void> {
    if (this.#standPromise) return this.#standPromise
    if (!this.#seatedSeat) {
      if (this.#activity.isCurrent(activityToken) && this.#activity.snapshot().state === 'standing') {
        this.#activity.transition(activityToken, 'idle')
      }
      return
    }
    const transition = this.#performStand(activityToken)
    this.#standPromise = transition
    try {
      await transition
    } finally {
      if (this.#standPromise === transition) this.#standPromise = null
    }
  }

  async #performStand(activityToken: ActivityToken): Promise<void> {
    const seat = this.#seatedSeat
    if (!seat) return
    this.#seatedSeat = null
    const finishSession = this.#sessionTracker?.stood() ?? Promise.resolve()
    await this.#adapter.releaseSeat()
    this.#setSeatForeground(null)
    this.#avatarController.stand()
    this.#setState('standing')
    for (let frame = 0; frame < ACTION_FRAMES.stand; frame += 1) {
      this.#updateAvatarFrame(frame)
      await new Promise<void>((resolve) => this.time.delayedCall(130, () => resolve()))
    }
    const approach = this.#graph.node(seat.approachNodeId)!
    const pixel = roomPointToPixel(this.#room, approach)
    const distance = Math.hypot(pixel.x - this.#avatar.x, pixel.y - this.#avatar.y)
    await new Promise<void>((resolve) => this.tweens.add({
      targets: this.#avatar,
      x: pixel.x,
      y: pixel.y,
      duration: Phaser.Math.Clamp(Math.round(distance * 3.2), 180, 600),
      ease: 'Sine.easeOut',
      onComplete: () => resolve(),
    }))
    this.#shadow.setPosition(pixel.x, pixel.y + 5).setVisible(true)
    this.#setAvatarDepth(approach.y)
    this.#avatarController.applyMovement({ x: 0, y: 0 })
    this.#updateAvatarFrame(0)
    await finishSession
    if (this.#activity.isCurrent(activityToken)) {
      if (this.#activity.snapshot().state === 'standing') this.#activity.transition(activityToken, 'idle')
      this.#setState('ready')
      void this.#pushPresence()
    }
  }

  async switchRoom(roomId: ImageRoomId): Promise<void> {
    if (roomId === this.#roomId) return
    if (!this.#seatedSeat) this.#activity.cancel()
    this.#cancelActiveRoute()
    if (this.#seatedSeat) await this.stand()
    this.#renderRoom(roomId)
    await this.#refreshSocialActors()
  }

  async equip(slot: WardrobeSlot, id: string): Promise<void> {
    if (this.#wardrobe.inventory.state(id) === 'locked') {
      await this.#adapter.purchaseWearable(id, globalThis.crypto?.randomUUID?.() ?? `wardrobe-${Date.now()}-${id}`)
      this.#wardrobe.inventory.addOwned(id)
    }
    await this.#adapter.equipWearable(id, slot)
    const appearance = this.#wardrobe.equip(slot, id)
    this.#avatarController.equip(slot, id)
    if (appearance.hatId === null) this.#avatarSprites.get('hat')?.setVisible(false)
    this.#updateAvatarFrame(0)
    this.#syncHud()
  }

  #nearestNode(worldX: number, worldY: number): NavigationNode | null {
    let nearest: NavigationNode | null = null
    let distance = Number.POSITIVE_INFINITY
    for (const node of this.#room.nodes) {
      const pixel = roomPointToPixel(this.#room, node)
      const candidate = Math.hypot(pixel.x - worldX, pixel.y - worldY)
      if (candidate < distance) {
        nearest = node
        distance = candidate
      }
    }
    return distance <= 180 ? nearest : null
  }

  #bindPointerMovement(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const nearestSeat = [...this.#room.seats]
        .map((seat) => ({ seat, pixel: roomPointToPixel(this.#room, seat.sit) }))
        .sort((left, right) => Math.hypot(left.pixel.x - pointer.worldX, left.pixel.y - pointer.worldY) - Math.hypot(right.pixel.x - pointer.worldX, right.pixel.y - pointer.worldY))[0]
      if (nearestSeat && Math.hypot(nearestSeat.pixel.x - pointer.worldX, nearestSeat.pixel.y - pointer.worldY) < 58) {
        void this.walkToSeat(nearestSeat.seat.id).catch(() => this.#showActionError('SEAT UNAVAILABLE'))
        return
      }
      const node = this.#nearestNode(pointer.worldX, pointer.worldY)
      if (node) void this.#walkToNode(node.id)
    })
  }

  #bindHud(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-room-id]').forEach((button) => {
      button.addEventListener('click', () => { void this.switchRoom(button.dataset.roomId as ImageRoomId) })
    })
    document.querySelectorAll<HTMLButtonElement>('[data-wearable-id]').forEach((button) => {
      button.addEventListener('click', () => {
        void this.equip(button.dataset.slot as WardrobeSlot, button.dataset.wearableId!)
          .catch(() => this.#showActionError('ITEM UNAVAILABLE'))
      })
    })
  }

  #showActionError(message: string): void {
    const output = document.querySelector<HTMLOutputElement>('#game-status')
    if (!output) return
    output.value = message
    output.textContent = message
    const activityToken = this.#activity.snapshot().token
    this.time.delayedCall(1_800, () => {
      if (this.#activity.isCurrent(activityToken)) this.#setState(this.#state)
    })
  }

  #syncHud(): void {
    document.documentElement.dataset.roomId = this.#roomId
    document.documentElement.dataset.hatId = this.#avatarController.appearance.hatId ?? 'none'
    document.querySelectorAll<HTMLButtonElement>('[data-room-id]').forEach((button) => {
      const selected = button.dataset.roomId === this.#roomId
      button.setAttribute('aria-selected', String(selected))
      button.classList.toggle('is-selected', selected)
    })
    document.querySelectorAll<HTMLButtonElement>('[data-wearable-id]').forEach((button) => {
      const slot = button.dataset.slot as WardrobeSlot
      const equipped = this.#wardrobe.inventory.equippedId(slot) === button.dataset.wearableId
      button.setAttribute('aria-pressed', String(equipped))
      button.dataset.state = equipped ? 'equipped' : this.#wardrobe.inventory.state(button.dataset.wearableId!)
    })
    const title = document.querySelector<HTMLElement>('#room-title')
    if (title) title.textContent = this.#roomId === 'library' ? 'Library' : 'Çim Alan'
  }

  #exposeDebugApi(): void {
    window.__STUDY_GAME_APP__ = {
      switchRoom: (roomId) => this.switchRoom(roomId),
      walkToNode: (nodeId) => this.#walkToNode(nodeId),
      walkToSeat: (seatId) => this.walkToSeat(seatId),
      stand: () => this.stand(),
      equip: (slot, id) => this.equip(slot, id),
      snapshot: () => ({
        roomId: this.#roomId,
        state: this.#state,
        nodeId: this.#currentNodeId,
        position: { x: this.#avatar.x, y: this.#avatar.y },
        z: this.#seatedSeat?.sit.z ?? this.#graph.node(this.#currentNodeId)?.z ?? 0,
        hatId: this.#avatarController.appearance.hatId,
        topId: this.#avatarController.appearance.topId,
        sparkLabel: this.#room.actors.spark?.label ?? null,
        camera: {
          zoom: this.cameras.main.zoom,
          worldViewWidth: this.cameras.main.worldView.width,
          worldViewHeight: this.cameras.main.worldView.height,
        },
        roomSize: { width: this.#room.image.width, height: this.#room.image.height },
      }),
    }
  }
}

declare global {
  interface Window {
    __STUDY_GAME_APP__: {
      switchRoom(roomId: ImageRoomId): Promise<void>
      walkToNode(nodeId: string): Promise<void>
      walkToSeat(seatId: string): Promise<void>
      stand(): Promise<void>
      equip(slot: WardrobeSlot, id: string): Promise<void>
      snapshot(): {
        roomId: ImageRoomId
        state: GameState
        nodeId: string
        position: { x: number; y: number }
        z: number
        hatId: string | null
        topId: string
        sparkLabel: string | null
        camera: { zoom: number; worldViewWidth: number; worldViewHeight: number }
        roomSize: { width: number; height: number }
      }
    }
  }
}
