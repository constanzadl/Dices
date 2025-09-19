//Import Express along with http and Socket.IO*
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

//Create the Express app
const app = express();

//Simple route to test
app.get("/", (req, res) => {
  res.send("Hello from Express backend!");
});

//Create the HTTP server from Express (so Socket.IO can attach to it)
const server = http.createServer(app);

//Initialize Socket.IO with CORS allowed
const io = new Server(server, {
  cors: { origin: "*" },
});

//Create rooms
const rooms = {}; // { roomId: { players: { userId: { socketId, values } } } }

//Listen for connections
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  //console.log(`User connected with id: ${userId}`);

  socket.on("joinRoom", (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: {},
        round: { submissions: 0 }, // initialize round state
      };
    }

    // Add this user to the room
    rooms[roomId].players[userId] = { socketId: socket.id, values: null };
    socket.join(roomId);

    // Count players
    const playerCount = Object.keys(rooms[roomId].players).length;

    /*  console.log(
      `${userId} joined room ${roomId}. Players in room: ${playerCount}`
    );
*/
    // Send count back to all clients in the room
    io.to(roomId).emit("playerCountUpdate", playerCount);
    console.dir(rooms[roomId].players, { depth: null });
  });

  socket.on("diceRolled", (value) => {
    console.dir(value);
    // Example: send to everyone (including sender)
    io.emit("diceResult", { player: userId, value });
  });

  socket.on("sendValues", ({ roomId, values }) => {
    const userId = socket.handshake.query.userId;

    // Save player values
    rooms[roomId].players[userId].values = values;
    rooms[roomId].round.submissions++;

    // If all players submitted, resolve round
    if (
      rooms[roomId].round.submissions ===
      Object.keys(rooms[roomId].players).length
    ) {
      const allPlayers = Object.values(rooms[roomId].players);

      // === Game logic ===
      const [player1, player2] = Object.entries(rooms[roomId].players);
      const [userId1, p1] = player1;
      const [userId2, p2] = player2;

      // Attack vs Defense check
      if (p1.values.diceOne > p2.values.diceTwo) {
        rooms[roomId].players[userId2].values.hp -=
          p1.values.diceOne - p2.values.diceTwo;
      }
      if (p2.values.diceOne > p1.values.diceTwo) {
        rooms[roomId].players[userId1].values.hp -=
          p2.values.diceOne - p1.values.diceTwo;
      }

      // === Reset dice for next round but keep HP ===
      for (const player of allPlayers) {
        player.values.diceOne = null;
        player.values.diceTwo = null;
      }

      // Reset submission counter
      rooms[roomId].round.submissions = 0;

      // Send result to all clients
      io.to(roomId).emit("roundResult", {
        players: rooms[roomId].players,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", userId);
  });
});

//Start the server:
const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
