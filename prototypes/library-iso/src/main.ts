import './style.css';
import Phaser from 'phaser';
import { LibraryScene } from './game/LibraryScene';

globalThis.Phaser = Phaser;
const { default: BoardPlugin } = await import('phaser3-rex-plugins/plugins/board-plugin.js');

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 390,
  height: 844,
  backgroundColor: '#111c25',
  pixelArt: true,
  roundPixels: true,
  scene: [LibraryScene],
  plugins: {
    scene: [
      {
        key: 'rexBoard',
        plugin: BoardPlugin,
        mapping: 'rexBoard',
      },
    ],
  },
};

new Phaser.Game(config);
