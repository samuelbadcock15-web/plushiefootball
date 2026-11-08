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

// Serve static files from the current directory
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Track active players and ball physics host
let ballPhysicsHostId = null;
let blueScore = 0;
let redScore = 0;
let teamToggle = false;

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Assign team and guest name on connection
  teamToggle = !teamToggle;
  const assignedTeam = teamToggle ? 'BLUE' : 'RED';
  const teamColor = assignedTeam === 'BLUE' ? '#00f0ff' : '#ff3838';
  const guestName = `Guest ${Math.floor(100 + Math.random() * 900)}`

  socket.emit('assign_team', { team: assignedTeam, teamColor: teamColor, name: guestName });

  // If no ball physics host is assigned yet, designate this client
  if (!ballPhysicsHostId) {
    ballPhysicsHostId = socket.id;
    socket.emit('ball_host_assignment', { isHost: true });
    console.log(`Assigned ball physics host to: ${socket.id}`);
  }

  // Handle player coordinate/pose updates
  socket.on('player_move', (data) => {
    socket.broadcast.emit('update_player', {
      id: socket.id,
      name: data.name,
      x: data.x,
      y: data.y,
      z: data.z,
      yaw: data.yaw,
      team: data.team,
      teamColor: data.teamColor,
      isSolid: data.isSolid
    });
  });

  // Handle authoritative ball updates from host
  socket.on('ball_move', (bData) => {
    if (socket.id === ballPhysicsHostId) {
      socket.broadcast.emit('ball_sync', bData);
    }
  });

  // Handle score sync updates
  socket.on('score_update', (sData) => {
    blueScore = sData.blue;
    redScore = sData.red;
    io.emit('score_sync', { blue: blueScore, red: redScore });
  });

  // Podium 1 Priority Launch Sequence sync
  socket.on('podium_1_claimed', (data) => {
    socket.broadcast.emit('podium_1_secured', { id: socket.id, name: data.name });
  });

  // Intermission / Dropout handler
  socket.on('player_step_off_podium', (data) => {
    io.emit('trigger_intermission', { contestant: data.contestant, name: data.name });
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    socket.broadcast.emit('remove_player', socket.id);

    if (ballPhysicsHostId === socket.id) {
      ballPhysicsHostId = null;
      const remainingSockets = Array.from(io.sockets.sockets.keys());
      if (remainingSockets.length > 0) {
        ballPhysicsHostId = remainingSockets[0];
        io.to(ballPhysicsHostId).emit('ball_host_assignment', { isHost: true });
        console.log(`Reassigned ball physics host to: ${ballPhysicsHostId}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Goody Tonight Show Server running on http://localhost:${PORT}`);
});
