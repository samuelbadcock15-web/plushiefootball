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

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Game state tracking
const activePlayers = new Map();
let guestCounter = 1;

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Alternate teams or assign based on current count
  const assignedTeam = guestCounter % 2 === 0 ? 'BLUE' : 'RED';
  const teamColorHex = assignedTeam === 'RED' ? '#ff3838' : '#00f0ff';
  const defaultName = `Guest ${guestCounter}`;
  guestCounter++;

  // Initialize player data
  activePlayers.set(socket.id, {
    id: socket.id,
    name: defaultName,
    x: 32.0,
    y: 0.44,
    z: 2.5,
    yaw: 0,
    team: assignedTeam,
    teamColor: teamColorHex,
    animState: 'idle'
  });

  // Designate first connected player as ball physics authority
  const isHost = activePlayers.size === 1;
  socket.emit('ball_host_assignment', { isHost });

  // Send initial team assignment and assigned guest name back to client
  socket.emit('assign_team', {
    team: assignedTeam,
    teamColor: teamColorHex,
    name: defaultName
  });

  // Broadcast current player list to everyone
  io.emit('update_players', Array.from(activePlayers.values()));

  // Handle player movement / transform updates
  socket.on('player_move', (data) => {
    const player = activePlayers.get(socket.id);
    if (player) {
      player.name = data.name || player.name;
      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.yaw = data.yaw;
      player.team = data.team || player.team;
      player.teamColor = data.teamColor || player.teamColor;
      player.animState = data.animState || 'idle';
      
      // Broadcast movement to all other connected clients
      socket.broadcast.emit('player_moved', player);
    }
  });

  // Handle Ball Physics Synchronization
  socket.on('ball_move', (bData) => {
    socket.broadcast.emit('ball_sync', bData);
  });

  // Handle Score Updates
  socket.on('score_update', (sData) => {
    io.emit('score_sync', sData);
  });

  // Handle WebRTC signaling for voice/video feeds
  socket.on('webrtc_signal', (data) => {
    if (data.to && data.signal) {
      io.to(data.to).emit('webrtc_signal', {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    activePlayers.delete(socket.id);
    io.emit('player_disconnected', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running smoothly on port ${PORT}`);
});
