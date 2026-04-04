import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import LandingScene from './scenes/LandingScene.js'
import WaitingScene from './scenes/WaitingScene.js'
import RaceScene from './scenes/RaceScene.js'
import FinishScene from './scenes/FinishScene.js'

const config = {
  type: Phaser.AUTO,
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
  dom: { createContainer: true },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BootScene, LandingScene, WaitingScene, RaceScene, FinishScene],
}

new Phaser.Game(config)
