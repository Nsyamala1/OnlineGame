import Phaser from 'phaser'
import { connect, getSocket } from '../socket.js'

export default class LandingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Landing' })
  }

  create() {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    this._drawBackground(width, height)
    this._createParticles(width, height)
    this._createTitle(cx, cy)
    this._createForm(cx, cy)
  }

  _drawBackground(width, height) {
    const g = this.add.graphics()
    // Deep purple gradient
    g.fillGradientStyle(0x0d0d2b, 0x0d0d2b, 0x16213e, 0x1a1a3e, 1)
    g.fillRect(0, 0, width, height)

    // Subtle star field
    g.fillStyle(0xffffff, 0.5)
    for (let i = 0; i < 80; i++) {
      const sx = Phaser.Math.Between(0, width)
      const sy = Phaser.Math.Between(0, height * 0.8)
      const sr = Math.random() < 0.2 ? 2 : 1
      g.fillCircle(sx, sy, sr)
    }
  }

  _createParticles(width, height) {
    this._floatingParticles = []

    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(0, width)
      const y = Phaser.Math.Between(0, height)
      const r = Phaser.Math.Between(1, 4)
      const alpha = Phaser.Math.FloatBetween(0.1, 0.5)
      const speed = Phaser.Math.FloatBetween(0.2, 0.8)

      const circle = this.add.circle(x, y, r, 0xffffff, alpha)
      this._floatingParticles.push({ obj: circle, speed, startY: y, x, height })
    }
  }

  _createTitle(cx, cy) {
    // Glow effect behind title
    const glow = this.add.text(cx, cy * 0.38, 'RACING GAME', {
      fontSize: '68px',
      fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#f39c12',
      alpha: 0.15,
    })
    glow.setOrigin(0.5)
    glow.setScale(1.02)

    const title = this.add.text(cx, cy * 0.38, 'RACING GAME', {
      fontSize: '64px',
      fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#f1c40f',
      stroke: '#e67e22',
      strokeThickness: 4,
      shadow: { offsetX: 3, offsetY: 3, color: '#000000', blur: 8, fill: true },
    })
    title.setOrigin(0.5)

    // Pulsing scale tween
    this.tweens.add({
      targets: title,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // Subtitle
    const subtitle = this.add.text(cx, cy * 0.38 + 60, 'Click  ·  Tap  ·  Run  ·  Win', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#ffffff',
      alpha: 0.6,
    })
    subtitle.setAlpha(0.6)
    subtitle.setOrigin(0.5)
  }

  _createForm(cx, cy) {
    const html = `
      <div id="landing-form" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        font-family: Arial, sans-serif;
      ">
        <input
          id="player-name"
          type="text"
          maxlength="15"
          placeholder="Enter your name..."
          autocomplete="off"
          style="
            width: 280px;
            padding: 12px 16px;
            font-size: 16px;
            border: 2px solid #f1c40f;
            border-radius: 8px;
            background: rgba(0,0,0,0.6);
            color: #ffffff;
            outline: none;
            text-align: center;
            letter-spacing: 1px;
          "
        />

        <div style="display: flex; gap: 10px;">
          <button
            id="btn-multiplayer"
            data-mode="multiplayer"
            style="
              padding: 10px 18px;
              font-size: 14px;
              border: 2px solid #3498db;
              border-radius: 8px;
              background: #3498db;
              color: #fff;
              cursor: pointer;
              font-weight: bold;
              transition: all 0.2s;
            "
          >&#128101; Play with Friends</button>

          <button
            id="btn-ai"
            data-mode="ai"
            style="
              padding: 10px 18px;
              font-size: 14px;
              border: 2px solid #666;
              border-radius: 8px;
              background: rgba(0,0,0,0.4);
              color: #aaa;
              cursor: pointer;
              font-weight: bold;
              transition: all 0.2s;
            "
          >&#129302; vs AI</button>
        </div>

        <button
          id="btn-start"
          style="
            width: 220px;
            padding: 14px;
            font-size: 18px;
            font-weight: bold;
            border: none;
            border-radius: 10px;
            background: linear-gradient(135deg, #f1c40f, #e67e22);
            color: #1a1a2e;
            cursor: pointer;
            letter-spacing: 1px;
            box-shadow: 0 4px 15px rgba(241,196,15,0.4);
            transition: transform 0.1s, box-shadow 0.1s;
          "
        >START RACE &#127937;</button>

        <div id="error-msg" style="
          color: #e74c3c;
          font-size: 14px;
          font-weight: bold;
          min-height: 20px;
          text-align: center;
        "></div>
      </div>
    `

    const dom = this.add.dom(cx, cy * 1.3).createFromHTML(html)

    let selectedMode = 'multiplayer'

    const setMode = (mode) => {
      selectedMode = mode
      const btnMulti = dom.getChildByID('btn-multiplayer')
      const btnAI = dom.getChildByID('btn-ai')
      if (mode === 'multiplayer') {
        btnMulti.style.background = '#3498db'
        btnMulti.style.borderColor = '#3498db'
        btnMulti.style.color = '#fff'
        btnAI.style.background = 'rgba(0,0,0,0.4)'
        btnAI.style.borderColor = '#666'
        btnAI.style.color = '#aaa'
      } else {
        btnAI.style.background = '#9b59b6'
        btnAI.style.borderColor = '#9b59b6'
        btnAI.style.color = '#fff'
        btnMulti.style.background = 'rgba(0,0,0,0.4)'
        btnMulti.style.borderColor = '#666'
        btnMulti.style.color = '#aaa'
      }
    }

    dom.addListener('click')
    dom.on('click', (event) => {
      const target = event.target

      if (target.id === 'btn-multiplayer') {
        setMode('multiplayer')
        return
      }
      if (target.id === 'btn-ai') {
        setMode('ai')
        return
      }
      if (target.id === 'btn-start') {
        this._handleStart(dom, selectedMode)
        return
      }
    })

    // Allow Enter key to start
    dom.addListener('keydown')
    dom.on('keydown', (event) => {
      if (event.key === 'Enter') {
        this._handleStart(dom, selectedMode)
      }
    })

    // Hover effect for start button
    const startBtn = dom.getChildByID('btn-start')
    startBtn.addEventListener('mouseenter', () => {
      startBtn.style.transform = 'scale(1.05)'
      startBtn.style.boxShadow = '0 6px 20px rgba(241,196,15,0.6)'
    })
    startBtn.addEventListener('mouseleave', () => {
      startBtn.style.transform = 'scale(1.0)'
      startBtn.style.boxShadow = '0 4px 15px rgba(241,196,15,0.4)'
    })

    this._dom = dom

    // Set up socket listeners for gameFull after dom is ready
    // (socket won't be connected yet — we connect on submit)
  }

  _handleStart(dom, mode) {
    const nameInput = dom.getChildByID('player-name')
    const errorEl = dom.getChildByID('error-msg')
    const name = nameInput.value.trim()

    if (!name) {
      errorEl.textContent = 'Please enter your name!'
      errorEl.style.color = '#e74c3c'
      // Shake input
      this.tweens.add({
        targets: dom,
        x: dom.x + 8,
        duration: 60,
        yoyo: true,
        repeat: 3,
        ease: 'Linear',
        onComplete: () => { dom.x = this.scale.width / 2 },
      })
      return
    }

    errorEl.textContent = 'Connecting...'
    errorEl.style.color = '#f1c40f'

    const socket = connect()

    socket.once('connect', () => {
      socket.emit('setName', { name, mode })

      socket.once('gameFull', () => {
        errorEl.textContent = 'Game is full (max 4 players)'
        errorEl.style.color = '#e74c3c'
      })

      socket.once('updateGame', (data) => {
        // Store initial state in registry for WaitingScene to pick up
        this.registry.set('initialGameData', data)
        this.registry.set('playerName', name)
        this.registry.set('playerMode', mode)
        this.scene.start('Waiting')
      })
    })

    socket.on('connect_error', () => {
      errorEl.textContent = 'Connection failed. Is the server running?'
      errorEl.style.color = '#e74c3c'
    })

    // If socket was already connected (reconnect scenario)
    if (socket.connected) {
      socket.emit('setName', { name, mode })

      socket.once('gameFull', () => {
        errorEl.textContent = 'Game is full (max 4 players)'
        errorEl.style.color = '#e74c3c'
      })

      socket.once('updateGame', (data) => {
        this.registry.set('initialGameData', data)
        this.registry.set('playerName', name)
        this.registry.set('playerMode', mode)
        this.scene.start('Waiting')
      })
    }
  }

  update() {
    if (!this._floatingParticles) return
    const height = this.scale.height
    this._floatingParticles.forEach(p => {
      p.obj.y -= p.speed
      if (p.obj.y < -10) {
        p.obj.y = height + 10
        p.obj.x = Phaser.Math.Between(0, this.scale.width)
      }
    })
  }
}
