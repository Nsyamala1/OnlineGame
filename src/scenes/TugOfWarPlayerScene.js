import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

const WIN_THRESHOLD  = 400
const PULL_THRESHOLD = 70    // pixels of downward drag = one pull

export default class TugOfWarPlayerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TugOfWarPlayer' })
  }

  init(data) {
    this._gameData = data.gameData || { players: [], gameState: 'waiting' }
  }

  create() {
    const { width, height } = this.scale
    const socket = getSocket()
    if (!socket) { this.scene.start('Landing'); return }

    this._myId        = socket.id
    this._gameStatus  = this._gameData.gameState || 'waiting'
    this._prevState   = null
    this._finishShown = false
    this._ropePos     = this._gameData.ropePosition || 0

    // Pull gesture state
    this._activePtr  = null
    this._pullStartY = 0
    this._stepTimes  = []

    const myData      = this._gameData.players?.find(p => p.id === this._myId)
    this._myTeam      = myData?.team  || 'A'
    this._myColor     = myData?.color || '#3498db'
    this._teamColor   = this._myTeam === 'A' ? 0x2980b9 : 0xc0392b
    this._teamHex     = this._myTeam === 'A' ? '#3498db' : '#e74c3c'
    this._teamLabel   = this._myTeam === 'A' ? 'TEAM A' : 'TEAM B'

    this.input.addPointer(2)

    this._buildBackground(width, height)
    this._buildCharacter(width, height)
    this._buildStatusArea(width, height)
    this._buildPullArea(width, height)
    this._buildMiniRope(width, height)

    socket.off('updateGame')
    socket.on('updateGame', (d) => this._onUpdate(d))
    this._onUpdate(this._gameData)

    this.input.on('pointerdown',   (ptr) => this._onDown(ptr))
    this.input.on('pointermove',   (ptr) => this._onMove(ptr))
    this.input.on('pointerup',     (ptr) => this._onUp(ptr))
    this.input.on('pointercancel', (ptr) => this._onUp(ptr))
  }

  // ── Background ───────────────────────────────────────────────────────────────

  _buildBackground(width, height) {
    const isA = this._myTeam === 'A'
    const g   = this.add.graphics()
    g.fillGradientStyle(
      isA ? 0x0a1a30 : 0x300a0a,
      isA ? 0x0a1a30 : 0x300a0a,
      isA ? 0x142845 : 0x451414,
      isA ? 0x142845 : 0x451414,
      1
    )
    g.fillRect(0, 0, width, height)
  }

  // ── Character ────────────────────────────────────────────────────────────────

  _buildCharacter(width, height) {
    const charX  = width / 2
    const charY  = height * 0.23
    const myData = this._gameData.players?.find(p => p.id === this._myId)
    const color  = myData?.color || this._myColor
    const name   = myData?.name  || this.registry.get('playerName') || 'Player'
    const wins   = myData?.wins  || 0

    const glow = this.add.graphics()
    glow.fillStyle(this._teamColor, 0.07)
    glow.fillEllipse(charX, charY + 10, 210, 55)

    this._char = new PlayerCharacter(this, charX, charY, { color, name, wins, isMe: true })
    this._char.posContainer.setScale(1.75)
    this._char.playIdle()
  }

  // ── Status area ───────────────────────────────────────────────────────────────

  _buildStatusArea(width, height) {
    this._statusText = this.add.text(width / 2, height * 0.06, '', {
      fontSize: '18px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
      shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 4, fill: true },
    }).setOrigin(0.5).setDepth(10)

    this.add.text(width / 2, height * 0.13, this._teamLabel, {
      fontSize: '32px', fontFamily: '"Arial Black", Arial',
      color: this._teamHex, stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10)

    this._advantageText = this.add.text(width / 2, height * 0.40, '', {
      fontSize: '22px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10)

    this._countdownText = this.add.text(width / 2, height * 0.43, '', {
      fontSize: '140px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(21).setAlpha(0)
  }

  // ── Pull area ─────────────────────────────────────────────────────────────────

  _buildPullArea(width, height) {
    const cx = width / 2
    const cy = height * 0.645
    this._pullCy    = cy
    this._gripBaseY = cy

    // Panel background
    const panelG = this.add.graphics().setDepth(2)
    panelG.fillStyle(0x000000, 0.28)
    panelG.fillRoundedRect(cx - 135, cy - 115, 270, 230, 22)

    // Vertical rope section
    const ropeG = this.add.graphics().setDepth(3)
    ropeG.lineStyle(16, 0xd4a96a, 0.75)
    ropeG.beginPath(); ropeG.moveTo(cx, cy - 105); ropeG.lineTo(cx, cy + 105); ropeG.strokePath()
    ropeG.lineStyle(4, 0xf0c98e, 0.35)
    ropeG.beginPath(); ropeG.moveTo(cx - 4, cy - 105); ropeG.lineTo(cx - 4, cy + 105); ropeG.strokePath()
    // Twist marks
    ropeG.lineStyle(2, 0x9a6830, 0.45)
    for (let y = cy - 95; y < cy + 90; y += 22) {
      ropeG.beginPath(); ropeG.moveTo(cx - 6, y); ropeG.lineTo(cx + 6, y + 10); ropeG.strokePath()
    }

    // Grip knot (the grab point the player pulls)
    this._gripKnot = this.add.circle(cx, cy, 30, 0x5a3a1a).setDepth(6)
    this._gripRing = this.add.circle(cx, cy, 30, 0x000000, 0)
      .setStrokeStyle(3, 0xd4a96a, 1).setDepth(7)

    // Finger marker
    this._fingerDot = this.add.circle(cx, cy, 18, this._teamColor, 0.85).setDepth(8).setVisible(false)

    // Pull-progress arc
    this._arcG = this.add.graphics().setDepth(7)

    // "PULL DOWN" hint arrows (bounce gently)
    this._hintText = this.add.text(cx, cy + 68, '▼  PULL DOWN  ▼', {
      fontSize: '15px', fontFamily: '"Arial Black", Arial',
      color: 'rgba(255,255,255,0.55)', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(5)
    this.tweens.add({
      targets: this._hintText,
      y: cy + 75, alpha: { from: 0.55, to: 0.22 },
      duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    // Waiting overlay
    this._pullOverlay = this.add.graphics().setDepth(9)
    this._pullOverlay.fillStyle(0x000000, 0.50)
    this._pullOverlay.fillRoundedRect(cx - 135, cy - 115, 270, 230, 22)
    this._pullWaitText = this.add.text(cx, cy, '⏳', { fontSize: '42px' })
      .setOrigin(0.5).setDepth(10)
  }

  _drawArc(pct) {
    const g  = this._arcG
    const cx = this.scale.width / 2
    const cy = this._gripBaseY
    g.clear()
    if (pct <= 0) return
    g.lineStyle(5, 0xffd700, 0.85)
    g.beginPath()
    g.arc(cx, cy, 36, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2, false)
    g.strokePath()
  }

  // ── Mini rope indicator at bottom ─────────────────────────────────────────────

  _buildMiniRope(width, height) {
    const pad  = 14
    const ty   = height * 0.895
    const th   = height * 0.085
    const tw   = width - pad * 2

    this._miniPad = pad; this._miniTy = ty; this._miniTh = th; this._miniTw = tw

    const bg = this.add.graphics().setDepth(5)
    bg.fillStyle(0x000000, 0.75)
    bg.fillRoundedRect(pad, ty, tw, th, 10)

    this.add.text(pad + tw / 2, ty - 4, 'ROPE', {
      fontSize: '9px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.3)',
    }).setOrigin(0.5, 1).setDepth(5)

    this._miniG = this.add.graphics().setDepth(6)
    this._drawMiniRope()
  }

  _drawMiniRope() {
    const { _miniPad: pad, _miniTy: ty, _miniTh: th, _miniTw: tw } = this
    const my  = ty + th / 2
    const lx  = pad + 10
    const rx  = pad + tw - 10
    const half = (rx - lx) / 2
    const kx  = (lx + rx) / 2 + (this._ropePos / WIN_THRESHOLD) * half
    const g   = this._miniG

    g.clear()
    g.lineStyle(6, 0x3498db, 0.95); g.beginPath(); g.moveTo(lx, my); g.lineTo(kx, my); g.strokePath()
    g.lineStyle(6, 0xe74c3c, 0.95); g.beginPath(); g.moveTo(kx, my); g.lineTo(rx, my); g.strokePath()
    g.fillStyle(0xffd700, 1); g.fillRect(kx - 3, my - 13, 6, 26)
    g.fillStyle(0x4a2e0d, 1); g.fillCircle(lx, my, 6); g.fillCircle(rx, my, 6)

    // Team label dots
    g.fillStyle(0x3498db, 1); g.fillCircle(lx + 14, my, 5)
    g.fillStyle(0xe74c3c, 1); g.fillCircle(rx - 14, my, 5)
  }

  // ── Input ────────────────────────────────────────────────────────────────────

  _onDown(ptr) {
    if (this._gameStatus !== 'racing') return
    if (this._activePtr !== null) return

    const cx = this.scale.width / 2
    const cy = this._pullCy
    if (Math.abs(ptr.x - cx) > 145 || Math.abs(ptr.y - cy) > 125) return

    this._activePtr  = ptr.id
    this._pullStartY = ptr.y
    this._fingerDot.setPosition(ptr.x, ptr.y).setVisible(true)
    this._gripKnot.setFillStyle(0x7a5a2a)
  }

  _onMove(ptr) {
    if (this._gameStatus !== 'racing') return
    if (ptr.id !== this._activePtr) return

    const dy       = ptr.y - this._pullStartY
    const clampDy  = Math.max(0, Math.min(dy, PULL_THRESHOLD))

    // Move grip and finger marker
    this._gripKnot.setY(this._gripBaseY + clampDy)
    this._gripRing.setY(this._gripBaseY + clampDy)
    this._fingerDot.setPosition(ptr.x, Math.min(ptr.y, this._pullCy + PULL_THRESHOLD))

    // Pull progress arc
    this._drawArc(clampDy / PULL_THRESHOLD)

    // Count a pull every PULL_THRESHOLD px of downward travel
    if (dy >= PULL_THRESHOLD) {
      this._pullStartY = ptr.y
      this._onPull()
    }
  }

  _onUp(ptr) {
    if (ptr.id !== this._activePtr) return
    this._activePtr = null
    this._fingerDot.setVisible(false)
    this._drawArc(0)

    // Snap grip back
    this.tweens.add({
      targets: [this._gripKnot, this._gripRing],
      y: this._gripBaseY, duration: 240, ease: 'Back.easeOut',
    })
    this._gripKnot.setFillStyle(0x5a3a1a)
  }

  _onPull() {
    getSocket()?.emit('move')

    const now = Date.now()
    this._stepTimes.push(now)
    if (this._stepTimes.length > 8) this._stepTimes.shift()

    // Snap grip up briefly (recoil feel)
    this.tweens.add({
      targets: [this._gripKnot, this._gripRing],
      y: this._gripBaseY - 10,
      duration: 70, ease: 'Quad.easeOut', yoyo: true,
    })

    // Arc flash
    this._drawArc(1)
    this.time.delayedCall(110, () => this._drawArc(0))

    // Camera shake + brief screen flash
    this.cameras.main.shake(55, 0.005)
    const { width, height } = this.scale
    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.06).setDepth(50)
    this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() })
  }

  // ── Server updates ────────────────────────────────────────────────────────────

  _onUpdate(data) {
    const { players = [], gameState, countdown, ropePosition = 0 } = data
    this._gameStatus = gameState
    this._ropePos    = ropePosition

    const me = players.find(p => p.id === this._myId)

    if (gameState === 'racing' && this._prevState !== 'racing') {
      this._stepTimes = []
    }
    this._prevState = gameState

    this._updateStatus(gameState, countdown, players)
    this._updateCharacter(gameState)
    this._updatePullState(gameState)
    this._updateAdvantage(gameState)
    this._drawMiniRope()

    if (me?.wins > 0) this._char?.updateWins(me.wins)
    if (gameState === 'finished') this._showFinish(players, ropePosition)
  }

  _updateStatus(state, countdown, players) {
    let msg = ''
    if (state === 'waiting') {
      const ready = players.filter(p => p.ready).length
      msg = players.length <= 1 ? '⏳ Waiting for players...' : `${ready}/${players.length} ready`
    } else if (state === 'countdown') {
      msg = 'Get ready!'
      this._showCountdown(countdown)
    } else if (state === 'racing') {
      msg = '💪 PULL DOWN!'
    }
    this._statusText.setText(msg)
  }

  _showCountdown(n) {
    if (!n) return
    this._countdownText.setText(String(n)).setAlpha(1).setScale(0.4)
    this.tweens.killTweensOf(this._countdownText)
    this.tweens.add({
      targets: this._countdownText, scaleX: 1.6, scaleY: 1.6, alpha: 0,
      duration: 850, ease: 'Cubic.easeOut',
    })
    this.cameras.main.shake(180, 0.009)
  }

  _updateCharacter(state) {
    if (!this._char) return
    if (state === 'racing') {
      this._char.startRunning()
    } else {
      this._char.stopRunning()
    }
  }

  _updatePullState(state) {
    const racing = state === 'racing'
    this._pullOverlay.setVisible(!racing)
    this._pullWaitText.setVisible(!racing)
  }

  _updateAdvantage(state) {
    if (state !== 'racing' && state !== 'finished') {
      this._advantageText.setText(''); return
    }
    const isA     = this._myTeam === 'A'
    const leading = isA ? this._ropePos < -30 : this._ropePos > 30

    if (Math.abs(this._ropePos) < 30) {
      this._advantageText.setText('⚖ Tied!').setColor('#f1c40f')
    } else if (leading) {
      this._advantageText.setText('💪 Winning!').setColor('#2ecc71')
    } else {
      this._advantageText.setText('😅 Hold on!').setColor('#e74c3c')
    }
  }

  // ── Finish overlay ────────────────────────────────────────────────────────────

  _showFinish(players, ropePosition) {
    if (this._finishShown) return
    this._finishShown = true

    const { width, height } = this.scale
    const winTeam = ropePosition <= 0 ? 'A' : 'B'
    const iWon    = this._myTeam === winTeam

    const ov = this.add.graphics().setDepth(30)
    ov.fillStyle(0x000000, 0.65)
    ov.fillRect(0, 0, width, height)

    if (iWon) {
      this._char?.playVictory()
      const wt = this.add.text(width / 2, height * 0.28, '🏆 YOUR TEAM WINS! 🏆', {
        fontSize: '34px', fontFamily: '"Arial Black", Arial',
        color: '#f1c40f', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(32).setScale(0)
      this.tweens.add({ targets: wt, scaleX: 1, scaleY: 1, duration: 600, ease: 'Back.easeOut' })
    } else {
      const label = winTeam === 'A' ? 'Team A' : 'Team B'
      this.add.text(width / 2, height * 0.28, `${label} wins this round`, {
        fontSize: '34px', fontFamily: '"Arial Black", Arial',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(32)
    }

    const playBtn = this.add.text(width / 2, height * 0.55, '▶  Play Again', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial',
      color: '#1a1a2e', backgroundColor: '#f1c40f', padding: { x: 32, y: 16 },
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })
    playBtn.on('pointerover', () => playBtn.setScale(1.05))
    playBtn.on('pointerout',  () => playBtn.setScale(1.0))
    playBtn.on('pointerdown', () => {
      getSocket()?.emit('requestRestart')
      this._finishShown = false
    })

    this.add.text(width / 2, height * 0.68, 'Leave Game', {
      fontSize: '16px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.45)',
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { disconnect(); window.location.reload() })
  }

  update() {}
}
