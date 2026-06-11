import Phaser from 'phaser'

export default class PlayerCharacter {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ color: string, name: string, wins: number, isMe: boolean }} opts
   */
  constructor(scene, x, y, { color = '#3498db', name = 'Player', wins = 0, isMe = false } = {}) {
    this.scene = scene
    this.color = color
    this.name = name
    this.isMe = isMe
    this.activeTweens = []
    this._running = false
    this._ready = false

    // Parse hex color string to Phaser integer
    const colorInt = Phaser.Display.Color.HexStringToColor(color).color

    // posContainer: moves with world x/y
    this.posContainer = scene.add.container(x, y)

    // bodyContainer: child of posContainer, handles bob animation
    this.bodyContainer = scene.add.container(0, 0)
    this.posContainer.add(this.bodyContainer)

    // Scale for "me" indicator
    const scale = isMe ? 1.15 : 1.0

    // --- Head ---
    this.head = scene.add.circle(0, -38 * scale, 10 * scale, colorInt)
    this.bodyContainer.add(this.head)

    // --- Body ---
    this.body = scene.add.rectangle(0, -18 * scale, 8 * scale, 22 * scale, colorInt)
    this.bodyContainer.add(this.body)

    // --- Left Arm ---
    this.leftArm = scene.add.rectangle(-8 * scale, -24 * scale, 5 * scale, 18 * scale, colorInt)
    this.leftArm.setOrigin(0.5, 0)
    this.bodyContainer.add(this.leftArm)

    // --- Right Arm ---
    this.rightArm = scene.add.rectangle(8 * scale, -24 * scale, 5 * scale, 18 * scale, colorInt)
    this.rightArm.setOrigin(0.5, 0)
    this.bodyContainer.add(this.rightArm)

    // --- Left Leg ---
    this.leftLeg = scene.add.rectangle(-4 * scale, -7 * scale, 5 * scale, 20 * scale, colorInt)
    this.leftLeg.setOrigin(0.5, 0)
    this.bodyContainer.add(this.leftLeg)

    // --- Right Leg ---
    this.rightLeg = scene.add.rectangle(4 * scale, -7 * scale, 5 * scale, 20 * scale, colorInt)
    this.rightLeg.setOrigin(0.5, 0)
    this.bodyContainer.add(this.rightLeg)

    // --- Name label ---
    const nameStyle = {
      fontSize: isMe ? '13px' : '11px',
      fontFamily: 'Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }
    this.nameLabel = scene.add.text(0, -60 * scale, name, nameStyle)
    this.nameLabel.setOrigin(0.5, 1)
    this.bodyContainer.add(this.nameLabel)

    // --- Wins badge ---
    this.winsBadge = scene.add.text(0, -72 * scale, wins > 0 ? `🏆 ${wins}` : '', {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 2,
    })
    this.winsBadge.setOrigin(0.5, 1)
    this.bodyContainer.add(this.winsBadge)

    // --- Ready indicator dot ---
    this.readyDot = scene.add.circle(14 * scale, -48 * scale, 5, 0xe74c3c)
    this.bodyContainer.add(this.readyDot)

    // --- Me indicator ring ---
    if (isMe) {
      this.meRing = scene.add.circle(0, -38 * scale, 14, 0xffffff, 0)
      this.meRing.setStrokeStyle(2, 0xffffff, 0.8)
      this.bodyContainer.add(this.meRing)
    }

    // --- Dust particle emitter ---
    if (scene.textures.exists('dust')) {
      this.dustEmitter = scene.add.particles(x, y, 'dust', {
        x: { min: -8, max: 8 },
        y: 0,
        speedX: { min: -30, max: -10 },
        speedY: { min: -15, max: 5 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 0.6, end: 0 },
        lifespan: 400,
        quantity: 1,
        frequency: 80,
        emitting: false,
      })
    }

    // Start idle animation
    this.playIdle()
  }

  /** Gently bob the body up and down */
  playIdle() {
    this._stopBodyBob()
    const t = this.scene.tweens.add({
      targets: this.bodyContainer,
      y: { from: 0, to: -3 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(t)
    this._idleTween = t
  }

  /** Start running animation: arms/legs alternate, body bobs faster */
  startRunning() {
    if (this._running) return
    this._running = true
    this._stopBodyBob()

    // Forward lean
    this.scene.tweens.add({
      targets: this.bodyContainer,
      angle: 10,
      duration: 200,
      ease: 'Sine.easeOut',
    })

    // Faster body bob with squash at the bottom
    const bobT = this.scene.tweens.add({
      targets: this.bodyContainer,
      y: { from: 0, to: -6 },
      scaleY: { from: 1, to: 0.93 },
      duration: 190,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(bobT)
    this._runBobTween = bobT

    // Arms swing — wider range for expressiveness
    const leftArmT = this.scene.tweens.add({
      targets: this.leftArm,
      angle: { from: -62, to: 62 },
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(leftArmT)

    const rightArmT = this.scene.tweens.add({
      targets: this.rightArm,
      angle: { from: 62, to: -62 },
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(rightArmT)

    // Legs swing — bigger stride
    const leftLegT = this.scene.tweens.add({
      targets: this.leftLeg,
      angle: { from: 55, to: -55 },
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(leftLegT)

    const rightLegT = this.scene.tweens.add({
      targets: this.rightLeg,
      angle: { from: -55, to: 55 },
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(rightLegT)

    // Dust
    if (this.dustEmitter) {
      this.dustEmitter.start()
    }
  }

  /** Stop running, reset limb angles */
  stopRunning() {
    if (!this._running) return
    this._running = false

    // Stop all active tweens
    this._clearActiveTweens()

    // Reset limb angles
    this.leftArm.angle = 0
    this.rightArm.angle = 0
    this.leftLeg.angle = 0
    this.rightLeg.angle = 0
    this.bodyContainer.y = 0
    this.bodyContainer.scaleY = 1

    // Smoothly upright the lean
    this.scene.tweens.add({
      targets: this.bodyContainer,
      angle: 0,
      duration: 200,
      ease: 'Sine.easeOut',
    })

    if (this.dustEmitter) {
      this.dustEmitter.stop()
    }

    // Back to idle
    this.playIdle()
  }

  /** Victory animation */
  playVictory() {
    this._clearActiveTweens()
    this._running = false

    if (this.dustEmitter) this.dustEmitter.stop()

    // Reset lean from running
    this.bodyContainer.angle = 0
    this.bodyContainer.scaleY = 1

    // Arms shoot up then wave alternately
    this.scene.tweens.add({
      targets: this.leftArm,
      angle: -155,
      duration: 280,
      ease: 'Back.easeOut',
      onComplete: () => {
        const waveL = this.scene.tweens.add({
          targets: this.leftArm,
          angle: { from: -155, to: -130 },
          duration: 280,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          delay: 0,
        })
        this.activeTweens.push(waveL)
      },
    })

    this.scene.tweens.add({
      targets: this.rightArm,
      angle: -155,
      duration: 280,
      ease: 'Back.easeOut',
      onComplete: () => {
        const waveR = this.scene.tweens.add({
          targets: this.rightArm,
          angle: { from: -130, to: -155 },
          duration: 280,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          delay: 0,
        })
        this.activeTweens.push(waveR)
      },
    })

    // Jump repeatedly with squash on land
    const jumpT = this.scene.tweens.add({
      targets: this.posContainer,
      y: this.posContainer.y - 45,
      duration: 360,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.easeOut',
    })
    this.activeTweens.push(jumpT)

    // Body sway side to side
    const swayT = this.scene.tweens.add({
      targets: this.bodyContainer,
      x: { from: -6, to: 6 },
      duration: 360,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(swayT)

    // Head pulse bigger
    const headT = this.scene.tweens.add({
      targets: this.head,
      scaleX: { from: 1, to: 1.35 },
      scaleY: { from: 1, to: 1.35 },
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(headT)
  }

  /**
   * Smoothly tween the character to a new world x position
   * @param {number} x
   */
  moveTo(x) {
    // Kill any existing move tween
    if (this._moveTween) {
      this._moveTween.stop()
      this.activeTweens = this.activeTweens.filter(t => t !== this._moveTween)
    }

    const t = this.scene.tweens.add({
      targets: this.posContainer,
      x: x,
      duration: 150,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        if (this.dustEmitter) {
          this.dustEmitter.setPosition(this.posContainer.x, this.posContainer.y)
        }
      },
    })
    this._moveTween = t
    this.activeTweens.push(t)
  }

  /**
   * Update the ready state indicator dot
   * @param {boolean} ready
   */
  setReady(ready) {
    this._ready = ready
    if (this.readyDot) {
      this.readyDot.setFillStyle(ready ? 0x2ecc71 : 0xe74c3c)
    }
  }

  /**
   * Update wins badge
   * @param {number} n
   */
  updateWins(n) {
    if (this.winsBadge) {
      this.winsBadge.setText(n > 0 ? `🏆 ${n}` : '')
    }
  }

  // ─── Cycling / Bike ──────────────────────────────────────────────────────

  /** Attach a procedural bicycle to the character for cycling mode */
  equipBike() {
    if (this._bikeEquipped) return
    this._bikeEquipped = true
    const s = this.isMe ? 1.15 : 1.0
    const c = Phaser.Display.Color.HexStringToColor(this.color).color

    // Lean body forward for cycling posture
    this.bodyContainer.angle = -22
    this.leftArm.angle  = -68
    this.rightArm.angle = -68

    // Bike geometry relative to posContainer origin
    const bwX = -18 * s, bwY = 16 * s  // back wheel centre
    const fwX =  18 * s, fwY = 16 * s  // front wheel centre
    const wR  =  13 * s                  // wheel radius
    const bbX =  -2 * s, bbY = 12 * s  // bottom bracket (crank centre)
    const sX  = -11 * s, sY  = -6 * s  // seat junction
    const hX  =   9 * s, hY  = -6 * s  // head-tube top

    this._bike = { bwX, bwY, fwX, fwY, wR, bbX, bbY, s }

    // Static frame — inserted behind the rider body
    const fg = this.scene.add.graphics()
    this._bikeFrameG = fg
    this.posContainer.addAt(fg, 0)

    // Wheels
    fg.lineStyle(2.5 * s, 0x222222, 1)
    fg.strokeCircle(bwX, bwY, wR)
    fg.strokeCircle(fwX, fwY, wR)
    fg.lineStyle(1.0 * s, 0x555555, 0.35)
    fg.strokeCircle(bwX, bwY, wR - 2 * s)
    fg.strokeCircle(fwX, fwY, wR - 2 * s)
    fg.fillStyle(0x555555, 1)
    fg.fillCircle(bwX, bwY, 2.5 * s)
    fg.fillCircle(fwX, fwY, 2.5 * s)

    // Coloured frame tubes
    fg.lineStyle(2.5 * s, c, 1)
    fg.lineBetween(sX, sY, bbX, bbY)        // seat tube
    fg.lineBetween(sX, sY, hX,  hY)         // top tube
    fg.lineBetween(hX, hY, bbX, bbY)        // down tube
    fg.lineBetween(bbX, bbY, bwX, bwY)      // chain stay
    fg.lineBetween(sX,  sY,  bwX, bwY)      // seat stay
    fg.lineBetween(hX,  hY,  fwX, fwY)      // fork
    fg.lineStyle(3.0 * s, c, 1)
    fg.lineBetween(hX, hY, hX + 1 * s, hY + 9 * s)  // head tube

    // Handlebar
    fg.lineStyle(2 * s, 0x555555, 1)
    fg.lineBetween(hX, hY, hX - 2 * s, hY - 9 * s)
    fg.lineBetween(hX - 7 * s, hY - 9 * s, hX + 4 * s, hY - 9 * s)

    // Saddle
    fg.lineStyle(2 * s, 0x555555, 1)
    fg.lineBetween(sX - 7 * s, sY - 4 * s, sX + 4 * s, sY - 4 * s)
    fg.lineBetween(sX - 2 * s, sY - 4 * s, sX, sY)

    // Animated layer (spokes + crank) — in front of rider
    const ag = this.scene.add.graphics()
    this._bikeAnimG = ag
    this.posContainer.add(ag)

    this._bikeAngle = 0
    this._drawBikeAnim()
  }

  _drawBikeAnim() {
    const g = this._bikeAnimG
    if (!g || !this._bike) return
    const { bwX, bwY, fwX, fwY, wR, bbX, bbY, s } = this._bike
    const a = this._bikeAngle
    g.clear()

    // 3 spokes per wheel, rotating with crank
    g.lineStyle(1.2 * s, 0x999999, 0.7)
    for (let i = 0; i < 3; i++) {
      const sp = a + (i * Math.PI * 2 / 3)
      g.lineBetween(bwX + Math.cos(sp) * wR, bwY + Math.sin(sp) * wR,
                    bwX - Math.cos(sp) * wR, bwY - Math.sin(sp) * wR)
      g.lineBetween(fwX + Math.cos(sp + 0.5) * wR, fwY + Math.sin(sp + 0.5) * wR,
                    fwX - Math.cos(sp + 0.5) * wR, fwY - Math.sin(sp + 0.5) * wR)
    }

    // Chainring
    g.lineStyle(1.5 * s, 0x888888, 0.7)
    g.strokeCircle(bbX, bbY, 6.5 * s)

    // Crank arm
    const cl = 8 * s
    const lpX = bbX + Math.cos(a) * cl, lpY = bbY + Math.sin(a) * cl
    const rpX = bbX + Math.cos(a + Math.PI) * cl, rpY = bbY + Math.sin(a + Math.PI) * cl
    g.lineStyle(2.5 * s, 0x444444, 1)
    g.lineBetween(lpX, lpY, rpX, rpY)

    // Pedals (perpendicular to crank arm)
    const pa = a + Math.PI / 2
    const pl = 5 * s
    g.lineStyle(2.5 * s, 0x222222, 1)
    g.lineBetween(lpX + Math.cos(pa) * pl, lpY + Math.sin(pa) * pl,
                  lpX - Math.cos(pa) * pl, lpY - Math.sin(pa) * pl)
    g.lineBetween(rpX + Math.cos(pa) * pl, rpY + Math.sin(pa) * pl,
                  rpX - Math.cos(pa) * pl, rpY - Math.sin(pa) * pl)
  }

  /** Start pedalling animation */
  startCycling() {
    if (this._cycling) return
    this._cycling = true
    this._stopBodyBob()

    // Gentle vertical bob while pedalling
    const bobT = this.scene.tweens.add({
      targets: this.bodyContainer,
      y: { from: 0, to: -3 },
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(bobT)

    // Crank counter drives spokes + leg animation
    const crankT = this.scene.tweens.addCounter({
      from: 0,
      to: Math.PI * 2,
      duration: 550,
      repeat: -1,
      onUpdate: (tw) => {
        this._bikeAngle = tw.getValue()
        this._drawBikeAnim()
        const ang = this._bikeAngle
        this.leftLeg.angle  =  Math.sin(ang) * 48
        this.rightLeg.angle = -Math.sin(ang) * 48
      },
    })
    this.activeTweens.push(crankT)

    if (this.dustEmitter) this.dustEmitter.start()
  }

  /** Stop pedalling, keep bike visible */
  stopCycling() {
    if (!this._cycling) return
    this._cycling = false
    this._clearActiveTweens()
    this.leftLeg.angle  = 0
    this.rightLeg.angle = 0
    this.bodyContainer.y = 0
    this._drawBikeAnim()
    if (this.dustEmitter) this.dustEmitter.stop()
  }

  /** Stop tweens and destroy everything */
  destroy() {
    this._clearActiveTweens()
    if (this.dustEmitter) {
      try { this.dustEmitter.destroy() } catch (e) {}
    }
    if (this._bikeFrameG) { try { this._bikeFrameG.destroy() } catch (e) {} }
    if (this._bikeAnimG)  { try { this._bikeAnimG.destroy()  } catch (e) {} }
    try { this.posContainer.destroy(true) } catch (e) {}
  }

  // --- Private helpers ---

  _stopBodyBob() {
    if (this._idleTween) {
      this._idleTween.stop()
      this.activeTweens = this.activeTweens.filter(t => t !== this._idleTween)
      this._idleTween = null
    }
    if (this._runBobTween) {
      this._runBobTween.stop()
      this.activeTweens = this.activeTweens.filter(t => t !== this._runBobTween)
      this._runBobTween = null
    }
    this.bodyContainer.y = 0
    this.bodyContainer.scaleY = 1
  }

  _clearActiveTweens() {
    this.activeTweens.forEach(t => { try { t.stop() } catch (e) {} })
    this.activeTweens = []
    this._idleTween = null
    this._runBobTween = null
    this._moveTween = null
  }
}
