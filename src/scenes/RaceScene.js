import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

const FINISH_LINE    = 2000
const START_POSITION = 50
const WORLD_WIDTH    = 2500

export default class RaceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Race' })
    this._characters     = {}
    this._prevPositions  = {}
    this._gameStarted    = false
  }

  init(data) {
    this._initPlayers   = data.players  || []
    this._gameType      = data.gameType || 'sprint'
    this._characters    = {}
    this._prevPositions = {}
    this._gameStarted   = false
    this._waveTime      = 0
  }

  create() {
    const { width, height } = this.scale

    this._trackTop    = height * 0.25
    this._trackBottom = height * 0.85
    this._trackHeight = this._trackBottom - this._trackTop
    this._laneHeight  = this._trackHeight / 4

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, height)

    if (this._gameType === 'swimming') {
      this._buildSwimmingBackground(width, height)
      this._buildSwimmingPool()
      this._buildSwimmingStart()
      this._buildSwimmingFinish()
      this._buildWaterSurface()
    } else {
      this._buildBackground(width, height)
      this._buildTrack(height)
      this._buildFinishLine()
      this._buildStartLine()
    }

    this._spawnPlayers()
    this._buildUI(width, height)
    this._setupInput()
    this._setupSocket()
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SPRINT / CYCLING  environment
  // ══════════════════════════════════════════════════════════════════════════

  _buildBackground(width, height) {
    const sky = this.add.graphics()
    sky.fillGradientStyle(0x87ceeb, 0x87ceeb, 0x1a1a6e, 0x1a1a6e, 1)
    sky.fillRect(0, 0, width, this._trackTop)
    sky.setScrollFactor(0)

    if (this.textures.exists('clouds')) {
      this._cloudsTile = this.add.tileSprite(0, height * 0.05, WORLD_WIDTH, 80, 'clouds')
        .setOrigin(0, 0).setScrollFactor(0).setAlpha(0.85)
    }
    if (this.textures.exists('mountains')) {
      this._mountainsTile = this.add.tileSprite(0, this._trackTop - 100, WORLD_WIDTH, 120, 'mountains')
        .setOrigin(0, 0).setScrollFactor(0).setAlpha(0.9)
    }
    if (this.textures.exists('trees')) {
      this._treesTile = this.add.tileSprite(0, this._trackTop - 80, WORLD_WIDTH, 100, 'trees')
        .setOrigin(0, 0).setScrollFactor(0)
    }

    this.add.rectangle(WORLD_WIDTH / 2, this._trackBottom + 20, WORLD_WIDTH, 40, 0x2d5a27).setDepth(1)
  }

  _buildTrack() {
    const track = this.add.graphics()
    track.fillStyle(0x3d3d3d, 1)
    track.fillRect(0, this._trackTop, WORLD_WIDTH, this._trackHeight)

    track.fillStyle(0xffd700, 1)
    track.fillRect(0, this._trackTop, WORLD_WIDTH, 4)
    track.fillRect(0, this._trackBottom - 4, WORLD_WIDTH, 4)

    const dashLen = 40, gapLen = 30
    track.fillStyle(0xffffff, 0.3)
    for (let lane = 1; lane < 4; lane++) {
      const y = this._trackTop + lane * this._laneHeight
      for (let x = 0; x < WORLD_WIDTH; x += dashLen + gapLen) {
        track.fillRect(x, y - 1, dashLen, 2)
      }
    }

    const markerStyle = { fontSize: '11px', fontFamily: 'Arial', color: '#888888' }
    for (let dist = 200; dist < FINISH_LINE; dist += 200) {
      this.add.text(dist, this._trackTop - 14, `${dist}m`, markerStyle).setOrigin(0.5, 1)
      const tick = this.add.graphics()
      tick.fillStyle(0x888888, 0.5)
      tick.fillRect(dist - 1, this._trackTop, 2, 8)
    }
  }

  _buildFinishLine() {
    const squareH = 20
    const cols    = 4
    const rows    = Math.ceil(this._trackHeight / squareH)
    const g       = this.add.graphics()

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        g.fillStyle((row + col) % 2 === 0 ? 0xffd700 : 0x000000, 1)
        g.fillRect(FINISH_LINE + col * (squareH / 2) - squareH, this._trackTop + row * squareH, squareH / 2, squareH)
      }
    }
    g.fillStyle(0xffffff, 1)
    g.fillRect(FINISH_LINE - 3, this._trackTop - 40, 6, 40)
    g.fillStyle(0xe74c3c, 1)
    g.fillTriangle(FINISH_LINE - 3, this._trackTop - 40, FINISH_LINE + 22, this._trackTop - 30, FINISH_LINE - 3, this._trackTop - 20)

    this.add.text(FINISH_LINE, this._trackTop - 55, 'FINISH', {
      fontSize: '18px', fontFamily: '"Arial Black", Arial', color: '#ffd700', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 1)
  }

  _buildStartLine() {
    const g = this.add.graphics()
    g.lineStyle(3, 0xffffff, 0.8)
    const dashH = 15
    for (let y = this._trackTop; y < this._trackBottom; y += dashH * 1.5) {
      g.beginPath(); g.moveTo(START_POSITION, y); g.lineTo(START_POSITION, y + dashH); g.strokePath()
    }
    this.add.text(START_POSITION, this._trackTop - 14, 'START', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0.5, 1)
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SWIMMING  environment
  // ══════════════════════════════════════════════════════════════════════════

  _buildSwimmingBackground(width, height) {
    // ── Sky above the pool ──────────────────────────────────────────────────
    const sky = this.add.graphics().setScrollFactor(0)
    sky.fillGradientStyle(0xb3e5fc, 0xb3e5fc, 0x4fc3f7, 0x4fc3f7, 1)
    sky.fillRect(0, 0, width, this._trackTop)

    // ── Crowd / bleachers (simple coloured rows, fixed to screen) ──────────
    const seatColors = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xfb8c00]
    const rows = 5, seatH = Math.floor((this._trackTop * 0.7) / rows)
    const bleacherG = this.add.graphics().setScrollFactor(0)
    for (let r = 0; r < rows; r++) {
      const y = this._trackTop * 0.08 + r * seatH
      for (let x = 0; x < width; x += 22) {
        bleacherG.fillStyle(seatColors[(r + Math.floor(x / 22)) % seatColors.length], 0.55)
        bleacherG.fillRoundedRect(x + 2, y + 2, 18, seatH - 4, 3)
      }
    }

    // ── Pool deck strip (top + bottom of pool) ──────────────────────────────
    const deckG = this.add.graphics()
    deckG.fillStyle(0xddd5c5, 1)
    deckG.fillRect(0, this._trackTop - 12, WORLD_WIDTH, 14)    // top deck
    deckG.fillRect(0, this._trackBottom,   WORLD_WIDTH, 14)    // bottom deck

    // ── Pool water fill ─────────────────────────────────────────────────────
    const waterG = this.add.graphics()
    // Deep-water gradient simulated with two rects
    waterG.fillStyle(0x1565c0, 1)
    waterG.fillRect(0, this._trackTop, WORLD_WIDTH, this._trackHeight)
    waterG.fillStyle(0x0d47a1, 0.35)
    waterG.fillRect(0, this._trackTop + this._trackHeight * 0.55, WORLD_WIDTH, this._trackHeight * 0.45)

    // ── Underwater lane-bottom tiles (the dark T-bars at lane ends) ─────────
    const tileG = this.add.graphics()
    tileG.fillStyle(0x1976d2, 0.4)
    for (let lane = 0; lane < 4; lane++) {
      const laneY = this._trackTop + lane * this._laneHeight
      // Centre line in each lane
      tileG.fillRect(0, laneY + this._laneHeight / 2 - 1, WORLD_WIDTH, 2)
    }

    // ── Distance markers ────────────────────────────────────────────────────
    const markerStyle = { fontSize: '11px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.5)' }
    for (let dist = 200; dist < FINISH_LINE; dist += 200) {
      this.add.text(dist, this._trackTop - 16, `${dist}m`, markerStyle).setOrigin(0.5, 1)
      const tick = this.add.graphics()
      tick.fillStyle(0xffffff, 0.3)
      tick.fillRect(dist - 1, this._trackTop, 2, 10)
    }
  }

  _buildSwimmingPool() {
    const g = this.add.graphics().setDepth(2)

    // ── Lane ropes (series of small circles along each lane boundary) ───────
    const FLOAT_SPACING = 60
    const FLOAT_R       = 5

    // Lane boundary y-positions (between lanes, not including outer edges)
    for (let lane = 1; lane < 4; lane++) {
      const ropeY = this._trackTop + lane * this._laneHeight

      for (let x = START_POSITION + 10; x < FINISH_LINE - 10; x += FLOAT_SPACING) {
        // Red within 200 of start/finish, alternating blue/white in middle
        const nearEnd = x < START_POSITION + 200 || x > FINISH_LINE - 200
        let color
        if (nearEnd) {
          color = 0xe53935   // red near walls
        } else {
          const idx = Math.floor((x - START_POSITION) / FLOAT_SPACING)
          color = idx % 3 === 0 ? 0x1e88e5 : idx % 3 === 1 ? 0xffffff : 0x1e88e5
        }
        g.fillStyle(color, 0.9)
        g.fillCircle(x, ropeY, FLOAT_R)

        // Thin rope line connecting floats
        g.lineStyle(1, 0xffffff, 0.25)
        g.beginPath()
        g.moveTo(x - FLOAT_SPACING + FLOAT_R, ropeY)
        g.lineTo(x - FLOAT_R, ropeY)
        g.strokePath()
      }
    }

    // Outer pool borders
    g.lineStyle(3, 0xffd700, 0.7)
    g.strokeRect(0, this._trackTop, WORLD_WIDTH, this._trackHeight)
  }

  _buildSwimmingStart() {
    const g = this.add.graphics().setDepth(3)

    // Starting blocks — one per lane
    for (let lane = 0; lane < 4; lane++) {
      const laneY  = this._trackTop + lane * this._laneHeight
      const blockY = laneY + this._laneHeight / 2 - 22
      const blockX = START_POSITION - 28

      // Block platform
      g.fillStyle(0x37474f, 1)
      g.fillRect(blockX, blockY, 30, 12)
      g.fillStyle(0x546e7a, 1)
      g.fillRect(blockX + 2, blockY - 14, 26, 14)   // upright

      // Number on block
      this.add.text(blockX + 15, blockY + 6, String(lane + 1), {
        fontSize: '9px', fontFamily: 'Arial', color: '#ffffff',
      }).setOrigin(0.5).setDepth(4)
    }

    this.add.text(START_POSITION - 14, this._trackTop - 16, 'START', {
      fontSize: '12px', fontFamily: '"Arial Black", Arial',
      color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1)
  }

  _buildSwimmingFinish() {
    const g = this.add.graphics().setDepth(3)

    // Touch wall — alternating blue/white tiles
    const tileH = this._trackHeight / 8
    for (let i = 0; i < 8; i++) {
      g.fillStyle(i % 2 === 0 ? 0x1e88e5 : 0xffffff, 1)
      g.fillRect(FINISH_LINE, this._trackTop + i * tileH, 18, tileH)
    }

    // Post + flag
    g.fillStyle(0xffffff, 1)
    g.fillRect(FINISH_LINE + 8, this._trackTop - 44, 5, 44)
    g.fillStyle(0xe74c3c, 1)
    g.fillTriangle(
      FINISH_LINE + 8,  this._trackTop - 44,
      FINISH_LINE + 32, this._trackTop - 34,
      FINISH_LINE + 8,  this._trackTop - 24
    )

    this.add.text(FINISH_LINE + 10, this._trackTop - 58, 'FINISH', {
      fontSize: '18px', fontFamily: '"Arial Black", Arial',
      color: '#ffd700', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 1)
  }

  // Animated wave line at pool surface — drawn fresh each frame in update()
  _buildWaterSurface() {
    this._waterSurfaceG = this.add.graphics().setScrollFactor(0).setDepth(5)
  }

  _updateWaterSurface() {
    const g   = this._waterSurfaceG
    const w   = this.scale.width
    const y0  = this._trackTop + 3

    g.clear()

    // First wave
    g.lineStyle(3, 0x64b5f6, 0.65)
    g.beginPath()
    for (let x = 0; x <= w; x += 3) {
      const wy = y0 + Math.sin((x + this._waveTime * 55) * 0.035) * 4
      x === 0 ? g.moveTo(x, wy) : g.lineTo(x, wy)
    }
    g.strokePath()

    // Second wave (offset phase)
    g.lineStyle(2, 0x42a5f5, 0.35)
    g.beginPath()
    for (let x = 0; x <= w; x += 3) {
      const wy = y0 + 9 + Math.sin((x + this._waveTime * 40 + 40) * 0.028) * 3
      x === 0 ? g.moveTo(x, wy) : g.lineTo(x, wy)
    }
    g.strokePath()
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Shared
  // ══════════════════════════════════════════════════════════════════════════

  _spawnPlayers() {
    const socket = getSocket()
    const myId   = socket ? socket.id : null

    this._initPlayers.forEach(p => {
      const laneY  = this._trackTop + (p.lane + 0.5) * this._laneHeight
      const worldX = p.position || START_POSITION

      const ch = new PlayerCharacter(this, worldX, laneY, {
        color: p.color, name: p.name, wins: p.wins, isMe: p.id === myId,
      })
      ch.playIdle()
      if (this._gameType === 'cycling') ch.equipBike()
      this._characters[p.id]    = ch
      this._prevPositions[p.id] = worldX

      if (p.id === myId) {
        this.cameras.main.startFollow(ch.posContainer, true, 0.08, 0)
      }
    })
  }

  _buildUI(width, height) {
    this._hintText = this.add.text(width / 2, 28, 'TAP / CLICK TO MOVE', {
      fontSize: '16px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100)

    this.tweens.add({ targets: this._hintText, alpha: 0, delay: 3000, duration: 1000 })

    this._progressBars = this.add.container(0, height - 56)
    this._progressBars.setScrollFactor(0).setDepth(100)

    const barBg = this.add.graphics()
    barBg.fillStyle(0x000000, 0.65)
    barBg.fillRect(0, 0, width, 56)
    this._progressBars.add(barBg)

    this._progressBarGraphics = this.add.graphics().setScrollFactor(0).setDepth(101)
    this._progressBarItems    = []
  }

  _setupInput() {
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
      .setScrollFactor(0).setDepth(200)
    this.tweens.add({
      targets: circle, scaleX: 3, scaleY: 3, alpha: 0,
      duration: 400, ease: 'Quad.easeOut',
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
    const myId   = socket ? socket.id : null

    if (gameState === 'racing' && !this._gameStarted) {
      this._gameStarted = true
      this.cameras.main.shake(300, 0.01)
    }

    players.forEach(p => {
      if (!this._characters[p.id]) {
        const laneY = this._trackTop + (p.lane + 0.5) * this._laneHeight
        const ch    = new PlayerCharacter(this, p.position || START_POSITION, laneY, {
          color: p.color, name: p.name, wins: p.wins, isMe: p.id === myId,
        })
        if (this._gameType === 'cycling') ch.equipBike()
        this._characters[p.id]    = ch
        this._prevPositions[p.id] = p.position || START_POSITION
        if (p.id === myId) this.cameras.main.startFollow(ch.posContainer, true, 0.08, 0)
      }

      const ch   = this._characters[p.id]
      const prevX = this._prevPositions[p.id] || START_POSITION
      const newX  = p.position || START_POSITION

      ch.moveTo(newX)

      if (gameState === 'racing') {
        if (this._gameType === 'cycling') {
          newX > prevX ? ch.startCycling() : ch.stopCycling()
        } else {
          newX > prevX ? ch.startRunning() : ch.stopRunning()
        }

        // Splash particle at character when they move (swimming only)
        if (this._gameType === 'swimming' && newX > prevX) {
          this._spawnSplash(newX, this._trackTop + (p.lane + 0.5) * this._laneHeight)
        }
      } else {
        this._gameType === 'cycling' ? ch.stopCycling() : ch.stopRunning()
      }

      this._prevPositions[p.id] = newX
      ch.updateWins(p.wins)
    })

    const activeIds = new Set(players.map(p => p.id))
    for (const id of Object.keys(this._characters)) {
      if (!activeIds.has(id)) {
        this._characters[id].destroy()
        delete this._characters[id]
      }
    }

    this._updateProgressBars(players)

    if (gameState === 'finished') {
      const winner = [...players].sort((a, b) => b.position - a.position)[0]
      if (socket) socket.off('updateGame')
      this._destroyAllCharacters()
      this.scene.start('Finish', {
        players, winner,
        olympicsRoundComplete: data.olympicsRoundComplete || false,
        olympicsComplete: data.olympicsComplete || false,
        olympicsRound: data.olympicsRound || 0,
        olympicsTotal: data.olympicsTotal || 5,
        nextMode: data.nextMode || null,
      })
    }
  }

  // Splash when a swimmer moves
  _spawnSplash(worldX, worldY) {
    for (let i = 0; i < 5; i++) {
      const sx = worldX + Phaser.Math.Between(-12, 12)
      const sy = this._trackTop + Phaser.Math.Between(2, 10)
      const drop = this.add.circle(sx, sy, Phaser.Math.Between(2, 5), 0x90caf9, 0.8).setDepth(6)
      this.tweens.add({
        targets: drop,
        y: sy - Phaser.Math.Between(10, 22),
        x: sx + Phaser.Math.Between(-10, 10),
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: Phaser.Math.Between(300, 550),
        ease: 'Quad.easeOut',
        onComplete: () => drop.destroy(),
      })
    }
  }

  _updateProgressBars(players) {
    const { width, height } = this.scale
    const g    = this._progressBarGraphics
    const barW = (width - 20) / players.length
    const barH = 14
    const yOff = height - 50

    g.clear()
    players.forEach((p, i) => {
      const pct      = Math.min(p.position / FINISH_LINE, 1)
      const x        = 10 + i * barW
      const colorInt = Phaser.Display.Color.HexStringToColor(p.color).color

      g.fillStyle(0x333333, 0.9)
      g.fillRoundedRect(x, yOff, barW - 6, barH, 3)
      g.fillStyle(colorInt, 1)
      g.fillRoundedRect(x, yOff, (barW - 6) * pct, barH, 3)

      if (!this._barLabels)    this._barLabels = []
      if (!this._barLabels[i]) {
        this._barLabels[i] = this.add.text(x + (barW - 6) / 2, yOff - 2, '', {
          fontSize: '11px', fontFamily: 'Arial', color: '#ffffff',
          stroke: '#000', strokeThickness: 2,
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

  update(time, delta) {
    const scrollX = this.cameras.main.scrollX

    // Sprint / cycling parallax
    if (this._mountainsTile) this._mountainsTile.tilePositionX = scrollX * 0.1
    if (this._treesTile)     this._treesTile.tilePositionX     = scrollX * 0.25
    if (this._cloudsTile)    this._cloudsTile.tilePositionX    = scrollX * 0.05

    // Swimming wave animation
    if (this._gameType === 'swimming' && this._waterSurfaceG) {
      this._waveTime += delta / 1000
      this._updateWaterSurface()
    }
  }

  shutdown() {
    const socket = getSocket()
    if (socket) socket.off('updateGame')
    this._destroyAllCharacters()
  }
}
