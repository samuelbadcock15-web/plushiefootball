const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Track active players connected to the studio
const activePlayers = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Assign a default guest name
  const defaultName = `Guest ${Math.floor(Math.random() * 900 + 100)}`;
  activePlayers.set(socket.id, { id: socket.id, name: defaultName, x: 32.0, y: 0.44, z: 2.5, yaw: 0 });

  // Send current players list to the newly connected client
  socket.emit('current_players', Array.from(activePlayers.values()));

  // Handle player avatar movement & rotation updates
  socket.on('player_move', (data) => {
    const player = activePlayers.get(socket.id);
    if (player) {
      player.name = data.name || player.name;
      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.yaw = data.yaw;

      // Broadcast updated player position to everyone else
      socket.broadcast.emit('update_player', player);
    }
  });

  // Handle real-time ball movement and physics synchronization
  socket.on('ball_move', (bData) => {
    // Broadcast ball coordinates and velocity to all other connected clients
    socket.broadcast.emit('ball_sync', bData);
  });

  // Handle goal scores and reset triggers
  socket.on('score_update', (sData) => {
    // Broadcast updated score to all clients (including sender)
    io.emit('score_sync', sData);
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    activePlayers.delete(socket.id);
    io.emit('remove_player', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`The Goody Tonight Show server running on http://localhost:${PORT}`);
});
