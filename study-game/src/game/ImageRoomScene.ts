import Phaser from 'phaser'

import { LocalStudyAdapter } from '../adapters/LocalStudyAdapter'
import type { StudyAdapter, StudyPresence } from '../adapters/StudyAdapter'
import { DIRECTIONS, type AvatarAction, type AvatarAppearance, type AvatarLayerSlot, type Direction8 } from '../avatar/AvatarAppearance'
import { DEFAULT_AVATAR_ASSET_MANIFEST } from '../avatar/AvatarAssetManifest'
import { avatarUpperBodyCrop, canonicalAvatarTextureKey, shouldUseCanonicalAvatar } from '../avatar/AvatarPresentation'
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
import { imageRoomActorDepth } from './ImageRoomDepth'
import { buildMotionPath, sampleMotionPathAtTime, walkFrameAtDistance } from './PathMotion'
import { SeatReservationBook } from './SeatReservationBook'
import { resolveTouchIntent, type TouchWorldPoint } from './TouchIntentResolver'

const ACTION_FRAMES: Record<AvatarAction, number> = { idle: 1, walk: 4, sit: 1, stand: 3 }
const RENDERED_LAYERS: AvatarLayerSlot[] = ['body', 'skin', 'hair', 'top', 'bottom', 'shoes', 'hat']
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/avatars/engine-proof`
const ROOM_BASE = import.meta.env.BASE_URL
const SUPPORTED_ITEMS = ['short-hair', 'radio-hoodie', 'varsity-jacket', 'jeans', 'black-cargos', 'sneakers', 'boots', 'bucket-hat', 'beanie'] as const
const AVATAR_WALK_SPEED = 280
const AVATAR_WALK_STRIDE = 18

type GameState = 'ready' | 'walking' | 'stair' | 'sitting' | 'seated' | 'standing' | 'spark' | 'rock'

const DEFAULT_APPEARANCE: AvatarAppearance = Object.freeze({
  bodyType: 'masc',
  skinTone: 'warm',
  hairId: 'short-hair',
  hairColor: 'brown',
  topId: 'radio-hoodie',
  bottomId: 'black-cargos',
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
  #seatReservations = new SeatReservationBook()
  #routeTween: Phaser.Tweens.Tween | null = null
  #activeSegmentFromId: string | null = null
  #activeSegmentToId: string | null = null
  #seatTransitionPromise: Promise<void> | null = null
  #standPromise: Promise<void> | null = null
  #seatedSeat: ImageRoomSeat | null = null
  #background!: Phaser.GameObjects.Image
  #avatar!: Phaser.GameObjects.Container
  #canonicalAvatar!: Phaser.GameObjects.Sprite
  #seatedUpperAvatar!: Phaser.GameObjects.Container
  #seatedUpperCanonical!: Phaser.GameObjects.Sprite
  #shadow!: Phaser.GameObjects.Ellipse
  #avatarSprites = new Map<AvatarLayerSlot, Phaser.GameObjects.Sprite>()
  #seatedUpperSprites = new Map<AvatarLayerSlot, Phaser.GameObjects.Sprite>()
  #avatarController!: AvatarController
  #wardrobe!: WardrobeController
  #roomObjects: Phaser.GameObjects.GameObject[] = []
  #seatForegroundObjects: Phaser.GameObjects.GameObject[] = []
  #socialObjects: Phaser.GameObjects.GameObject[] = []
  #intentMarker: Phaser.GameObjects.GameObject | null = null
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
      this.load.spritesheet(canonicalAvatarTextureKey(action), `${ASSET_BASE}/canonical-${action}.png`, {
        frameWidth: 64, frameHeight: 96, endFrame: DIRECTIONS.length * ACTION_FRAMES[action] - 1,
      })
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
      const ownerId = this.#adapter.session().account.id
      if (this.#seatReservations.releaseOwner(ownerId) > 0) void this.#adapter.releaseSeat()
      void this.#sessionTracker?.stood().catch(() => undefined)
    })
    this.scale.on(Phaser.Scale.Events.RESIZE, this.#fitCamera, this)
    document.documentElement.dataset.studyReady = 'true'
  }

  #createAvatar(): void {
    this.#shadow = this.add.ellipse(0, 0, 38, 14, 0x020609, 0.42)
    this.#avatar = this.add.container(0, 0).setScale(1.08)
    this.#seatedUpperAvatar = this.add.container(0, 0).setScale(1.08).setVisible(false)
    this.#canonicalAvatar = this.add.sprite(0, 0, canonicalAvatarTextureKey('idle')).setOrigin(0.5, 0.88)
    this.#seatedUpperCanonical = this.add.sprite(0, 0, canonicalAvatarTextureKey('sit')).setOrigin(0.5, 0.88)
    for (const layer of RENDERED_LAYERS) {
      const key = textureKey(layer, 'idle', this.#avatarController.appearance)
      if (!key) continue
      const sprite = this.add.sprite(0, 0, key).setOrigin(0.5, 0.88)
      const seatedUpperSprite = this.add.sprite(0, 0, key).setOrigin(0.5, 0.88)
      this.#avatarSprites.set(layer, sprite)
      this.#seatedUpperSprites.set(layer, seatedUpperSprite)
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
    this.#clearIntentMarker()
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
    this.#seatedUpperAvatar.setPosition(pixel.x, pixel.y).setVisible(false)
    this.#shadow.setPosition(pixel.x, pixel.y + 5).setVisible(true)
    this.#setAvatarDepth(spawn)
    this.#avatarController.applyMovement({ x: 0, y: 0 })
    this.#updateAvatarFrame(0)
    void Promise.resolve(this.#adapter.enterRoom(this.#roomId, this.#currentNodeId)).catch(() => {
      if (this.#roomId === roomId) this.#showActionError('ROOM UNAVAILABLE')
    })

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
      const depth = seat ? anchor.y * 100 + 12 : imageRoomActorDepth(anchor, 12)
      const container = this.add.container(pixel.x, pixel.y).setDepth(depth).setScale(0.88)
      const shadow = this.add.ellipse(0, 5, 34, 11, 0x020609, 0.35)
      shadow.setVisible(!seat)
      const layers: Phaser.GameObjects.Sprite[] = []
      const sheetFrame = DIRECTIONS.indexOf(direction) * ACTION_FRAMES[action]
      if (shouldUseCanonicalAvatar(appearance)) {
        layers.push(this.add.sprite(0, 0, canonicalAvatarTextureKey(action)).setOrigin(0.5, 0.88).setFrame(sheetFrame))
      } else {
        for (const layer of RENDERED_LAYERS) {
          const key = textureKey(layer, action, appearance)
          if (!key) continue
          const sprite = this.add.sprite(0, 0, key).setOrigin(0.5, 0.88).setFrame(sheetFrame)
          if (layer === 'top' && !(presence.equippedWearableIds?.length)) sprite.setTint(presence.color)
          layers.push(sprite)
        }
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
      this.#syncSeatReservations(this.#adapter.presence(roomId))
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
    try {
      await this.#adapter.heartbeatPresence({
        roomId: this.#roomId,
        nodeId: this.#seatedSeat ? `seat:${this.#seatedSeat.id}` : this.#currentNodeId,
        seatId: this.#seatedSeat?.id ?? null,
        position: { x: point.x, y: point.y },
      })
    } catch {
      this.#showActionError('ROOM SYNC RETRY')
    }
  }

  #setSeatForeground(seat: ImageRoomSeat | null): void {
    for (const object of this.#seatForegroundObjects) object.destroy()
    this.#seatForegroundObjects = []
    if (!seat) return
    const asset = seat.foregroundAsset
    const image = this.add.image(asset.x, asset.y, `seat-foreground:${this.#roomId}:${seat.id}`)
      .setOrigin(0)
      .setDepth(Math.max(seat.sit.y * 100 + 20, this.#seatedUpperAvatar.depth + 5))
    this.#seatForegroundObjects.push(image)
  }

  #updateAvatarFrame(frameIndex: number): void {
    const action = this.#avatarController.action
    const direction = this.#avatarController.direction
    const upperBodyCrop = avatarUpperBodyCrop(action)
    const frameCount = ACTION_FRAMES[action]
    const sheetFrame = DIRECTIONS.indexOf(direction) * frameCount + (frameIndex % frameCount)
    const orderedSlots = this.#avatarController.layers(frameIndex).map((layer) => layer.slot)
    this.#avatar.removeAll(false)
    this.#seatedUpperAvatar.removeAll(false)
    this.#seatedUpperAvatar.setPosition(this.#avatar.x, this.#avatar.y).setVisible(Boolean(upperBodyCrop))
    this.#canonicalAvatar.setVisible(false)
    this.#seatedUpperCanonical.setVisible(false)
    for (const sprite of this.#avatarSprites.values()) sprite.setVisible(false)
    for (const sprite of this.#seatedUpperSprites.values()) sprite.setVisible(false)
    if (shouldUseCanonicalAvatar(this.#avatarController.appearance)) {
      this.#canonicalAvatar.setPosition(0, 0).setTexture(canonicalAvatarTextureKey(action), sheetFrame).setVisible(true)
      this.#avatar.add(this.#canonicalAvatar)
      if (upperBodyCrop) {
        this.#seatedUpperCanonical
          .setPosition(0, 0)
          .setTexture(canonicalAvatarTextureKey(action), sheetFrame)
          .setCrop(upperBodyCrop.x, upperBodyCrop.y, upperBodyCrop.width, upperBodyCrop.height)
          .setVisible(true)
        this.#seatedUpperAvatar.add(this.#seatedUpperCanonical)
      }
      return
    }
    for (const slot of orderedSlots) {
      const sprite = this.#avatarSprites.get(slot)
      const key = textureKey(slot, action, this.#avatarController.appearance)
      if (!sprite || !key) continue
      sprite.setPosition(0, 0).setTexture(key, sheetFrame).setVisible(true)
      this.#avatar.add(sprite)
      if (upperBodyCrop) {
        const seatedUpperSprite = this.#seatedUpperSprites.get(slot)
        if (!seatedUpperSprite) continue
        seatedUpperSprite
          .setPosition(0, 0)
          .setTexture(key, sheetFrame)
          .setCrop(upperBodyCrop.x, upperBodyCrop.y, upperBodyCrop.width, upperBodyCrop.height)
          .setVisible(true)
        this.#seatedUpperAvatar.add(seatedUpperSprite)
      }
    }
  }

  #setAvatarDepth(point: Readonly<{ y: number; z: number }>): void {
    const depth = imageRoomActorDepth(point)
    this.#avatar.setDepth(depth)
    this.#seatedUpperAvatar.setDepth(depth + 1)
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

  async #walkToNode(
    targetId: string,
    activityToken: ActivityToken = this.#activity.beginWalk(),
    beforeRoute?: () => Promise<boolean>,
  ): Promise<void> {
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
    if (beforeRoute && !(await beforeRoute())) return
    if (!this.#activity.isCurrent(activityToken)) return
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
    const durationMs = (motion.totalLength / AVATAR_WALK_SPEED) * 1_000
    const travel = { elapsedMs: 0 }
    let activeSegmentIndex = -1
    const updateMotion = () => {
      const sample = sampleMotionPathAtTime(motion, travel.elapsedMs, AVATAR_WALK_SPEED)
      if (sample.segmentIndex !== activeSegmentIndex) {
        activeSegmentIndex = sample.segmentIndex
        this.#activeSegmentFromId = this.#graph.node(sample.from.id) ? sample.from.id : this.#currentNodeId
        this.#activeSegmentToId = this.#graph.node(sample.to.id) ? sample.to.id : this.#currentNodeId
        if (this.#graph.node(sample.from.id)) this.#currentNodeId = sample.from.id
        this.#avatarController.applyMovement(sample.direction)
        this.#setState(sample.from.z !== sample.to.z ? 'stair' : 'walking')
      }
      this.#avatar.setPosition(sample.x, sample.y)
      this.#shadow.setPosition(sample.x, sample.y + 5)
      this.#updateAvatarFrame(walkFrameAtDistance(sample.distance, ACTION_FRAMES.walk, AVATAR_WALK_STRIDE))
      this.#setAvatarDepth({
        y: (sample.y / this.#room.image.height) * 100,
        z: sample.z,
      })
    }
    updateMotion()
    await new Promise<void>((resolve) => {
      let routeTween!: Phaser.Tweens.Tween
      routeTween = this.tweens.add({
        targets: travel,
        elapsedMs: durationMs,
        duration: durationMs,
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
    const ownerId = this.#adapter.session().account.id
    const roomId = this.#roomId
    let adapterReserved = false
    let seated = false
    try {
      await this.#walkToNode(seat.approachNodeId, activityToken, async () => {
        this.#syncSeatReservations(this.#adapter.presence(roomId))
        if (!this.#seatReservations.reserve(roomId, seat.id, ownerId)) {
          throw new Error(`Seat ${roomId}:${seat.id} is occupied`)
        }
        try {
          await this.#adapter.reserveSeat(roomId, seat.id)
          adapterReserved = true
          return this.#activity.isCurrent(activityToken) && this.#roomId === roomId
        } catch (error) {
          this.#seatReservations.release(roomId, seat.id, ownerId)
          throw error
        }
      })
      if (!this.#activity.isCurrent(activityToken) || this.#currentNodeId !== seat.approachNodeId || this.#roomId !== roomId) return
      this.#activity.transition(activityToken, 'aligning-seat')
      await this.#sit(seat, activityToken)
      if (!this.#activity.isCurrent(activityToken)) return
      this.#seatReservations.occupy(roomId, seat.id, ownerId)
      seated = true
      await this.#sessionTracker?.seated(roomId, seat.id, { x: seat.sit.x, y: seat.sit.y })
      void this.#pushPresence()
    } finally {
      if (adapterReserved && !seated) {
        this.#seatReservations.release(roomId, seat.id, ownerId)
        await this.#adapter.releaseSeat()
      }
    }
  }

  async #sit(seat: ImageRoomSeat, activityToken: ActivityToken): Promise<void> {
    this.#avatarController.applyMovement(FACING_DELTA[seat.facing])
    this.#updateAvatarFrame(0)
    const sitPixel = roomPointToPixel(this.#room, seat.sit)
    const distance = Math.hypot(sitPixel.x - this.#avatar.x, sitPixel.y - this.#avatar.y)
    this.#setState('sitting')
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
    this.#avatarController.sit()
    this.#shadow.setVisible(false)
    this.#seatedSeat = seat
    this.#activity.transition(activityToken, 'seated')
    this.#setState('seated')
    this.#setAvatarDepth(seat.sit)
    this.#seatedUpperAvatar.setDepth(Math.max(
      this.#avatar.depth + 1,
      ...this.#room.occluders.map((occluder) => occluder.depthY * 100 + 1),
    ))
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
    this.#seatReservations.release(this.#roomId, seat.id, this.#adapter.session().account.id)
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
    this.#setAvatarDepth(approach)
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
    const previousRoomId = this.#roomId
    const ownerId = this.#adapter.session().account.id
    if (!this.#seatedSeat) this.#activity.cancel()
    this.#cancelActiveRoute()
    if (this.#seatedSeat) await this.stand()
    else if (this.#seatReservations.releaseOwner(ownerId, previousRoomId) > 0) await this.#adapter.releaseSeat()
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

  #nodeIsReachable(nodeId: string): boolean {
    return nodeId === this.#currentNodeId || this.#graph.findPath(this.#currentNodeId, nodeId).length > 0
  }

  #syncSeatReservations(presence: readonly StudyPresence[]): void {
    const ownerId = this.#adapter.session().account.id
    this.#seatReservations.syncRemoteOccupants(this.#roomId, presence.flatMap((person) => (
      person.userId !== ownerId && person.seatId
        ? [{ seatId: person.seatId, ownerId: person.userId }]
        : []
    )))
  }

  #clearIntentMarker(): void {
    this.#intentMarker?.destroy()
    this.#intentMarker = null
  }

  #showIntentMarker(target: TouchWorldPoint, kind: 'walk' | 'seat' | 'blocked'): void {
    this.#clearIntentMarker()
    const color = kind === 'blocked' ? 0xff6b6b : kind === 'seat' ? 0xffd166 : 0x6fffe9
    const marker = kind === 'seat'
      ? this.add.ellipse(target.x, target.y, 44, 22, color, 0.12).setStrokeStyle(3, color, 0.95)
      : this.add.circle(target.x, target.y, kind === 'blocked' ? 13 : 10, color, 0.12).setStrokeStyle(3, color, 0.95)
    marker.setDepth(99_500)
    this.#intentMarker = marker
    this.tweens.add({
      targets: marker,
      alpha: 0,
      scaleX: kind === 'seat' ? 1.22 : 1.65,
      scaleY: kind === 'seat' ? 1.22 : 1.65,
      duration: kind === 'blocked' ? 420 : 620,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.#intentMarker === marker) this.#intentMarker = null
        marker.destroy()
      },
    })
  }

  #bindPointerMovement(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const accountId = this.#adapter.session().account.id
      const presence = this.#adapter.presence(this.#roomId)
      this.#syncSeatReservations(presence)
      const intent = resolveTouchIntent({
        world: { x: pointer.worldX, y: pointer.worldY },
        uiConsumed: pointer.event.target instanceof Element
          && Boolean(pointer.event.target.closest('[data-study-ui]')),
        seated: Boolean(this.#seatedSeat),
        activeSeatIntentId: this.#activity.snapshot().activeSeatId,
        nodes: this.#room.nodes.map((node) => ({
          id: node.id,
          ...roomPointToPixel(this.#room, node),
          reachable: this.#nodeIsReachable(node.id),
        })),
        seats: this.#room.seats.map((seat) => ({
          id: seat.id,
          ...roomPointToPixel(this.#room, seat.sit),
          reachable: this.#nodeIsReachable(seat.approachNodeId),
          occupied: !this.#seatReservations.isAvailable(this.#roomId, seat.id, accountId),
        })),
        players: presence.flatMap((person) => {
          if (person.userId === accountId) return []
          const seat = person.seatId ? this.#room.seats.find((candidate) => candidate.id === person.seatId) : null
          const anchor = seat?.sit ?? this.#graph.node(person.nodeId)
          return anchor ? [{ userId: person.userId, ...roomPointToPixel(this.#room, anchor) }] : []
        }),
      })

      if (intent.kind === 'ignored') return
      if (intent.kind === 'stand') {
        this.#clearIntentMarker()
        void this.stand()
        return
      }
      if (intent.kind === 'interact-player') {
        const selected = presence.find((person) => person.userId === intent.userId)
        if (selected) window.dispatchEvent(new CustomEvent('radiotedu:study-player-selected', { detail: { presence: selected } }))
        return
      }
      this.#showIntentMarker(intent.target, intent.kind === 'sit' ? 'seat' : intent.kind)
      if (intent.kind === 'blocked') {
        this.#showActionError(intent.reason === 'occupied-seat' ? 'KOLTUK DOLU' : 'YOL KAPALI')
        return
      }
      if (intent.kind === 'sit') {
        void this.walkToSeat(intent.seatId).catch(() => this.#showActionError('KOLTUK KULLANILAMIYOR'))
        return
      }
      void this.#walkToNode(intent.nodeId)
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
      tapTargets: () => {
        const camera = this.cameras.main
        const accountId = this.#adapter.session().account.id
        const screen = (world: { x: number; y: number }) => ({
          x: camera.x + (world.x - camera.worldView.x) * camera.zoom,
          y: camera.y + (world.y - camera.worldView.y) * camera.zoom,
        })
        return {
          nodes: this.#room.nodes.map((node) => {
            const world = roomPointToPixel(this.#room, node)
            return { id: node.id, reachable: this.#nodeIsReachable(node.id), world, screen: screen(world) }
          }),
          seats: this.#room.seats.map((seat) => {
            const world = roomPointToPixel(this.#room, seat.sit)
            return {
              id: seat.id,
              reachable: this.#nodeIsReachable(seat.approachNodeId),
              occupied: !this.#seatReservations.isAvailable(this.#roomId, seat.id, accountId),
              world,
              screen: screen(world),
            }
          }),
        }
      },
      snapshot: () => ({
        roomId: this.#roomId,
        state: this.#state,
        nodeId: this.#currentNodeId,
        seatId: this.#seatedSeat?.id ?? null,
        position: { x: this.#avatar.x, y: this.#avatar.y },
        z: this.#seatedSeat?.sit.z ?? this.#graph.node(this.#currentNodeId)?.z ?? 0,
        hatId: this.#avatarController.appearance.hatId,
        topId: this.#avatarController.appearance.topId,
        sparkLabel: this.#room.actors.spark?.label ?? null,
        camera: {
          zoom: this.cameras.main.zoom,
          x: this.cameras.main.x,
          y: this.cameras.main.y,
          worldViewX: this.cameras.main.worldView.x,
          worldViewY: this.cameras.main.worldView.y,
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
      tapTargets(): {
        nodes: Array<{
          id: string
          reachable: boolean
          world: { x: number; y: number }
          screen: { x: number; y: number }
        }>
        seats: Array<{
          id: string
          reachable: boolean
          occupied: boolean
          world: { x: number; y: number }
          screen: { x: number; y: number }
        }>
      }
      snapshot(): {
        roomId: ImageRoomId
        state: GameState
        nodeId: string
        seatId: string | null
        position: { x: number; y: number }
        z: number
        hatId: string | null
        topId: string
        sparkLabel: string | null
        camera: {
          zoom: number
          x: number
          y: number
          worldViewX: number
          worldViewY: number
          worldViewWidth: number
          worldViewHeight: number
        }
        roomSize: { width: number; height: number }
      }
    }
  }
}
