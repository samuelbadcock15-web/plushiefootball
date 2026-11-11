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
let connectionCount = 0;
let guestCounter = 0; // Sequential counter for Guest names

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  connectionCount++;
  guestCounter++;

  const assignedTeam = (connectionCount % 2 === 1) ? 'BLUE' : 'RED';
  const teamColorHex = assignedTeam === 'RED' ? '#ff3838' : '#00f0ff';
  const defaultName = `Guest ${guestCounter}`;

  // Store the player in activePlayers map with their unique guest name
  activePlayers.set(socket.id, {
    id: socket.id,
    name: defaultName,
    x: 0.0,
    y: 0.44,
    z: 0.0,
    yaw: 0,
    team: assignedTeam,
    teamColor: teamColorHex
  });

  // Send the team assignment and guest name just once cleanly
  socket.emit('assign_team', {
    team: assignedTeam,
    teamColor: teamColorHex,
    name: defaultName
  });

  // Send current players list to the newly connected client
  socket.emit('current_players', Array.from(activePlayers.values()));

  // Broadcast new player to everyone else
  socket.broadcast.emit('new_player', activePlayers.get(socket.id));

  // Handle player avatar movement, rotation, & team updates
  socket.on('player_move', (data) => {
    const player = activePlayers.get(socket.id);
    if (player) {
      player.name = data.name || player.name;
      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.yaw = data.rotY !== undefined ? data.rotY : player.yaw;
      player.team = data.team || player.team;
      player.teamColor = data.teamColor || player.teamColor;

      // Broadcast updated player position to everyone else
      socket.broadcast.emit('player_moved', {
        id: socket.id,
        x: player.x,
        y: player.y,
        z: player.z,
        rotY: player.yaw
      });
    }
  });

  // Handle Tag / Infection event between players
  socket.on('tag_player', (data) => {
    // data contains { victimId: '...' }
    io.emit('player_tagged', {
      taggerId: socket.id,
      victimId: data.victimId
    });
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    activePlayers.delete(socket.id);
    io.emit('player_disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Plushie Tag Arena server running on http://localhost:${PORT}`);
});
