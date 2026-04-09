import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import LandingScene from './scenes/LandingScene.js'
import WaitingScene from './scenes/WaitingScene.js'
import RaceScene from './scenes/RaceScene.js'
import PlayerScene from './scenes/PlayerScene.js'
import CyclingPlayerScene from './scenes/CyclingPlayerScene.js'
import SwimmingPlayerScene from './scenes/SwimmingPlayerScene.js'
import TugOfWarScene from './scenes/TugOfWarScene.js'
import TugOfWarPlayerScene from './scenes/TugOfWarPlayerScene.js'
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
  scene: [BootScene, LandingScene, WaitingScene, RaceScene, PlayerScene, CyclingPlayerScene, SwimmingPlayerScene, TugOfWarScene, TugOfWarPlayerScene, FinishScene],
}

new Phaser.Game(config)
