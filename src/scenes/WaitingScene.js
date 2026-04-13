import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'

export default class WaitingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Waiting' })
    this._characters = {}
    this._isReady = false
    this._lastPlayerIds = []
  }

  create() {
    const { width, height } = this.scale
    this._characters = {}
    this._isReady = false

    this._drawBackground(width, height)
    this._createUI(width, height)

    const socket = getSocket()
    if (!socket) {
      this.scene.start('Landing')
      return
    }

    // Remove any stale listener, then add fresh one
    socket.off('updateGame')
    socket.on('updateGame', (data) => this._onUpdateGame(data))

    // Process initial data if available
    const initialData = this.registry.get('initialGameData')
    if (initialData) {
      this.registry.remove('initialGameData')
      this._onUpdateGame(initialData)
    }
  }

  _drawBackground(width, height) {
    // Gradient background
    const g = this.add.graphics()
    g.fillGradientStyle(0x0d0d2b, 0x0d0d2b, 0x1a1a3e, 0x16213e, 1)
    g.fillRect(0, 0, width, height)

    // Track preview strip at bottom
    g.fillStyle(0x2c3e50, 0.5)
    g.fillRect(0, height * 0.5, width, height * 0.5)

    // Lane lines
    g.lineStyle(1, 0xffffff, 0.1)
    for (let i = 1; i < 4; i++) {
      const y = height * 0.5 + (i / 4) * height * 0.5
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(width, y)
      g.strokePath()
    }
  }

  _createUI(width, height) {
    const cx = width / 2

    // Title
    this.add.text(cx, 36, 'LOBBY', {
      fontSize: '32px',
      fontFamily: '"Arial Black", Arial',
      color: '#f1c40f',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5)

    this.add.text(cx, 70, 'Waiting for players...', {
      fontSize: '15px',
      fontFamily: 'Arial',
      color: '#aaaaaa',
    }).setOrigin(0.5)

    // Player list panel (right side)
    this._playerListPanel = this.add.container(width - 200, 110)
    this._playerListBg = this.add.graphics()
    this._playerListBg.fillStyle(0x000000, 0.4)
    this._playerListBg.fillRoundedRect(width - 210, 100, 200, 200, 12)

    const panelTitle = this.add.text(width - 110, 108, 'PLAYERS', {
      fontSize: '13px',
      fontFamily: '"Arial Black", Arial',
      color: '#f1c40f',
    }).setOrigin(0.5)

    this._playerRows = []
    for (let i = 0; i < 4; i++) {
      const y = 130 + i * 40
      const dot = this.add.circle(width - 200, y, 6, 0x555555)
      const nameTxt = this.add.text(width - 185, y, '—', {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: '#555555',
      }).setOrigin(0, 0.5)
      this._playerRows.push({ dot, nameTxt })
    }

    // Hide ready button and show spectator badge for display clients
    const isDisplay = this.registry.get('clientRole') === 'display'
    if (isDisplay) {
      this.add.text(cx, height - 100, '📺  DISPLAY MODE  —  Spectating', {
        fontSize: '16px', fontFamily: '"Arial Black", Arial',
        color: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)',
        padding: { x: 16, y: 10 },
      }).setOrigin(0.5)

      // Game selector — only the display screen picks the game
      const selectorY = height - 52
      this.add.text(cx - 130, selectorY, 'Game:', {
        fontSize: '14px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.5)',
      }).setOrigin(0, 0.5)

      const games = [
        { key: 'sprint',   label: '🏃 Sprint' },
        { key: 'cycling',  label: '🚴 Cycling' },
        { key: 'swimming', label: '🏊 Swimming' },
        { key: 'tugofwar', label: '🤝 Tug' },
        { key: 'balloon',  label: '🎈 Balloon' },
      ]
      this._gameTypeBtns = {}
      games.forEach((g, i) => {
        const btn = this.add.text(cx - 240 + i * 120, selectorY, g.label, {
          fontSize: '14px', fontFamily: '"Arial Black", Arial',
          color: '#1a1a2e', backgroundColor: '#555555',
          padding: { x: 10, y: 8 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })

        btn.on('pointerdown', () => {
          const socket = getSocket()
          if (socket) socket.emit('setGameType', g.key)
        })
        this._gameTypeBtns[g.key] = btn
      })
      // Highlight initial selection
      this._highlightGameBtn(this.registry.get('gameType') || 'sprint')
    }

    // Ready button
    this._readyBtn = this.add.text(cx, height - 60, '  READY UP  ', {
      fontSize: '24px',
      fontFamily: '"Arial Black", Arial',
      color: '#1a1a2e',
      backgroundColor: '#f1c40f',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    this._readyBtn.on('pointerover', () => {
      if (!this._isReady) this._readyBtn.setStyle({ backgroundColor: '#e6b800' })
    })
    this._readyBtn.on('pointerout', () => {
      if (!this._isReady) this._readyBtn.setStyle({ backgroundColor: '#f1c40f' })
    })
    this._readyBtn.setVisible(!isDisplay)
    this._readyBtn.on('pointerdown', () => this._toggleReady())

    // Leave button
    const leaveBtn = this.add.text(width - 20, height - 20, 'Leave Game', {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#e74c3c',
    }).setOrigin(1, 1).setInteractive({ useHandCursor: true })
    leaveBtn.on('pointerover', () => leaveBtn.setStyle({ color: '#ff6b6b' }))
    leaveBtn.on('pointerout', () => leaveBtn.setStyle({ color: '#e74c3c' }))
    leaveBtn.on('pointerdown', () => {
      disconnect()
      window.location.reload()
    })

    // Invite section (shown when alone)
    this._inviteSection = this.add.container(cx, height * 0.88)
    this._inviteSection.setVisible(false)

    const inviteText = this.add.text(0, 0, `Invite friends: ${window.location.hostname}:3000`, {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#aaaaaa',
    }).setOrigin(0.5)

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`http://${window.location.hostname}:3000`)}`
    this.load.image('qr_code', qrUrl)
    this.load.once('complete', () => {
      if (this._qrImage) this._qrImage.destroy()
      this._qrImage = this.add.image(0, -50, 'qr_code').setOrigin(0.5)
      this._inviteSection.add(this._qrImage)
    })
    this.load.start()

    this._inviteSection.add(inviteText)

    // Countdown overlay (hidden by default)
    this._countdownOverlay = this.add.container(cx, height / 2)
    this._countdownOverlay.setVisible(false)

    this._countdownBg = this.add.rectangle(0, 0, width, height, 0x000000, 0.5)
    this._countdownText = this.add.text(0, 0, '3', {
      fontSize: '160px',
      fontFamily: '"Arial Black", Arial',
      color: '#f1c40f',
      stroke: '#000',
      strokeThickness: 8,
    }).setOrigin(0.5)

    this._countdownOverlay.add([this._countdownBg, this._countdownText])
  }

  _toggleReady() {
    const socket = getSocket()
    if (!socket) return
    this._isReady = !this._isReady

    if (this._isReady) {
      this._readyBtn.setText('  ✓ READY!  ')
      this._readyBtn.setStyle({ backgroundColor: '#2ecc71', color: '#ffffff' })
    } else {
      this._readyBtn.setText('  READY UP  ')
      this._readyBtn.setStyle({ backgroundColor: '#f1c40f', color: '#1a1a2e' })
    }

    socket.emit('toggleReady')
  }

  _onUpdateGame(data) {
    const { players, gameState, gameType, countdown } = data
    const socket = getSocket()
    const myId = socket ? socket.id : null

    // Keep gameType in registry so buttons stay highlighted correctly
    if (gameType) this.registry.set('gameType', gameType)

    // Update game type button highlight for display clients
    if (gameType && this._gameTypeBtns) this._highlightGameBtn(gameType)

    if (gameState === 'racing') {
      if (socket) socket.off('updateGame')
      this._destroyAllCharacters()
      const role = this.registry.get('clientRole')
      if (role === 'display') {
        const displayScene = gameType === 'tugofwar' ? 'TugOfWar'
          : gameType === 'balloon'   ? 'BalloonDisplay'
          : 'Race'
        this.scene.start(displayScene, { players, gameState, gameType, ropePosition: data.ropePosition || 0 })
      } else {
        const sceneKey = gameType === 'cycling'  ? 'CyclingPlayer'
          : gameType === 'swimming'  ? 'SwimmingPlayer'
          : gameType === 'tugofwar'  ? 'TugOfWarPlayer'
          : gameType === 'balloon'   ? 'BalloonPlayer'
          : 'Player'
        this.scene.start(sceneKey, { gameData: data })
      }
      return
    }

    if (gameState === 'countdown') {
      this._showCountdown(countdown)
    } else {
      this._countdownOverlay.setVisible(false)
    }

    // Update player characters
    this._syncCharacters(players, myId)

    // Update player list panel
    this._updatePlayerList(players)

    // Show/hide invite section
    const humanCount = players.filter(p => !p.isAI).length
    this._inviteSection.setVisible(humanCount <= 1)

    // Update ready button state
    const myPlayer = players.find(p => p.id === myId)
    if (myPlayer && myPlayer.ready !== this._isReady) {
      // Sync visual state if server disagrees (e.g. after reconnect)
      // Don't toggle _isReady here — just let the button reflect reality
    }
  }

  _syncCharacters(players, myId) {
    const { width, height } = this.scale
    const trackTop = height * 0.5
    const trackHeight = height * 0.5
    const laneHeight = trackHeight / 4
    const newIds = new Set(players.map(p => p.id))

    // Remove disconnected players
    for (const id of Object.keys(this._characters)) {
      if (!newIds.has(id)) {
        this._characters[id].destroy()
        delete this._characters[id]
      }
    }

    // Add or update characters
    players.forEach((p) => {
      const laneY = trackTop + (p.lane + 0.5) * laneHeight
      const spawnX = (p.lane + 1) * (width / (players.length + 1))

      if (!this._characters[p.id]) {
        this._characters[p.id] = new PlayerCharacter(this, spawnX, laneY, {
          color: p.color,
          name: p.name,
          wins: p.wins,
          isMe: p.id === myId,
        })
        this._characters[p.id].playIdle()
      }

      const ch = this._characters[p.id]
      ch.setReady(p.ready)
      ch.updateWins(p.wins)
    })
  }

  _updatePlayerList(players) {
    for (let i = 0; i < 4; i++) {
      const row = this._playerRows[i]
      if (i < players.length) {
        const p = players[i]
        const colorInt = Phaser.Display.Color.HexStringToColor(p.color).color
        row.dot.setFillStyle(colorInt)
        row.nameTxt.setText(p.name + (p.isAI ? ' 🤖' : ''))
        row.nameTxt.setStyle({ color: p.ready ? '#2ecc71' : '#ffffff' })
      } else {
        row.dot.setFillStyle(0x555555)
        row.nameTxt.setText('—')
        row.nameTxt.setStyle({ color: '#555555' })
      }
    }
  }

  _showCountdown(count) {
    if (count === undefined || count === null) return

    this._countdownOverlay.setVisible(true)
    this._countdownText.setText(String(count))
    this._countdownText.setScale(1)
    this._countdownText.setAlpha(1)

    // Flash screen
    const flash = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0xffffff, 0.3
    )
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    })

    // Scale tween on number
    this.tweens.add({
      targets: this._countdownText,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeIn',
    })
  }

  _highlightGameBtn(activeKey) {
    if (!this._gameTypeBtns) return
    const colors = { sprint: '#e67e22', cycling: '#2ecc71', swimming: '#3498db', tugofwar: '#e74c3c', balloon: '#9b59b6' }
    Object.entries(this._gameTypeBtns).forEach(([key, btn]) => {
      const isActive = key === activeKey
      btn.setStyle({
        backgroundColor: isActive ? (colors[key] || '#f1c40f') : '#555555',
        color: isActive ? '#1a1a2e' : 'rgba(255,255,255,0.5)',
      })
    })
  }

  _destroyAllCharacters() {
    for (const id of Object.keys(this._characters)) {
      this._characters[id].destroy()
    }
    this._characters = {}
  }

  shutdown() {
    const socket = getSocket()
    if (socket) socket.off('updateGame')
    this._destroyAllCharacters()
  }
}
