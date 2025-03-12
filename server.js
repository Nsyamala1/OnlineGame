const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();

// Enable CORS for Express
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

let players = [];
let gameState = 'waiting'; // waiting, countdown, racing, finished
let countdownTimer = null;
const MAX_PLAYERS = 4;
const COLORS = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f'];

function resetGame() {
  players.forEach(player => {
    player.position = 50;
    player.ready = false;
  });
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  gameState = 'waiting';
  io.emit('updateGame', { players, gameState });
}

function startCountdown() {
  gameState = 'countdown';
  let count = 3;
  io.emit('updateGame', { players, gameState, countdown: count });

  countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      io.emit('updateGame', { players, gameState, countdown: count });
    } else {
      clearInterval(countdownTimer);
      gameState = 'racing';
      io.emit('updateGame', { players, gameState });
    }
  }, 1000);
}

io.on('connection', (socket) => {
  console.log('New player connected: ' + socket.id);

  if (players.length >= MAX_PLAYERS) {
    socket.emit('gameFull');
    socket.disconnect();
    return;
  }

  const lane = players.length; // 0-3 for lanes
  players.push({ 
    id: socket.id, 
    position: 50, 
    name: 'Anonymous',
    lane: lane,
    color: COLORS[lane],
    ready: false,
    wins: 0
  });

  io.emit('updateGame', { players, gameState });

  socket.on('setName', (name) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.name = name;
      io.emit('updateGame', { players, gameState });
    }
  });

  socket.on('toggleReady', () => {
    const player = players.find(p => p.id === socket.id);
    if (player && gameState === 'waiting') {
      player.ready = !player.ready;
      console.log(`Player ${player.name} ready state: ${player.ready}`);
      
      // Check if all players are ready and there are at least 2 players
      const allReady = players.length >= 2 && players.every(p => p.ready);
      console.log(`Players ready: ${players.filter(p => p.ready).length}/${players.length}`);
      
      if (allReady) {
        startCountdown();
      } else {
        io.emit('updateGame', { players, gameState });
      }
    }
  });

  socket.on('move', () => {
    if (gameState !== 'racing') return;

    const player = players.find(p => p.id === socket.id);
    const FINISH_LINE = 2000;
    if (player && player.position < FINISH_LINE) {
      // Move player
      const moveAmount = 25;
      player.position = Math.min(player.position + moveAmount, FINISH_LINE);

      // Check win condition - only win if exactly at or past finish line
      if (player.position >= FINISH_LINE) {
        player.wins++;
        gameState = 'finished';
      }

      io.emit('updateGame', { players, gameState });
    }
  });

  socket.on('requestRestart', () => {
    if (gameState === 'finished') {
      resetGame();
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected: ' + socket.id);
    const index = players.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      players.splice(index, 1);
      // Reassign lanes and colors for remaining players
      players.forEach((p, i) => {
        p.lane = i;
        p.color = COLORS[i];
      });
      
      // Reset game if not enough players or if a player disconnects during countdown/racing
      if (players.length <= 1 || gameState === 'countdown' || gameState === 'racing') {
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        gameState = 'waiting';
        players.forEach(p => {
          p.position = 50;
          p.ready = false;
        });
      }
      io.emit('updateGame', { players, gameState });
    }
  });
});

const port = process.env.PORT || 3001;
const HOST = '0.0.0.0';

server.listen(port, HOST, () => {
  console.log(`Server running on http://${HOST}:${port}`);
  console.log('Local access: http://localhost:' + port);
  
  // Get local IP address for sharing
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const results = {};

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        console.log('\nShare this link with your friends:');
        console.log(`http://${net.address}:${port}`);
        break;
      }
    }
  }
});
