import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

// ─────────────────────────────────────────────────────────────────────────────
//  PlayerScene  —  iPad / phone controller screen
//
//  Running mechanic: alternate LEFT and RIGHT fingers (like actual running legs)
//  Left half of screen = left foot, right half = right foot
//  Tapping the same side twice in a row doesn't count — must alternate L→R→L→R
// ─────────────────────────────────────────────────────────────────────────────

const FINISH_LINE = 2000
const RANK_LABELS  = ['🥇 1st!', '🥈 2nd', '🥉 3rd', '4th']
const RANK_COLORS  = ['#f1c40f', '#c0c0c0', '#cd7f32', '#95a5a6']
const LEFT_COLOR   = 0x3498db   // blue for left foot
const RIGHT_COLOR  = 0x9b59b6   // purple for right foot

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

    this._myId       = socket.id
    this._gameStatus = this._gameData.gameState || 'waiting'
    this._lastSide   = null   // 'left' | 'right' | null (null = first step, any side ok)
    this._prevState  = null
    this._finishShown = false
    this._otherDots  = []

    // Enable multi-touch so both fingers are tracked simultaneously
    this.input.addPointer(3)

    this._buildBackground(width, height)
    this._buildCharacter(width, height)
    this._buildStatusArea(width, height)
    this._buildRunZones(width, height)
    this._buildProgressBar(width, height)

    socket.off('updateGame')
    socket.on('updateGame', (data) => this._onUpdate(data))
    this._onUpdate(this._gameData)

    // Each finger tap fires a separate pointerdown event
    this.input.on('pointerdown', (ptr) => {
      if (this._gameStatus === 'racing') this._handleStep(ptr.x, ptr.y)
    })
  }

  // ── Background ──────────────────────────────────────────────────────────────
  _buildBackground(width, height) {
    const g = this.add.graphics()
    g.fillGradientStyle(0x0d0d2b, 0x0d0d2b, 0x16213e, 0x1a1a3e, 1)
    g.fillRect(0, 0, width, height)
  }

  // ── Character (large, centred in top portion) ───────────────────────────────
  _buildCharacter(width, height) {
    const charX = width / 2
    const charY = height * 0.30

    const glow = this.add.graphics()
    glow.fillStyle(0xffffff, 0.04)
    glow.fillEllipse(charX, charY + 12, 220, 60)

    const myData = this._gameData.players?.find(p => p.id === this._myId)
    const color  = myData?.color  || '#3498db'
    const name   = myData?.name   || this.registry.get('playerName') || 'Player'
    const wins   = myData?.wins   || 0

    this._char = new PlayerCharacter(this, charX, charY, { color, name, wins, isMe: true })
    this._char.posContainer.setScale(1.8)
    this._char.playIdle()
  }

  // ── Status + rank text ──────────────────────────────────────────────────────
  _buildStatusArea(width, height) {
    this._statusText = this.add.text(width / 2, height * 0.07, '', {
      fontSize: '20px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
      shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 4, fill: true },
    }).setOrigin(0.5).setDepth(10)

    this._rankText = this.add.text(width / 2, height * 0.14, '', {
      fontSize: '30px', fontFamily: '"Arial Black", Arial', color: '#f1c40f',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10)

    // Countdown burst (hidden until needed)
    this._countdownText = this.add.text(width / 2, height * 0.45, '', {
      fontSize: '150px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(21).setAlpha(0)
  }

  // ── Two-finger run zones ─────────────────────────────────────────────────────
  _buildRunZones(width, height) {
    const pad     = 10
    const top     = height * 0.58
    const zoneH   = height * 0.36    // leaves room for progress bar
    const halfW   = (width - pad * 3) / 2

    // Store for reuse in drawing/input
    this._zt    = top
    this._zh    = zoneH
    this._hw    = halfW
    this._zpad  = pad

    // ── Left zone ──
    this._leftBg   = this.add.graphics().setDepth(2)
    this._rightBg  = this.add.graphics().setDepth(2)
    this._drawZone(this._leftBg,  'left',  'idle')
    this._drawZone(this._rightBg, 'right', 'idle')

    const lCx = pad + halfW / 2
    const rCx = pad * 2 + halfW + halfW / 2
    const midY = top + zoneH * 0.38

    // Foot emojis — left foot mirrored, right normal
    this._leftFoot = this.add.text(lCx, midY, '🦶', {
      fontSize: '68px',
    }).setOrigin(0.5).setFlipX(true).setDepth(3)

    this._rightFoot = this.add.text(rCx, midY, '🦶', {
      fontSize: '68px',
    }).setOrigin(0.5).setDepth(3)

    // Labels
    this._leftLabel = this.add.text(lCx, top + zoneH * 0.74, 'LEFT', {
      fontSize: '22px', fontFamily: '"Arial Black", Arial',
      color: '#7fb3d3', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3)

    this._rightLabel = this.add.text(rCx, top + zoneH * 0.74, 'RIGHT', {
      fontSize: '22px', fontFamily: '"Arial Black", Arial',
      color: '#bb8fce', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3)

    // Centre divider
    const div = this.add.graphics().setDepth(3)
    div.lineStyle(2, 0xffffff, 0.12)
    div.beginPath()
    div.moveTo(width / 2, top + 12)
    div.lineTo(width / 2, top + zoneH - 12)
    div.strokePath()

    // "NEXT →" arrow that jumps above the expected zone
    this._nextArrow = this.add.text(lCx, top - 28, '▼ NEXT', {
      fontSize: '14px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(4)

    // "SAME SIDE!" warning (flashes briefly on wrong tap)
    this._wrongText = this.add.text(width / 2, top + zoneH / 2, '❌  SAME SIDE!', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial',
      color: '#e74c3c', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(10)

    // Waiting overlay text
    this._waitText = this.add.text(width / 2, top + zoneH / 2, '⏳  Waiting for race...', {
      fontSize: '18px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.45)',
    }).setOrigin(0.5).setDepth(3)

    this._zonesVisible = true
  }

  // Draw a zone background + border with three states: 'idle' | 'next' | 'wrong'
  _drawZone(g, side, state) {
    const { _zt: zt, _zh: zh, _hw: hw, _zpad: pad } = this
    const x = side === 'left' ? pad : pad * 2 + hw
    const baseColor = side === 'left' ? LEFT_COLOR : RIGHT_COLOR

    let bgAlpha, borderAlpha, borderColor
    if (state === 'next') {
      bgAlpha = 0.38; borderAlpha = 1.0; borderColor = baseColor
    } else if (state === 'wrong') {
      bgAlpha = 0.45; borderAlpha = 1.0; borderColor = 0xe74c3c
    } else {
      bgAlpha = 0.08; borderAlpha = 0.25; borderColor = baseColor
    }

    g.clear()
    g.fillStyle(state === 'wrong' ? 0xe74c3c : baseColor, bgAlpha)
    g.fillRoundedRect(x, zt, hw, zh, 18)
    g.lineStyle(3, borderColor, borderAlpha)
    g.strokeRoundedRect(x, zt, hw, zh, 18)
  }

  // ── Progress bar (thin strip at very bottom) ────────────────────────────────
  _buildProgressBar(width, height) {
    const barY = height - 16
    const barH = 12
    const pad  = 16
    const barW = width - pad * 2

    const track = this.add.graphics()
    track.fillStyle(0xffffff, 0.08)
    track.fillRoundedRect(pad, barY - barH / 2, barW, barH, 6)

    this._myFill = this.add.graphics().setDepth(5)
    this._myDot  = this.add.circle(pad, barY, 9, 0xffffff).setDepth(6)

    this._progressY   = barY
    this._progressPad = pad
    this._progressW   = barW
    this._progressH   = barH
  }

  // ── Incoming server update ───────────────────────────────────────────────────
  _onUpdate(data) {
    const { players = [], gameState, countdown } = data
    this._gameStatus  = gameState
    this._lastPlayers = players

    const me = players.find(p => p.id === this._myId)

    // Reset stride tracking when a fresh race begins
    if (gameState === 'racing' && this._prevState !== 'racing') {
      this._lastSide = null
    }
    this._prevState = gameState

    this._updateStatusText(gameState, countdown, players)
    this._updateCharacterState(gameState, me)
    this._updateZoneState(gameState)
    this._updateProgressBar(players, me)
    this._updateRankBadge(gameState, players)

    if (gameState === 'finished') this._showFinish(players, me)
  }

  _updateStatusText(state, countdown, players) {
    let msg = ''
    if (state === 'waiting') {
      const ready = players.filter(p => p.ready).length
      msg = players.length <= 1 ? '⏳ Waiting for players...' : `${ready}/${players.length} ready`
    } else if (state === 'countdown') {
      msg = 'Get ready!'
      this._showCountdown(countdown)
    } else if (state === 'racing') {
      msg = '🏃 Alternate L + R fingers!'
    }
    this._statusText.setText(msg)
  }

  _showCountdown(n) {
    if (!n) return
    this._countdownText.setText(String(n)).setAlpha(1).setScale(0.4)
    this.tweens.killTweensOf(this._countdownText)
    this.tweens.add({
      targets: this._countdownText,
      scaleX: 1.6, scaleY: 1.6, alpha: 0,
      duration: 850, ease: 'Cubic.easeOut',
    })
    this.cameras.main.shake(180, 0.009)
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
      winner?.id === this._myId ? this._char.playVictory() : this._char.stopRunning()
    }
    if (me?.wins > 0) this._char.updateWins(me.wins)
  }

  _updateZoneState(state) {
    const racing  = state === 'racing'
    const waiting = !racing && state !== 'finished'

    this._waitText.setVisible(waiting)
    this._leftFoot.setVisible(!waiting)
    this._rightFoot.setVisible(!waiting)
    this._leftLabel.setVisible(!waiting)
    this._rightLabel.setVisible(!waiting)

    if (!racing) {
      // Reset zones back to idle when not racing
      this._drawZone(this._leftBg,  'left',  'idle')
      this._drawZone(this._rightBg, 'right', 'idle')
      this._nextArrow.setAlpha(0)
      this.tweens.killTweensOf(this._nextArrow)

      if (!waiting) {
        // Hide zones completely on finish screen
        this._leftBg.setVisible(false)
        this._rightBg.setVisible(false)
      } else {
        this._leftBg.setVisible(true)
        this._rightBg.setVisible(true)
      }
    } else {
      this._leftBg.setVisible(true)
      this._rightBg.setVisible(true)

      // Show alternating hint for the first 2.5 seconds of the race
      if (this._lastSide === null && !this._hintTimer) {
        this._showRaceStartHint()
      }
    }
  }

  _showRaceStartHint() {
    const { width } = this.scale
    const hint = this.add.text(width / 2, this._zt + this._zh / 2,
      '👈 Alternate fingers! 👉', {
      fontSize: '20px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8)

    this._hintTimer = this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() })
      this._hintTimer = null
    })
  }

  _updateRankBadge(state, players) {
    if (state === 'racing' || state === 'finished') {
      const sorted = [...players].sort((a, b) => b.position - a.position)
      const rank   = sorted.findIndex(p => p.id === this._myId)
      if (rank >= 0) {
        this._rankText.setText(RANK_LABELS[Math.min(rank, 3)])
        this._rankText.setColor(RANK_COLORS[Math.min(rank, 3)])
      }
    } else {
      this._rankText.setText('')
    }
  }

  _updateProgressBar(players, me) {
    const { _progressPad: pad, _progressW: barW, _progressY: barY, _progressH: barH } = this

    this._myFill.clear()
    if (me) {
      const pct   = Math.min(me.position / FINISH_LINE, 1)
      const color = Phaser.Display.Color.HexStringToColor(me.color.replace('#', '')).color
      if (pct > 0) {
        this._myFill.fillStyle(color, 0.9)
        this._myFill.fillRoundedRect(pad, barY - barH / 2, pct * barW, barH, 6)
      }
      this._myDot.setPosition(pad + pct * barW, barY)
    }

    this._otherDots.forEach(d => d.destroy())
    this._otherDots = []
    players.forEach(p => {
      if (p.id === this._myId) return
      const pct   = Math.min(p.position / FINISH_LINE, 1)
      const color = Phaser.Display.Color.HexStringToColor(p.color.replace('#', '')).color
      this._otherDots.push(this.add.circle(pad + pct * barW, barY, 5, color).setDepth(6))
    })
  }

  // ── Two-finger step logic ─────────────────────────────────────────────────────
  _handleStep(x, y) {
    const { width } = this.scale
    const side         = x < width / 2 ? 'left' : 'right'
    const isFirst      = this._lastSide === null
    const isAlternating = this._lastSide !== side

    if (isFirst || isAlternating) {
      // ✅ Valid step
      this._lastSide = side
      getSocket()?.emit('move')
      this._flashValid(side, x, y)
      this._highlightNext(side === 'left' ? 'right' : 'left')
    } else {
      // ❌ Same side again
      this._flashWrong(side)
    }
  }

  // Flash the tapped zone green-ish + bounce the foot icon
  _flashValid(side, x, y) {
    const bg   = side === 'left' ? this._leftBg   : this._rightBg
    const icon = side === 'left' ? this._leftFoot : this._rightFoot

    this._drawZone(bg, side, 'next')

    // Foot stamp animation
    this.tweens.killTweensOf(icon)
    this.tweens.add({
      targets: icon,
      scaleX: 1.5, scaleY: 1.5,
      duration: 75, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => {
        // Zone dims after stamp
        this._drawZone(bg, side, 'idle')
      },
    })

    // Ripple at touch point
    const ripple = this.add.circle(x, y, 12,
      side === 'left' ? LEFT_COLOR : RIGHT_COLOR, 0.7).setDepth(9)
    this.tweens.add({
      targets: ripple, scaleX: 5, scaleY: 5, alpha: 0,
      duration: 450, ease: 'Cubic.easeOut',
      onComplete: () => ripple.destroy(),
    })
  }

  // Highlight the zone the player should tap next
  _highlightNext(nextSide) {
    const { width }  = this.scale
    const lCx        = this._zpad + this._hw / 2
    const rCx        = this._zpad * 2 + this._hw + this._hw / 2
    const arrowX     = nextSide === 'left' ? lCx : rCx
    const nextBg     = nextSide === 'left' ? this._leftBg   : this._rightBg
    const prevBg     = nextSide === 'left' ? this._rightBg  : this._leftBg
    const prevSide   = nextSide === 'left' ? 'right' : 'left'

    // Brighten next zone
    this._drawZone(nextBg, nextSide, 'next')
    // Dim previous zone
    this._drawZone(prevBg, prevSide, 'idle')

    // Bounce the "▼ NEXT" arrow above the next zone
    this.tweens.killTweensOf(this._nextArrow)
    this._nextArrow.setPosition(arrowX, this._zt - 32).setAlpha(1)
    this.tweens.add({
      targets: this._nextArrow,
      y: this._zt - 18,
      duration: 280, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
      onComplete: () => {
        this.tweens.add({ targets: this._nextArrow, alpha: 0.4, duration: 200 })
      },
    })
  }

  // Flash a zone red + camera shake + "SAME SIDE!" warning
  _flashWrong(side) {
    const bg = side === 'left' ? this._leftBg : this._rightBg

    this._drawZone(bg, side, 'wrong')
    this.cameras.main.shake(90, 0.006)

    // "SAME SIDE!" text burst
    this.tweens.killTweensOf(this._wrongText)
    this._wrongText.setAlpha(1).setScale(0.8)
    this.tweens.add({
      targets: this._wrongText,
      scaleX: 1.1, scaleY: 1.1,
      duration: 120, yoyo: true, ease: 'Quad.easeOut',
    })
    this.tweens.add({
      targets: this._wrongText, alpha: 0,
      duration: 500, delay: 350,
    })

    // Restore zone colour
    this.time.delayedCall(300, () => {
      // Re-apply correct highlight state after flash
      const nextSide  = this._lastSide  // the side that SHOULD be tapped
      const otherSide = nextSide === 'left' ? 'right' : 'left'
      if (this._lastSide) {
        this._drawZone(bg, side, side === otherSide ? 'next' : 'idle')
      } else {
        this._drawZone(bg, side, 'idle')
      }
    })
  }

  // ── Win / Lose finish screen ─────────────────────────────────────────────────
  _showFinish(players, me) {
    if (this._finishShown) return
    this._finishShown = true

    const { width, height } = this.scale
    const winner = players.find(p => p.position >= FINISH_LINE)
    const iWon   = winner?.id === this._myId

    const overlay = this.add.graphics().setDepth(30)
    overlay.fillStyle(0x000000, 0.65)
    overlay.fillRect(0, 0, width, height)

    if (iWon) {
      // Confetti cannon
      for (let i = 0; i < 6; i++) {
        const emitter = this.add.particles(
          Phaser.Math.Between(0, width), 0, `confetti_${i}`, {
            speedY: { min: 160, max: 380 },
            speedX: { min: -90, max: 90 },
            gravityY: 220, rotate: { min: 0, max: 360 },
            scale: { start: 1.3, end: 0.2 },
            alpha: { start: 1, end: 0 },
            lifespan: 2600, quantity: 4,
          }
        ).setDepth(31)
        this.time.delayedCall(3200, () => emitter.stop())
      }

      const winText = this.add.text(width / 2, height * 0.32, '🏆 YOU WIN! 🏆', {
        fontSize: '52px', fontFamily: '"Arial Black", Arial',
        color: '#f1c40f', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(32).setScale(0)
      this.tweens.add({ targets: winText, scaleX: 1, scaleY: 1, duration: 600, ease: 'Back.easeOut' })

    } else {
      const pos = [...players].sort((a, b) => b.position - a.position)
        .findIndex(p => p.id === this._myId) + 1
      const suffix = pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'
      this.add.text(width / 2, height * 0.32, `You finished ${pos}${suffix}`, {
        fontSize: '38px', fontFamily: '"Arial Black", Arial',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(32)

      if (winner) {
        this.add.text(width / 2, height * 0.43, `${winner.name} wins! 🎉`, {
          fontSize: '22px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.75)',
        }).setOrigin(0.5).setDepth(32)
      }
    }

    // Play Again
    const playBtn = this.add.text(width / 2, height * 0.62, '▶  Play Again', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial',
      color: '#1a1a2e', backgroundColor: '#f1c40f', padding: { x: 32, y: 16 },
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })
    playBtn.on('pointerover', () => playBtn.setScale(1.05))
    playBtn.on('pointerout',  () => playBtn.setScale(1.0))
    playBtn.on('pointerdown', () => {
      getSocket()?.emit('requestRestart')
      this._finishShown = false
    })

    // Leave
    this.add.text(width / 2, height * 0.75, 'Leave Game', {
      fontSize: '16px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.45)',
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { disconnect(); window.location.reload() })
  }

  update() {}
}
