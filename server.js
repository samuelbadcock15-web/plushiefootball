const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname)));

const players = new Map();
let guestCounter = 0;
let connectionCount = 0;

// Authoritative Server-Side Ball State & Physics
let ballState = {
  x: 34.0,
  y: 0.82,
  z: 0.0,
  vx: 0,
  vy: 0,
  vz: 0
};

let currentScores = { blue: 0, red: 0 };

// Fixed Server Physics Tick (30 FPS)
const TICK_RATE = 30;
const ARENA_LENGTH = 36.0;
const ARENA_WIDTH = 24.0;
const HALF_LEN = ARENA_LENGTH / 2;
const HALF_WID = ARENA_WIDTH / 2;

setInterval(() => {
  // Update Ball Physics
  ballState.x += ballState.vx * (1 / TICK_RATE);
  ballState.z += ballState.vz * (1 / TICK_RATE);

  // Friction / Damping
  ballState.vx *= 0.95;
  ballState.vz *= 0.95;

  // Boundary Collisions (North/South Walls)
  if (ballState.z > HALF_WID - 0.5) {
    ballState.z = HALF_WID - 0.5;
    ballState.vz *= -0.8;
  }
  if (ballState.z < -(HALF_WID - 0.5)) {
    ballState.z = -(HALF_WID - 0.5);
    ballState.vz *= -0.8;
  }

  // Goal Detection & Scoring
  const goalSpan = 5.0;
  if (ballState.x < 16.3 && ballState.z > -goalSpan / 2 && ballState.z < goalSpan / 2) {
    // Red Team Scores!
    currentScores.red++;
    resetBall();
    io.emit('score_sync', currentScores);
  } else if (ballState.x > 51.7 && ballState.z > -goalSpan / 2 && ballState.z < goalSpan / 2) {
    // Blue Team Scores!
    currentScores.blue++;
    resetBall();
    io.emit('score_sync', currentScores);
  }

  // East/West Field Boundaries
  if (ballState.x < 16.3) { ballState.x = 16.3; ballState.vx *= -0.8; }
  if (ballState.x > 51.7) { ballState.x = 51.7; ballState.vx *= -0.8; }

  // Check Player-to-Ball Collisions on the Server
  players.forEach((player) => {
    if (player.x > 10.0) { // Only inside the pitch arena
      const dx = ballState.x - player.x;
      const dz = ballState.z - player.z;
      const dist = Math.hypot(dx, dz);
      
      if (dist < 0.85) {
        // High-speed impact calculation
        const angle = Math.atan2(dz, dx);
        const pushForce = 12.0;
        ballState.vx = Math.cos(angle) * pushForce;
        ballState.vz = Math.sin(angle) * pushForce;
      }
    }
  });

  // Broadcast authoritative ball state to all clients
  io.emit('ball_sync', ballState);

}, 1000 / TICK_RATE);

function resetBall() {
  ballState.x = 34.0;
  ballState.y = 0.82;
  ballState.z = 0.0;
  ballState.vx = 0;
  ballState.vy = 0;
  ballState.vz = 0;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  connectionCount++;
  guestCounter++;

  const assignedTeam = (connectionCount % 2 === 1) ? 'BLUE' : 'RED';
  const teamColorHex = assignedTeam === 'RED' ? '#ff3838' : '#00f0ff';
  const defaultName = `Guest ${guestCounter}`;

  players.set(socket.id, {
    id: socket.id,
    name: defaultName,
    x: 14.5,
    y: 0.44,
    z: 0.0,
    yaw: 0,
    team: assignedTeam,
    teamColor: teamColorHex,
    isSolid: false
  });

  socket.emit('assign_team', {
    team: assignedTeam,
    teamColor: teamColorHex,
    name: defaultName
  });

  socket.emit('current_players', Array.from(players.values()));
  socket.emit('score_sync', currentScores);

  socket.on('player_move', (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.name = data.name || player.name;
      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.yaw = data.yaw;
      player.team = data.team || player.team;
      player.teamColor = data.teamColor || player.teamColor;
      player.isSolid = data.isSolid;

      socket.broadcast.emit('update_player', player);
    }
  });

  // Direct kick impulse request from any client going full speed
  socket.on('player_kick_ball', (kickData) => {
    if (kickData && typeof kickData.vx === 'number' && typeof kickData.vz === 'number') {
      ballState.vx = kickData.vx;
      ballState.vz = kickData.vz;
    }
  });

  socket.on('score_update', (sData) => {
    currentScores = sData;
    io.emit('score_sync', currentScores);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    players.delete(socket.id);
    io.emit('remove_player', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`The Goody Tonight Show server running on http://localhost:${PORT}`);
});
