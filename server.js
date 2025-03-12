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

io.on('connection', (socket) => {
  console.log('New player connected: ' + socket.id);

  players.push({ id: socket.id, position: 10, name: 'Anonymous' });

  socket.on('setName', (name) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.name = name;
      io.emit('updatePositions', players);
    }
  });

  socket.on('move', () => {
    const player = players.find(p => p.id === socket.id);
    if (player && player.position < 570) {
      player.position += 10;
    }

    io.emit('updatePositions', players);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected: ' + socket.id);
    players = players.filter(p => p.id !== socket.id);
    io.emit('updatePositions', players);
  });
});

const port = process.env.PORT || 3001;
const HOST = '0.0.0.0';

server.listen(port, HOST, () => {
  console.log(`Server running on http://${HOST}:${port}`);
  console.log('Local access: http://localhost:' + port);
});
