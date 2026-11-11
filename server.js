const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Host private PeerJS broker on /peerjs
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peerjs', peerServer);

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Track active players and authoritative ball state
const activePlayers = new Map();
let ballPhysicsHostId = null;
let connectionCount = 0;
let guestCounter = 0;

// Persistent ball state on the server
let currentBallState = {
  x: 34.0,
  y: 0.82,
  z: 0.0,
  vx: 0,
  vy: 0,
  vz: 0
};
let currentScores = { blue: 0, red: 0 };

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  connectionCount++;
  guestCounter++;

  const assignedTeam = (connectionCount % 2 === 1) ? 'BLUE' : 'RED';
  const teamColorHex = assignedTeam === 'RED' ? '#ff3838' : '#00f0ff';
  const defaultName = `Guest ${guestCounter}`;

  const newPlayerData = {
    id: socket.id,
    name: defaultName,
    x: 32.0,
    y: 0.44,
    z: 2.5,
    yaw: 0,
    team: assignedTeam,
    teamColor: teamColorHex
  };

  activePlayers.set(socket.id, newPlayerData);

  // 1. Send team assignment
  socket.emit('assign_team', {
    team: assignedTeam,
    teamColor: teamColorHex,
    name: defaultName
  });

  // 2. Assign or maintain physics host
  if (!ballPhysicsHostId) {
    ballPhysicsHostId = socket.id;
  }
  socket.emit('ball_host_assignment', { isHost: socket.id === ballPhysicsHostId });

  // 3. Immediately send current ball position and score to the new joiner
  socket.emit('ball_sync', currentBallState);
  socket.emit('score_sync', currentScores);

  // 4. Send existing players to the new joiner, and announce the new joiner to everyone
  socket.emit('current_players', Array.from(activePlayers.values()));
  socket.broadcast.emit('update_player', newPlayerData);

  // Handle avatar movement
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

      socket.broadcast.emit('update_player', player);
    }
  });

  // Handle host ball movement sync
  socket.on('ball_move', (bData) => {
    currentBallState = bData;
    socket.broadcast.emit('ball_sync', bData);
  });

  // Handle kick impulses from ANY player
  socket.on('ball_kick', (kData) => {
    if (kData.ballX !== undefined) {
      currentBallState.x = kData.ballX;
      currentBallState.z = kData.ballZ;
      currentBallState.vx = kData.vx;
      currentBallState.vz = kData.vz;
    }
    // Forward to everyone (including host) to update velocity and adopted position
    io.emit('apply_ball_kick', kData);
  });

  // Handle goal scores
  socket.on('score_update', (sData) => {
    currentScores = sData;
    currentBallState = { x: 34.0, y: 0.82, z: 0.0, vx: 0, vy: 0, vz: 0 };
    io.emit('score_sync', sData);
    io.emit('ball_sync', currentBallState);
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    activePlayers.delete(socket.id);
    io.emit('remove_player', socket.id);

    if (socket.id === ballPhysicsHostId) {
      const remainingIds = Array.from(activePlayers.keys());
      ballPhysicsHostId = remainingIds.length > 0 ? remainingIds[0] : null;
      if (ballPhysicsHostId) {
        io.to(ballPhysicsHostId).emit('ball_host_assignment', { isHost: true });
        console.log(`Reassigned ball physics host to: ${ballPhysicsHostId}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`The Goody Tonight Show server running on http://localhost:${PORT}`);
});
