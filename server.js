const path = require('path');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ── HTTP security headers ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,   // disabled: Phaser uses inline canvas/WebGL
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: false
}));

// ── HTTP rate limiting (per IP, protects the Express endpoints) ──────────────
app.use(rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 120,              // max 120 HTTP requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests — slow down.',
}));

let io;

const gameState = {
  players: [],
  status: 'waiting',
  countdownTimer: null,
  aiPlayers: [],
  aiInterval: null,
  gameType: 'sprint',   // 'sprint' | 'cycling' | 'swimming' | 'tugofwar'
  ropePosition: 0,      // tugofwar: negative = Team A winning, positive = Team B winning
  balloonBurstId: null, // balloon: socket id of the player who just burst (cleared after broadcast)
};

const TOW_CONFIG = {
  WIN_THRESHOLD: 400,
  PULL_AMOUNT: 28,
};

const BALLOON_CONFIG = {
  MAX_SIZE: 100,
  INFLATE_AMOUNT: 4,
  BURST_COOLDOWN_MS: 150, // tapping faster than this causes a pop
};

const GAME_CONFIG = {
  MAX_PLAYERS: 4,
  COLORS: ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f'],
  FINISH_LINE: 2000,
  MOVE_AMOUNT: 25,
  START_POSITION: 50,
  AI_MOVE_INTERVAL: [800, 1500],
  AI_NAMES: ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot David'],
  // Security
  MOVE_COOLDOWN_MS: 80,     // max ~12 legitimate taps/sec; scripts emit 100s/sec
  MAX_NAME_LENGTH: 15,
  MAX_EVENTS_PER_SEC: 20,   // hard cap on all socket events per socket per second
};

// ── Input sanitisation ────────────────────────────────────────────────────────
function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  // Strip HTML tags, trim whitespace, enforce length
  const cleaned = raw
    .replace(/<[^>]*>/g, '')   // no HTML
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // printable chars only
    .trim()
    .slice(0, GAME_CONFIG.MAX_NAME_LENGTH);
  return cleaned.length >= 1 ? cleaned : null;
}

function allPlayers() {
  return [...gameState.players, ...gameState.aiPlayers];
}

function broadcastUpdate(extra = {}) {
  const burstId = gameState.balloonBurstId;
  gameState.balloonBurstId = null; // consume after one broadcast
  io.emit('updateGame', {
    players: allPlayers(),
    gameState: gameState.status,
    gameType: gameState.gameType,
    ropePosition: gameState.ropePosition,
    burstId,
    ...extra
  });
}

function startAIMovement() {
  if (gameState.aiInterval) clearInterval(gameState.aiInterval);

  // ── Balloon: AI taps at a steady safe rhythm (~4.5 taps/sec) ──────────────
  if (gameState.gameType === 'balloon') {
    gameState.aiInterval = setInterval(() => {
      if (gameState.status !== 'racing') return;
      gameState.aiPlayers.forEach(ai => {
        // 80% chance to tap each tick → staggered natural feel
        if (Math.random() > 0.2) {
          ai.balloonSize = Math.min(BALLOON_CONFIG.MAX_SIZE, ai.balloonSize + BALLOON_CONFIG.INFLATE_AMOUNT);
          if (ai.balloonSize >= BALLOON_CONFIG.MAX_SIZE) {
            ai.wins++;
            gameState.status = 'finished';
          }
        }
      });
      broadcastUpdate();
    }, 220);
    return;
  }

  gameState.aiInterval = setInterval(() => {
    if (gameState.status !== 'racing') return;

    if (gameState.gameType === 'tugofwar') {
      if (gameState.aiPlayers.length === 0) return;
      // One AI pulls per tick
      const ai  = gameState.aiPlayers[Math.floor(Math.random() * gameState.aiPlayers.length)];
      const dir = ai.team === 'A' ? -1 : 1;
      gameState.ropePosition = Math.max(
        -TOW_CONFIG.WIN_THRESHOLD,
        Math.min(TOW_CONFIG.WIN_THRESHOLD, gameState.ropePosition + dir * TOW_CONFIG.PULL_AMOUNT)
      );
      if (Math.abs(gameState.ropePosition) >= TOW_CONFIG.WIN_THRESHOLD) {
        const winTeam = gameState.ropePosition < 0 ? 'A' : 'B';
        allPlayers().filter(p => p.team === winTeam).forEach(p => p.wins++);
        gameState.status = 'finished';
      }
    } else {
      gameState.aiPlayers.forEach(ai => {
        if (ai.position < GAME_CONFIG.FINISH_LINE) {
          ai.position = Math.min(ai.position + GAME_CONFIG.MOVE_AMOUNT, GAME_CONFIG.FINISH_LINE);
          if (ai.position >= GAME_CONFIG.FINISH_LINE) {
            ai.wins++;
            gameState.status = 'finished';
          }
        }
      });
    }

    broadcastUpdate();
  }, Math.floor(Math.random() *
    (GAME_CONFIG.AI_MOVE_INTERVAL[1] - GAME_CONFIG.AI_MOVE_INTERVAL[0]) +
    GAME_CONFIG.AI_MOVE_INTERVAL[0]));
}

