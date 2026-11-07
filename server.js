const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current working directory
app.use(express.static(path.join(__dirname)));

// Track active players connected to the studio & arena
const activePlayers = new Map();
let ballPhysicsHostId = null; // Tracks which client has physics authority over the ball

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Assign player slot & name based on connection order
  const playerIndex = activePlayers.size;
  const defaultName = playerIndex === 0 ? "Player 1" : `Player ${playerIndex + 1}`;
  
  activePlayers.set(socket.id, { 
    id: socket.id, 
    name: defaultName, 
    x: 32.0, 
    y: 0.44, 
    z: 2.5, 
    yaw: 0,
    playerNum: playerIndex + 1
  });

  // Designate the first connected client as the ball physics host
  if (!ballPhysicsHostId) {
    ballPhysicsHostId = socket.id;
  }
  
  // Inform this client whether they are the designated ball physics host
  socket.emit('ball_host_assignment', { isHost: socket.id === ballPhysicsHostId });

  // Broadcast current players list to everyone
  io.emit('current_players', Array.from(activePlayers.values()));

  // Handle player avatar movement & rotation updates
  socket.on('player_move', (data) => {
    const player = activePlayers.get(socket.id);
    if (player) {
      player.name = data.name || player.name;
      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.yaw = data.yaw;
      player.playerNum = data.playerNum || player.playerNum;

      // Broadcast updated player position to everyone else
      socket.broadcast.emit('update_player', player);
    }
  });

  // Handle real-time ball movement and physics synchronization from the host
  socket.on('ball_move', (bData) => {
    socket.broadcast.emit('ball_sync', bData);
  });

  // Handle goal scores and reset triggers
  socket.on('score_update', (sData) => {
    io.emit('score_sync', sData);
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    activePlayers.delete(socket.id);
    io.emit('remove_player', socket.id);

    // Reassign ball physics host if necessary
    if (socket.id === ballPhysicsHostId) {
      const remainingIds = Array.from(activePlayers.keys());
      ballPhysicsHostId = remainingIds.length > 0 ? remainingIds[0] : null;
      if (ballPhysicsHostId) {
        io.to(ballPhysicsHostId).emit('ball_host_assignment', { isHost: true });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`The Goody Tonight Show server running on http://localhost:${PORT}`);
});
