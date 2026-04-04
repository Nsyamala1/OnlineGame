const path = require('path');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: false
}));

let io;

const gameState = {
  players: [],
  status: 'waiting', // waiting, countdown, racing, finished
  countdownTimer: null,
  aiPlayers: [],
  aiInterval: null
};

const GAME_CONFIG = {
  MAX_PLAYERS: 4,
  COLORS: ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f'],
  FINISH_LINE: 2000,
  MOVE_AMOUNT: 25,
  START_POSITION: 50,
  AI_MOVE_INTERVAL: [800, 1500],
  AI_NAMES: ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot David']
};

function allPlayers() {
  return [...gameState.players, ...gameState.aiPlayers];
}

function broadcastUpdate(extra = {}) {
  io.emit('updateGame', {
    players: allPlayers(),
    gameState: gameState.status,
    ...extra
  });
}

function startAIMovement() {
  if (gameState.aiInterval) clearInterval(gameState.aiInterval);

  gameState.aiInterval = setInterval(() => {
    if (gameState.status !== 'racing') return;

    gameState.aiPlayers.forEach(ai => {
      if (ai.position < GAME_CONFIG.FINISH_LINE) {
        ai.position = Math.min(ai.position + GAME_CONFIG.MOVE_AMOUNT, GAME_CONFIG.FINISH_LINE);
        if (ai.position >= GAME_CONFIG.FINISH_LINE) {
          ai.wins++;
          gameState.status = 'finished';
        }
      }
    });

    broadcastUpdate();
  }, Math.floor(Math.random() *
    (GAME_CONFIG.AI_MOVE_INTERVAL[1] - GAME_CONFIG.AI_MOVE_INTERVAL[0]) +
    GAME_CONFIG.AI_MOVE_INTERVAL[0]));
}

function resetGame() {
  gameState.players.forEach(p => { p.position = GAME_CONFIG.START_POSITION; p.ready = false; });
  gameState.aiPlayers.forEach(ai => { ai.position = GAME_CONFIG.START_POSITION; ai.ready = true; });

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

async function setupServer() {
  const server = require('http').createServer(app);

  io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'], credentials: false },
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000
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

    // ── Display screen (TV/laptop) ──────────────────────────────────────────
    // Joins as spectator — does NOT create a player slot
    socket.on('joinAsDisplay', () => {
      console.log('Display screen connected: ' + socket.id);
      // Send current state immediately so the display can render
      socket.emit('updateGame', {
        players: allPlayers(),
        gameState: gameState.status
      });
    });

    // ── Player (iPad/phone) ─────────────────────────────────────────────────
    // Player is only created here — not on raw connection
    socket.on('setName', ({ name, mode }) => {
      if (isPlayer) {
        // Player already exists — just update name (e.g. reconnect)
        const player = gameState.players.find(p => p.id === socket.id);
        if (player) { player.name = name; broadcastUpdate(); }
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
        name,
        lane,
        color: GAME_CONFIG.COLORS[lane],
        ready: false,
        wins: 0
      });

      // AI opponents
      gameState.aiPlayers = [];
      if (mode === 'ai') {
        for (let i = 0; i < 3; i++) {
          const aiLane = gameState.players.length + i;
          if (aiLane < GAME_CONFIG.MAX_PLAYERS) {
            gameState.aiPlayers.push({
              id: `ai-${i}`,
              name: GAME_CONFIG.AI_NAMES[i],
              position: GAME_CONFIG.START_POSITION,
              lane: aiLane,
              color: GAME_CONFIG.COLORS[aiLane],
              ready: true,
              wins: 0,
              isAI: true
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

      const player = gameState.players.find(p => p.id === socket.id);
      if (!player || player.position >= GAME_CONFIG.FINISH_LINE) return;

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
