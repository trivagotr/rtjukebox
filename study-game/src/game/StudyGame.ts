import Phaser from 'phaser'
import BoardPlugin from 'phaser4-rex-plugins/plugins/board-plugin.js'

import { EngineProofScene } from './EngineProofScene'

export function createStudyGame(parent = 'game-canvas'): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1100,
    height: 760,
    backgroundColor: '#0b151b',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1100,
      height: 760,
    },
    scene: [EngineProofScene],
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
