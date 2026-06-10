// Procedural sound effects using Web Audio API — no audio files required

let _ctx = null

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

function beep({ frequency = 440, type = 'sine', duration = 0.1, volume = 0.3, decay = 0.08 } = {}) {
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration + decay)
  } catch (e) {
    // silently ignore if audio unavailable
  }
}

export const SoundManager = {
  tap() {
    beep({ frequency: 520, type: 'square', duration: 0.05, volume: 0.15 })
  },

  ready() {
    beep({ frequency: 660, type: 'sine', duration: 0.12, volume: 0.3 })
    setTimeout(() => beep({ frequency: 880, type: 'sine', duration: 0.12, volume: 0.3 }), 120)
  },

  countdown(n) {
    if (n > 0) {
      beep({ frequency: 440, type: 'sine', duration: 0.18, volume: 0.4 })
    } else {
      // GO!
      beep({ frequency: 660, type: 'sine', duration: 0.15, volume: 0.5 })
      setTimeout(() => beep({ frequency: 880, type: 'sine', duration: 0.15, volume: 0.5 }), 120)
      setTimeout(() => beep({ frequency: 1100, type: 'sine', duration: 0.25, volume: 0.5 }), 240)
    }
  },

  finish() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      setTimeout(() => beep({ frequency: freq, type: 'sine', duration: 0.2, volume: 0.4 }), i * 100)
    })
  },

  burst() {
    beep({ frequency: 200, type: 'sawtooth', duration: 0.3, volume: 0.5 })
  },

  playerJoin() {
    beep({ frequency: 392, type: 'sine', duration: 0.1, volume: 0.25 })
    setTimeout(() => beep({ frequency: 523, type: 'sine', duration: 0.1, volume: 0.25 }), 100)
  },

  tugPull() {
    beep({ frequency: 180, type: 'square', duration: 0.04, volume: 0.1 })
  },
}
