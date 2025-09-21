const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();

// Serve frontend build (Vite)
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// Catch-all to support React Router
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {}; // { roomId: { players: { userId: { socketId, values } }, round: { submissions } } }

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  socket.on("joinRoom", (roomId) => {
    if (!rooms[roomId])
      rooms[roomId] = { players: {}, round: { submissions: 0 } };

    rooms[roomId].players[userId] = {
      socketId: socket.id,
      values: { hp: 10, diceOne: 0, diceTwo: 0 },
    };
    socket.join(roomId);

    const playerCount = Object.keys(rooms[roomId].players).length;
    io.to(roomId).emit("playerCountUpdate", playerCount);
  });

  socket.on("diceRolled", (dice) => {
    if (rooms[dice.roomId]?.players[userId]) {
      rooms[dice.roomId].players[userId].values = {
        ...rooms[dice.roomId].players[userId].values,
        diceOne: dice.diceValueOne,
        diceTwo: dice.diceValueTwo,
      };
    }
    io.to(dice.roomId).emit("playerValuesUpdated", {
      players: rooms[dice.roomId].players,
    });
  });

  socket.on("sendValues", ({ roomId }) => {
    const userValues = rooms[roomId].players[userId].values;
    if (!userValues) return;

    rooms[roomId].round.submissions++;

    if (
      rooms[roomId].round.submissions ===
      Object.keys(rooms[roomId].players).length
    ) {
      const [player1, player2] = Object.entries(rooms[roomId].players);
      const [userId1, p1] = player1;
      const [userId2, p2] = player2;

      // Attack vs Defense
      if (p1.values.diceOne > p2.values.diceTwo)
        rooms[roomId].players[userId2].values.hp -=
          p1.values.diceOne - p2.values.diceTwo;
      if (p2.values.diceOne > p1.values.diceTwo)
        rooms[roomId].players[userId1].values.hp -=
          p2.values.diceOne - p1.values.diceTwo;

      // Reset dice for next round
      Object.values(rooms[roomId].players).forEach((player) => {
        player.values.diceOne = 0;
        player.values.diceTwo = 0;
      });

      rooms[roomId].round.submissions = 0;

      // End game check
      if (p1.values.hp <= 0 || p2.values.hp <= 0) {
        const results = {};
        Object.entries(rooms[roomId].players).forEach(([id, player]) => {
          results[id] = player.values.hp <= 0 ? "You lose" : "You win";
        });

        io.to(roomId).emit("endGame", {
          message: "Game has ended! Thank you for playing",
          results,
          gameInfo: rooms[roomId].players,
        });
      }

      io.to(roomId).emit("playerValuesUpdated", {
        players: rooms[roomId].players,
      });
    }
  });

  socket.on("disconnect", () => console.log("Player disconnected:", userId));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
