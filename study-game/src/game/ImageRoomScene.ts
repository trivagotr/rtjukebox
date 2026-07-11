import Phaser from 'phaser'

import { LocalStudyAdapter } from '../adapters/LocalStudyAdapter'
import type { StudyAdapter } from '../adapters/StudyAdapter'
import { DIRECTIONS, type AvatarAction, type AvatarAppearance, type AvatarLayerSlot, type Direction8 } from '../avatar/AvatarAppearance'
import { DEFAULT_AVATAR_ASSET_MANIFEST } from '../avatar/AvatarAssetManifest'
import { InventoryStore } from '../inventory/InventoryStore'
import { WearableCatalog, type WardrobeItem, type WardrobeSlot } from '../inventory/WearableCatalog'
import { WardrobeController } from '../inventory/WardrobeController'
import { NavigationGraph, type NavigationNode } from '../pathfinding/NavigationGraph'
import { IMAGE_ROOMS, roomPointToPixel, type ImageRoomDefinition, type ImageRoomId, type ImageRoomSeat } from '../rooms/ImageRoomDefinition'
import { AvatarController } from './AvatarController'
import { calculateOverviewZoom } from './CameraFraming'

const ACTION_FRAMES: Record<AvatarAction, number> = { idle: 1, walk: 4, sit: 1, stand: 3 }
const RENDERED_LAYERS: AvatarLayerSlot[] = ['body', 'skin', 'hair', 'top', 'bottom', 'shoes', 'hat']
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/avatars/engine-proof`
const ROOM_BASE = import.meta.env.BASE_URL
const SUPPORTED_ITEMS = ['short-hair', 'radio-hoodie', 'varsity-jacket', 'jeans', 'black-cargos', 'sneakers', 'boots', 'bucket-hat', 'beanie'] as const

type GameState = 'ready' | 'walking' | 'stair' | 'seated' | 'standing' | 'spark' | 'rock'

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

export class ImageRoomScene extends Phaser.Scene {
  #roomId: ImageRoomId = 'library'
  #room: ImageRoomDefinition = IMAGE_ROOMS.library
  #graph = new NavigationGraph(this.#room.nodes, this.#room.edges)
  #currentNodeId = this.#room.spawnNodeId
  #state: GameState = 'ready'
  #routeToken = 0
  #seatedSeat: ImageRoomSeat | null = null
  #background!: Phaser.GameObjects.Image
  #avatar!: Phaser.GameObjects.Container
  #shadow!: Phaser.GameObjects.Ellipse
  #avatarSprites = new Map<AvatarLayerSlot, Phaser.GameObjects.Sprite>()
  #avatarController!: AvatarController
  #wardrobe!: WardrobeController
  #roomObjects: Phaser.GameObjects.GameObject[] = []
  #seatForegroundObjects: Phaser.GameObjects.GameObject[] = []
  readonly #adapter: StudyAdapter
  readonly #initialRoom: ImageRoomId

  constructor(adapter: StudyAdapter = new LocalStudyAdapter(), initialRoom: ImageRoomId = 'library') {
    super('image-rooms')
    this.#adapter = adapter
    this.#initialRoom = initialRoom
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
    const inventory = new InventoryStore(catalog, storage, this.#adapter.session().ownedWearableIds)
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
    for (const object of [...this.#roomObjects, ...this.#seatForegroundObjects]) object.destroy()
    this.#roomObjects = []
    this.#seatForegroundObjects = []
  }

  #renderRoom(roomId: ImageRoomId): void {
    this.#routeToken += 1
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
    this.#adapter.enterRoom(this.#roomId, this.#currentNodeId)

    this.cameras.main.stopFollow()
    this.cameras.main.removeBounds()
    this.#fitCamera()
    this.#setState('ready')
    this.#syncHud()
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
    for (const presence of this.#adapter.presence(this.#roomId)) {
      const node = this.#graph.node(presence.nodeId)
      if (!node) continue
      const pixel = roomPointToPixel(this.#room, node)
      const container = this.add.container(pixel.x, pixel.y).setDepth(node.y * 100 + 12).setScale(0.88)
      const shadow = this.add.ellipse(0, 5, 34, 11, 0x020609, 0.35)
      const layers: Phaser.GameObjects.Sprite[] = []
      for (const layer of RENDERED_LAYERS) {
        const key = textureKey(layer, 'idle', DEFAULT_APPEARANCE)
        if (!key) continue
        const sprite = this.add.sprite(0, 0, key).setOrigin(0.5, 0.88).setFrame(DIRECTIONS.indexOf('s'))
        if (layer === 'top') sprite.setTint(presence.color)
        layers.push(sprite)
      }
      const name = this.add.text(0, -86, presence.displayName, {
        color: '#ffffff', fontFamily: 'Segoe UI, sans-serif', fontSize: '10px',
        backgroundColor: '#152126cc', padding: { x: 4, y: 2 },
      }).setOrigin(0.5)
      container.add([shadow, ...layers, name])
      this.#roomObjects.push(container)
    }
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

  async #walkToNode(targetId: string): Promise<void> {
    if (this.#seatedSeat) await this.stand()
    const path = this.#graph.findPath(this.#currentNodeId, targetId)
    if (path.length < 2) return
    const token = ++this.#routeToken
    for (let index = 1; index < path.length; index += 1) {
      if (token !== this.#routeToken) return
      const from = this.#graph.node(path[index - 1]!)!
      const to = this.#graph.node(path[index]!)!
      await this.#walkSegment(from, to, token)
      this.#currentNodeId = to.id
    }
    if (token !== this.#routeToken) return
    this.#avatarController.applyMovement({ x: 0, y: 0 })
    this.#updateAvatarFrame(0)
    this.#setState('ready')
  }

  async #walkSegment(from: NavigationNode, to: NavigationNode, token: number): Promise<void> {
    const fromPixel = roomPointToPixel(this.#room, from)
    const toPixel = roomPointToPixel(this.#room, to)
    const dx = toPixel.x - fromPixel.x
    const dy = toPixel.y - fromPixel.y
    this.#avatarController.applyMovement({ x: dx, y: dy })
    this.#setState(from.z !== to.z ? 'stair' : 'walking')
    const distance = Math.hypot(dx, dy)
    const duration = Phaser.Math.Clamp(Math.round(distance * 3.2), 260, from.z !== to.z ? 900 : 760)
    const progress = { value: 0 }
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: progress,
        value: 1,
        duration,
        ease: 'Linear',
        onUpdate: (tween) => {
          this.#avatar.setPosition(
            Phaser.Math.Linear(fromPixel.x, toPixel.x, progress.value),
            Phaser.Math.Linear(fromPixel.y, toPixel.y, progress.value),
          )
          this.#shadow.setPosition(this.#avatar.x, this.#avatar.y + 5)
          const frame = Math.floor(tween.progress * ACTION_FRAMES.walk) % ACTION_FRAMES.walk
          this.#updateAvatarFrame(frame)
          this.#setAvatarDepth(Phaser.Math.Linear(from.y, to.y, tween.progress))
        },
        onComplete: () => resolve(),
        onStop: () => resolve(),
      })
    })
    if (token !== this.#routeToken) return
    this.#setAvatarDepth(to.y)
  }

  async walkToSeat(seatId: string): Promise<void> {
    const seat = this.#room.seats.find((candidate) => candidate.id === seatId)
    if (!seat) throw new Error(`Unknown seat ${this.#roomId}:${seatId}`)
    await this.#walkToNode(seat.approachNodeId)
    if (this.#currentNodeId !== seat.approachNodeId) return
    this.#adapter.reserveSeat(this.#roomId, seat.id)
    await this.#sit(seat)
  }

  async #sit(seat: ImageRoomSeat): Promise<void> {
    this.#avatarController.applyMovement(FACING_DELTA[seat.facing])
    this.#avatarController.sit()
    const sitPixel = roomPointToPixel(this.#room, seat.sit)
    this.#setState('seated')
    this.#shadow.setVisible(false)
    await new Promise<void>((resolve) => this.tweens.add({
      targets: this.#avatar, x: sitPixel.x, y: sitPixel.y, duration: 220, ease: 'Sine.easeOut', onComplete: () => resolve(),
    }))
    this.#seatedSeat = seat
    this.#setAvatarDepth(seat.sit.y)
    this.#setSeatForeground(seat)
    this.#updateAvatarFrame(0)
  }

  async stand(): Promise<void> {
    if (!this.#seatedSeat) return
    const seat = this.#seatedSeat
    this.#seatedSeat = null
    this.#adapter.releaseSeat()
    this.#setSeatForeground(null)
    this.#avatarController.stand()
    this.#setState('standing')
    for (let frame = 0; frame < ACTION_FRAMES.stand; frame += 1) {
      this.#updateAvatarFrame(frame)
      await new Promise<void>((resolve) => this.time.delayedCall(130, () => resolve()))
    }
    const approach = this.#graph.node(seat.approachNodeId)!
    const pixel = roomPointToPixel(this.#room, approach)
    this.#avatar.setPosition(pixel.x, pixel.y)
    this.#shadow.setPosition(pixel.x, pixel.y + 5).setVisible(true)
    this.#setAvatarDepth(approach.y)
    this.#avatarController.applyMovement({ x: 0, y: 0 })
    this.#updateAvatarFrame(0)
    this.#setState('ready')
  }

  switchRoom(roomId: ImageRoomId): void {
    if (roomId === this.#roomId) return
    this.#renderRoom(roomId)
  }

  equip(slot: WardrobeSlot, id: string): void {
    this.#adapter.equipWearable(id)
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
        void this.walkToSeat(nearestSeat.seat.id)
        return
      }
      const node = this.#nearestNode(pointer.worldX, pointer.worldY)
      if (node) void this.#walkToNode(node.id)
    })
  }

  #bindHud(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-room-id]').forEach((button) => {
      button.addEventListener('click', () => this.switchRoom(button.dataset.roomId as ImageRoomId))
    })
    document.querySelectorAll<HTMLButtonElement>('[data-wearable-id]').forEach((button) => {
      button.addEventListener('click', () => this.equip(button.dataset.slot as WardrobeSlot, button.dataset.wearableId!))
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
      walkToSeat: (seatId) => this.walkToSeat(seatId),
      stand: () => this.stand(),
      equip: (slot, id) => this.equip(slot, id),
      snapshot: () => ({
        roomId: this.#roomId,
        state: this.#state,
        nodeId: this.#currentNodeId,
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
      switchRoom(roomId: ImageRoomId): void
      walkToSeat(seatId: string): Promise<void>
      stand(): Promise<void>
      equip(slot: WardrobeSlot, id: string): void
      snapshot(): {
        roomId: ImageRoomId
        state: GameState
        nodeId: string
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
