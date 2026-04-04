import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

// ─────────────────────────────────────────────────────────────────────────────
//  PlayerScene  — the iPad / phone controller screen
//  Kids only see their own character here. The full race plays on the TV.
// ─────────────────────────────────────────────────────────────────────────────

const FINISH_LINE = 2000
const RANK_LABELS = ['🥇 1st!', '🥈 2nd', '🥉 3rd', '4th']
const RANK_COLORS = ['#f1c40f', '#aaaaaa', '#cd7f32', '#95a5a6']

export default class PlayerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Player' })
  }

  init(data) {
    this._gameData = data.gameData || { players: [], gameState: 'waiting' }
  }

  create() {
    const { width, height } = this.scale
    const socket = getSocket()
    if (!socket) { this.scene.start('Landing'); return }

    this._myId = socket.id
    this._gameStatus = this._gameData.gameState || 'waiting'
    this._ripples = []

    this._buildBackground(width, height)
    this._buildCharacter(width, height)
    this._buildStatusArea(width, height)
    this._buildTapZone(width, height)
    this._buildProgressBar(width, height)

    // Update from server
    socket.off('updateGame')
    socket.on('updateGame', (data) => this._onUpdate(data))

    // Process initial state
    this._onUpdate(this._gameData)

    // Make the whole lower area tappable
    this.input.on('pointerdown', (ptr) => {
      if (this._gameStatus === 'racing') {
        this._sendMove(ptr.x, ptr.y)
      }
    })
  }

  // ── Background ─────────────────────────────────────────────────────────────
  _buildBackground(width, height) {
    const g = this.add.graphics()
    g.fillGradientStyle(0x0d0d2b, 0x0d0d2b, 0x1a1a3e, 0x16213e, 1)
    g.fillRect(0, 0, width, height)
    this._bg = g
  }

  // ── The player's character — large and centered ─────────────────────────────
  _buildCharacter(width, height) {
    // Player shown in the top 55% of the screen, centred
    const charX = width / 2
    const charY = height * 0.38

    // Spotlight glow under character
    const glow = this.add.graphics()
    glow.fillStyle(0xffffff, 0.04)
    glow.fillEllipse(charX, charY + 10, 200, 60)
    this._glowGraphic = glow

    // Bigger scale for the character on iPad
    const myData = this._gameData.players?.find(p => p.id === this._myId)
    const color = myData?.color || '#3498db'
    const name = myData?.name || this.registry.get('playerName') || 'Player'
    const wins = myData?.wins || 0

    this._char = new PlayerCharacter(this, charX, charY, { color, name, wins, isMe: true })
    // Scale up the character — it's the star of this screen
    this._char.posContainer.setScale(1.8)

    this._char.playIdle()
  }

  // ── Status text area (top of screen) ───────────────────────────────────────
  _buildStatusArea(width, height) {
    // Game status pill at top
    this._statusBg = this.add.graphics()
    this._statusText = this.add.text(width / 2, height * 0.08, '', {
      fontSize: '22px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
      shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 4, fill: true },
    }).setOrigin(0.5).setDepth(10)

    // Rank badge
    this._rankText = this.add.text(width / 2, height * 0.16, '', {
      fontSize: '28px', fontFamily: '"Arial Black", Arial', color: '#f1c40f',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10)

    // Countdown overlay (hidden until needed)
    this._countdownOverlay = this.add.graphics().setDepth(20)
    this._countdownText = this.add.text(width / 2, height / 2, '', {
      fontSize: '140px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(21).setAlpha(0)
  }

  // ── Tap zone — lower half of screen ────────────────────────────────────────
  _buildTapZone(width, height) {
    const zoneTop = height * 0.62
    const zoneH = height - zoneTop

    // Background of tap zone
    this._tapBg = this.add.graphics()
    this._tapBg.fillStyle(0x000000, 0.3)
    this._tapBg.fillRoundedRect(16, zoneTop, width - 32, zoneH - 16, 20)

    // Tap hint text
    this._tapHint = this.add.text(width / 2, zoneTop + zoneH / 2, '👆  TAP HERE TO RUN!', {
      fontSize: '28px', fontFamily: '"Arial Black", Arial',
      color: '#ffffff', alpha: 0.5,
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0.5)

    // Waiting text (shown before race)
    this._waitText = this.add.text(width / 2, zoneTop + zoneH / 2, '⏳  Waiting for race to start...', {
      fontSize: '20px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.5)',
    }).setOrigin(0.5)

    // Ripple container
    this._rippleContainer = this.add.container(0, 0).setDepth(5)
  }

  // ── Mini progress bar (bottom strip) ───────────────────────────────────────
  _buildProgressBar(width, height) {
    const barY = height - 20
    const barH = 14
    const pad = 20
    const barW = width - pad * 2

    // Track
    const track = this.add.graphics()
    track.fillStyle(0xffffff, 0.1)
    track.fillRoundedRect(pad, barY - barH / 2, barW, barH, 7)

    // My fill (dynamic)
    this._myFill = this.add.graphics()
    this._myFill.setDepth(5)

    // My dot on bar
    this._myDot = this.add.circle(pad, barY, 10, 0xffffff)
    this._myDot.setDepth(6)

    // Other player dots
    this._otherDots = []

    this._progressY = barY
    this._progressPad = pad
    this._progressW = barW
    this._progressH = barH
  }

  // ── Handle server update ────────────────────────────────────────────────────
  _onUpdate(data) {
    const { players = [], gameState, countdown } = data
    this._gameStatus = gameState
    this._lastPlayers = players

    const me = players.find(p => p.id === this._myId)

    this._updateStatusText(gameState, countdown, players, me)
    this._updateCharacterState(gameState, me)
    this._updateProgressBar(players, me)
    this._updateTapZoneVisibility(gameState)

    // Rank label
    if (me && (gameState === 'racing' || gameState === 'finished')) {
      const sorted = [...players].sort((a, b) => b.position - a.position)
      const rank = sorted.findIndex(p => p.id === this._myId)
      if (rank >= 0) {
        this._rankText.setText(RANK_LABELS[rank] || `${rank + 1}th`)
        this._rankText.setColor(RANK_COLORS[rank] || '#ffffff')
      }
    } else {
      this._rankText.setText('')
    }

    if (gameState === 'finished') {
      this._showFinish(players, me)
    }
  }

  _updateStatusText(state, countdown, players, me) {
    const { width } = this.scale
    let msg = ''
    if (state === 'waiting') {
      const readyCount = players.filter(p => p.ready).length
      msg = players.length <= 1
        ? '⏳ Waiting for players...'
        : `${readyCount}/${players.length} ready`
    } else if (state === 'countdown') {
      msg = 'Get ready!'
      this._showCountdown(countdown)
    } else if (state === 'racing') {
      msg = '🏃 Race in progress!'
    } else if (state === 'finished') {
      msg = ''
    }
    this._statusText.setText(msg)
  }

  _showCountdown(n) {
    if (!n) return
    this._countdownText.setText(String(n))
    this._countdownText.setAlpha(1).setScale(0.5)
    this.tweens.killTweensOf(this._countdownText)
    this.tweens.add({
      targets: this._countdownText,
      scaleX: 1.4, scaleY: 1.4, alpha: 0,
      duration: 800, ease: 'Cubic.easeOut',
    })
    this.cameras.main.shake(200, 0.008)
  }

  _updateCharacterState(state, me) {
    if (!this._char) return
    if (state === 'racing') {
      this._char.startRunning()
    } else if (state === 'waiting' || state === 'countdown') {
      this._char.stopRunning()
      this._char.playIdle()
    } else if (state === 'finished') {
      const winner = this._lastPlayers?.find(p => p.position >= FINISH_LINE)
      if (winner?.id === this._myId) {
        this._char.playVictory()
      } else {
        this._char.stopRunning()
      }
    }

    // Update wins badge
    if (me?.wins > 0) this._char.updateWins(me.wins)
  }

  _updateProgressBar(players, me) {
    const { width } = this.scale
    const pad = this._progressPad
    const barW = this._progressW
    const barY = this._progressY
    const barH = this._progressH

    // My fill
    this._myFill.clear()
    if (me) {
      const pct = Math.min(me.position / FINISH_LINE, 1)
      const fillW = pct * barW
      if (fillW > 0) {
        const color = Phaser.Display.Color.HexStringToColor(me.color.replace('#', '')).color
        this._myFill.fillStyle(color, 0.9)
        this._myFill.fillRoundedRect(pad, barY - barH / 2, fillW, barH, 7)
      }
      // My dot
      this._myDot.setPosition(pad + pct * barW, barY)
    }

    // Other player dots — remove old ones and redraw
    this._otherDots.forEach(d => d.destroy())
    this._otherDots = []
    players.forEach(p => {
      if (p.id === this._myId) return
      const pct = Math.min(p.position / FINISH_LINE, 1)
      const color = Phaser.Display.Color.HexStringToColor(p.color.replace('#', '')).color
      const dot = this.add.circle(pad + pct * barW, barY, 6, color).setDepth(6)
      this._otherDots.push(dot)
    })
  }

  _updateTapZoneVisibility(state) {
    const racing = state === 'racing'
    this._tapHint.setVisible(racing)
    this._waitText.setVisible(!racing && state !== 'finished')

    // Pulse the tap hint
    if (racing && !this._hintPulsing) {
      this._hintPulsing = true
      this.tweens.add({
        targets: this._tapHint, alpha: 0.9, duration: 700,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    } else if (!racing) {
      this._hintPulsing = false
      this.tweens.killTweensOf(this._tapHint)
    }
  }

  // ── Tap → move ──────────────────────────────────────────────────────────────
  _sendMove(tapX, tapY) {
    const socket = getSocket()
    if (!socket) return
    socket.emit('move')

    // Ripple effect at tap position
    const ring = this.add.circle(tapX, tapY, 10, 0xffffff, 0.7)
    ring.setDepth(10)
    this.tweens.add({
      targets: ring, scaleX: 5, scaleY: 5, alpha: 0,
      duration: 500, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })

    // Flash the tap zone
    this._tapBg.clear()
    this._tapBg.fillStyle(0xffffff, 0.12)
    const zoneTop = this.scale.height * 0.62
    const zoneH = this.scale.height - zoneTop
    this._tapBg.fillRoundedRect(16, zoneTop, this.scale.width - 32, zoneH - 16, 20)
    this.time.delayedCall(120, () => {
      this._tapBg.clear()
      this._tapBg.fillStyle(0x000000, 0.3)
      this._tapBg.fillRoundedRect(16, zoneTop, this.scale.width - 32, zoneH - 16, 20)
    })
  }

  // ── Win / lose screen ───────────────────────────────────────────────────────
  _showFinish(players, me) {
    if (this._finishShown) return
    this._finishShown = true

    const { width, height } = this.scale
    const winner = players.find(p => p.position >= FINISH_LINE)
    const iWon = winner?.id === this._myId

    // Semi-transparent overlay
    const overlay = this.add.graphics().setDepth(30)
    overlay.fillStyle(0x000000, 0.6)
    overlay.fillRect(0, 0, width, height)

    if (iWon) {
      // Confetti!
      for (let i = 0; i < 6; i++) {
        const key = `confetti_${i}`
        const emitter = this.add.particles(
          Phaser.Math.Between(0, width), 0, key, {
            speedY: { min: 150, max: 350 },
            speedX: { min: -80, max: 80 },
            gravityY: 200,
            scale: { start: 1.2, end: 0.3 },
            alpha: { start: 1, end: 0 },
            rotate: { min: 0, max: 360 },
            lifespan: 2500,
            quantity: 3,
          }
        ).setDepth(31)
        this.time.delayedCall(3000, () => emitter.stop())
      }

      const winText = this.add.text(width / 2, height * 0.35, '🏆 YOU WIN! 🏆', {
        fontSize: '52px', fontFamily: '"Arial Black", Arial',
        color: '#f1c40f', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(32).setScale(0)
      this.tweens.add({
        targets: winText, scaleX: 1, scaleY: 1, duration: 600, ease: 'Back.easeOut',
      })
    } else {
      const pos = [...players].sort((a, b) => b.position - a.position)
        .findIndex(p => p.id === this._myId) + 1
      this.add.text(width / 2, height * 0.35, `You finished ${pos}${pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'}`, {
        fontSize: '36px', fontFamily: '"Arial Black", Arial',
        color: '#ffffff', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(32)

      if (winner) {
        this.add.text(width / 2, height * 0.45, `${winner.name} wins! 🎉`, {
          fontSize: '22px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.8)',
        }).setOrigin(0.5).setDepth(32)
      }
    }

    // Play Again button
    const btn = this.add.text(width / 2, height * 0.65, '▶  Play Again', {
      fontSize: '24px', fontFamily: '"Arial Black", Arial',
      color: '#1a1a2e',
      backgroundColor: '#f1c40f',
      padding: { x: 28, y: 14 },
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })

    btn.on('pointerover', () => btn.setScale(1.05))
    btn.on('pointerout', () => btn.setScale(1.0))
    btn.on('pointerdown', () => {
      getSocket()?.emit('requestRestart')
      this._finishShown = false
    })

    // Leave button
    const leaveBtn = this.add.text(width / 2, height * 0.77, 'Leave Game', {
      fontSize: '16px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.5)',
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })
    leaveBtn.on('pointerdown', () => { disconnect(); window.location.reload() })
  }

  update() {}
}
