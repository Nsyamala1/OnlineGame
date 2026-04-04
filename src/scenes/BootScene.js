import Phaser from 'phaser'

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  create() {
    this._generateDust()
    this._generateConfetti()
    this._generateMountains()
    this._generateTrees()
    this._generateClouds()

    this.scene.start('Landing')
  }

  _generateDust() {
    const g = this.make.graphics({ add: false })
    g.fillStyle(0xb8a898, 1)
    g.fillCircle(4, 4, 4)
    g.generateTexture('dust', 8, 8)
    g.destroy()
  }

  _generateConfetti() {
    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xff6b35]
    colors.forEach((col, i) => {
      const g = this.make.graphics({ add: false })
      g.fillStyle(col, 1)
      g.fillRect(0, 0, 8, 4)
      g.generateTexture(`confetti_${i}`, 8, 4)
      g.destroy()
    })
  }

  _generateMountains() {
    const w = 400
    const h = 120
    const g = this.make.graphics({ add: false })

    // Background fill transparent
    g.fillStyle(0x5d7a9e, 1)

    // Mountain peaks — leftmost and rightmost cut for seamless tiling
    const peaks = [
      { x: -20, height: 80 },
      { x: 80,  height: 110 },
      { x: 180, height: 90 },
      { x: 300, height: 100 },
      { x: 420, height: 80 },
    ]

    peaks.forEach(p => {
      g.fillTriangle(
        p.x - 70, h,
        p.x,      h - p.height,
        p.x + 70, h
      )
    })

    // Lighter snow caps
    g.fillStyle(0xdce8f0, 0.6)
    peaks.forEach(p => {
      g.fillTriangle(
        p.x - 15, h - p.height + 20,
        p.x,      h - p.height,
        p.x + 15, h - p.height + 20
      )
    })

    g.generateTexture('mountains', w, h)
    g.destroy()
  }

  _generateTrees() {
    const w = 200
    const h = 100
    const g = this.make.graphics({ add: false })

    const trees = [
      { x: 30,  h1: 60, h2: 40, w1: 30, w2: 20 },
      { x: 100, h1: 75, h2: 50, w1: 35, w2: 25 },
      { x: 170, h1: 55, h2: 38, w1: 28, w2: 18 },
    ]

    trees.forEach(t => {
      // Outer dark green
      g.fillStyle(0x27ae60, 1)
      g.fillTriangle(t.x - t.w1, h, t.x, h - t.h1, t.x + t.w1, h)

      // Inner darker overlay for depth
      g.fillStyle(0x1e8449, 1)
      g.fillTriangle(t.x - t.w2, h - (t.h1 - t.h2) * 0.5, t.x, h - t.h1, t.x + t.w2, h - (t.h1 - t.h2) * 0.5)

      // Trunk
      g.fillStyle(0x6d4c41, 1)
      g.fillRect(t.x - 3, h - 12, 6, 12)
    })

    g.generateTexture('trees', w, h)
    g.destroy()
  }

  _generateClouds() {
    const w = 300
    const h = 80
    const g = this.make.graphics({ add: false })
    g.fillStyle(0xffffff, 0.85)

    const clouds = [
      { cx: 60,  cy: 45, circles: [{x:0,y:0,r:22},{x:-20,y:8,r:16},{x:20,y:8,r:16},{x:-10,y:15,r:14},{x:10,y:15,r:14}] },
      { cx: 200, cy: 38, circles: [{x:0,y:0,r:18},{x:-18,y:8,r:13},{x:18,y:8,r:14},{x:0,y:14,r:12}] },
    ]

    clouds.forEach(cloud => {
      cloud.circles.forEach(c => {
        g.fillCircle(cloud.cx + c.x, cloud.cy + c.y, c.r)
      })
      // Fill rect to merge bottom of cloud
      const minX = Math.min(...cloud.circles.map(c => cloud.cx + c.x - c.r))
      const maxX = Math.max(...cloud.circles.map(c => cloud.cx + c.x + c.r))
      const maxY = Math.max(...cloud.circles.map(c => cloud.cy + c.y + c.r))
      const midY = cloud.cy + Math.min(...cloud.circles.map(c => c.y))
      g.fillRect(minX, midY, maxX - minX, maxY - midY)
    })

    g.generateTexture('clouds', w, h)
    g.destroy()
  }
}
