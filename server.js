const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve frontend static files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Global multiplayer state
const players = new Map();
let ballState = { x: 34.0, y: 0.82, z: 0.0, vx: 0, vz: 0 };
let scores = { blue: 0, red: 0 };

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Initialize player in the lobby
  players.set(socket.id, {
    id: socket.id,
    x: 32.0,
    y: 0.44,
    z: 2.5,
    yaw: 0,
    isSolid: true
  });

  // Send current players and ball state to the newly joined player
  socket.emit('current_players', Array.from(players.values()));
  socket.emit('ball_update', ballState);
  socket.emit('score_update', scores);

  // Listen for player movement from a client
  socket.on('player_move', (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.yaw = data.yaw;

      // Broadcast updated position to everyone else
      socket.broadcast.emit('update_player', player);
    }
  });

  // Listen for football bumps/kicks from clients
  socket.on('hit_ball', (data) => {
    ballState.x = data.x;
    ballState.z = data.z;
    ballState.vx = data.vx;
    ballState.vz = data.vz;
    // Broadcast ball movement to all other clients
    socket.broadcast.emit('ball_update', ballState);
  });

  // Listen for goals scored
  socket.on('goal_scored', (team) => {
    if (team === 'blue') scores.blue++;
    if (team === 'red') scores.red++;
    ballState = { x: 34.0, y: 0.82, z: 0.0, vx: 0, vz: 0 };
    io.emit('score_update', scores);
    io.emit('ball_update', ballState);
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    players.delete(socket.id);
    io.emit('remove_player', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`The Goody Tonight Show server running on port ${PORT}`);
});
