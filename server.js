const path = require('path');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();

// Enable CORS for Express
// Enable CORS for all origins
app.use(cors());

// Socket.io instance
let io;

// Game state
const gameState = {
  players: [],
  status: 'waiting', // waiting, countdown, racing, finished
  countdownTimer: null
};

// Game constants
const GAME_CONFIG = {
  MAX_PLAYERS: 4,
  COLORS: ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f'],
  FINISH_LINE: 2000,
  MOVE_AMOUNT: 25,
  START_POSITION: 50
};

// Reset game state
function resetGame() {
  gameState.players.forEach(player => {
    player.position = GAME_CONFIG.START_POSITION;
    player.ready = false;
  });
  if (gameState.countdownTimer) {
    clearInterval(gameState.countdownTimer);
    gameState.countdownTimer = null;
  }
  gameState.status = 'waiting';
  io.emit('updateGame', { 
    players: gameState.players, 
    gameState: gameState.status 
  });
}

// Start countdown
function startCountdown() {
  gameState.status = 'countdown';
  let count = 3;
  io.emit('updateGame', { 
    players: gameState.players, 
    gameState: gameState.status, 
    countdown: count 
  });

  gameState.countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      io.emit('updateGame', { 
        players: gameState.players, 
        gameState: gameState.status, 
        countdown: count 
      });
    } else {
      clearInterval(gameState.countdownTimer);
      gameState.status = 'racing';
      io.emit('updateGame', { 
        players: gameState.players, 
        gameState: gameState.status 
      });
    }
  }, 1000);
}

// Create server
async function setupServer() {
  const server = require('http').createServer(app);

  io = socketIo(server, {
    cors: {
      origin: ['http://localhost:3000', 'http://10.1.10.160:3000'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  return { server, io };
}

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));



// Start the secure server
async function startServer() {
  const port = process.env.PORT || 3001;
  const HOST = '0.0.0.0';
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP;

  // Get local IP address
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
    if (localIP) break;
  }

  const { server } = await setupServer();

  // Set up socket event handlers
  io.on('connection', (socket) => {
    console.log('New player connected: ' + socket.id);

    if (gameState.players.length >= GAME_CONFIG.MAX_PLAYERS) {
      socket.emit('gameFull');
      socket.disconnect();
      return;
    }

    // Add new player with next available lane
    const newPlayerIndex = gameState.players.length;
    gameState.players.push({ 
      id: socket.id, 
      position: GAME_CONFIG.START_POSITION, 
      name: 'Anonymous',
      lane: newPlayerIndex,
      color: GAME_CONFIG.COLORS[newPlayerIndex],
      ready: false,
      wins: 0
    });

    io.emit('updateGame', { 
      players: gameState.players, 
      gameState: gameState.status 
    });

    socket.on('setName', (name) => {
      const player = gameState.players.find(p => p.id === socket.id);
      if (player) {
        player.name = name;
        io.emit('updateGame', { 
          players: gameState.players, 
          gameState: gameState.status 
        });
      }
    });

    socket.on('toggleReady', () => {
      const player = gameState.players.find(p => p.id === socket.id);
      if (player && gameState.status === 'waiting') {
        player.ready = !player.ready;
        console.log(`Player ${player.name} ready state: ${player.ready}`);
        
        // Check if all players are ready and there are at least 2 players
        const allReady = gameState.players.length >= 2 && gameState.players.every(p => p.ready);
        console.log(`Players ready: ${gameState.players.filter(p => p.ready).length}/${gameState.players.length}`);
        
        if (allReady) {
          startCountdown();
        } else {
          io.emit('updateGame', { 
            players: gameState.players, 
            gameState: gameState.status 
          });
        }
      }
    });

    socket.on('move', () => {
      if (gameState.status !== 'racing') return;

      const player = gameState.players.find(p => p.id === socket.id);
      if (player && player.position < GAME_CONFIG.FINISH_LINE) {
        // Move player
        player.position = Math.min(
          player.position + GAME_CONFIG.MOVE_AMOUNT, 
          GAME_CONFIG.FINISH_LINE
        );

        // Check win condition - only win if exactly at or past finish line
        if (player.position >= GAME_CONFIG.FINISH_LINE) {
          player.wins++;
          gameState.status = 'finished';
        }

        io.emit('updateGame', { 
          players: gameState.players, 
          gameState: gameState.status 
        });
      }
    });

    socket.on('requestRestart', () => {
      if (gameState.status === 'finished') {
        resetGame();
      }
    });

    socket.on('disconnect', () => {
      console.log('Player disconnected: ' + socket.id);
      const index = gameState.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        gameState.players.splice(index, 1);
        // Reassign lanes and colors for remaining players
        gameState.players.forEach((p, i) => {
          p.lane = i;
          p.color = GAME_CONFIG.COLORS[i];
        });
        
        // Reset game if not enough players or if a player disconnects during countdown/racing
        if (gameState.players.length <= 1 || 
            gameState.status === 'countdown' || 
            gameState.status === 'racing') {
          if (gameState.countdownTimer) {
            clearInterval(gameState.countdownTimer);
            gameState.countdownTimer = null;
          }
          gameState.status = 'waiting';
          gameState.players.forEach(p => {
            p.position = GAME_CONFIG.START_POSITION;
            p.ready = false;
          });
        }
        io.emit('updateGame', { 
          players: gameState.players, 
          gameState: gameState.status 
        });
      }
    });

    socket.on('requestRestart', () => {
      if (gameState.status === 'finished') {
        resetGame();
      }
    });

    socket.on('disconnect', () => {
      console.log('Player disconnected: ' + socket.id);
      const index = gameState.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        gameState.players.splice(index, 1);
        // Reassign lanes and colors for remaining players
        gameState.players.forEach((p, i) => {
          p.lane = i;
          p.color = GAME_CONFIG.COLORS[i];
        });
        
        // Reset game if not enough players or if a player disconnects during countdown/racing
        if (gameState.players.length <= 1 || 
            gameState.status === 'countdown' || 
            gameState.status === 'racing') {
          if (gameState.countdownTimer) {
            clearInterval(gameState.countdownTimer);
            gameState.countdownTimer = null;
          }
          gameState.status = 'waiting';
          gameState.players.forEach(p => {
            p.position = GAME_CONFIG.START_POSITION;
            p.ready = false;
          });
        }
        io.emit('updateGame', { 
          players: gameState.players, 
          gameState: gameState.status 
        });
      }
    });
  });

  server.listen(port, HOST, () => {
    console.log(`Game server running on port ${port}`);
    console.log('\nAccess the game at:');
    console.log(`- Local: http://localhost:3000`);
    if (localIP) {
      console.log(`- Network: http://${localIP}:3000`);
    }
  });
}

// Start the server
startServer().catch(console.error);
