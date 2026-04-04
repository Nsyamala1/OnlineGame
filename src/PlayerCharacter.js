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

    // Faster body bob
    const bobT = this.scene.tweens.add({
      targets: this.bodyContainer,
      y: { from: 0, to: -5 },
      duration: 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(bobT)
    this._runBobTween = bobT

    // Arms swing
    const leftArmT = this.scene.tweens.add({
      targets: this.leftArm,
      angle: { from: -45, to: 45 },
      duration: 250,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(leftArmT)

    const rightArmT = this.scene.tweens.add({
      targets: this.rightArm,
      angle: { from: 45, to: -45 },
      duration: 250,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(rightArmT)

    // Legs swing
    const leftLegT = this.scene.tweens.add({
      targets: this.leftLeg,
      angle: { from: 40, to: -40 },
      duration: 250,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.activeTweens.push(leftLegT)

    const rightLegT = this.scene.tweens.add({
      targets: this.rightLeg,
      angle: { from: -40, to: 40 },
      duration: 250,
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

    // Arms shoot up
    this.scene.tweens.add({
      targets: [this.leftArm, this.rightArm],
      angle: -160,
      duration: 300,
      ease: 'Back.easeOut',
    })

    // Jump repeatedly
    const jumpT = this.scene.tweens.add({
      targets: this.posContainer,
      y: this.posContainer.y - 40,
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.easeOut',
    })
    this.activeTweens.push(jumpT)

    // Spin head
    const headT = this.scene.tweens.add({
      targets: this.head,
      scaleX: { from: 1, to: 1.3 },
      scaleY: { from: 1, to: 1.3 },
      duration: 400,
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
      ease: 'Linear',
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

  /** Stop tweens and destroy everything */
  destroy() {
    this._clearActiveTweens()
    if (this.dustEmitter) {
      try { this.dustEmitter.destroy() } catch (e) {}
    }
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
  }

  _clearActiveTweens() {
    this.activeTweens.forEach(t => { try { t.stop() } catch (e) {} })
    this.activeTweens = []
    this._idleTween = null
    this._runBobTween = null
    this._moveTween = null
  }
}
