import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

// ─────────────────────────────────────────────────────────────────────────────
//  SwimmingPlayerScene  —  iPad controller for the swimming game
//
//  Mechanic: trace the ∞ (infinity) symbol with one finger.
//  Each time the finger crosses the centre crossing-point, switching sides
//  (left→right or right→left), one swim stroke is counted.
//  Sides must alternate — crossing in the same direction twice doesn't count.
// ─────────────────────────────────────────────────────────────────────────────

const FINISH_LINE = 2000
const RANK_LABELS = ['🥇 1st!', '🥈 2nd', '🥉 3rd', '4th']
const RANK_COLORS = ['#f1c40f', '#c0c0c0', '#cd7f32', '#95a5a6']

export default class SwimmingPlayerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SwimmingPlayer' })
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

    // ∞ crossing detection state
    this._inCrossZone   = false   // is finger currently inside the crossing zone?
    this._lastSide      = null    // 'left' | 'right' — which side finger was on before crossing
    this._lastCrossDir  = null    // 'ltr' | 'rtl' — last valid crossing direction
    this._activePtr     = null    // pointer id being tracked

    // Speed tracking
    this._stepTimes = []

    // Mini track
    this._trackDots   = {}
    this._trackLabels = {}
    this._trackGlows  = {}

    // Compute ∞ geometry (used in drawing + hit detection)
    const cx = width / 2
    const cy = height * 0.67
    this._infCx     = cx
    this._infCy     = cy
    this._infA      = Math.min(width * 0.28, 155)   // half-width of one lobe
    this._crossW    = Math.max(this._infA * 0.22, 32)  // crossing zone half-width
    this._crossH    = Math.max(this._infA * 0.18, 24)  // crossing zone half-height

    this.input.addPointer(2)

    this._buildBackground(width, height)
    this._buildCharacter(width, height)
    this._buildStatusArea(width, height)
    this._buildInfinityGuide(width, height)
    this._buildMiniTrack(width, height)

    socket.off('updateGame')
    socket.on('updateGame', (d) => this._onUpdate(d))
    this._onUpdate(this._gameData)

    this.input.on('pointerdown',   (ptr) => this._onDown(ptr))
    this.input.on('pointermove',   (ptr) => this._onMove(ptr))
    this.input.on('pointerup',     (ptr) => this._onUp(ptr))
    this.input.on('pointercancel', (ptr) => this._onUp(ptr))
  }

  // ── Background — deep-water blue ────────────────────────────────────────────
  _buildBackground(width, height) {
    const g = this.add.graphics()
    g.fillGradientStyle(0x0a1628, 0x0a1628, 0x0d2137, 0x103354, 1)
    g.fillRect(0, 0, width, height)

    // Subtle horizontal wave lines in the control area
    const waveG = this.add.graphics()
    waveG.lineStyle(1, 0x1a5276, 0.4)
    for (let y = height * 0.52; y < height * 0.88; y += 18) {
      waveG.beginPath()
      for (let x = 0; x <= width; x += 4) {
        const wy = y + Math.sin(x * 0.04) * 3
        x === 0 ? waveG.moveTo(x, wy) : waveG.lineTo(x, wy)
      }
      waveG.strokePath()
    }
  }

  // ── Character ──────────────────────────────────────────────────────────────
  _buildCharacter(width, height) {
    const charX = width / 2
    const charY = height * 0.27

    const glow = this.add.graphics()
    glow.fillStyle(0x74b9ff, 0.06)
    glow.fillEllipse(charX, charY + 12, 220, 60)

    const myData = this._gameData.players?.find(p => p.id === this._myId)
    const color  = myData?.color || '#3498db'
    const name   = myData?.name  || this.registry.get('playerName') || 'Player'
    const wins   = myData?.wins  || 0

    this._char = new PlayerCharacter(this, charX, charY, { color, name, wins, isMe: true })
    this._char.posContainer.setScale(1.8)
    this._char.playIdle()
  }

  // ── Status + rank + countdown ───────────────────────────────────────────────
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

  // ── ∞ guide ─────────────────────────────────────────────────────────────────
  _buildInfinityGuide(width, height) {
    const { _infCx: cx, _infCy: cy, _infA: a } = this

    // ── Draw the ∞ path ──────────────────────────────────────────────────────
    // Using the lemniscate parametric: x = a·cos(t)/(1+sin²t), y = a·sin(t)·cos(t)/(1+sin²t)
    const pathPoints = this._lemniscatePoints(cx, cy, a, 120)

    // Outer glow (thick, low alpha)
    const glowPath = this.add.graphics().setDepth(2)
    glowPath.lineStyle(14, 0x3498db, 0.08)
    glowPath.beginPath()
    pathPoints.forEach((p, i) => i === 0 ? glowPath.moveTo(p.x, p.y) : glowPath.lineTo(p.x, p.y))
    glowPath.closePath()
    glowPath.strokePath()

    // Main path (medium)
    this._pathG = this.add.graphics().setDepth(3)
    this._drawInfinityPath(0.30)

    // Lobe labels
    this.add.text(cx - a * 0.72, cy - a * 0.25, 'LEFT\nARST', {
      fontSize: '11px', fontFamily: 'Arial', color: 'rgba(116,185,255,0.4)',
      align: 'center',
    }).setOrigin(0.5).setDepth(3)
    this.add.text(cx + a * 0.72, cy - a * 0.25, 'RIGHT\nARM', {
      fontSize: '11px', fontFamily: 'Arial', color: 'rgba(116,185,255,0.4)',
      align: 'center',
    }).setOrigin(0.5).setDepth(3)

    // ── Crossing zone indicator ──────────────────────────────────────────────
    this._crossZoneG = this.add.graphics().setDepth(4)
    this._drawCrossZone(0.18)

    // ── Animated guide dot (shows kids how to trace) ─────────────────────────
    this._guideT    = 0
    this._guideDot  = this.add.circle(cx + a, cy, 9, 0x74b9ff, 0.55).setDepth(5)
    this._guideTrail = []
    for (let i = 0; i < 6; i++) {
      this._guideTrail.push(
        this.add.circle(cx + a, cy, 6 - i, 0x74b9ff, 0.12 - i * 0.015).setDepth(4)
      )
    }

    // ── "Trace the symbol!" hint ─────────────────────────────────────────────
    this._hintText = this.add.text(cx, cy - a * 0.52 - 24, '∞  Trace the symbol!', {
      fontSize: '16px', fontFamily: '"Arial Black", Arial',
      color: '#74b9ff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(6).setAlpha(0)

    // ── "WRONG DIRECTION!" warning ───────────────────────────────────────────
    this._wrongText = this.add.text(cx, cy, '⚠  Keep the rhythm!', {
      fontSize: '22px', fontFamily: '"Arial Black", Arial',
      color: '#e74c3c', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(10)

    // ── Finger trace dot (follows touch) ────────────────────────────────────
    this._fingerDot = this.add.circle(0, 0, 16, 0x74b9ff, 0.75).setDepth(7).setVisible(false)

    // ── Waiting overlay ──────────────────────────────────────────────────────
    this._waitOverlay = this.add.graphics().setDepth(8)
    this._waitOverlay.fillStyle(0x000000, 0.40)
    this._waitOverlay.fillRoundedRect(
      cx - a - 20, cy - a * 0.55 - 10,
      (a + 20) * 2, a * 1.1 + 20, 16
    )
    this._waitText = this.add.text(cx, cy, '⏳', { fontSize: '40px' })
      .setOrigin(0.5).setDepth(9)
  }

  // Draw the lemniscate path onto this._pathG at given alpha
  _drawInfinityPath(alpha) {
    const { _infCx: cx, _infCy: cy, _infA: a } = this
    const g = this._pathG
    g.clear()
    g.lineStyle(4, 0x74b9ff, alpha)
    const pts = this._lemniscatePoints(cx, cy, a, 120)
    g.beginPath()
    pts.forEach((p, i) => i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y))
    g.closePath()
    g.strokePath()
  }

  // Flash the path bright on a stroke
  _flashPath() {
    this._drawInfinityPath(0.9)
    this.time.delayedCall(150, () => this._drawInfinityPath(0.30))
  }

  _drawCrossZone(alpha) {
    const g = this._crossZoneG
    g.clear()
    g.fillStyle(0x74b9ff, alpha)
    g.fillEllipse(this._infCx, this._infCy, this._crossW * 2, this._crossH * 2)
  }

  // Returns array of {x, y} for the lemniscate curve
  _lemniscatePoints(cx, cy, a, steps) {
    const pts = []
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2
      const d = 1 + Math.sin(t) * Math.sin(t)
      pts.push({ x: cx + a * Math.cos(t) / d, y: cy + a * Math.sin(t) * Math.cos(t) / d })
    }
    return pts
  }

  // ── Pointer input ────────────────────────────────────────────────────────────
  _onDown(ptr) {
    if (this._gameStatus !== 'racing') return
    if (this._activePtr !== null) return

    // Accept touch anywhere in the control area
    const { _infCy: cy, _infA: a } = this
    if (ptr.y < cy - a * 0.6 || ptr.y > cy + a * 0.6) return

    this._activePtr = ptr.id
    this._lastSide  = ptr.x < this._infCx ? 'left' : 'right'
    this._fingerDot.setPosition(ptr.x, ptr.y).setVisible(true)
  }

  _onMove(ptr) {
    if (this._gameStatus !== 'racing') return
    if (ptr.id !== this._activePtr) return

    const { _infCx: cx, _infCy: cy, _crossW: cw, _crossH: ch } = this

    this._fingerDot.setPosition(ptr.x, ptr.y)

    // Track which side the finger is on (outside crossing zone only)
    const inZone = Math.abs(ptr.x - cx) < cw && Math.abs(ptr.y - cy) < ch

    if (!inZone) {
      this._lastSide = ptr.x < cx ? 'left' : 'right'
    }

    // Detect crossing
    if (inZone && !this._inCrossZone && this._lastSide !== null) {
      const crossDir = this._lastSide === 'left' ? 'ltr' : 'rtl'
      const isFirst     = this._lastCrossDir === null
      const isAlternate = crossDir !== this._lastCrossDir

      if (isFirst || isAlternate) {
        this._lastCrossDir = crossDir
        this._onSwimStroke(crossDir)
      } else {
        this._flashWrong()
      }
    }

    this._inCrossZone = inZone
  }

  _onUp(ptr) {
    if (ptr.id !== this._activePtr) return
    this._activePtr  = null
    this._inCrossZone = false
    this._fingerDot.setVisible(false)
  }

  // A valid crossing — emit move + visual feedback
  _onSwimStroke(dir) {
    getSocket()?.emit('move')

    // Speed tracking
    const now = Date.now()
    this._stepTimes.push(now)
    if (this._stepTimes.length > 8) this._stepTimes.shift()

    // Flash path + crossing zone
    this._flashPath()
    this._drawCrossZone(0.6)
    this.time.delayedCall(180, () => this._drawCrossZone(0.18))

    // Bubble burst at crossing point
    for (let i = 0; i < 8; i++) {
      const angle  = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const speed  = Phaser.Math.FloatBetween(40, 110)
      const bubble = this.add.circle(
        this._infCx + Phaser.Math.FloatBetween(-10, 10),
        this._infCy + Phaser.Math.FloatBetween(-6, 6),
        Phaser.Math.FloatBetween(3, 8), 0x74b9ff, 0.7
      ).setDepth(8)
      this.tweens.add({
        targets: bubble,
        x: bubble.x + Math.cos(angle) * speed,
        y: bubble.y + Math.sin(angle) * speed - 20,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: Phaser.Math.Between(400, 700),
        ease: 'Cubic.easeOut',
        onComplete: () => bubble.destroy(),
      })
    }

    // Splash ripple at crossing
    const ripple = this.add.circle(this._infCx, this._infCy, 8, 0x74b9ff, 0.8).setDepth(8)
    this.tweens.add({
      targets: ripple, scaleX: 6, scaleY: 3, alpha: 0,
      duration: 500, ease: 'Cubic.easeOut',
      onComplete: () => ripple.destroy(),
    })

    // Brief camera nudge
    this.cameras.main.shake(60, 0.003)
  }

  // Same direction crossed — flash warning
  _flashWrong() {
    this.tweens.killTweensOf(this._wrongText)
    this._wrongText.setAlpha(1).setScale(0.85)
    this.tweens.add({
      targets: this._wrongText, scaleX: 1.05, scaleY: 1.05,
      duration: 100, yoyo: true, ease: 'Quad.easeOut',
    })
    this.tweens.add({
      targets: this._wrongText, alpha: 0, duration: 500, delay: 350,
    })
    this._drawCrossZone(0.5)
    // Red-ish flash on crossing zone
    const flash = this.add.ellipse(
      this._infCx, this._infCy,
      this._crossW * 2.2, this._crossH * 2.2, 0xe74c3c, 0.45
    ).setDepth(9)
    this.tweens.add({ targets: flash, alpha: 0, duration: 300,
      onComplete: () => { flash.destroy(); this._drawCrossZone(0.18) } })

    this.cameras.main.shake(80, 0.006)
  }

  // ── Server updates ──────────────────────────────────────────────────────────
  _onUpdate(data) {
    const { players = [], gameState, countdown } = data
    this._gameStatus  = gameState
    this._lastPlayers = players

    const me = players.find(p => p.id === this._myId)

    if (gameState === 'racing' && this._prevState !== 'racing') {
      this._stepTimes    = []
      this._lastCrossDir = null
      this._lastSide     = null
      this._inCrossZone  = false
    }
    this._prevState = gameState

    this._updateStatus(gameState, countdown, players)
    this._updateCharacter(gameState, me)
    this._updateGuideState(gameState)
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
      msg = '🏊 Trace the ∞ to swim!'
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

  _updateGuideState(state) {
    const racing = state === 'racing'
    this._waitOverlay.setVisible(!racing)
    this._waitText.setVisible(!racing)

    if (racing) {
      this.tweens.killTweensOf(this._hintText)
      this._hintText.setAlpha(0)
      this.tweens.add({
        targets: this._hintText, alpha: 0.85, duration: 500,
        onComplete: () => {
          this.tweens.add({
            targets: this._hintText, alpha: 0.35,
            duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          })
        },
      })
    } else {
      this.tweens.killTweensOf(this._hintText)
      this._hintText.setAlpha(0)
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

  // ── update() — moves the animated guide dot along the ∞ path ───────────────
  update(time, delta) {
    if (!this._guideDot) return

    // Advance guide dot (slow when waiting, hide during active play)
    const racing = this._gameStatus === 'racing'
    const speed  = racing ? 0.025 : 0.018
    this._guideT = (this._guideT + speed * (delta / 16.67)) % (Math.PI * 2)

    const { _infCx: cx, _infCy: cy, _infA: a } = this
    const t = this._guideT
    const d = 1 + Math.sin(t) * Math.sin(t)
    const gx = cx + a * Math.cos(t) / d
    const gy = cy + a * Math.sin(t) * Math.cos(t) / d

    // Hide guide dot while finger is actively on screen
    const show = this._activePtr === null
    this._guideDot.setVisible(show).setPosition(gx, gy)

    // Trail
    const trailAlpha = show ? 1 : 0
    this._guideTrail.forEach((tr, i) => {
      const tPast = (this._guideT - (i + 1) * 0.06 + Math.PI * 2) % (Math.PI * 2)
      const dp    = 1 + Math.sin(tPast) * Math.sin(tPast)
      tr.setVisible(show)
        .setPosition(
          cx + a * Math.cos(tPast) / dp,
          cy + a * Math.sin(tPast) * Math.cos(tPast) / dp
        )
        .setAlpha(trailAlpha * (0.10 - i * 0.012))
    })
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
    bg.fillStyle(0x0a1628, 0.9)
    bg.fillRoundedRect(pad, trkY, trkW, trkH, 10)

    const lineY = trkY + trkH / 2
    const dashG = this.add.graphics().setDepth(5)
    dashG.lineStyle(1, 0x1a5276, 0.5)
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
}
