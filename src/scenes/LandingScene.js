import Phaser from 'phaser'
import { connect, getSocket, disconnect } from '../socket.js'

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
    this._createModeChoice(cx, cy)
  }

  _drawBackground(width, height) {
    const g = this.add.graphics()
    g.fillGradientStyle(0x0d0d2b, 0x0d0d2b, 0x16213e, 0x1a1a3e, 1)
    g.fillRect(0, 0, width, height)
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
      this._floatingParticles.push({ obj: circle, speed })
    }
  }

  _createTitle(cx, cy) {
    const title = this.add.text(cx, cy * 0.35, 'RACING GAME', {
      fontSize: '64px',
      fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#f1c40f',
      stroke: '#e67e22',
      strokeThickness: 4,
      shadow: { offsetX: 3, offsetY: 3, color: '#000000', blur: 8, fill: true },
    }).setOrigin(0.5)

    this.tweens.add({
      targets: title,
      scaleX: 1.05, scaleY: 1.05,
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    this.add.text(cx, cy * 0.35 + 60, 'Click  ·  Tap  ·  Run  ·  Win', {
      fontSize: '18px', fontFamily: 'Arial', color: '#ffffff',
    }).setAlpha(0.6).setOrigin(0.5)
  }

  // ── Two big buttons: Display Screen vs Player ──────────────────────────────
  _createModeChoice(cx, cy) {
    const html = `
      <div style="
        display: flex; flex-direction: column; align-items: center; gap: 24px;
        font-family: Arial, sans-serif;
      ">
        <p style="color:rgba(255,255,255,0.7); font-size:16px; margin:0; text-align:center;">
          Who are you?
        </p>

        <!-- DISPLAY SCREEN -->
        <button id="btn-display" style="
          width: 300px; padding: 20px 24px;
          font-size: 18px; font-weight: bold;
          border: 3px solid #3498db; border-radius: 16px;
          background: rgba(52,152,219,0.15);
          color: #fff; cursor: pointer; text-align: left;
          transition: all 0.2s; line-height: 1.5;
        ">
          <div style="font-size:32px; margin-bottom:6px;">📺</div>
          <div style="font-size:18px; font-weight:bold;">Display Screen</div>
          <div style="font-size:13px; font-weight:normal; opacity:0.7; margin-top:4px;">
            TV · Laptop · Monitor<br/>Shows the full race for everyone to watch
          </div>
        </button>

        <!-- PLAYER (iPad/Phone) -->
        <button id="btn-player" style="
          width: 300px; padding: 20px 24px;
          font-size: 18px; font-weight: bold;
          border: 3px solid #2ecc71; border-radius: 16px;
          background: rgba(46,204,113,0.15);
          color: #fff; cursor: pointer; text-align: left;
          transition: all 0.2s; line-height: 1.5;
        ">
          <div style="font-size:32px; margin-bottom:6px;">🎮</div>
          <div style="font-size:18px; font-weight:bold;">I'm a Player</div>
          <div style="font-size:13px; font-weight:normal; opacity:0.7; margin-top:4px;">
            iPad · Phone<br/>Tap your screen to make your character run!
          </div>
        </button>

        <div id="error-msg" style="
          color: #e74c3c; font-size: 14px; font-weight: bold;
          min-height: 18px; text-align: center;
        "></div>
      </div>
    `

    const dom = this.add.dom(cx, cy * 1.3).createFromHTML(html)
    this._dom = dom

    // Hover effects
    ;['btn-display', 'btn-player'].forEach(id => {
      const btn = dom.getChildByID(id)
      btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.03)' })
      btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1.0)' })
    })

    dom.addListener('click')
    dom.on('click', (e) => {
      if (e.target.id === 'btn-display' || e.target.closest?.('#btn-display')) {
        this._startDisplay()
      } else if (e.target.id === 'btn-player' || e.target.closest?.('#btn-player')) {
        this._showPlayerForm(cx, cy, dom)
      }
    })
  }

  // ── Display Screen flow ─────────────────────────────────────────────────────
  _startDisplay() {
    const errorEl = this._dom?.getChildByID('error-msg')
    if (errorEl) { errorEl.textContent = 'Connecting...'; errorEl.style.color = '#f1c40f' }

    const socket = connect()

    const go = () => {
      socket.emit('joinAsDisplay')
      socket.once('updateGame', (data) => {
        this.registry.set('initialGameData', data)
        this.registry.set('clientRole', 'display')
        this.scene.start('Waiting')
      })
    }

    if (socket.connected) { go() }
    else {
      socket.once('connect', go)
      socket.on('connect_error', () => {
        if (errorEl) { errorEl.textContent = 'Cannot connect to server. Is it running?'; errorEl.style.color = '#e74c3c' }
      })
    }
  }

  // ── Player flow — show name + mode form ────────────────────────────────────
  _showPlayerForm(cx, cy, oldDom) {
    oldDom.destroy()

    const html = `
      <div style="
        display: flex; flex-direction: column; align-items: center; gap: 14px;
        font-family: Arial, sans-serif;
      ">
        <button id="btn-back" style="
          align-self: flex-start; background: none; border: none;
          color: rgba(255,255,255,0.6); font-size: 14px; cursor: pointer; padding: 0;
        ">← Back</button>

        <input
          id="player-name"
          type="text" maxlength="15" placeholder="Enter your name..."
          autocomplete="off"
          style="
            width: 280px; padding: 12px 16px; font-size: 16px;
            border: 2px solid #f1c40f; border-radius: 8px;
            background: rgba(0,0,0,0.6); color: #fff;
            outline: none; text-align: center; letter-spacing: 1px;
          "
        />

        <div style="display: flex; gap: 10px;">
          <button id="btn-multiplayer" data-mode="multiplayer" style="
            padding: 10px 18px; font-size: 14px; font-weight: bold;
            border: 2px solid #3498db; border-radius: 8px;
            background: #3498db; color: #fff; cursor: pointer;
          ">&#128101; With Friends</button>
          <button id="btn-ai" data-mode="ai" style="
            padding: 10px 18px; font-size: 14px; font-weight: bold;
            border: 2px solid #666; border-radius: 8px;
            background: rgba(0,0,0,0.4); color: #aaa; cursor: pointer;
          ">&#129302; vs AI</button>
        </div>

        <button id="btn-start" style="
          width: 220px; padding: 14px; font-size: 18px; font-weight: bold;
          border: none; border-radius: 10px;
          background: linear-gradient(135deg, #f1c40f, #e67e22);
          color: #1a1a2e; cursor: pointer; letter-spacing: 1px;
          box-shadow: 0 4px 15px rgba(241,196,15,0.4);
        ">JOIN RACE 🏁</button>

        <div id="error-msg" style="
          color: #e74c3c; font-size: 14px; font-weight: bold;
          min-height: 20px; text-align: center;
        "></div>
      </div>
    `

    const dom = this.add.dom(cx, cy * 1.3).createFromHTML(html)
    this._dom = dom

    let selectedMode = 'multiplayer'

    const setMode = (mode) => {
      selectedMode = mode
      const btnM = dom.getChildByID('btn-multiplayer')
      const btnA = dom.getChildByID('btn-ai')
      if (mode === 'multiplayer') {
        btnM.style.background = '#3498db'; btnM.style.borderColor = '#3498db'; btnM.style.color = '#fff'
        btnA.style.background = 'rgba(0,0,0,0.4)'; btnA.style.borderColor = '#666'; btnA.style.color = '#aaa'
      } else {
        btnA.style.background = '#9b59b6'; btnA.style.borderColor = '#9b59b6'; btnA.style.color = '#fff'
        btnM.style.background = 'rgba(0,0,0,0.4)'; btnM.style.borderColor = '#666'; btnM.style.color = '#aaa'
      }
    }

    dom.addListener('click')
    dom.on('click', (e) => {
      if (e.target.id === 'btn-back') { dom.destroy(); this._createModeChoice(cx, cy); return }
      if (e.target.id === 'btn-multiplayer') { setMode('multiplayer'); return }
      if (e.target.id === 'btn-ai') { setMode('ai'); return }
      if (e.target.id === 'btn-start') { this._handleStart(dom, selectedMode) }
    })

    dom.addListener('keydown')
    dom.on('keydown', (e) => { if (e.key === 'Enter') this._handleStart(dom, selectedMode) })

    const startBtn = dom.getChildByID('btn-start')
    startBtn.addEventListener('mouseenter', () => { startBtn.style.transform = 'scale(1.05)' })
    startBtn.addEventListener('mouseleave', () => { startBtn.style.transform = 'scale(1.0)' })
  }

  _handleStart(dom, mode) {
    const nameInput = dom.getChildByID('player-name')
    const errorEl = dom.getChildByID('error-msg')
    const name = nameInput.value.trim()

    if (!name) {
      errorEl.textContent = 'Please enter your name!'
      errorEl.style.color = '#e74c3c'
      this.tweens.add({
        targets: dom, x: dom.x + 8, duration: 60,
        yoyo: true, repeat: 3, ease: 'Linear',
        onComplete: () => { dom.x = this.scale.width / 2 },
      })
      return
    }

    errorEl.textContent = 'Connecting...'; errorEl.style.color = '#f1c40f'

    const socket = connect()

    const go = () => {
      socket.emit('setName', { name, mode })

      socket.once('gameFull', () => {
        errorEl.textContent = 'Game is full (max 4 players)'
        errorEl.style.color = '#e74c3c'
      })

      socket.once('updateGame', (data) => {
        this.registry.set('initialGameData', data)
        this.registry.set('playerName', name)
        this.registry.set('playerMode', mode)
        this.registry.set('clientRole', 'player')
        this.scene.start('Waiting')
      })
    }

    if (socket.connected) { go() }
    else {
      socket.once('connect', go)
      socket.on('connect_error', () => {
        errorEl.textContent = 'Connection failed. Is the server running?'
        errorEl.style.color = '#e74c3c'
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
