const path = require('path');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: false
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests — slow down.',
}));

let io;

const TOW_CONFIG = {
  WIN_THRESHOLD: 400,
  PULL_AMOUNT: 28,
};

const BALLOON_CONFIG = {
  MAX_SIZE: 100,
  INFLATE_AMOUNT: 4,
  BURST_COOLDOWN_MS: 150,
};

const GAME_CONFIG = {
  MAX_PLAYERS: 4,
  COLORS: ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f'],
  FINISH_LINE: 2000,
  MOVE_AMOUNT: 25,
  START_POSITION: 50,
  AI_MOVE_INTERVAL: [800, 1500],
  AI_NAMES: ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot David'],
  MOVE_COOLDOWN_MS: 80,
  MAX_NAME_LENGTH: 15,
  MAX_EVENTS_PER_SEC: 20,
};

function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/<[^>]*>/g, '')
    .replace(/[^\x20-\x7E -￿]/g, '')
    .trim()
    .slice(0, GAME_CONFIG.MAX_NAME_LENGTH);
  return cleaned.length >= 1 ? cleaned : null;
}

// ── Room management ──────────────────────────────────────────────────────────

const rooms = new Map()       // code -> roomState
const socketRooms = new Map() // socket.id -> roomCode

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const OLYMPICS_MODES = ['sprint', 'cycling', 'swimming', 'eating', 'tugofwar', 'balloon'];

function makeRoomState(code) {
  return {
    code,
    players: [],
    status: 'waiting',
    countdownTimer: null,
    aiPlayers: [],
    aiInterval: null,
    gameType: 'sprint',
    ropePosition: 0,
    balloonBurstId: null,
    olympicsMode: false,
    olympicsRound: 0,
    olympicsAdvanceTimer: null,
  };
}

function allRoomPlayers(room) {
  return [...room.players, ...room.aiPlayers];
}

function broadcastRoomUpdate(room, extra = {}) {
  const burstId = room.balloonBurstId;
  room.balloonBurstId = null;
  io.to(room.code).emit('updateGame', {
    players: allRoomPlayers(room),
    gameState: room.status,
    gameType: room.gameType,
    ropePosition: room.ropePosition,
    roomCode: room.code,
    olympicsMode: room.olympicsMode,
    olympicsRound: room.olympicsRound,
    olympicsTotal: OLYMPICS_MODES.length,
    burstId,
    ...extra,
  });
}

function handleOlympicsFinish(room) {
  if (!room.olympicsMode || room.status !== 'finished') return;

  room.olympicsRound++;
  const isComplete = room.olympicsRound >= OLYMPICS_MODES.length;

  if (isComplete) {
    broadcastRoomUpdate(room, { olympicsComplete: true });
  } else {
    const nextMode = OLYMPICS_MODES[room.olympicsRound];
    broadcastRoomUpdate(room, {
      olympicsRoundComplete: true,
      nextMode,
    });
    room.olympicsAdvanceTimer = setTimeout(() => {
      if (!rooms.has(room.code)) return;
      room.gameType = nextMode;
      resetRoomGame(room);
      room.players.forEach(p => { p.ready = true; });
      room.aiPlayers.forEach(ai => { ai.ready = true; });
      startRoomCountdown(room);
    }, 5000);
  }
}

