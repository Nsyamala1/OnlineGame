import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

const FINISH_LINE = 2000
const START_POSITION = 50
const WORLD_WIDTH = 2500

export default class RaceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Race' })
    this._characters = {}
    this._prevPositions = {}
    this._gameStarted = false
  }

  init(data) {
    this._initPlayers = data.players || []
    this._characters = {}
    this._prevPositions = {}
    this._gameStarted = false
  }

  create() {
    const { width, height } = this.scale

    this._trackTop = height * 0.25
    this._trackBottom = height * 0.85
    this._trackHeight = this._trackBottom - this._trackTop
    this._laneHeight = this._trackHeight / 4

    // Camera bounds
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, height)

    this._buildBackground(width, height)
    this._buildTrack(height)
    this._buildFinishLine()
    this._buildStartLine()
    this._spawnPlayers()
    this._buildUI(width, height)
    this._setupInput()
    this._setupSocket()
  }

  _buildBackground(width, height) {
    // Sky gradient (fixed, no scroll)
    const sky = this.add.graphics()
    sky.fillGradientStyle(0x87ceeb, 0x87ceeb, 0x1a1a6e, 0x1a1a6e, 1)
    sky.fillRect(0, 0, width, this._trackTop)
    sky.setScrollFactor(0)

    // Clouds TileSprite
    if (this.textures.exists('clouds')) {
      this._cloudsTile = this.add.tileSprite(0, height * 0.05, WORLD_WIDTH, 80, 'clouds')
      this._cloudsTile.setOrigin(0, 0)
      this._cloudsTile.setScrollFactor(0)
      this._cloudsTile.setAlpha(0.85)
    }

    // Mountains TileSprite
    if (this.textures.exists('mountains')) {
      this._mountainsTile = this.add.tileSprite(0, this._trackTop - 100, WORLD_WIDTH, 120, 'mountains')
      this._mountainsTile.setOrigin(0, 0)
      this._mountainsTile.setScrollFactor(0)
      this._mountainsTile.setAlpha(0.9)
    }

    // Trees TileSprite
    if (this.textures.exists('trees')) {
      this._treesTile = this.add.tileSprite(0, this._trackTop - 80, WORLD_WIDTH, 100, 'trees')
      this._treesTile.setOrigin(0, 0)
      this._treesTile.setScrollFactor(0)
    }

    // Ground strip below track
    const ground = this.add.rectangle(WORLD_WIDTH / 2, this._trackBottom + 20, WORLD_WIDTH, 40, 0x2d5a27)
    ground.setDepth(1)
  }

  _buildTrack(height) {
    // Main track surface
    const track = this.add.graphics()
    track.fillStyle(0x3d3d3d, 1)
    track.fillRect(0, this._trackTop, WORLD_WIDTH, this._trackHeight)

    // Track border top and bottom
    track.fillStyle(0xffd700, 1)
    track.fillRect(0, this._trackTop, WORLD_WIDTH, 4)
    track.fillRect(0, this._trackBottom - 4, WORLD_WIDTH, 4)

    // Lane dividers (dashed horizontal lines)
    const dashLen = 40
    const gapLen = 30
    track.fillStyle(0xffffff, 0.3)
    for (let lane = 1; lane < 4; lane++) {
      const y = this._trackTop + lane * this._laneHeight
      for (let x = 0; x < WORLD_WIDTH; x += dashLen + gapLen) {
        track.fillRect(x, y - 1, dashLen, 2)
      }
    }

    // Distance markers every 200 units
    const markerStyle = { fontSize: '11px', fontFamily: 'Arial', color: '#888888' }
    for (let dist = 200; dist < FINISH_LINE; dist += 200) {
      const marker = this.add.text(dist, this._trackTop - 14, `${dist}m`, markerStyle)
      marker.setOrigin(0.5, 1)
      // Small tick
      const tick = this.add.graphics()
      tick.fillStyle(0x888888, 0.5)
      tick.fillRect(dist - 1, this._trackTop, 2, 8)
    }
  }

  _buildFinishLine() {
    const squareH = 20
    const cols = 4
    const rows = Math.ceil(this._trackHeight / squareH)

    const g = this.add.graphics()
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const isWhite = (row + col) % 2 === 0
        g.fillStyle(isWhite ? 0xffd700 : 0x000000, 1)
        const x = FINISH_LINE + col * (squareH / 2) - squareH
        const y = this._trackTop + row * squareH
        g.fillRect(x, y, squareH / 2, squareH)
      }
    }
    // Finish post
    g.fillStyle(0xffffff, 1)
    g.fillRect(FINISH_LINE - 3, this._trackTop - 40, 6, 40)
    // Flag
    g.fillStyle(0xe74c3c, 1)
    g.fillTriangle(FINISH_LINE - 3, this._trackTop - 40, FINISH_LINE + 22, this._trackTop - 30, FINISH_LINE - 3, this._trackTop - 20)

    const finishText = this.add.text(FINISH_LINE, this._trackTop - 55, 'FINISH', {
      fontSize: '18px',
      fontFamily: '"Arial Black", Arial',
      color: '#ffd700',
      stroke: '#000',
      strokeThickness: 4,
    })
    finishText.setOrigin(0.5, 1)
  }

  _buildStartLine() {
    const g = this.add.graphics()
    g.lineStyle(3, 0xffffff, 0.8)
    const dashH = 15
    for (let y = this._trackTop; y < this._trackBottom; y += dashH * 1.5) {
      g.beginPath()
      g.moveTo(START_POSITION, y)
      g.lineTo(START_POSITION, y + dashH)
      g.strokePath()
    }

    const startText = this.add.text(START_POSITION, this._trackTop - 14, 'START', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#ffffff',
    })
    startText.setOrigin(0.5, 1)
  }

  _spawnPlayers() {
    const socket = getSocket()
    const myId = socket ? socket.id : null

    this._initPlayers.forEach(p => {
      const laneY = this._trackTop + (p.lane + 0.5) * this._laneHeight
      const worldX = p.position || START_POSITION

      const ch = new PlayerCharacter(this, worldX, laneY, {
        color: p.color,
        name: p.name,
        wins: p.wins,
        isMe: p.id === myId,
      })
      ch.playIdle()
      this._characters[p.id] = ch
      this._prevPositions[p.id] = worldX

      // Camera follow the local player
      if (p.id === myId) {
        this.cameras.main.startFollow(ch.posContainer, true, 0.08, 0)
      }
    })
  }

  _buildUI(width, height) {
    // TAP / CLICK hint
    this._hintText = this.add.text(width / 2, 28, 'TAP / CLICK TO MOVE', {
      fontSize: '16px',
      fontFamily: '"Arial Black", Arial',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.4)',
      padding: { x: 12, y: 6 },
    })
    this._hintText.setOrigin(0.5).setScrollFactor(0).setDepth(100)

    this.tweens.add({
      targets: this._hintText,
      alpha: 0,
      delay: 3000,
      duration: 1000,
    })

    // Progress bar container at bottom
    this._progressBars = this.add.container(0, height - 56)
    this._progressBars.setScrollFactor(0).setDepth(100)

    // Progress bar background
    const barBg = this.add.graphics()
    barBg.fillStyle(0x000000, 0.65)
    barBg.fillRect(0, 0, width, 56)
    this._progressBars.add(barBg)

    // Will be updated when we get player data
    this._progressBarGraphics = this.add.graphics()
    this._progressBarGraphics.setScrollFactor(0).setDepth(101)
    this._progressBarItems = []
  }

  _setupInput() {
    // Click
    this.input.on('pointerdown', (ptr) => {
      const socket = getSocket()
      if (socket && this._gameStarted) {
        socket.emit('move')
        this._spawnClickRipple(ptr.x, ptr.y)
      }
    })
  }

  _spawnClickRipple(x, y) {
    const circle = this.add.circle(x, y, 10, 0xffffff, 0.6)
    circle.setScrollFactor(0).setDepth(200)
    this.tweens.add({
      targets: circle,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => circle.destroy(),
    })
  }

  _setupSocket() {
    const socket = getSocket()
    if (!socket) return

    socket.off('updateGame')
    socket.on('updateGame', (data) => this._onUpdateGame(data))
  }

  _onUpdateGame(data) {
    const { players, gameState } = data
    const socket = getSocket()
    const myId = socket ? socket.id : null

    if (gameState === 'racing' && !this._gameStarted) {
      this._gameStarted = true
      this.cameras.main.shake(300, 0.01)
    }

    // Sync player characters
    players.forEach(p => {
      if (!this._characters[p.id]) {
        // Late-joining player or new spawn
        const laneY = this._trackTop + (p.lane + 0.5) * this._laneHeight
        const ch = new PlayerCharacter(this, p.position || START_POSITION, laneY, {
          color: p.color,
          name: p.name,
          wins: p.wins,
          isMe: p.id === myId,
        })
        this._characters[p.id] = ch
        this._prevPositions[p.id] = p.position || START_POSITION

        if (p.id === myId) {
          this.cameras.main.startFollow(ch.posContainer, true, 0.08, 0)
        }
      }

      const ch = this._characters[p.id]
      const prevX = this._prevPositions[p.id] || START_POSITION
      const newX = p.position || START_POSITION

      ch.moveTo(newX)

      if (gameState === 'racing') {
        if (newX > prevX) {
          ch.startRunning()
        } else {
          ch.stopRunning()
        }
      } else {
        ch.stopRunning()
      }

      this._prevPositions[p.id] = newX
      ch.updateWins(p.wins)
    })

    // Remove disconnected
    const activeIds = new Set(players.map(p => p.id))
    for (const id of Object.keys(this._characters)) {
      if (!activeIds.has(id)) {
        this._characters[id].destroy()
        delete this._characters[id]
      }
    }

    // Update progress bars
    this._updateProgressBars(players)

    if (gameState === 'finished') {
      const winner = [...players].sort((a, b) => b.position - a.position)[0]
      const socket = getSocket()
      if (socket) socket.off('updateGame')
      this._destroyAllCharacters()
      this.scene.start('Finish', { players, winner })
    }
  }

  _updateProgressBars(players) {
    const { width, height } = this.scale
    const g = this._progressBarGraphics
    g.clear()

    const barW = (width - 20) / players.length
    const barH = 14
    const yOff = height - 50

    players.forEach((p, i) => {
      const pct = Math.min(p.position / FINISH_LINE, 1)
      const x = 10 + i * barW
      const colorInt = Phaser.Display.Color.HexStringToColor(p.color).color

      // Track background
      g.fillStyle(0x333333, 0.9)
      g.fillRoundedRect(x, yOff, barW - 6, barH, 3)

      // Filled portion
      g.fillStyle(colorInt, 1)
      g.fillRoundedRect(x, yOff, (barW - 6) * pct, barH, 3)

      // Name
      if (!this._barLabels) this._barLabels = []
      if (!this._barLabels[i]) {
        this._barLabels[i] = this.add.text(x + (barW - 6) / 2, yOff - 2, '', {
          fontSize: '11px',
          fontFamily: 'Arial',
          color: '#ffffff',
          stroke: '#000',
          strokeThickness: 2,
        }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(102)
      }
      this._barLabels[i].setX(x + (barW - 6) / 2)
      this._barLabels[i].setText(`${p.name} ${Math.round(pct * 100)}%`)
    })
  }

  _destroyAllCharacters() {
    for (const id of Object.keys(this._characters)) {
      try { this._characters[id].destroy() } catch (e) {}
    }
    this._characters = {}
  }

  update() {
    const scrollX = this.cameras.main.scrollX

    if (this._mountainsTile) {
      this._mountainsTile.tilePositionX = scrollX * 0.1
    }
    if (this._treesTile) {
      this._treesTile.tilePositionX = scrollX * 0.25
    }
    if (this._cloudsTile) {
      this._cloudsTile.tilePositionX = scrollX * 0.05
    }
  }

  shutdown() {
    const socket = getSocket()
    if (socket) socket.off('updateGame')
    this._destroyAllCharacters()
  }
}
