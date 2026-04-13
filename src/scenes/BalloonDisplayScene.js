import Phaser from 'phaser'
import { getSocket } from '../socket.js'

const BALLOON_MAX_SIZE = 100

export default class BalloonDisplayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BalloonDisplay' })
  }

  init(data) {
    this._initPlayers = data.players || []
    this._finishShown = false
    this._slots = [] // { id, cx, color, colorVal, size, g, nameText, pctText, winsText }
  }

  create() {
    const { width, height } = this.scale
    this._buildBackground(width, height)
    this._buildUI(width, height)
    this._buildSlots(width, height, this._initPlayers)
    this._setupSocket()
  }

  // ── Background ────────────────────────────────────────────────────────────────

  _buildBackground(width, height) {
    const sky = this.add.graphics()
    sky.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xC9EBF7, 0xC9EBF7, 1)
    sky.fillRect(0, 0, width, height)

    // Ground
    const ground = this.add.graphics()
    ground.fillStyle(0x6AB040, 1)
    ground.fillRect(0, height * 0.88, width, height * 0.12)
    ground.fillStyle(0x7EC850, 1)
    ground.fillRect(0, height * 0.88, width, 8)

    // Sun
    const sun = this.add.graphics().setDepth(0)
    sun.fillStyle(0xFFE44D, 0.5)
    sun.fillCircle(width * 0.9, height * 0.1, 62)
    sun.fillStyle(0xFFD700, 1)
    sun.fillCircle(width * 0.9, height * 0.1, 44)

    // Clouds
    this._drawCloud(width * 0.08, height * 0.08, 90)
    this._drawCloud(width * 0.38, height * 0.06, 110)
    this._drawCloud(width * 0.65, height * 0.11, 75)
  }

  _drawCloud(cx, cy, size) {
    const g = this.add.graphics().setAlpha(0.82)
    g.fillStyle(0xFFFFFF, 1)
    g.fillEllipse(cx, cy, size, size * 0.52)
    g.fillEllipse(cx - size * 0.33, cy + size * 0.07, size * 0.68, size * 0.44)
    g.fillEllipse(cx + size * 0.33, cy + size * 0.07, size * 0.68, size * 0.44)
    g.fillEllipse(cx, cy + size * 0.14, size * 1.1, size * 0.48)
  }

  // ── UI ────────────────────────────────────────────────────────────────────────

  _buildUI(width, height) {
    this.add.text(width / 2, 26, '🎈  BALLOON POP  🎈', {
      fontSize: '34px', fontFamily: '"Arial Black", Arial',
      color: '#1a1a2e', stroke: '#ffffff', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10)

    this._statusText = this.add.text(width / 2, 68, 'WAITING...', {
      fontSize: '17px', fontFamily: '"Arial Black", Arial',
      color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.42)',
      padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setDepth(10)

    this.add.text(width / 2, height - 7, 'Tap steadily — tap too fast and your balloon POPS!', {
      fontSize: '13px', fontFamily: 'Arial', color: 'rgba(0,0,0,0.45)',
    }).setOrigin(0.5, 1).setDepth(10)
  }

  // ── Balloon slots ─────────────────────────────────────────────────────────────

  _buildSlots(width, height, players) {
    const n = Math.max(players.length, 1)
    const colW = width / n
    this._groundY = height * 0.86
    this._maxBalloonW = colW * 0.72
    this._maxBalloonH = height * 0.54

    players.forEach((p, i) => {
      const cx = colW * i + colW / 2
      const colorVal = Phaser.Display.Color.HexStringToColor(p.color).color

      const g = this.add.graphics().setDepth(5)

      const nameText = this.add.text(cx, this._groundY + 14, p.name, {
        fontSize: '17px', fontFamily: '"Arial Black", Arial',
        color: p.color, stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(6)

      const pctText = this.add.text(cx, this._groundY + 36, '', {
        fontSize: '13px', fontFamily: '"Arial Black", Arial', color: '#333333',
      }).setOrigin(0.5, 0).setDepth(6)

      const winsText = this.add.text(cx, 92, `Wins: ${p.wins || 0}`, {
        fontSize: '12px', fontFamily: 'Arial', color: '#555555',
      }).setOrigin(0.5).setDepth(6)

      const slot = { id: p.id, cx, color: p.color, colorVal, size: p.balloonSize || 0, g, nameText, pctText, winsText }
      this._slots.push(slot)
      this._redrawBalloon(i)
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
    const { players = [], gameState, burstId } = data

    if (gameState === 'racing') {
      this._statusText.setText("🎈  INFLATE — DON'T BURST!")
    } else if (gameState === 'waiting') {
      this._statusText.setText('WAITING...')
    }

    players.forEach(p => {
      const idx = this._slots.findIndex(s => s.id === p.id)
      if (idx < 0) return
      this._slots[idx].size = p.balloonSize || 0
      this._slots[idx].winsText.setText(`Wins: ${p.wins || 0}`)
      this._redrawBalloon(idx)
    })

    if (burstId) {
      const idx = this._slots.findIndex(s => s.id === burstId)
      if (idx >= 0) this._popAnimation(idx)
    }

    if (gameState === 'finished' && !this._finishShown) {
      this._finishShown = true
      const socket = getSocket()
      if (socket) socket.off('updateGame')
      const winner = players.find(p => (p.balloonSize || 0) >= BALLOON_MAX_SIZE)
        || [...players].sort((a, b) => (b.balloonSize || 0) - (a.balloonSize || 0))[0]
      this._showFinish(winner)
    }
  }

  // ── Balloon drawing ───────────────────────────────────────────────────────────

  _redrawBalloon(index) {
    const slot = this._slots[index]
    if (!slot) return

    const { cx, colorVal, size, g } = slot
    const pct = size / BALLOON_MAX_SIZE
    const minW = 18, minH = 22
    const w = minW + (this._maxBalloonW - minW) * pct
    const h = minH + (this._maxBalloonH - minH) * pct
    const stringLen = 55
    const knotY = this._groundY - stringLen
    const balloonY = knotY - h / 2

    g.clear()

    // Danger glow (>75%)
    if (pct > 0.75) {
      const alpha = ((pct - 0.75) / 0.25) * 0.55
      g.fillStyle(0xff4444, alpha)
      g.fillEllipse(cx, balloonY, w + 22, h + 22)
    }

    // Balloon body
    g.fillStyle(colorVal, 1)
    g.fillEllipse(cx, balloonY, w, h)

    // Shine highlight
    if (pct > 0.04) {
      g.fillStyle(0xffffff, 0.35)
      g.fillEllipse(cx - w * 0.2, balloonY - h * 0.2, w * 0.28, h * 0.3)
    }

    // Knot
    if (pct > 0.02) {
      g.fillStyle(colorVal, 1)
      g.fillTriangle(cx - 5, knotY - 2, cx + 5, knotY - 2, cx, knotY + 10)
    }

    // String (wavy)
    g.lineStyle(2, 0x777777, 0.75)
    g.beginPath()
    g.moveTo(cx, knotY + 10)
    g.lineTo(cx + 7, knotY + 24)
    g.lineTo(cx - 5, knotY + 38)
    g.lineTo(cx + 4, this._groundY - 4)
    g.strokePath()

    // Percentage label
    slot.pctText.setText(pct > 0.05 ? `${Math.round(pct * 100)}%` : '')
  }

  // ── Pop animation ─────────────────────────────────────────────────────────────

  _popAnimation(slotIdx) {
    const slot = this._slots[slotIdx]
    if (!slot) return

    const { cx } = slot
    const stringLen = 55
    const popY = this._groundY - stringLen - 80

    this.cameras.main.shake(280, 0.014)

    // Expanding burst ring
    const ring = this.add.graphics().setDepth(20)
    ring.lineStyle(5, 0xff4444, 1)
    ring.strokeCircle(cx, popY, 28)
    this.tweens.add({
      targets: ring, scaleX: 6, scaleY: 6, alpha: 0,
      duration: 480, ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    })

    // POP! label
    const popText = this.add.text(cx, popY - 14, '💥 POP!', {
      fontSize: '38px', fontFamily: '"Arial Black", Arial',
      color: '#ff4444', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(21).setScale(0)
    this.tweens.add({
      targets: popText,
      scaleX: 1.3, scaleY: 1.3, alpha: 0,
      duration: 750, ease: 'Back.easeOut',
      onComplete: () => popText.destroy(),
    })

    // Scattered color dots
    const colorVal = slot.colorVal
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const dot = this.add.circle(cx, popY, 7, colorVal).setDepth(20)
      const dist = 55 + Math.random() * 40
      this.tweens.add({
        targets: dot,
        x: cx + Math.cos(angle) * dist,
        y: popY + Math.sin(angle) * dist,
        alpha: 0,
        duration: 550,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      })
    }
  }

  // ── Finish overlay ────────────────────────────────────────────────────────────

  _showFinish(winner) {
    const { width, height } = this.scale

    const ov = this.add.graphics().setDepth(30)
    ov.fillStyle(0x000000, 0.6)
    ov.fillRect(0, 0, width, height)

    const label = winner ? `🎈  ${winner.name} WINS!  🎈` : '🎈  GAME OVER  🎈'
    const banner = this.add.text(width / 2, height * 0.38, label, {
      fontSize: '58px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(31).setScale(0)
    this.tweens.add({ targets: banner, scaleX: 1, scaleY: 1, duration: 650, ease: 'Back.easeOut' })

    if (winner) {
      this.add.text(width / 2, height * 0.54, `First to fully inflate their balloon!`, {
        fontSize: '22px', fontFamily: 'Arial', color: '#ffffff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(31)
    }
  }

  shutdown() {
    const socket = getSocket()
    if (socket) socket.off('updateGame')
  }
}