function startRoomAIMovement(room) {
  if (room.aiInterval) clearInterval(room.aiInterval);

  if (room.gameType === 'balloon') {
    room.aiInterval = setInterval(() => {
      if (room.status !== 'racing') return;
      room.aiPlayers.forEach(ai => {
        if (Math.random() > 0.2) {
          ai.balloonSize = Math.min(BALLOON_CONFIG.MAX_SIZE, ai.balloonSize + BALLOON_CONFIG.INFLATE_AMOUNT);
          if (ai.balloonSize >= BALLOON_CONFIG.MAX_SIZE) {
            ai.wins++;
            room.status = 'finished';
          }
        }
      });
      broadcastRoomUpdate(room);
      handleOlympicsFinish(room);
    }, 220);
    return;
  }

  room.aiInterval = setInterval(() => {
    if (room.status !== 'racing') return;

    if (room.gameType === 'tugofwar') {
      if (room.aiPlayers.length === 0) return;
      const ai = room.aiPlayers[Math.floor(Math.random() * room.aiPlayers.length)];
      const dir = ai.team === 'A' ? -1 : 1;
      room.ropePosition = Math.max(
        -TOW_CONFIG.WIN_THRESHOLD,
        Math.min(TOW_CONFIG.WIN_THRESHOLD, room.ropePosition + dir * TOW_CONFIG.PULL_AMOUNT)
      );
      if (Math.abs(room.ropePosition) >= TOW_CONFIG.WIN_THRESHOLD) {
        const winTeam = room.ropePosition < 0 ? 'A' : 'B';
        allRoomPlayers(room).filter(p => p.team === winTeam).forEach(p => p.wins++);
        room.status = 'finished';
      }
    } else {
      room.aiPlayers.forEach(ai => {
        if (ai.position < GAME_CONFIG.FINISH_LINE) {
          ai.position = Math.min(ai.position + GAME_CONFIG.MOVE_AMOUNT, GAME_CONFIG.FINISH_LINE);
          if (ai.position >= GAME_CONFIG.FINISH_LINE) {
            ai.wins++;
            room.status = 'finished';
          }
        }
      });
    }

    broadcastRoomUpdate(room);
    handleOlympicsFinish(room);
  }, Math.floor(Math.random() *
    (GAME_CONFIG.AI_MOVE_INTERVAL[1] - GAME_CONFIG.AI_MOVE_INTERVAL[0]) +
    GAME_CONFIG.AI_MOVE_INTERVAL[0]));
}

function resetRoomGame(room) {
  room.players.forEach(p => {
    p.position = GAME_CONFIG.START_POSITION;
    p.ready = false;
    p.balloonSize = 0;
    p.lastBalloonTap = 0;
  });
  room.aiPlayers.forEach(ai => {
    ai.position = GAME_CONFIG.START_POSITION;
    ai.ready = true;
    ai.balloonSize = 0;
    ai.lastBalloonTap = 0;
  });
  room.ropePosition = 0;
  room.balloonBurstId = null;

  if (room.countdownTimer) { clearInterval(room.countdownTimer); room.countdownTimer = null; }
  if (room.aiInterval) { clearInterval(room.aiInterval); room.aiInterval = null; }
  if (room.olympicsAdvanceTimer) { clearTimeout(room.olympicsAdvanceTimer); room.olympicsAdvanceTimer = null; }

  room.status = 'waiting';
  broadcastRoomUpdate(room);
}

function startRoomCountdown(room) {
  room.status = 'countdown';
  let count = 3;
  broadcastRoomUpdate(room, { countdown: count });

  room.countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      broadcastRoomUpdate(room, { countdown: count });
    } else {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
      room.status = 'racing';
      startRoomAIMovement(room);
      broadcastRoomUpdate(room);
    }
  }, 1000);
}

