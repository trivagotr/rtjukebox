import Phaser from 'phaser'
import BoardPlugin from 'phaser4-rex-plugins/plugins/board-plugin.js'

import type { StudyAdapter } from '../adapters/StudyAdapter'
import type { ImageRoomId } from '../rooms/ImageRoomDefinition'
import { EngineProofScene } from './EngineProofScene'
import { ImageRoomScene } from './ImageRoomScene'

export type StudyGameMode = 'study' | 'engine-proof'

export function createStudyGame(parent = 'game-canvas', mode: StudyGameMode = 'study', adapter?: StudyAdapter, initialRoom: ImageRoomId = 'library'): Phaser.Game {
  const width = mode === 'engine-proof' ? 1100 : 941
  const height = 760
  return new Phaser.Game({
    type: mode === 'study' ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#0b151b',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width,
      height,
    },
    scene: mode === 'engine-proof' ? [EngineProofScene] : [new ImageRoomScene(adapter, initialRoom)],
    plugins: {
      scene: [
        {
          key: 'rexBoard',
          plugin: BoardPlugin,
          mapping: 'rexBoard',
        },
      ],
    },
  })
}
