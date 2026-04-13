import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

const BALLOON_MAX_SIZE = 100
// Matches server BURST_COOLDOWN_MS — used for client-side speed warning only
const BURST_COOLDOWN_MS = 150

export default class BalloonPlayerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BalloonPlayer' })
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
    this._prevStatus  = null
    this._balloonSize = 0
    this._finishShown = false
    this._lastTapAt   = 0
    this._tapTimes    = []

    const myData      = this._gameData.players?.find(p => p.id === this._myId)
    this._myColor     = myData?.color || '#3498db'
    this._myName      = myData?.name  || this.registry.get('playerName') || 'Player'
    this._myWins      = myData?.wins  || 0
    this._colorVal    = Phaser.Display.Color.HexStringToColor(this._myColor).color

    this._buildBackground(width, height)
    this._buildCharacter(width, height)
    this._buildBalloon(width, height)
    this._buildUI(width, height)
    this._buildTapArea(width, height)

    socket.off('updateGame')
    socket.on('updateGame', (d) => this._onUpdateGame(d))
    this._onUpdateGame(this._gameData)
  }

  // ── Background ────────────────────────────────────────────────────────────────

  _buildBackground(width, height) {
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xD4EFF9, 0xD4EFF9, 1)
    bg.fillRect(0, 0, width, height)
    this._drawCloud(width * 0.14, height * 0.07, 72)
    this._drawCloud(width * 0.76, height * 0.11, 88)
  }

  _drawCloud(cx, cy, size) {
    const g = this.add.graphics().setAlpha(0.75)
    g.fillStyle(0xFFFFFF, 1)
    g.fillEllipse(cx, cy, size, size * 0.52)
    g.fillEllipse(cx - size * 0.33, cy + size * 0.07, size * 0.68, size * 0.44)
    g.fillEllipse(cx + size * 0.33, cy + size * 0.07, size * 0.68, size * 0.44)
    g.fillEllipse(cx, cy + size * 0.14, size * 1.1, size * 0.48)
  }

  // ── Character ─────────────────────────────────────────────────────────────────

  _buildCharacter(width, height) {
    const charX = width / 2
    const charY = height * 0.17
    const glow = this.add.graphics()
    glow.fillStyle(this._colorVal, 0.07)
    glow.fillEllipse(charX, charY + 10, 200, 52)

    this._char = new PlayerCharacter(this, charX, charY, {
      color: this._myColor, name: this._myName, wins: this._myWins, isMe: true,
    })
    this._char.posContainer.setScale(1.6)
    this._char.playIdle()
  }

  // ── Balloon ───────────────────────────────────────────────────────────────────

  _buildBalloon(width, height) {
    this._balloonCx   = width / 2
    this._balloonBase = height * 0.80  // bottom anchor (string end)
    this._maxW        = width * 0.52
    this._maxH        = height * 0.40
    this._balloonG    = this.add.graphics().setDepth(5)
    this._redrawBalloon(0)
  }

  _redrawBalloon(size) {
    const { _balloonCx: cx, _balloonBase: base, _maxW: maxW, _maxH: maxH, _balloonG: g } = this
    const pct      = size / BALLOON_MAX_SIZE
    const w        = 22 + (maxW - 22) * pct
    const h        = 26 + (maxH - 26) * pct
    const stringLen = 58
    const knotY    = base - stringLen
    const balloonY = knotY - h / 2

    g.clear()

    // Danger glow when >75%
    if (pct > 0.75) {
      const alpha = ((pct - 0.75) / 0.25) * 0.42
      g.fillStyle(0xff4444, alpha)
      g.fillEllipse(cx, balloonY, w + 28, h + 28)
    }

    // Balloon body
    g.fillStyle(this._colorVal, 1)
    g.fillEllipse(cx, balloonY, w, h)

    // Shine
    if (pct > 0.03) {
      g.fillStyle(0xffffff, 0.42)
      g.fillEllipse(cx - w * 0.22, balloonY - h * 0.22, w * 0.28, h * 0.33)
    }

    // Knot + string
    g.fillStyle(this._colorVal, 1)
    g.fillTriangle(cx - 6, knotY, cx + 6, knotY, cx, knotY + 13)
    g.lineStyle(2, 0x777777, 0.78)
    g.beginPath()
    g.moveTo(cx, knotY + 13)
    g.lineTo(cx + 10, knotY + 28)
    g.lineTo(cx - 8, knotY + 44)
    g.lineTo(cx, base)
    g.strokePath()

    // Pct text (positioned inside balloon when large enough)
    if (this._pctText) {
      if (pct > 0.25) {
        this._pctText.setText(`${Math.round(pct * 100)}%`)
        this._pctText.setY(balloonY)
        this._pctText.setAlpha(Math.min(1, (pct - 0.25) / 0.18))
      } else {
        this._pctText.setAlpha(0)
      }
    }
  }

  // ── UI ────────────────────────────────────────────────────────────────────────

  _buildUI(width, height) {
    this._statusText = this.add.text(width / 2, height * 0.04, '', {
      fontSize: '17px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
      shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 3, fill: true },
    }).setOrigin(0.5).setDepth(10)

    this._pctText = this.add.text(width / 2, height * 0.5, '', {
      fontSize: '28px', fontFamily: '"Arial Black", Arial',
      color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(7).setAlpha(0)

    this._warningText = this.add.text(width / 2, height * 0.86, '', {
      fontSize: '22px', fontFamily: '"Arial Black", Arial',
      color: '#ff4444', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(15)

    this._tapHint = this.add.text(width / 2, height * 0.92, '👆  TAP TO INFLATE', {
      fontSize: '18px', fontFamily: '"Arial Black", Arial',
      color: 'rgba(0,0,0,0.4)',
    }).setOrigin(0.5).setDepth(10)
    this.tweens.add({
      targets: this._tapHint, alpha: { from: 0.4, to: 0.12 },
      duration: 720, yoyo: true, repeat: -1,
    })

    this._countdownText = this.add.text(width / 2, height / 2, '', {
      fontSize: '140px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(21).setAlpha(0)
  }

  // ── Tap area ──────────────────────────────────────────────────────────────────

  _buildTapArea(width, height) {
    const zone = this.add.zone(0, 0, width, height).setOrigin(0).setInteractive()
    zone.on('pointerdown', () => this._onTap())
  }

  // ── Input ─────────────────────────────────────────────────────────────────────

  _onTap() {
    if (this._gameStatus !== 'racing') return
    const socket = getSocket()
    if (!socket) return

    const now     = Date.now()
    const elapsed = now - this._lastTapAt

    // Client-side speed feedback (visual only — server is authoritative)
    if (this._lastTapAt > 0 && elapsed < BURST_COOLDOWN_MS) {
      this._showWarning('⚡  TOO FAST!')
    } else if (this._lastTapAt > 0 && elapsed < BURST_COOLDOWN_MS * 1.25) {
      this._showWarning('STEADY...')
    }
    this._lastTapAt = now

    socket.emit('move')

    // Subtle pulse feedback on the balloon graphic
    this.tweens.killTweensOf(this._balloonG)
    this._balloonG.setScale(1.04)
    this.tweens.add({
      targets: this._balloonG, scaleX: 1, scaleY: 1,
      duration: 110, ease: 'Quad.easeOut',
    })
  }

  _showWarning(msg) {
    this._warningText.setText(msg)
    this.tweens.killTweensOf(this._warningText)
    this._warningText.setAlpha(1)
    this.tweens.add({
      targets: this._warningText, alpha: 0,
      duration: 550, delay: 180,
    })
  }

  // ── Server updates ────────────────────────────────────────────────────────────

  _onUpdateGame(data) {
    const { players = [], gameState, countdown, burstId } = data
    const prevStatus  = this._gameStatus
    this._gameStatus  = gameState

    // After a finished round the server resets — go back to lobby for clean state
    if (prevStatus === 'finished' && gameState === 'waiting') {
      getSocket()?.off('updateGame')
      this.scene.start('Waiting')
      return
    }

    const me = players.find(p => p.id === this._myId)
    if (me) {
      this._balloonSize = me.balloonSize || 0
      this._redrawBalloon(this._balloonSize)
      if (me.wins !== this._myWins) {
        this._myWins = me.wins
        this._char?.updateWins(this._myWins)
      }
    }

    this._updateStatus(gameState, countdown, players)

    if (gameState === 'racing') {
      this._char?.startRunning()
    } else {
      this._char?.stopRunning()
    }

    if (burstId === this._myId) this._onBurst()

    if (gameState === 'finished' && !this._finishShown) {
      this._showFinish(players)
    }
  }

  _updateStatus(state, countdown, players) {
    if (state === 'waiting') {
      const ready = players.filter(p => p.ready).length
      this._statusText.setText(
        players.length <= 1 ? '⏳ Waiting for players...' : `${ready}/${players.length} ready`
      )
    } else if (state === 'countdown') {
      this._statusText.setText('Get ready!')
      if (countdown) this._showCountdown(countdown)
    } else if (state === 'racing') {
      this._statusText.setText(`🎈 ${Math.round(this._balloonSize)}%  — Keep going!`)
    }
  }

  _showCountdown(n) {
    this._countdownText.setText(String(n)).setAlpha(1).setScale(0.4)
    this.tweens.killTweensOf(this._countdownText)
    this.tweens.add({
      targets: this._countdownText, scaleX: 1.6, scaleY: 1.6, alpha: 0,
      duration: 850, ease: 'Cubic.easeOut',
    })
    this.cameras.main.shake(180, 0.009)
  }

  // ── Burst animation ───────────────────────────────────────────────────────────

  _onBurst() {
    const { width, height } = this.scale

    this.cameras.main.shake(360, 0.022)

    // Red screen flash
    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xff4444, 0.55).setDepth(50)
    this.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() })

    // Big POP! text
    const popText = this.add.text(width / 2, height * 0.44, '💥  POP!', {
      fontSize: '74px', fontFamily: '"Arial Black", Arial',
      color: '#ff4444', stroke: '#ffffff', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(52).setScale(0)
    this.tweens.add({ targets: popText, scaleX: 1.3, scaleY: 1.3, duration: 380, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: popText, alpha: 0,
      delay: 520, duration: 380,
      onComplete: () => popText.destroy(),
    })

    // Reset balloon visual immediately
    this._balloonSize = 0
    this._redrawBalloon(0)
    this._lastTapAt = 0
  }

  // ── Finish overlay ────────────────────────────────────────────────────────────

  _showFinish(players) {
    if (this._finishShown) return
    this._finishShown = true

    const { width, height } = this.scale
    const winner = players.find(p => (p.balloonSize || 0) >= BALLOON_MAX_SIZE)
    const iWon   = winner?.id === this._myId

    const ov = this.add.graphics().setDepth(30)
    ov.fillStyle(0x000000, 0.65)
    ov.fillRect(0, 0, width, height)

    if (iWon) {
      this._char?.playVictory()
      const wt = this.add.text(width / 2, height * 0.27, '🏆  YOU WIN!  🏆', {
        fontSize: '44px', fontFamily: '"Arial Black", Arial',
        color: '#f1c40f', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(32).setScale(0)
      this.tweens.add({ targets: wt, scaleX: 1, scaleY: 1, duration: 620, ease: 'Back.easeOut' })
    } else {
      const winnerName = winner?.name || 'Someone'
      this.add.text(width / 2, height * 0.27, `${winnerName} wins!`, {
        fontSize: '38px', fontFamily: '"Arial Black", Arial',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(32)
    }

    const playBtn = this.add.text(width / 2, height * 0.54, '▶  Play Again', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial',
      color: '#1a1a2e', backgroundColor: '#f1c40f',
      padding: { x: 32, y: 16 },
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })
    playBtn.on('pointerover', () => playBtn.setScale(1.05))
    playBtn.on('pointerout',  () => playBtn.setScale(1.0))
    playBtn.on('pointerdown', () => { getSocket()?.emit('requestRestart') })

    this.add.text(width / 2, height * 0.68, 'Leave Game', {
      fontSize: '16px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.45)',
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { disconnect(); window.location.reload() })
  }

  update() {}

  shutdown() {
    const socket = getSocket()
    if (socket) socket.off('updateGame')
  }
}
