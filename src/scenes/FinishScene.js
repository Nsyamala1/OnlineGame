import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import PlayerCharacter from '../PlayerCharacter.js'
import { SoundManager } from '../SoundManager.js'

const FINISH_LINE = 2000
const MEDALS = ['🥇', '🥈', '🥉']

export default class FinishScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Finish' })
  }

  init(data) {
    this._players = data.players || []
    this._winner = data.winner || (this._players[0] || null)
    this._winnerCharacter = null
    this._olympicsRoundComplete = data.olympicsRoundComplete || false
    this._olympicsComplete = data.olympicsComplete || false
    this._olympicsRound = data.olympicsRound || 0
    this._olympicsTotal = data.olympicsTotal || 5
    this._nextMode = data.nextMode || null
  }

  create() {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    this._drawBackground(width, height)
    this._launchConfetti(width, height)
    SoundManager.finish()

    if (this._olympicsComplete) {
      this._showOlympicsChampion(cx, cy, width, height)
      this._createButtons(cx, height)
      return
    }

    this._showWinnerAnnouncement(cx, cy)
    this._showStandings(cx, cy, width, height)
    this._spawnWinnerCharacter(cx, cy)

    if (this._olympicsRoundComplete) {
      this._showOlympicsNextRound(cx, height)
      this._listenForNextRound()
    } else {
      this._createButtons(cx, height)
    }
  }

  _drawBackground(width, height) {
    const g = this.add.graphics()
    g.fillGradientStyle(0x0d0d2b, 0x0d0d2b, 0x1a0a2e, 0x0d1a2b, 1)
    g.fillRect(0, 0, width, height)

    // Decorative stars
    g.fillStyle(0xffffff, 0.4)
    for (let i = 0; i < 60; i++) {
      g.fillCircle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Math.random() < 0.15 ? 2 : 1
      )
    }
  }

  _launchConfetti(width, height) {
    const confettiKeys = ['confetti_0', 'confetti_1', 'confetti_2', 'confetti_3', 'confetti_4', 'confetti_5']

    confettiKeys.forEach(key => {
      if (!this.textures.exists(key)) return

      const emitter = this.add.particles(
        Phaser.Math.Between(0, width),
        -10,
        key,
        {
          x: { min: 0, max: width },
          y: { min: -20, max: -5 },
          speedX: { min: -80, max: 80 },
          speedY: { min: 150, max: 380 },
          gravityY: 120,
          angle: { min: 0, max: 360 },
          rotate: { min: 0, max: 360 },
          scale: { min: 0.8, max: 2 },
          alpha: { start: 1, end: 0.3 },
          lifespan: { min: 2000, max: 3500 },
          quantity: 5,
          frequency: 60,
        }
      )
      emitter.setDepth(300)

      // Stop after 3 seconds
      this.time.delayedCall(3000, () => {
        try { emitter.stop() } catch (e) {}
      })
    })
  }

  _showWinnerAnnouncement(cx, cy) {
    if (!this._winner) return

    const winnerColor = this._winner.color || '#f1c40f'

    // Background banner
    const banner = this.add.graphics()
    banner.fillStyle(0x000000, 0.5)
    banner.fillRoundedRect(cx - 280, cy * 0.2, 560, 80, 16)
    banner.setDepth(10)

    const winText = this.add.text(cx, cy * 0.38, `🎉 ${this._winner.name} WINS! 🎉`, {
      fontSize: '42px',
      fontFamily: '"Arial Black", Arial',
      color: winnerColor,
      stroke: '#000000',
      strokeThickness: 6,
      shadow: { offsetX: 3, offsetY: 3, color: '#000', blur: 10, fill: true },
    })
    winText.setOrigin(0.5).setDepth(11)
    winText.setScale(0)

    // Entrance tween: scale from 0 → 1.2 → 1
    this.tweens.add({
      targets: winText,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 600,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: winText,
          scaleX: 1,
          scaleY: 1,
          duration: 200,
          ease: 'Quad.easeInOut',
        })
      },
    })

    // Pulsing glow
    this.tweens.add({
      targets: winText,
      alpha: 0.8,
      duration: 900,
      yoyo: true,
      repeat: -1,
      delay: 900,
      ease: 'Sine.easeInOut',
    })
  }

  _showStandings(cx, cy, width, height) {
    // Sort players by position descending
    const sorted = [...this._players].sort((a, b) => b.position - a.position)

    const panelW = Math.min(360, width * 0.8)
    const panelH = 40 + sorted.length * 46 + 20
    const panelX = cx - panelW / 2
    const panelY = cy * 0.6

    // Panel bg
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.55)
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, 14)
    bg.setDepth(10)

    this.add.text(cx, panelY + 20, 'FINAL STANDINGS', {
      fontSize: '16px',
      fontFamily: '"Arial Black", Arial',
      color: '#f1c40f',
    }).setOrigin(0.5).setDepth(11)

    sorted.forEach((p, i) => {
      const rowY = panelY + 46 + i * 46
      const colorInt = Phaser.Display.Color.HexStringToColor(p.color).color
      const medal = i < 3 ? MEDALS[i] : `${i + 1}.`
      const pct = Math.round((p.position / FINISH_LINE) * 100)

      // Animate each row sliding in
      const row = this.add.container(panelX - 50, rowY)
      row.setDepth(11)

      const rowBg = this.add.graphics()
      rowBg.fillStyle(colorInt, 0.12)
      rowBg.fillRoundedRect(0, -16, panelW, 38, 6)

      const colorDot = this.add.circle(22, 4, 8, colorInt)

      const medalTxt = this.add.text(38, 4, medal, {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: '#ffffff',
      }).setOrigin(0, 0.5)

      const nameTxt = this.add.text(72, 4, p.name + (p.isAI ? ' 🤖' : ''), {
        fontSize: '15px',
        fontFamily: 'Arial',
        color: '#ffffff',
      }).setOrigin(0, 0.5)

      const pctTxt = this.add.text(panelW - 14, 4, `${pct}%`, {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: '#aaaaaa',
      }).setOrigin(1, 0.5)

      // Wins badge
      if (p.wins > 0) {
        const winsTxt = this.add.text(panelW - 14, -8, `🏆×${p.wins}`, {
          fontSize: '10px',
          fontFamily: 'Arial',
          color: '#f1c40f',
        }).setOrigin(1, 0.5)
        row.add(winsTxt)
      }

      row.add([rowBg, colorDot, medalTxt, nameTxt, pctTxt])

      // Slide in animation
      this.tweens.add({
        targets: row,
        x: panelX,
        duration: 400,
        delay: i * 120,
        ease: 'Back.easeOut',
      })
    })
  }

  _spawnWinnerCharacter(cx, cy) {
    if (!this._winner) return

    const charX = cx
    const charY = cy * 1.62

    this._winnerCharacter = new PlayerCharacter(this, charX, charY, {
      color: this._winner.color || '#f1c40f',
      name: this._winner.name || 'Winner',
      wins: this._winner.wins || 0,
      isMe: false,
    })
    this._winnerCharacter.playVictory()
  }

  _showOlympicsNextRound(cx, height) {
    const modeLabels = { sprint: '🏃 Sprint', cycling: '🚴 Cycling', swimming: '🏊 Swimming', tugofwar: '🤝 Tug of War', balloon: '🎈 Balloon Pop' }
    const roundLabel = `Round ${this._olympicsRound} / ${this._olympicsTotal} complete`
    const nextLabel = `Next: ${modeLabels[this._nextMode] || this._nextMode}`

    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.7)
    bg.fillRoundedRect(cx - 200, height - 120, 400, 100, 14)
    bg.setDepth(200)

    this.add.text(cx, height - 95, roundLabel, {
      fontSize: '14px', fontFamily: 'Arial', color: '#f1c40f',
    }).setOrigin(0.5).setDepth(201)

    this.add.text(cx, height - 72, nextLabel, {
      fontSize: '20px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
    }).setOrigin(0.5).setDepth(201)

    this._countdownTxt = this.add.text(cx, height - 44, 'Starting in 5…', {
      fontSize: '13px', fontFamily: 'Arial', color: 'rgba(255,255,255,0.6)',
    }).setOrigin(0.5).setDepth(201)

    let secs = 5
    this._nextRoundTimer = this.time.addEvent({
      delay: 1000, repeat: 4,
      callback: () => {
        secs--
        if (this._countdownTxt) this._countdownTxt.setText(`Starting in ${secs}…`)
      },
    })
  }

  _listenForNextRound() {
    const socket = getSocket()
    if (!socket) return
    socket.off('updateGame')
    socket.on('updateGame', (data) => {
      if (data.gameState === 'countdown' || data.gameState === 'racing') {
        socket.off('updateGame')
        this.registry.set('initialGameData', data)
        this.scene.start('Waiting')
      }
    })
  }

  _showOlympicsChampion(cx, cy, width, height) {
    const sorted = [...this._players].sort((a, b) => b.wins - a.wins)
    const champion = sorted[0]

    this.add.text(cx, cy * 0.3, '🏅 OLYMPICS COMPLETE! 🏅', {
      fontSize: '32px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10)

    if (champion) {
      this.add.text(cx, cy * 0.55, `🥇 CHAMPION: ${champion.name}`, {
        fontSize: '26px', fontFamily: '"Arial Black", Arial',
        color: champion.color || '#f1c40f', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(10)
    }

    // Overall leaderboard
    const panelW = Math.min(340, width * 0.8)
    const panelX = cx - panelW / 2
    const panelY = cy * 0.7
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.55)
    bg.fillRoundedRect(panelX, panelY, panelW, 30 + sorted.length * 44, 12)
    bg.setDepth(10)

    this.add.text(cx, panelY + 16, 'OVERALL STANDINGS', {
      fontSize: '14px', fontFamily: '"Arial Black", Arial', color: '#f1c40f',
    }).setOrigin(0.5).setDepth(11)

    sorted.forEach((p, i) => {
      const rowY = panelY + 42 + i * 44
      const colorInt = Phaser.Display.Color.HexStringToColor(p.color).color
      const medals = ['🥇', '🥈', '🥉']
      this.add.circle(panelX + 22, rowY + 4, 8, colorInt).setDepth(11)
      this.add.text(panelX + 38, rowY + 4, `${medals[i] || (i + 1) + '.'} ${p.name}${p.isAI ? ' 🤖' : ''}`, {
        fontSize: '15px', fontFamily: 'Arial', color: '#fff',
      }).setOrigin(0, 0.5).setDepth(11)
      this.add.text(panelX + panelW - 14, rowY + 4, `🏆×${p.wins}`, {
        fontSize: '14px', fontFamily: 'Arial', color: '#f1c40f',
      }).setOrigin(1, 0.5).setDepth(11)
    })

    if (champion) {
      new PlayerCharacter(this, cx, cy * 1.65, {
        color: champion.color || '#f1c40f',
        name: champion.name,
        wins: champion.wins,
      }).playVictory()
    }
  }

  _createButtons(cx, height) {
    const socket = getSocket()

    // PLAY AGAIN button
    const playAgainBtn = this.add.text(cx - 90, height - 54, '  PLAY AGAIN  ', {
      fontSize: '18px',
      fontFamily: '"Arial Black", Arial',
      color: '#1a1a2e',
      backgroundColor: '#2ecc71',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(200)

    playAgainBtn.on('pointerover', () => playAgainBtn.setStyle({ backgroundColor: '#27ae60' }))
    playAgainBtn.on('pointerout', () => playAgainBtn.setStyle({ backgroundColor: '#2ecc71' }))
    playAgainBtn.on('pointerdown', () => {
      if (socket) {
        socket.emit('requestRestart')
      }
      if (this._winnerCharacter) {
        try { this._winnerCharacter.destroy() } catch (e) {}
      }
      this.scene.start('Waiting')
    })

    // LEAVE button
    const leaveBtn = this.add.text(cx + 90, height - 54, '  LEAVE  ', {
      fontSize: '18px',
      fontFamily: '"Arial Black", Arial',
      color: '#ffffff',
      backgroundColor: '#e74c3c',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(200)

    leaveBtn.on('pointerover', () => leaveBtn.setStyle({ backgroundColor: '#c0392b' }))
    leaveBtn.on('pointerout', () => leaveBtn.setStyle({ backgroundColor: '#e74c3c' }))
    leaveBtn.on('pointerdown', () => {
      disconnect()
      window.location.reload()
    })
  }

  shutdown() {
    if (this._winnerCharacter) {
      try { this._winnerCharacter.destroy() } catch (e) {}
    }
  }
}
