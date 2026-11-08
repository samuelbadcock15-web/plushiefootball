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

let ballPhysicsHostId = null; // Tracks which client has physics authority over the ball

let connectionCount = 0;

let guestCounter = 0; // Sequential counter for Guest names



io.on('connection', (socket) => {

  console.log(`User connected: ${socket.id}`);



  // Alternate teams: 1st player is Blue, 2nd is Red, 3rd is Blue, etc.

  connectionCount++;

  guestCounter++;

 

  const assignedTeam = (connectionCount % 2 === 1) ? 'BLUE' : 'RED';

  const teamColorHex = assignedTeam === 'RED' ? '#ff3838' : '#00f0ff';



  // Assign sequential guest name (Guest 1, Guest 2, Guest 3, etc.)

  const defaultName = `Guest ${guestCounter}`;

 

  activePlayers.set(socket.id, {

    id: socket.id,

    name: defaultName,

    x: 32.0,

    y: 0.44,

    z: 2.5,

    yaw: 0,

    team: assignedTeam,

    teamColor: teamColorHex

  });



  // Inform this client what team they have been assigned to

  socket.emit('assign_team', { team: assignedTeam, teamColor: teamColorHex });



  // If this is the first connected player, make them the official ball physics host

  if (!ballPhysicsHostId) {

    ballPhysicsHostId = socket.id;

  }

 

  // Inform this client whether they are the designated ball physics host

  socket.emit('ball_host_assignment', { isHost: socket.id === ballPhysicsHostId });



  // Send current players list to the newly connected client

  socket.emit('current_players', Array.from(activePlayers.values()));



  // Handle player avatar movement, rotation, & team updates

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



      // Broadcast updated player position and team data to everyone else

      socket.broadcast.emit('update_player', player);

    }

  });



  // Handle real-time ball movement and physics synchronization from the host

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



    // If the current ball physics host disconnects, reassign to the next available player

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