function makeSocketRateLimiter(maxPerSec) {
  let count = 0;
  let windowStart = Date.now();
  return function allow() {
    const now = Date.now();
    if (now - windowStart >= 1000) { count = 0; windowStart = now; }
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
    maxHttpBufferSize: 1e4,
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
    let lastMoveAt = 0;
    const allowEvent = makeSocketRateLimiter(GAME_CONFIG.MAX_EVENTS_PER_SEC);

    socket.use(([event], next) => {
      if (!allowEvent()) {
        console.warn(`Rate limit exceeded — socket ${socket.id} (event: ${event})`);
        return;
      }
      next();
    });

    // ── Display screen: creates a new room ────────────────────────────────────
    socket.on('joinAsDisplay', () => {
      console.log('Display screen connected: ' + socket.id);
      const code = generateRoomCode();
      const room = makeRoomState(code);
      rooms.set(code, room);
      socket.join(code);
      socketRooms.set(socket.id, code);
      socket.emit('roomCreated', { code });
      broadcastRoomUpdate(room);
    });

    // ── Spectator: join a room by code, watch only ───────────────────────────
    socket.on('joinAsSpectator', ({ code: rawCode } = {}) => {
      const roomCode = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
      const room = rooms.get(roomCode);
      if (!room) { socket.emit('roomNotFound'); return; }
      socket.join(roomCode);
      socketRooms.set(socket.id, roomCode);
      socket.emit('updateGame', {
        players: allRoomPlayers(room),
        gameState: room.status,
        gameType: room.gameType,
        ropePosition: room.ropePosition,
        roomCode: room.code,
        olympicsMode: room.olympicsMode,
        olympicsRound: room.olympicsRound,
        olympicsTotal: OLYMPICS_MODES.length,
      });
    });

    // ── Display screen: toggle Olympics mode ─────────────────────────────────
    socket.on('setOlympicsMode', (enabled) => {
      const code = socketRooms.get(socket.id);
      const room = rooms.get(code);
      if (!room || room.status !== 'waiting') return;
      room.olympicsMode = !!enabled;
      room.olympicsRound = 0;
      if (room.olympicsMode) room.gameType = OLYMPICS_MODES[0];
      broadcastRoomUpdate(room);
    });

    // ── Display screen: game type selector ────────────────────────────────────
    socket.on('setGameType', (type) => {
      const code = socketRooms.get(socket.id);
      const room = rooms.get(code);
      if (!room) return;
      const allowed = ['sprint', 'cycling', 'swimming', 'eating', 'tugofwar', 'balloon'];
      if (!allowed.includes(type)) return;
      if (room.status !== 'waiting') return;
      room.gameType = type;
      broadcastRoomUpdate(room);
    });

    // ── Player: join a room by code ───────────────────────────────────────────
    socket.on('joinRoom', ({ code: rawCode, name, mode, color: rawColor } = {}) => {
      const roomCode = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
      const room = rooms.get(roomCode);

      if (!room) {
        socket.emit('roomNotFound');
        return;
      }
      if (room.status !== 'waiting') {
        socket.emit('gameAlreadyStarted');
        return;
      }

      const safeName = sanitizeName(name);
      if (!safeName) {
        socket.emit('error', { message: 'Invalid name.' });
        return;
      }

      if (isPlayer) {
        const player = room.players.find(p => p.id === socket.id);
        if (player) { player.name = safeName; broadcastRoomUpdate(room); }
        return;
      }

      if (room.players.length >= GAME_CONFIG.MAX_PLAYERS) {
        socket.emit('gameFull');
        return;
      }

      isPlayer = true;
      socket.join(roomCode);
      socketRooms.set(socket.id, roomCode);

      const safeMode = mode === 'ai' ? 'ai' : 'multiplayer';
      const safeColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : GAME_CONFIG.COLORS[room.players.length % GAME_CONFIG.COLORS.length];
      const lane = room.players.length;
      room.players.push({
        id: socket.id,
        position: GAME_CONFIG.START_POSITION,
        name: safeName,
        lane,
        color: safeColor,
        team: lane % 2 === 0 ? 'A' : 'B',
        ready: false,
        wins: 0,
        balloonSize: 0,
        lastBalloonTap: 0,
      });

      room.aiPlayers = [];
      if (safeMode === 'ai') {
        for (let i = 0; i < 3; i++) {
          const aiLane = room.players.length + i;
          if (aiLane < GAME_CONFIG.MAX_PLAYERS) {
            room.aiPlayers.push({
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

      broadcastRoomUpdate(room);
    });

    socket.on('toggleReady', () => {
      const code = socketRooms.get(socket.id);
      const room = rooms.get(code);
      if (!room || !isPlayer) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player || room.status !== 'waiting') return;

      player.ready = !player.ready;

      const allReady = room.players.every(p => p.ready);
      const total = room.players.length + room.aiPlayers.length;

      if (allReady && total >= 2) {
        startRoomCountdown(room);
      } else {
        broadcastRoomUpdate(room);
      }
    });

    socket.on('move', () => {
      const code = socketRooms.get(socket.id);
      const room = rooms.get(code);
      if (!room || !isPlayer || room.status !== 'racing') return;

      const now = Date.now();

      if (room.gameType === 'balloon') {
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        const elapsed = now - player.lastBalloonTap;
        player.lastBalloonTap = now;
        if (elapsed > 0 && elapsed < BALLOON_CONFIG.BURST_COOLDOWN_MS) {
          player.balloonSize = 0;
          room.balloonBurstId = player.id;
        } else {
          player.balloonSize = Math.min(BALLOON_CONFIG.MAX_SIZE, player.balloonSize + BALLOON_CONFIG.INFLATE_AMOUNT);
          if (player.balloonSize >= BALLOON_CONFIG.MAX_SIZE) {
            player.wins++;
            room.status = 'finished';
          }
        }
        broadcastRoomUpdate(room);
        handleOlympicsFinish(room);
        return;
      }

      if (now - lastMoveAt < GAME_CONFIG.MOVE_COOLDOWN_MS) return;
      lastMoveAt = now;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      if (room.gameType === 'tugofwar') {
        const dir = player.team === 'A' ? -1 : 1;
        room.ropePosition = Math.max(
          -TOW_CONFIG.WIN_THRESHOLD,
          Math.min(TOW_CONFIG.WIN_THRESHOLD, room.ropePosition + dir * TOW_CONFIG.PULL_AMOUNT)
        );
        if (Math.abs(room.ropePosition) >= TOW_CONFIG.WIN_THRESHOLD) {
          const winTeam = room.ropePosition < 0 ? 'A' : 'B';
          allRoomPlayers(room).filter(p => p.team === winTeam).forEach(p => p.wins++);
          room.status = 'finished';
        }
        broadcastRoomUpdate(room);
        handleOlympicsFinish(room);
        return;
      }

      if (player.position >= GAME_CONFIG.FINISH_LINE) return;
      player.position = Math.min(player.position + GAME_CONFIG.MOVE_AMOUNT, GAME_CONFIG.FINISH_LINE);
      if (player.position >= GAME_CONFIG.FINISH_LINE) {
        player.wins++;
        room.status = 'finished';
      }

      broadcastRoomUpdate(room);
      handleOlympicsFinish(room);
    });

    socket.on('requestRestart', () => {
      const code = socketRooms.get(socket.id);
      const room = rooms.get(code);
      if (!room || !isPlayer || room.status !== 'finished') return;
      if (room.olympicsMode && room.olympicsAdvanceTimer) return; // auto-advancing, ignore
      room.olympicsMode = false;
      room.olympicsRound = 0;
      resetRoomGame(room);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected: ' + socket.id);
      const code = socketRooms.get(socket.id);
      socketRooms.delete(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      if (!isPlayer) return;

      const index = room.players.findIndex(p => p.id === socket.id);
      if (index === -1) return;

      room.players.splice(index, 1);
      room.players.forEach((p, i) => { p.lane = i; p.color = GAME_CONFIG.COLORS[i]; });

      if (room.players.length === 0) {
        if (room.countdownTimer) clearInterval(room.countdownTimer);
        if (room.aiInterval) clearInterval(room.aiInterval);
        rooms.delete(code);
        return;
      }

      if (room.status === 'countdown' || room.status === 'racing') {
        if (room.countdownTimer) { clearInterval(room.countdownTimer); room.countdownTimer = null; }
        if (room.aiInterval) { clearInterval(room.aiInterval); room.aiInterval = null; }
        room.status = 'waiting';
        room.players.forEach(p => { p.position = GAME_CONFIG.START_POSITION; p.ready = false; });
      }

      broadcastRoomUpdate(room);
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
