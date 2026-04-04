import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

// ─────────────────────────────────────────────────────────────────────────────
//  CyclingPlayerScene  —  iPad controller for the cycling game
//
//  Mechanic: trace a clockwise circle with one finger on the joystick ring.
//  Every quarter-turn (π/2 rad) = one pedal stroke = one move event.
//  Faster circles = more moves per second = faster on the TV.
// ─────────────────────────────────────────────────────────────────────────────

const FINISH_LINE  = 2000
const RANK_LABELS  = ['🥇 1st!', '🥈 2nd', '🥉 3rd', '4th']
const RANK_COLORS  = ['#f1c40f', '#c0c0c0', '#cd7f32', '#95a5a6']
const JS_R         = 115    // joystick ring radius
const DEAD_R       = 30     // ignore touches within this distance from center
const STEP_ANGLE   = Math.PI / 2   // quarter-turn per move event

export default class CyclingPlayerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CyclingPlayer' })
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

    // Joystick state
    this._prevAngle  = null   // angle from center at last pointermove
    this._accumRot   = 0      // accumulated CW rotation since last step
    this._activePtr  = null   // pointer id being tracked
    this._pedalAngle = 0      // visual rotation angle of the pedal arm

    // Speed tracking
    this._stepTimes = []

    // Track/label objects for mini race track
    this._trackDots   = {}
    this._trackLabels = {}
    this._trackGlows  = {}

    this.input.addPointer(2)

    this._buildBackground(width, height)
    this._buildCharacter(width, height)
    this._buildStatusArea(width, height)
    this._buildJoystick(width, height)
    this._buildMiniTrack(width, height)

    socket.off('updateGame')
    socket.on('updateGame', (d) => this._onUpdate(d))
    this._onUpdate(this._gameData)

    this.input.on('pointerdown',   (ptr) => this._onDown(ptr))
    this.input.on('pointermove',   (ptr) => this._onMove(ptr))
    this.input.on('pointerup',     (ptr) => this._onUp(ptr))
    this.input.on('pointercancel', (ptr) => this._onUp(ptr))
  }

  // ── Background ──────────────────────────────────────────────────────────────
  _buildBackground(width, height) {
    const g = this.add.graphics()
    g.fillGradientStyle(0x0d1f0d, 0x0d1f0d, 0x162616, 0x1a2e1a, 1)
    g.fillRect(0, 0, width, height)
  }

  // ── Character ──────────────────────────────────────────────────────────────
  _buildCharacter(width, height) {
    const charX = width / 2
    const charY = height * 0.27

    const glow = this.add.graphics()
    glow.fillStyle(0xffffff, 0.04)
    glow.fillEllipse(charX, charY + 12, 220, 60)

    const myData = this._gameData.players?.find(p => p.id === this._myId)
    const color  = myData?.color || '#2ecc71'
    const name   = myData?.name  || this.registry.get('playerName') || 'Player'
    const wins   = myData?.wins  || 0

    this._char = new PlayerCharacter(this, charX, charY, { color, name, wins, isMe: true })
    this._char.posContainer.setScale(1.8)
    this._char.playIdle()
  }

  // ── Status text + rank + countdown ─────────────────────────────────────────
  _buildStatusArea(width, height) {
    this._statusText = this.add.text(width / 2, height * 0.07, '', {
      fontSize: '20px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
      shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 4, fill: true },
    }).setOrigin(0.5).setDepth(10)

    this._rankText = this.add.text(width / 2, height * 0.14, '', {
      fontSize: '30px', fontFamily: '"Arial Black", Arial', color: '#f1c40f',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10)

    this._countdownText = this.add.text(width / 2, height * 0.45, '', {
      fontSize: '150px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(21).setAlpha(0)
  }

  // ── Virtual joystick ────────────────────────────────────────────────────────
  _buildJoystick(width, height) {
    const cx = width / 2
    const cy = height * 0.665

    this._jsCx = cx
    this._jsCy = cy

    // Speed arc (behind everything)
    this._speedArc = this.add.graphics().setDepth(2)

    // Guide ring (dashed)
    this._outerRing = this.add.graphics().setDepth(3)
    this._drawGuideRing(0.22)

    // Centre gear ──────────────────────────────────────────────────────────
    const gear = this.add.graphics().setDepth(4)
    // Outer toothed rim
    gear.lineStyle(6, 0x3a3a3a, 1)
    gear.strokeCircle(cx, cy, 44)
    // Fill
    gear.fillStyle(0x1c1c1c, 1)
    gear.fillCircle(cx, cy, 40)
    // Spokes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      gear.lineStyle(3, 0x505050, 1)
      gear.beginPath()
      gear.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10)
      gear.lineTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34)
      gear.strokePath()
    }
    // Hub
    gear.fillStyle(0x2a2a2a, 1)
    gear.fillCircle(cx, cy, 10)
    gear.lineStyle(2, 0x666666, 1)
    gear.strokeCircle(cx, cy, 10)

    // Pedal arm (redrawn each step)
    this._pedalArm = this.add.graphics().setDepth(5)
    this._drawPedalArm(0)

    // Finger dot (shown while touching)
    this._fingerDot = this.add.circle(cx + JS_R, cy, 20, 0x2ecc71, 0.85).setDepth(6)
    this._fingerDot.setVisible(false)

    // "Circle your finger!" hint
    this._hintArrow = this.add.text(cx, cy - JS_R - 30, '↻  Circle your finger!', {
      fontSize: '16px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(6).setAlpha(0)

    // Waiting overlay
    this._jsOverlay = this.add.graphics().setDepth(7)
    this._jsOverlay.fillStyle(0x000000, 0.45)
    this._jsOverlay.fillCircle(cx, cy, JS_R + 8)

    this._jsWaitText = this.add.text(cx, cy, '⏳', { fontSize: '44px' })
      .setOrigin(0.5).setDepth(8)
  }

  _drawGuideRing(alpha) {
    const g = this._outerRing
    g.clear()
    const segments = 24
    for (let i = 0; i < segments; i++) {
      if (i % 2 === 0) continue
      const a1 = (i / segments) * Math.PI * 2
      const a2 = ((i + 0.85) / segments) * Math.PI * 2
      g.lineStyle(5, 0xffffff, alpha)
      g.beginPath()
      g.arc(this._jsCx, this._jsCy, JS_R, a1, a2, false)
      g.strokePath()
    }
    // Small clockwise arrow cue at the top-right
    const arrowX = this._jsCx + JS_R * Math.cos(-0.4)
    const arrowY = this._jsCy + JS_R * Math.sin(-0.4)
    g.lineStyle(3, 0xffffff, alpha)
    g.beginPath()
    g.moveTo(arrowX - 10, arrowY - 5)
    g.lineTo(arrowX + 2,  arrowY + 8)
    g.lineTo(arrowX + 14, arrowY - 4)
    g.strokePath()
  }

  _drawPedalArm(angle) {
    const g  = this._pedalArm
    const cx = this._jsCx
    const cy = this._jsCy
    g.clear()

    const arm1x1 = cx + Math.cos(angle) * 12
    const arm1y1 = cy + Math.sin(angle) * 12
    const arm1x2 = cx + Math.cos(angle) * 68
    const arm1y2 = cy + Math.sin(angle) * 68

    const arm2x1 = cx - Math.cos(angle) * 12
    const arm2y1 = cy - Math.sin(angle) * 12
    const arm2x2 = cx - Math.cos(angle) * 68
    const arm2y2 = cy - Math.sin(angle) * 68

    // Arms
    g.lineStyle(7, 0x888888, 1)
    g.beginPath(); g.moveTo(arm1x1, arm1y1); g.lineTo(arm1x2, arm1y2); g.strokePath()
    g.lineStyle(7, 0x666666, 1)
    g.beginPath(); g.moveTo(arm2x1, arm2y1); g.lineTo(arm2x2, arm2y2); g.strokePath()

    // Pedal blocks
    const perp = angle + Math.PI / 2
    const pw = 22, ph = 8
    ;[[arm1x2, arm1y2], [arm2x2, arm2y2]].forEach(([px, py]) => {
      g.fillStyle(0xaaaaaa, 1)
      g.fillRect(
        px + Math.cos(perp) * pw / 2 - Math.cos(angle) * ph / 2,
        py + Math.sin(perp) * pw / 2 - Math.sin(angle) * ph / 2,
        -Math.cos(perp) * pw, -Math.sin(perp) * pw
      )
      // simpler: just a rect centred on end point
      g.fillStyle(0xbbbbbb, 1)
      g.fillRect(px - 12, py - 5, 24, 10)
    })
  }

  _drawSpeedArc(speed) {
    const g = this._speedArc
    g.clear()
    if (speed <= 0) return

    const r = JS_R + 12
    const startA = -Math.PI / 2
    const endA   = startA + speed * Math.PI * 2

    // Gradient color green → yellow → red
    let r_, g_, b_
    if (speed < 0.5) {
      const t = speed * 2
      r_ = Math.round(46  + (241 - 46)  * t)
      g_ = Math.round(204 + (196 - 204) * t)
      b_ = Math.round(113 + (15  - 113) * t)
    } else {
      const t = (speed - 0.5) * 2
      r_ = Math.round(241 + (231 - 241) * t)
      g_ = Math.round(196 + (76  - 196) * t)
      b_ = Math.round(15  + (60  - 15)  * t)
    }

    this._speedArc.lineStyle(7, Phaser.Display.Color.GetColor(r_, g_, b_), 0.85)
    this._speedArc.beginPath()
    this._speedArc.arc(this._jsCx, this._jsCy, r, startA, endA, false)
    this._speedArc.strokePath()
  }

  // ── Pointer input ───────────────────────────────────────────────────────────
  _onDown(ptr) {
    if (this._gameStatus !== 'racing') return
    if (this._activePtr !== null) return

    const dx   = ptr.x - this._jsCx
    const dy   = ptr.y - this._jsCy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < DEAD_R || dist > JS_R + 24) return

    this._activePtr = ptr.id
    this._prevAngle = Math.atan2(dy, dx)
    this._accumRot  = 0
    this._fingerDot.setVisible(true)
  }

  _onMove(ptr) {
    if (this._gameStatus !== 'racing') return
    if (ptr.id !== this._activePtr) return

    const dx   = ptr.x - this._jsCx
    const dy   = ptr.y - this._jsCy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)

    // Keep finger dot clamped to the ring visually
    const clampR = Math.max(DEAD_R + 6, Math.min(JS_R, dist))
    this._fingerDot.setPosition(
      this._jsCx + Math.cos(angle) * clampR,
      this._jsCy + Math.sin(angle) * clampR
    )

    if (dist < DEAD_R) return

    if (this._prevAngle !== null) {
      let delta = angle - this._prevAngle

      // Wrap to [-π, π]
      if (delta >  Math.PI) delta -= 2 * Math.PI
      if (delta < -Math.PI) delta += 2 * Math.PI

      // Only clockwise rotation counts (positive delta in canvas coords)
      if (delta > 0) {
        this._accumRot   += delta
        this._pedalAngle += delta
        this._drawPedalArm(this._pedalAngle)

        while (this._accumRot >= STEP_ANGLE) {
          this._accumRot -= STEP_ANGLE
          this._onPedalStep()
        }
      }
    }

    this._prevAngle = angle
  }

  _onUp(ptr) {
    if (ptr.id !== this._activePtr) return
    this._activePtr = null
    this._prevAngle = null
    this._accumRot  = 0
    this._fingerDot.setVisible(false)
    // Fade speed arc when finger lifts
    this.tweens.add({ targets: this._speedArc, alpha: 0, duration: 400,
      onComplete: () => { this._speedArc.setAlpha(1); this._drawSpeedArc(0) } })
  }

  _onPedalStep() {
    getSocket()?.emit('move')

    // Track speed
    const now = Date.now()
    this._stepTimes.push(now)
    if (this._stepTimes.length > 8) this._stepTimes.shift()

    const oldest = this._stepTimes[0]
    const elapsed = (now - oldest) / 1000
    const stepsPerSec = elapsed > 0 ? this._stepTimes.length / elapsed : 0
    const speed = Math.min(stepsPerSec / 8, 1)

    this._drawSpeedArc(speed)
    this._drawGuideRing(0.65)
    this.time.delayedCall(130, () => this._drawGuideRing(0.22))

    // Ripple at finger
    const ripple = this.add.circle(
      this._fingerDot.x, this._fingerDot.y, 10, 0x2ecc71, 0.8
    ).setDepth(9)
    this.tweens.add({
      targets: ripple, scaleX: 4, scaleY: 4, alpha: 0,
      duration: 420, ease: 'Cubic.easeOut',
      onComplete: () => ripple.destroy(),
    })
  }

  // ── Server updates ──────────────────────────────────────────────────────────
  _onUpdate(data) {
    const { players = [], gameState, countdown } = data
    this._gameStatus  = gameState
    this._lastPlayers = players

    const me = players.find(p => p.id === this._myId)

    if (gameState === 'racing' && this._prevState !== 'racing') {
      this._stepTimes  = []
      this._accumRot   = 0
      this._prevAngle  = null
    }
    this._prevState = gameState

    this._updateStatus(gameState, countdown, players)
    this._updateCharacter(gameState, me)
    this._updateJoystickState(gameState)
    this._updateMiniTrack(players, me)
    this._updateRank(gameState, players)

    if (me?.wins > 0) this._char?.updateWins(me.wins)
    if (gameState === 'finished') this._showFinish(players, me)
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
      msg = '🚴 Keep pedaling!'
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

  _updateCharacter(state, me) {
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
  }

  _updateJoystickState(state) {
    const racing = state === 'racing'
    this._jsOverlay.setVisible(!racing)
    this._jsWaitText.setVisible(!racing)

    if (racing) {
      this.tweens.killTweensOf(this._hintArrow)
      this._hintArrow.setAlpha(0)
      this.tweens.add({
        targets: this._hintArrow, alpha: 0.85, duration: 400,
        onComplete: () => {
          this.tweens.add({
            targets: this._hintArrow, alpha: 0.3,
            duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          })
        },
      })
    } else {
      this.tweens.killTweensOf(this._hintArrow)
      this._hintArrow.setAlpha(0)
      this._drawSpeedArc(0)
      this._drawGuideRing(0.22)
    }
  }

  _updateRank(state, players) {
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

  // ── Mini race track ─────────────────────────────────────────────────────────
  _buildMiniTrack(width, height) {
    const pad  = 14
    const trkY = height * 0.89
    const trkH = height * 0.10
    const trkW = width - pad * 2

    this._trkY = trkY; this._trkH = trkH
    this._trkW = trkW; this._trkPad = pad

    const bg = this.add.graphics().setDepth(5)
    bg.fillStyle(0x0a1f0a, 0.85)
    bg.fillRoundedRect(pad, trkY, trkW, trkH, 10)

    const lineY = trkY + trkH / 2
    const dashG = this.add.graphics().setDepth(5)
    dashG.lineStyle(1, 0xffffff, 0.15)
    for (let x = pad + 38; x < pad + trkW - 38; x += 20) {
      dashG.beginPath(); dashG.moveTo(x, lineY); dashG.lineTo(x + 12, lineY); dashG.strokePath()
    }

    this.add.text(pad + 5, trkY + trkH / 2, '🚩', { fontSize: '15px' })
      .setOrigin(0, 0.5).setDepth(6)

    const finX = pad + trkW - 5
    const finG = this.add.graphics().setDepth(6)
    finG.lineStyle(3, 0xf1c40f, 1)
    finG.beginPath(); finG.moveTo(finX, trkY + 5); finG.lineTo(finX, trkY + trkH - 5); finG.strokePath()
    this.add.text(finX - 2, trkY + 3, '🏁', { fontSize: '15px' }).setOrigin(1, 0).setDepth(6)

    this.add.text(pad + trkW / 2, trkY - 5, 'RACE', {
      fontSize: '9px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.3)',
    }).setOrigin(0.5, 1).setDepth(5)
  }

  _updateMiniTrack(players, me) {
    const { _trkPad: pad, _trkW: trkW, _trkY: trkY, _trkH: trkH } = this
    const leftEdge  = pad + 36
    const rightEdge = pad + trkW - 30
    const range     = rightEdge - leftEdge
    const dotY      = trkY + trkH / 2
    const activeIds = new Set(players.map(p => p.id))

    for (const id of Object.keys(this._trackDots)) {
      if (!activeIds.has(id)) {
        this._trackDots[id].destroy()
        this._trackLabels[id]?.destroy()
        this._trackGlows[id]?.destroy()
        delete this._trackDots[id]; delete this._trackLabels[id]; delete this._trackGlows[id]
      }
    }

    players.forEach(p => {
      const isMe  = p.id === this._myId
      const pct   = Math.min(p.position / FINISH_LINE, 1)
      const x     = leftEdge + pct * range
      const r     = isMe ? 9 : 6
      const color = Phaser.Display.Color.HexStringToColor(p.color.replace('#', '')).color
      const label = isMe ? 'YOU' : (p.name.length > 5 ? p.name.slice(0, 5) + '.' : p.name)

      if (!this._trackDots[p.id]) {
        if (isMe) this._trackGlows[p.id] = this.add.circle(x, dotY, r + 5, color, 0.25).setDepth(6)
        this._trackDots[p.id]   = this.add.circle(x, dotY, r, color).setDepth(7)
        this._trackLabels[p.id] = this.add.text(x, dotY + r + 3, label, {
          fontSize: isMe ? '11px' : '9px',
          fontFamily: isMe ? '"Arial Black", Arial' : 'Arial',
          color: isMe ? '#f1c40f' : 'rgba(255,255,255,0.55)',
        }).setOrigin(0.5, 0).setDepth(7)
      } else {
        this.tweens.add({ targets: this._trackDots[p.id],   x, duration: 120, ease: 'Linear' })
        this.tweens.add({ targets: this._trackLabels[p.id], x, duration: 120, ease: 'Linear' })
        if (this._trackGlows[p.id])
          this.tweens.add({ targets: this._trackGlows[p.id], x, duration: 120, ease: 'Linear' })
      }
    })
  }

  // ── Finish screen ───────────────────────────────────────────────────────────
  _showFinish(players, me) {
    if (this._finishShown) return
    this._finishShown = true

    const { width, height } = this.scale
    const winner = players.find(p => p.position >= FINISH_LINE)
    const iWon   = winner?.id === this._myId

    const ov = this.add.graphics().setDepth(30)
    ov.fillStyle(0x000000, 0.65)
    ov.fillRect(0, 0, width, height)

    if (iWon) {
      for (let i = 0; i < 6; i++) {
        const em = this.add.particles(Phaser.Math.Between(0, width), 0, `confetti_${i}`, {
          speedY: { min: 160, max: 380 }, speedX: { min: -90, max: 90 },
          gravityY: 220, rotate: { min: 0, max: 360 },
          scale: { start: 1.3, end: 0.2 }, alpha: { start: 1, end: 0 },
          lifespan: 2600, quantity: 4,
        }).setDepth(31)
        this.time.delayedCall(3200, () => em.stop())
      }
      const wt = this.add.text(width / 2, height * 0.32, '🏆 YOU WIN! 🏆', {
        fontSize: '52px', fontFamily: '"Arial Black", Arial',
        color: '#f1c40f', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(32).setScale(0)
      this.tweens.add({ targets: wt, scaleX: 1, scaleY: 1, duration: 600, ease: 'Back.easeOut' })
    } else {
      const pos = [...players].sort((a, b) => b.position - a.position)
        .findIndex(p => p.id === this._myId) + 1
      const sfx = pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'
      this.add.text(width / 2, height * 0.32, `You finished ${pos}${sfx}`, {
        fontSize: '38px', fontFamily: '"Arial Black", Arial',
        color: '#ffffff', stroke: '#000', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(32)
      if (winner) {
        this.add.text(width / 2, height * 0.43, `${winner.name} wins! 🎉`, {
          fontSize: '22px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.75)',
        }).setOrigin(0.5).setDepth(32)
      }
    }

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

    this.add.text(width / 2, height * 0.75, 'Leave Game', {
      fontSize: '16px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.45)',
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { disconnect(); window.location.reload() })
  }

  update() {}
}
