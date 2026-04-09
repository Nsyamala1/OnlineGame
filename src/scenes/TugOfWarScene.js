import Phaser from 'phaser'
import { getSocket } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

const WIN_THRESHOLD = 400

export default class TugOfWarScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TugOfWar' })
  }

  init(data) {
    this._initPlayers  = data.players      || []
    this._ropePosition = data.ropePosition || 0
    this._knotX        = 0   // computed in create
    this._gameStarted  = false
    this._finishShown  = false
    this._characters   = {}
  }

  create() {
    const { width, height } = this.scale
    this._ropeY = height * 0.50

    this._knotX = this._rpoToKnotX(this._ropePosition, width)

    this._buildBackground(width, height)
    this._buildArena(width, height)
    this._ropeG = this.add.graphics().setDepth(5)
    this._buildUI(width, height)
    this._spawnCharacters(width, height)
    this._setupSocket()
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  _rpoToKnotX(rpo, width) {
    const lx = width * 0.12, rx = width * 0.88
    return width / 2 + (rpo / WIN_THRESHOLD) * ((rx - lx) / 2)
  }

  // ── Background ────────────────────────────────────────────────────────────────

  _buildBackground(width, height) {
    const sky = this.add.graphics()
    sky.fillGradientStyle(0x4a8fd4, 0x4a8fd4, 0x87ceeb, 0x87ceeb, 1)
    sky.fillRect(0, 0, width, height * 0.6)

    const grass = this.add.graphics()
    grass.fillStyle(0x4a7c59, 1)
    grass.fillRect(0, height * 0.6, width, height * 0.4)
    grass.fillStyle(0x5a9c6b, 0.4)
    grass.fillRect(0, height * 0.6, width, 10)

    // Crowd dots
    const cg = this.add.graphics().setAlpha(0.28)
    const crowdColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6]
    for (let i = 0; i < 70; i++) {
      cg.fillStyle(crowdColors[i % crowdColors.length], 1)
      cg.fillCircle(
        (i % 14) * (width / 14) + Phaser.Math.Between(-15, 15),
        height * 0.07 + Math.floor(i / 14) * 26 + Phaser.Math.Between(-4, 4),
        7
      )
    }
  }

  // ── Arena decorations ─────────────────────────────────────────────────────────

  _buildArena(width, height) {
    const ry = this._ropeY

    // Coloured win zones
    const zones = this.add.graphics()
    zones.fillStyle(0x2980b9, 0.18)
    zones.fillRect(0, ry - 100, width * 0.15, 200)
    zones.fillStyle(0xc0392b, 0.18)
    zones.fillRect(width * 0.85, ry - 100, width * 0.15, 200)

    // Mud pit under knot
    const mud = this.add.graphics()
    mud.fillStyle(0x7d5a3c, 0.55)
    mud.fillEllipse(width / 2, ry + 22, 180, 52)
    mud.fillStyle(0x5a3a20, 0.35)
    mud.fillEllipse(width / 2, ry + 14, 110, 30)

    // Win-line markers
    const lg = this.add.graphics()
    lg.lineStyle(3, 0x3498db, 1)
    lg.beginPath(); lg.moveTo(width * 0.12, ry - 90); lg.lineTo(width * 0.12, ry + 90); lg.strokePath()
    lg.lineStyle(3, 0xe74c3c, 1)
    lg.beginPath(); lg.moveTo(width * 0.88, ry - 90); lg.lineTo(width * 0.88, ry + 90); lg.strokePath()

    this.add.text(width * 0.085, ry - 100, '◀ WIN', {
      fontSize: '13px', fontFamily: '"Arial Black", Arial',
      color: '#3498db', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1)
    this.add.text(width * 0.915, ry - 100, 'WIN ▶', {
      fontSize: '13px', fontFamily: '"Arial Black", Arial',
      color: '#e74c3c', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1)

    // Team labels
    this.add.text(width * 0.22, ry - 125, 'TEAM A', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial',
      color: '#3498db', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5)
    this.add.text(width * 0.78, ry - 125, 'TEAM B', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial',
      color: '#e74c3c', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5)
  }

  // ── UI / progress bar ─────────────────────────────────────────────────────────

  _buildUI(width, height) {
    this._statusText = this.add.text(width / 2, 24, 'WAITING...', {
      fontSize: '18px', fontFamily: '"Arial Black", Arial',
      color: '#ffffff', stroke: '#000', strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.45)', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(100)

    const barBg = this.add.graphics().setDepth(100)
    barBg.fillStyle(0x000000, 0.55)
    barBg.fillRect(0, height - 44, width, 44)

    this._progG  = this.add.graphics().setDepth(101)
    this._progW  = width * 0.72
    this._progX  = width * 0.14
    this._progY  = height - 22
    this._drawProgressBar()

    this.add.text(width / 2, height - 5, '← TEAM A  ·  ROPE  ·  TEAM B →', {
      fontSize: '10px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.35)',
    }).setOrigin(0.5, 1).setDepth(102)
  }

  _drawProgressBar() {
    const g   = this._progG
    const bw  = this._progW, bx = this._progX, by = this._progY
    const pct = this._ropePosition / WIN_THRESHOLD   // −1 … +1
    const half = bw / 2

    g.clear()
    g.fillStyle(0x1a1a1a, 1)
    g.fillRoundedRect(bx, by - 10, bw, 20, 5)

    // Team A side (left)
    const aW = half - pct * half
    if (aW > 2) {
      g.fillStyle(0x3498db, 1)
      g.fillRoundedRect(bx, by - 10, Math.min(aW, bw), 20, 5)
    }
    // Team B side (right)
    const bStart = bx + half
    const bWid   = half + pct * half
    if (bWid > 2) {
      g.fillStyle(0xe74c3c, 1)
      g.fillRoundedRect(bStart, by - 10, Math.min(bWid, half), 20, 5)
    }

    // Centre divider & knot marker
    g.fillStyle(0xffffff, 0.9)
    g.fillRect(bx + half - 2, by - 14, 4, 28)
    g.fillStyle(0xffd700, 1)
    g.fillRect(bx + half + pct * half - 4, by - 16, 8, 32)
  }

  // ── Characters ────────────────────────────────────────────────────────────────

  _spawnCharacters(width, height) {
    const ry = this._ropeY

    this._initPlayers.forEach((p) => {
      const isA       = p.team === 'A'
      const mates     = this._initPlayers.filter(m => m.team === p.team)
      const idx       = mates.indexOf(p)
      const offsetY   = (idx - (mates.length - 1) / 2) * 58

      const ch = new PlayerCharacter(this, isA ? width * 0.25 : width * 0.75, ry + offsetY, {
        color: p.color, name: p.name, wins: p.wins, isMe: false,
      })

      if (isA) {
        // Flip Team A to face left (pulling away from centre)
        ch.posContainer.setScale(-1, 1)
        ch.nameLabel.setScale(-1, 1)
        if (ch.winsBadge) ch.winsBadge.setScale(-1, 1)
      }

      ch.playIdle()
      this._characters[p.id] = ch
    })
  }

  // ── Socket ────────────────────────────────────────────────────────────────────

  _setupSocket() {
    const socket = getSocket()
    if (!socket) return
    socket.off('updateGame')
    socket.on('updateGame', (data) => this._onUpdateGame(data))
  }

  _onUpdateGame(data) {
    const { players, gameState, ropePosition = 0 } = data
    const socket = getSocket()

    if (gameState === 'racing' && !this._gameStarted) {
      this._gameStarted = true
      this.cameras.main.shake(280, 0.012)
      this._statusText.setText('PULL!')
      Object.values(this._characters).forEach(ch => ch.startRunning())
    }

    if (gameState === 'waiting') {
      this._statusText.setText('WAITING...')
      Object.values(this._characters).forEach(ch => ch.stopRunning())
    }

    const prevRpo = this._ropePosition
    this._ropePosition = ropePosition
    this._drawProgressBar()

    // Smoothly tween knot to new position
    const newKnotX = this._rpoToKnotX(ropePosition, this.scale.width)
    this.tweens.add({ targets: this, _knotX: newKnotX, duration: 160, ease: 'Quad.easeOut' })

    if (Math.abs(ropePosition - prevRpo) > 0 && this._gameStarted) {
      this.cameras.main.shake(75, 0.004)
    }

    if (players) {
      players.forEach(p => {
        const ch = this._characters[p.id]
        if (ch) ch.updateWins(p.wins)
      })
    }

    if (gameState === 'finished' && !this._finishShown) {
      this._finishShown = true
      if (socket) socket.off('updateGame')
      Object.values(this._characters).forEach(ch => { try { ch.stopRunning() } catch(e) {} })
      this._showFinish(ropePosition, players)
    }
  }

  // ── Finish overlay ────────────────────────────────────────────────────────────

  _showFinish(ropePosition, players) {
    const { width, height } = this.scale
    const winTeam  = ropePosition <= 0 ? 'A' : 'B'
    const winColor = winTeam === 'A' ? '#3498db' : '#e74c3c'
    const winners  = (players || []).filter(p => p.team === winTeam)

    // Victory animations for winning team
    Object.entries(this._characters).forEach(([id, ch]) => {
      const p = (players || []).find(pl => pl.id === id)
      if (p?.team === winTeam) ch.playVictory()
    })

    const ov = this.add.graphics().setDepth(40)
    ov.fillStyle(0x000000, 0.62)
    ov.fillRect(0, 0, width, height)

    const banner = this.add.text(width / 2, height * 0.36, `TEAM ${winTeam} WINS!`, {
      fontSize: '72px', fontFamily: '"Arial Black", Arial',
      color: winColor, stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(41).setScale(0)
    this.tweens.add({ targets: banner, scaleX: 1, scaleY: 1, duration: 650, ease: 'Back.easeOut' })

    if (winners.length) {
      this.add.text(width / 2, height * 0.52, winners.map(p => p.name).join('  &  '), {
        fontSize: '28px', fontFamily: 'Arial',
        color: '#ffffff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(41)
    }
  }

  // ── Per-frame rope drawing ────────────────────────────────────────────────────

  update() {
    const { width } = this.scale
    const ry = this._ropeY
    const kx = this._knotX
    const lx = width * 0.12
    const rx = width * 0.88
    const g  = this._ropeG

    g.clear()

    // Rope body — left & right segments
    g.lineStyle(18, 0xd4a96a, 1)
    g.beginPath(); g.moveTo(lx, ry); g.lineTo(kx, ry); g.strokePath()
    g.beginPath(); g.moveTo(kx, ry); g.lineTo(rx, ry); g.strokePath()

    // Highlight stripe
    g.lineStyle(5, 0xf0c98e, 0.45)
    g.beginPath(); g.moveTo(lx, ry - 4); g.lineTo(rx, ry - 4); g.strokePath()

    // Twist marks
    g.lineStyle(2, 0x9a6830, 0.55)
    for (let x = lx + 18; x < kx - 10; x += 28) {
      g.beginPath(); g.moveTo(x, ry - 7); g.lineTo(x + 10, ry + 7); g.strokePath()
    }
    for (let x = kx + 18; x < rx - 10; x += 28) {
      g.beginPath(); g.moveTo(x, ry - 7); g.lineTo(x + 10, ry + 7); g.strokePath()
    }

    // Rope anchors at edges
    g.fillStyle(0x4a2e0d, 1)
    g.fillCircle(lx, ry, 13)
    g.fillCircle(rx, ry, 13)

    // Centre knot
    g.fillStyle(0x5a3a1a, 1)
    g.fillCircle(kx, ry, 20)
    g.lineStyle(3, 0xffd700, 1)
    g.strokeCircle(kx, ry, 20)

    // Flag pole & pennant (color shifts with winning team)
    g.fillStyle(0xdddddd, 1)
    g.fillRect(kx - 2, ry - 46, 4, 34)
    const flagColor = kx < width / 2 - 10 ? 0x3498db : kx > width / 2 + 10 ? 0xe74c3c : 0xff0000
    g.fillStyle(flagColor, 1)
    g.fillTriangle(kx + 2, ry - 46, kx + 26, ry - 36, kx + 2, ry - 26)
  }

  shutdown() {
    const socket = getSocket()
    if (socket) socket.off('updateGame')
    Object.values(this._characters).forEach(ch => { try { ch.destroy() } catch(e) {} })
    this._characters = {}
  }
}
