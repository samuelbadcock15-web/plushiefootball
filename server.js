const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname)));

const players = new Map();
const lobbyPlayers = new Map();

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send existing active players
  players.forEach((playerData) => {
    socket.emit('update_player', playerData);
  });

  // Handle Lobby join & chat/presence
  socket.on('join_lobby', (data) => {
    if (lobbyPlayers.size >= 30) {
      socket.emit('lobby_full');
      return;
    }
    lobbyPlayers.set(socket.id, {
      id: socket.id,
      name: data.name || `Player ${lobbyPlayers.size + 1}`,
      ready: false
    });
    io.emit('sync_lobby', Array.from(lobbyPlayers.values()));
  });

  socket.on('toggle_ready', (readyStatus) => {
    const p = lobbyPlayers.get(socket.id);
    if (p) {
      p.ready = readyStatus;
      io.emit('sync_lobby', Array.from(lobbyPlayers.values()));
    }
  });

  socket.on('start_game_from_lobby', () => {
    io.emit('enter_main_game');
  });

  // Handle real-time plushie movement synchronization
  socket.on('player_move', (data) => {
    players.set(socket.id, {
      id: socket.id,
      x: data.x,
      y: data.y,
      z: data.z,
      yaw: data.yaw,
      isSolid: data.isSolid !== undefined ? data.isSolid : true
    });
    socket.broadcast.emit('update_player', players.get(socket.id));
  });

  socket.on('sync_ball', (data) => {
    socket.broadcast.emit('sync_ball', data);
  });

  socket.on('start_podium_countdown', (data) => {
    socket.broadcast.emit('start_podium_countdown', data);
  });

  socket.on('cancel_podium_countdown', () => {
    socket.broadcast.emit('cancel_podium_countdown');
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    players.delete(socket.id);
    lobbyPlayers.delete(socket.id);
    io.emit('remove_player', socket.id);
    io.emit('sync_lobby', Array.from(lobbyPlayers.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Goody Tonight Show server running on port ${PORT}`);
});