function resetGame() {
  gameState.players.forEach(p => {
    p.position = GAME_CONFIG.START_POSITION;
    p.ready = false;
    p.balloonSize = 0;
    p.lastBalloonTap = 0;
  });
  gameState.aiPlayers.forEach(ai => {
    ai.position = GAME_CONFIG.START_POSITION;
    ai.ready = true;
    ai.balloonSize = 0;
    ai.lastBalloonTap = 0;
  });
  gameState.ropePosition = 0;
  gameState.balloonBurstId = null;

  if (gameState.countdownTimer) { clearInterval(gameState.countdownTimer); gameState.countdownTimer = null; }
  if (gameState.aiInterval) { clearInterval(gameState.aiInterval); gameState.aiInterval = null; }

  gameState.status = 'waiting';
  broadcastUpdate();
}

function startCountdown() {
  gameState.status = 'countdown';
  let count = 3;
  broadcastUpdate({ countdown: count });

  gameState.countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      broadcastUpdate({ countdown: count });
    } else {
      clearInterval(gameState.countdownTimer);
      gameState.status = 'racing';
      startAIMovement();
      broadcastUpdate();
    }
  }, 1000);
}

// ── Per-socket rate limiter factory ──────────────────────────────────────────
// Returns a function that returns true when the call is allowed, false when throttled.
function makeSocketRateLimiter(maxPerSec) {
  let count = 0;
  let windowStart = Date.now();
  return function allow() {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      count = 0;
      windowStart = now;
    }
    count++;
    return count <= maxPerSec;
  };
}

async function setupServer() {
  const server = require('http').createServer(app);

  io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'], credentials: false },
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e4,   // 10 KB max payload per message
  });

  return { server, io };
}

