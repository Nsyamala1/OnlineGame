import Phaser from 'phaser'
import { getSocket, disconnect } from '../socket.js'
import { SoundManager } from '../SoundManager.js'

const FOODS = ['🍕', '🍔', '🍩', '🌮', '🍦', '🍣', '🥪', '🍰']
const FINISH_LINE = 2000

export default class EatingPlayerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'EatingPlayer' })
  }

  init(data) {
    this._gameData = data.gameData || {}
  }

  create() {
    const { width, height } = this.scale
    const socket = getSocket()
    if (!socket) { this.scene.start('Landing'); return }

    this._myId = socket.id
    this._gameStatus = this._gameData.gameState || 'waiting'
    this._myPosition = 0
    this._finishShown = false
    this._activeItems = []

    this._buildBackground(width, height)
    this._buildProgressBar(width, height)
    this._buildStatusText(width, height)
    this._buildTapHint(width, height)

    socket.off('updateGame')
    socket.on('updateGame', (data) => this._onUpdate(data))
    this._onUpdate(this._gameData)

    this.input.on('pointerdown', (ptr) => this._onTap(ptr.x, ptr.y))
  }

  _buildBackground(width, height) {
    const g = this.add.graphics()
    g.fillGradientStyle(0x1a0a00, 0x1a0a00, 0x2d1500, 0x3d2000, 1)
    g.fillRect(0, 0, width, height)

    // Plate decoration at center
    const cx = width / 2
    const cy = height * 0.52
    g.fillStyle(0xffffff, 0.06)
    g.fillCircle(cx, cy, Math.min(width, height) * 0.38)
    g.fillStyle(0xffffff, 0.04)
    g.fillCircle(cx, cy, Math.min(width, height) * 0.32)
  }

  _buildProgressBar(width, height) {
    const barW = width * 0.78
    const barH = 22
    const barX = (width - barW) / 2
    const barY = height * 0.06

    // Track
    const track = this.add.graphics()
    track.fillStyle(0x000000, 0.4)
    track.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 12)
    track.fillStyle(0x333333, 1)
    track.fillRoundedRect(barX, barY, barW, barH, 10)

    this._progressBar = this.add.graphics()
    this._progressBarX = barX
    this._progressBarY = barY
    this._progressBarW = barW
    this._progressBarH = barH

    this.add.text(width / 2, barY + barH + 12, 'HUNGER METER', {
      fontSize: '11px', fontFamily: '"Arial Black", Arial',
      color: 'rgba(255,200,100,0.7)',
    }).setOrigin(0.5)

    this._hungerPct = this.add.text(barX + barW + 10, barY + barH / 2, '0%', {
      fontSize: '12px', fontFamily: 'Arial', color: '#f1c40f',
    }).setOrigin(0, 0.5)
  }

  _buildStatusText(width, height) {
    this._statusText = this.add.text(width / 2, height * 0.18, 'WAITING…', {
      fontSize: '22px', fontFamily: '"Arial Black", Arial',
      color: '#f1c40f', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5)
  }

  _buildTapHint(width, height) {
    this._hintText = this.add.text(width / 2, height * 0.9, 'Tap the food to eat! 🍽️', {
      fontSize: '16px', fontFamily: 'Arial',
      color: 'rgba(255,255,255,0.55)',
    }).setOrigin(0.5)
  }

  _onUpdate(data) {
    const { players, gameState } = data
    const socket = getSocket()
    const myPlayer = players?.find(p => p.id === this._myId)

    if (myPlayer) {
      this._myPosition = myPlayer.position || 0
      this._updateProgressBar(this._myPosition)
    }

    if (gameState === 'racing' && this._gameStatus !== 'racing') {
      this._gameStatus = 'racing'
      this._statusText.setText('EAT! 🍽️')
      this._hintText.setText('Tap the food!')
      this._startSpawning()
    }

    if (gameState === 'waiting' || gameState === 'countdown') {
      this._gameStatus = gameState
      const countdownVal = data.countdown
      this._statusText.setText(
        gameState === 'countdown' ? (countdownVal !== undefined ? String(countdownVal) : 'GO!') : 'WAITING…'
      )
    }

    if (gameState === 'finished' && !this._finishShown) {
      this._finishShown = true
      this._gameStatus = 'finished'
      this._stopSpawning()
      const sorted = [...(players || [])].sort((a, b) => b.position - a.position)
      const rank = sorted.findIndex(p => p.id === this._myId)
      const labels = ['🥇 1st!', '🥈 2nd', '🥉 3rd', '4th']
      this._statusText.setText(rank >= 0 ? labels[rank] || `${rank + 1}th` : 'Finished!')
      this._hintText.setText('')
      if (rank === 0) SoundManager.finish()

      if (socket) socket.off('updateGame')
      this.time.delayedCall(3000, () => {
        if (this.scene.isActive('EatingPlayer')) this.scene.start('Waiting')
      })
    }
  }

  _updateProgressBar(position) {
    const pct = Math.min(position / FINISH_LINE, 1)
    this._progressBar.clear()
    if (pct > 0) {
      this._progressBar.fillStyle(0xf39c12, 1)
      this._progressBar.fillRoundedRect(
        this._progressBarX, this._progressBarY,
        this._progressBarW * pct, this._progressBarH, 10
      )
    }
    this._hungerPct.setText(`${Math.round(pct * 100)}%`)
  }

  _startSpawning() {
    this._spawnTimer = this.time.addEvent({
      delay: 700,
      loop: true,
      callback: this._spawnFood,
      callbackScope: this,
    })
    // Spawn a few immediately
    for (let i = 0; i < 3; i++) this._spawnFood()
  }

  _stopSpawning() {
    if (this._spawnTimer) { this._spawnTimer.remove(); this._spawnTimer = null; }
    this._activeItems.forEach(item => { try { item.txt.destroy() } catch (e) {} })
    this._activeItems = []
  }

  _spawnFood() {
    if (this._gameStatus !== 'racing') return
    const { width, height } = this.scale
    const margin = 60
    const x = Phaser.Math.Between(margin, width - margin)
    const y = Phaser.Math.Between(height * 0.25, height * 0.78)
    const emoji = Phaser.Utils.Array.GetRandom(FOODS)
    const size = Phaser.Math.Between(36, 52)

    const txt = this.add.text(x, y, emoji, {
      fontSize: `${size}px`,
    }).setOrigin(0.5).setAlpha(0).setScale(0.3).setInteractive()

    // Pop in
    this.tweens.add({ targets: txt, alpha: 1, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' })

    // Bobbing
    this.tweens.add({
      targets: txt, y: y - 8,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    const lifetime = Phaser.Math.Between(1800, 3200)
    const item = { txt, eaten: false }
    this._activeItems.push(item)

    // Fade out when lifetime ends
    this.time.delayedCall(lifetime, () => {
      if (!item.eaten) {
        this.tweens.add({
          targets: txt, alpha: 0, scaleX: 0.2, scaleY: 0.2,
          duration: 250, onComplete: () => { try { txt.destroy() } catch (e) {} },
        })
        this._activeItems = this._activeItems.filter(i => i !== item)
      }
    })
  }

  _onTap(tapX, tapY) {
    if (this._gameStatus !== 'racing') return

    // Find closest food item within hit radius
    const HIT_RADIUS = 55
    let nearest = null
    let nearestDist = Infinity

    for (const item of this._activeItems) {
      if (item.eaten) continue
      const dx = item.txt.x - tapX
      const dy = item.txt.y - tapY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < HIT_RADIUS && dist < nearestDist) {
        nearest = item
        nearestDist = dist
      }
    }

    if (nearest) {
      nearest.eaten = true
      this._activeItems = this._activeItems.filter(i => i !== nearest)
      this._eatAnimation(nearest.txt)
      getSocket()?.emit('move')
      SoundManager.tap()
    } else {
      // Miss — small visual feedback
      this._showMiss(tapX, tapY)
    }
  }

  _eatAnimation(txt) {
    this.tweens.killTweensOf(txt)
    this.tweens.add({
      targets: txt,
      scaleX: 1.6, scaleY: 1.6, alpha: 0, y: txt.y - 40,
      duration: 300, ease: 'Quad.easeOut',
      onComplete: () => { try { txt.destroy() } catch (e) {} },
    })
  }

  _showMiss(x, y) {
    const miss = this.add.text(x, y, '✗', {
      fontSize: '28px', color: '#e74c3c', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5)
    this.tweens.add({
      targets: miss, alpha: 0, y: y - 30,
      duration: 400, onComplete: () => { try { miss.destroy() } catch (e) {} },
    })
  }

  shutdown() {
    this._stopSpawning()
    const socket = getSocket()
    if (socket) socket.off('updateGame')
  }
}
