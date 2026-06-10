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

  _createModeChoice(cx, cy) {
    const html = `
      <div style="
        display: flex; flex-direction: column; align-items: center; gap: 24px;
        font-family: Arial, sans-serif;
      ">
        <p style="color:rgba(255,255,255,0.7); font-size:16px; margin:0; text-align:center;">
          Who are you?
        </p>

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

        <button id="btn-spectator" style="
          width: 300px; padding: 14px 24px;
          font-size: 16px; font-weight: bold;
          border: 2px solid #9b59b6; border-radius: 16px;
          background: rgba(155,89,182,0.15);
          color: #fff; cursor: pointer; text-align: left;
          transition: all 0.2s; line-height: 1.5;
        ">
          <div style="font-size:24px; margin-bottom:4px;">👁️</div>
          <div style="font-size:16px; font-weight:bold;">Spectate</div>
          <div style="font-size:12px; font-weight:normal; opacity:0.7; margin-top:2px;">
            Watch a game in progress
          </div>
        </button>

        <button id="btn-howto" style="
          background: none; border: none;
          color: rgba(255,255,255,0.5); font-size: 13px; cursor: pointer;
          text-decoration: underline; padding: 0;
        ">? How to play</button>

        <div id="error-msg" style="
          color: #e74c3c; font-size: 14px; font-weight: bold;
          min-height: 18px; text-align: center;
        "></div>
      </div>
    `

    const dom = this.add.dom(cx, cy * 1.3).createFromHTML(html)
    this._dom = dom

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
      } else if (e.target.id === 'btn-spectator' || e.target.closest?.('#btn-spectator')) {
        this._showSpectatorForm(cx, cy, dom)
      } else if (e.target.id === 'btn-howto') {
        this._showHowToPlay(cx, cy, dom)
      }
    })
  }

  _showSpectatorForm(cx, cy, oldDom) {
    oldDom.destroy()
    const urlParams = new URLSearchParams(window.location.search)
    const roomFromUrl = urlParams.get('room') || ''

    const html = `
      <div style="font-family:Arial,sans-serif; display:flex; flex-direction:column; align-items:center; gap:14px;">
        <button id="btn-back" style="align-self:flex-start;background:none;border:none;color:rgba(255,255,255,0.6);font-size:14px;cursor:pointer;padding:0;">← Back</button>
        <p style="color:rgba(255,255,255,0.7);font-size:15px;margin:0;text-align:center;">Enter the room code to spectate</p>
        <input id="spectate-code" type="text" maxlength="4" placeholder="Room Code"
          autocomplete="off" value="${roomFromUrl.toUpperCase()}"
          style="width:240px;padding:14px;font-size:28px;font-weight:bold;
            border:2px solid #9b59b6;border-radius:8px;
            background:rgba(0,0,0,0.6);color:#fff;
            outline:none;text-align:center;letter-spacing:8px;text-transform:uppercase;" />
        <button id="btn-spectate-join" style="
          width:200px;padding:12px;font-size:16px;font-weight:bold;
          border:none;border-radius:10px;
          background:#9b59b6;color:#fff;cursor:pointer;">
          👁️ SPECTATE
        </button>
        <div id="error-msg" style="color:#e74c3c;font-size:14px;min-height:18px;text-align:center;"></div>
      </div>
    `

    const dom = this.add.dom(cx, cy * 1.3).createFromHTML(html)
    this._dom = dom

    const codeInput = dom.getChildByID('spectate-code')
    if (codeInput) {
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
      })
    }

    dom.addListener('click')
    dom.on('click', (e) => {
      if (e.target.id === 'btn-back') { dom.destroy(); this._createModeChoice(cx, cy); return }
      if (e.target.id === 'btn-spectate-join') this._handleSpectate(dom)
    })
    dom.addListener('keydown')
    dom.on('keydown', (e) => { if (e.key === 'Enter') this._handleSpectate(dom) })
  }

  _handleSpectate(dom) {
    const codeInput = dom.getChildByID('spectate-code')
    const errorEl = dom.getChildByID('error-msg')
    const code = codeInput.value.trim().toUpperCase()

    if (!code || code.length !== 4) {
      errorEl.textContent = 'Enter the 4-letter room code'
      errorEl.style.color = '#e74c3c'
      return
    }

    errorEl.textContent = 'Connecting…'; errorEl.style.color = '#f1c40f'
    const socket = connect()

    const go = () => {
      socket.emit('joinAsSpectator', { code })

      socket.once('roomNotFound', () => {
        errorEl.textContent = 'Room not found!'
        errorEl.style.color = '#e74c3c'
      })

      socket.once('updateGame', (data) => {
        this.registry.set('initialGameData', data)
        this.registry.set('clientRole', 'spectator')
        this.scene.start('Waiting')
      })
    }

    if (socket.connected) { go() }
    else {
      socket.once('connect', go)
      socket.on('connect_error', () => {
        errorEl.textContent = 'Connection failed.'
        errorEl.style.color = '#e74c3c'
      })
    }
  }

  _showHowToPlay(cx, cy, behindDom) {
    behindDom.setVisible(false)

    const html = `
      <div style="
        font-family: Arial, sans-serif; color: #fff;
        background: rgba(10,10,30,0.97); border: 2px solid #f1c40f;
        border-radius: 20px; padding: 28px 32px; width: 340px;
        display: flex; flex-direction: column; gap: 14px;
      ">
        <div style="font-size:22px; font-weight:bold; color:#f1c40f; text-align:center;">
          How to Play
        </div>

        <div style="font-size:13px; line-height:1.7; color:rgba(255,255,255,0.85);">
          <b style="color:#3498db;">📺 Display Screen (TV / Laptop)</b><br/>
          Open this page on the device everyone can see.<br/>
          Choose <b>Display Screen</b> — a room code + QR code will appear.<br/><br/>

          <b style="color:#2ecc71;">🎮 Players (Phone / Tablet)</b><br/>
          Scan the QR code on the display, or open this URL and enter the room code.<br/>
          Choose your name &amp; color, then join.<br/><br/>

          <b style="color:#f1c40f;">🏁 Game Modes</b><br/>
          <b>Sprint</b> — alternate tapping left &amp; right halves of your screen to run.<br/>
          <b>Cycling</b> — same alternating mechanic, bike theme.<br/>
          <b>Swimming</b> — tap the ∞ pattern on screen.<br/>
          <b>Tug of War</b> — tap fast to pull your team's side.<br/>
          <b>Balloon Pop</b> — tap steadily to inflate. Too fast = burst!<br/><br/>

          <b style="color:#e74c3c;">⚠️ Tips</b><br/>
          All players must press Ready before the countdown starts.<br/>
          The display screen picks the game mode.
        </div>

        <button id="btn-close-howto" style="
          padding: 10px; font-size: 15px; font-weight: bold;
          border: none; border-radius: 10px;
          background: #f1c40f; color: #1a1a2e; cursor: pointer;
        ">Got it! ✓</button>
      </div>
    `

    const modal = this.add.dom(cx, cy).createFromHTML(html)
    modal.addListener('click')
    modal.on('click', (e) => {
      if (e.target.id === 'btn-close-howto') {
        modal.destroy()
        behindDom.setVisible(true)
      }
    })
  }

  _startDisplay() {
    const errorEl = this._dom?.getChildByID('error-msg')
    if (errorEl) { errorEl.textContent = 'Connecting...'; errorEl.style.color = '#f1c40f' }

    const socket = connect()

    const go = () => {
      socket.emit('joinAsDisplay')

      socket.once('roomCreated', ({ code }) => {
        this.registry.set('roomCode', code)
      })

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

  _showPlayerForm(cx, cy, oldDom) {
    oldDom.destroy()

    // Read room code from URL query param (set when player scans QR code)
    const urlParams = new URLSearchParams(window.location.search)
    const roomFromUrl = urlParams.get('room') || ''

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
          type="text" maxlength="15" placeholder="Your name..."
          autocomplete="off"
          style="
            width: 280px; padding: 12px 16px; font-size: 16px;
            border: 2px solid #f1c40f; border-radius: 8px;
            background: rgba(0,0,0,0.6); color: #fff;
            outline: none; text-align: center; letter-spacing: 1px;
          "
        />

        <input
          id="room-code"
          type="text" maxlength="4" placeholder="Room Code (e.g. AB3D)"
          autocomplete="off"
          value="${roomFromUrl.toUpperCase()}"
          style="
            width: 280px; padding: 12px 16px; font-size: 20px; font-weight: bold;
            border: 2px solid #3498db; border-radius: 8px;
            background: rgba(0,0,0,0.6); color: #fff;
            outline: none; text-align: center; letter-spacing: 6px; text-transform: uppercase;
          "
        />

        <div style="display: flex; gap: 10px; align-items: center;">
          <span style="color:rgba(255,255,255,0.6); font-size:13px;">Color:</span>
          ${['#3498db','#e74c3c','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#e91e63'].map((c, i) => `
            <div id="color-${i}" data-color="${c}" style="
              width:28px; height:28px; border-radius:50%; background:${c};
              cursor:pointer; border: 3px solid ${i === 0 ? '#fff' : 'transparent'};
              transition: border-color 0.15s; flex-shrink:0;
            "></div>
          `).join('')}
        </div>

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
    let selectedColor = '#3498db'

    const setColor = (color, index) => {
      selectedColor = color
      for (let i = 0; i < 8; i++) {
        const swatch = dom.getChildByID(`color-${i}`)
        if (swatch) swatch.style.borderColor = i === index ? '#fff' : 'transparent'
      }
    }

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

    // Force uppercase as user types room code
    const roomInput = dom.getChildByID('room-code')
    if (roomInput) {
      roomInput.addEventListener('input', () => {
        const pos = roomInput.selectionStart
        roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
        roomInput.setSelectionRange(pos, pos)
      })
    }

    dom.addListener('click')
    dom.on('click', (e) => {
      if (e.target.id === 'btn-back') { dom.destroy(); this._createModeChoice(cx, cy); return }
      if (e.target.id === 'btn-multiplayer') { setMode('multiplayer'); return }
      if (e.target.id === 'btn-ai') { setMode('ai'); return }
      if (e.target.id === 'btn-start') { this._handleStart(dom, selectedMode, selectedColor); return }
      // Color swatches
      if (e.target.dataset?.color) {
        const idx = parseInt(e.target.id.split('-')[1])
        setColor(e.target.dataset.color, idx)
      }
    })

    dom.addListener('keydown')
    dom.on('keydown', (e) => { if (e.key === 'Enter') this._handleStart(dom, selectedMode) })

    const startBtn = dom.getChildByID('btn-start')
    startBtn.addEventListener('mouseenter', () => { startBtn.style.transform = 'scale(1.05)' })
    startBtn.addEventListener('mouseleave', () => { startBtn.style.transform = 'scale(1.0)' })
  }

  _handleStart(dom, mode, color = '#3498db') {
    const nameInput = dom.getChildByID('player-name')
    const codeInput = dom.getChildByID('room-code')
    const errorEl = dom.getChildByID('error-msg')
    const name = nameInput.value.trim()
    const code = codeInput.value.trim().toUpperCase()

    if (!name) {
      errorEl.textContent = 'Please enter your name!'
      errorEl.style.color = '#e74c3c'
      this._shake(dom)
      return
    }

    if (!code || code.length !== 4) {
      errorEl.textContent = 'Enter the 4-letter room code from the display screen!'
      errorEl.style.color = '#e74c3c'
      this._shake(dom)
      return
    }

    errorEl.textContent = 'Connecting...'; errorEl.style.color = '#f1c40f'

    const socket = connect()

    const go = () => {
      socket.emit('joinRoom', { code, name, mode, color })

      const cleanup = () => {
        socket.off('roomNotFound')
        socket.off('gameAlreadyStarted')
        socket.off('gameFull')
        socket.off('updateGame')
      }

      socket.once('roomNotFound', () => {
        cleanup()
        errorEl.textContent = 'Room not found. Check the code!'
        errorEl.style.color = '#e74c3c'
      })

      socket.once('gameAlreadyStarted', () => {
        cleanup()
        errorEl.textContent = 'Game already in progress!'
        errorEl.style.color = '#e74c3c'
      })

      socket.once('gameFull', () => {
        cleanup()
        errorEl.textContent = 'Room is full (max 4 players)'
        errorEl.style.color = '#e74c3c'
      })

      socket.once('updateGame', (data) => {
        cleanup()
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

  _shake(dom) {
    this.tweens.add({
      targets: dom, x: dom.x + 8, duration: 60,
      yoyo: true, repeat: 3, ease: 'Linear',
      onComplete: () => { dom.x = this.scale.width / 2 },
    })
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
