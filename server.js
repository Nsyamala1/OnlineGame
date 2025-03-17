const path = require('path');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();

// Enable CORS for Express
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: false
}));

// Socket.io instance
let io;

// Game state
const gameState = {
  players: [],
  status: 'waiting', // waiting, countdown, racing, finished
  countdownTimer: null,
  aiPlayers: [],
  aiInterval: null
};

// Game constants
const GAME_CONFIG = {
  MAX_PLAYERS: 4,
  COLORS: ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f'],
  FINISH_LINE: 2000,
  MOVE_AMOUNT: 25,
  START_POSITION: 50,
  AI_MOVE_INTERVAL: [800, 1500], // Random interval between moves for AI
  AI_NAMES: ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot David']
};

// Handle AI movement
function startAIMovement() {
  if (gameState.aiInterval) {
    clearInterval(gameState.aiInterval);
  }

  gameState.aiInterval = setInterval(() => {
    if (gameState.status === 'racing') {
      gameState.aiPlayers.forEach(ai => {
        if (ai.position < GAME_CONFIG.FINISH_LINE) {
          ai.position = Math.min(
            ai.position + GAME_CONFIG.MOVE_AMOUNT,
            GAME_CONFIG.FINISH_LINE
          );

          if (ai.position >= GAME_CONFIG.FINISH_LINE) {
            ai.wins++;
            gameState.status = 'finished';
          }
        }
      });

      io.emit('updateGame', {
        players: [...gameState.players, ...gameState.aiPlayers],
        gameState: gameState.status
      });
    }
  }, Math.floor(Math.random() * 
    (GAME_CONFIG.AI_MOVE_INTERVAL[1] - GAME_CONFIG.AI_MOVE_INTERVAL[0]) + 
    GAME_CONFIG.AI_MOVE_INTERVAL[0]));
}

// Reset game state
function resetGame() {
  gameState.players.forEach(player => {
    player.position = GAME_CONFIG.START_POSITION;
    player.ready = false;
  });
  gameState.aiPlayers.forEach(ai => {
    ai.position = GAME_CONFIG.START_POSITION;
    ai.ready = true;
  });
  if (gameState.countdownTimer) {
    clearInterval(gameState.countdownTimer);
    gameState.countdownTimer = null;
  }
  if (gameState.aiInterval) {
    clearInterval(gameState.aiInterval);
    gameState.aiInterval = null;
  }
  gameState.status = 'waiting';
  io.emit('updateGame', { 
    players: [...gameState.players, ...gameState.aiPlayers], 
    gameState: gameState.status 
  });
}

// Start countdown
function startCountdown() {
  gameState.status = 'countdown';
  let count = 3;
  io.emit('updateGame', { 
    players: [...gameState.players, ...gameState.aiPlayers], 
    gameState: gameState.status, 
    countdown: count 
  });

  gameState.countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      io.emit('updateGame', { 
        players: [...gameState.players, ...gameState.aiPlayers], 
        gameState: gameState.status, 
        countdown: count 
      });
    } else {
      clearInterval(gameState.countdownTimer);
      gameState.status = 'racing';
      startAIMovement();
      io.emit('updateGame', { 
        players: [...gameState.players, ...gameState.aiPlayers], 
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
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: false
    },
    transports: ['polling', 'websocket'],
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

  // Add AI players
function addAIPlayers() {
  // Clear existing AI players
  gameState.aiPlayers = [];
  
  // Add AI players if there's only one human player
  if (gameState.players.length === 1) {
    const numAI = 1; // Add one AI opponent
    for (let i = 0; i < numAI; i++) {
      const aiIndex = gameState.players.length + i;
      if (aiIndex < GAME_CONFIG.MAX_PLAYERS) {
        gameState.aiPlayers.push({
          id: `ai-${i}`,
          position: GAME_CONFIG.START_POSITION,
          name: GAME_CONFIG.AI_NAMES[i],
          lane: aiIndex,
          color: GAME_CONFIG.COLORS[aiIndex],
          ready: true,
          wins: 0,
          isAI: true
        });
      }
    }
  }
}



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

    socket.on('setName', ({ name, mode }) => {
      const player = gameState.players.find(p => p.id === socket.id);
      if (player) {
        player.name = name;
        
        // Clear existing AI players
        gameState.aiPlayers = [];
        
        // Add AI players if AI mode is selected
        if (mode === 'ai') {
          const numAiPlayers = 3; // Add 3 AI players
          for (let i = 0; i < numAiPlayers; i++) {
            const aiIndex = gameState.players.length + i;
            if (aiIndex < GAME_CONFIG.MAX_PLAYERS) {
              gameState.aiPlayers.push({
                id: `ai-${i}`,
                name: GAME_CONFIG.AI_NAMES[i],
                position: GAME_CONFIG.START_POSITION,
                lane: aiIndex,
                color: GAME_CONFIG.COLORS[aiIndex],
                ready: true,
                wins: 0,
                isAI: true
              });
            }
          }
          // Start AI movement when in AI mode
          startAIMovement();
        }
        
        io.emit('updateGame', { 
          players: [...gameState.players, ...gameState.aiPlayers], 
          gameState: gameState.status 
        });
      }
    });

    socket.on('toggleReady', () => {
      const player = gameState.players.find(p => p.id === socket.id);
      if (player && gameState.status === 'waiting') {
        player.ready = !player.ready;
        console.log(`Player ${player.name} ready state: ${player.ready}`);
        
        // Check if all players (including AI) are ready
        const allPlayersReady = gameState.players.every(p => p.ready);
        const totalPlayers = gameState.players.length + gameState.aiPlayers.length;
        
        // Start game if all players are ready and there's at least one human and one AI
        if (allPlayersReady && totalPlayers >= 2) {
          startCountdown();
        } else {
          io.emit('updateGame', { 
            players: [...gameState.players, ...gameState.aiPlayers], 
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