async function startServer() {
  const port = process.env.PORT || 3001;
  const HOST = '0.0.0.0';
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP;

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
    if (localIP) break;
  }

  const { server } = await setupServer();

  io.on('connection', (socket) => {
    console.log('Client connected: ' + socket.id);

    let isPlayer = false;
    let lastMoveAt = 0;                                // anti-cheat: move cooldown
    const allowEvent = makeSocketRateLimiter(GAME_CONFIG.MAX_EVENTS_PER_SEC);

    // Wrap every incoming event with the general rate limiter
    socket.use(([event], next) => {
      if (!allowEvent()) {
        console.warn(`Rate limit exceeded — socket ${socket.id} (event: ${event})`);
        return; // silently drop; don't call next()
      }
      next();
    });

    // ── Display screen: game type selector ─────────────────────────────────
    socket.on('setGameType', (type) => {
      const allowed = ['sprint', 'cycling', 'swimming', 'tugofwar', 'balloon'];
      if (!allowed.includes(type)) return;
      if (gameState.status !== 'waiting') return;  // can't change mid-race
      gameState.gameType = type;
      broadcastUpdate();
    });

    // ── Display screen (TV/laptop) ──────────────────────────────────────────
    socket.on('joinAsDisplay', () => {
      console.log('Display screen connected: ' + socket.id);
      socket.emit('updateGame', {
        players: allPlayers(),
        gameState: gameState.status
      });
    });

    // ── Player (iPad/phone) ─────────────────────────────────────────────────
    socket.on('setName', ({ name, mode } = {}) => {
      // Validate & sanitise name
      const safeName = sanitizeName(name);
      if (!safeName) {
        socket.emit('error', { message: 'Invalid name.' });
        return;
      }

      // Validate mode
      const safeMode = mode === 'ai' ? 'ai' : 'multiplayer';

      if (isPlayer) {
        const player = gameState.players.find(p => p.id === socket.id);
        if (player) { player.name = safeName; broadcastUpdate(); }
        return;
      }

      if (gameState.players.length >= GAME_CONFIG.MAX_PLAYERS) {
        socket.emit('gameFull');
        socket.disconnect();
        return;
      }

      isPlayer = true;
      const lane = gameState.players.length;
      gameState.players.push({
        id: socket.id,
        position: GAME_CONFIG.START_POSITION,
        name: safeName,
        lane,
        color: GAME_CONFIG.COLORS[lane],
        team: lane % 2 === 0 ? 'A' : 'B',
        ready: false,
        wins: 0,
        balloonSize: 0,
        lastBalloonTap: 0,
      });

      gameState.aiPlayers = [];
      if (safeMode === 'ai') {
        for (let i = 0; i < 3; i++) {
          const aiLane = gameState.players.length + i;
          if (aiLane < GAME_CONFIG.MAX_PLAYERS) {
            gameState.aiPlayers.push({
              id: `ai-${i}`,
              name: GAME_CONFIG.AI_NAMES[i],
              position: GAME_CONFIG.START_POSITION,
              lane: aiLane,
              color: GAME_CONFIG.COLORS[aiLane],
              team: aiLane % 2 === 0 ? 'A' : 'B',
              ready: true,
              wins: 0,
              isAI: true,
              balloonSize: 0,
              lastBalloonTap: 0,
            });
          }
        }
      }

      broadcastUpdate();
    });

    socket.on('toggleReady', () => {
      if (!isPlayer) return;
      const player = gameState.players.find(p => p.id === socket.id);
      if (!player || gameState.status !== 'waiting') return;

      player.ready = !player.ready;

      const allReady = gameState.players.every(p => p.ready);
      const total = gameState.players.length + gameState.aiPlayers.length;

      if (allReady && total >= 2) {
        startCountdown();
      } else {
        broadcastUpdate();
      }
    });

    socket.on('move', () => {
      if (!isPlayer || gameState.status !== 'racing') return;

      const now = Date.now();

      // ── Balloon Pop ─────────────────────────────────────────────────────────
      if (gameState.gameType === 'balloon') {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player) return;

        const elapsed = now - player.lastBalloonTap;
        player.lastBalloonTap = now;

        if (elapsed > 0 && elapsed < BALLOON_CONFIG.BURST_COOLDOWN_MS) {
          // Tapped too fast — balloon bursts and resets to 0
          player.balloonSize = 0;
          gameState.balloonBurstId = player.id;
        } else {
          player.balloonSize = Math.min(
            BALLOON_CONFIG.MAX_SIZE,
            player.balloonSize + BALLOON_CONFIG.INFLATE_AMOUNT
          );
          if (player.balloonSize >= BALLOON_CONFIG.MAX_SIZE) {
            player.wins++;
            gameState.status = 'finished';
          }
        }
        broadcastUpdate();
        return;
      }

      // ── Anti-cheat: enforce minimum time between moves ──────────────────
      if (now - lastMoveAt < GAME_CONFIG.MOVE_COOLDOWN_MS) return; // drop silent
      lastMoveAt = now;

      const player = gameState.players.find(p => p.id === socket.id);
      if (!player) return;

      // ── Tug of War ──────────────────────────────────────────────────────
      if (gameState.gameType === 'tugofwar') {
        const dir = player.team === 'A' ? -1 : 1;
        gameState.ropePosition = Math.max(
          -TOW_CONFIG.WIN_THRESHOLD,
          Math.min(TOW_CONFIG.WIN_THRESHOLD, gameState.ropePosition + dir * TOW_CONFIG.PULL_AMOUNT)
        );
        if (Math.abs(gameState.ropePosition) >= TOW_CONFIG.WIN_THRESHOLD) {
          const winTeam = gameState.ropePosition < 0 ? 'A' : 'B';
          allPlayers().filter(p => p.team === winTeam).forEach(p => p.wins++);
          gameState.status = 'finished';
        }
        broadcastUpdate();
        return;
      }

      // ── Racing games ────────────────────────────────────────────────────
      if (player.position >= GAME_CONFIG.FINISH_LINE) return;

      player.position = Math.min(player.position + GAME_CONFIG.MOVE_AMOUNT, GAME_CONFIG.FINISH_LINE);

      if (player.position >= GAME_CONFIG.FINISH_LINE) {
        player.wins++;
        gameState.status = 'finished';
      }

      broadcastUpdate();
    });

    socket.on('requestRestart', () => {
      if (!isPlayer || gameState.status !== 'finished') return;
      resetGame();
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected: ' + socket.id);
      if (!isPlayer) return;

      const index = gameState.players.findIndex(p => p.id === socket.id);
      if (index === -1) return;

      gameState.players.splice(index, 1);
      gameState.players.forEach((p, i) => { p.lane = i; p.color = GAME_CONFIG.COLORS[i]; });

      if (gameState.players.length === 0 ||
          gameState.status === 'countdown' ||
          gameState.status === 'racing') {
        if (gameState.countdownTimer) { clearInterval(gameState.countdownTimer); gameState.countdownTimer = null; }
        if (gameState.aiInterval) { clearInterval(gameState.aiInterval); gameState.aiInterval = null; }
        gameState.status = 'waiting';
        gameState.players.forEach(p => { p.position = GAME_CONFIG.START_POSITION; p.ready = false; });
      }

      broadcastUpdate();
    });
  });

  server.listen(port, HOST, () => {
    console.log(`Game server running on port ${port}`);
    console.log('\nOpen the game:');
    console.log(`  Local:   http://localhost:3000`);
    if (localIP) {
      console.log(`  Network: http://${localIP}:3000`);
      console.log(`\n  TV/Laptop → open the URL, choose "Display Screen"`);
      console.log(`  iPad/Phone → open the URL, choose "I'm a Player"`);
    }
  });
}

startServer().catch(console.error);
