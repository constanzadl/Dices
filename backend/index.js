//Import Express along with http and Socket.IO
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

//Create the Express app
const app = express();

//Serve frontend build with Vite (so we can deploy by only deploying backend)
app.use(express.static(path.join(__dirname, "../frontend/dist")));

//Any not known route will go to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

//Create the HTTP server from Express (para que Socket.IO se monte sobre el mismo server)
const server = http.createServer(app);

//Initialize Socket.io
const io = new Server(server, { cors: { origin: "*" } });

//Rooms: { roomId: { players: { userId: { socketId, values } }, round: { submissions } } }
const rooms = {};

//Listen for connections
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  //console.log(`User connected with id: ${userId}`);

  //Player enters room
  socket.on("joinRoom", (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { players: {}, round: { submissions: 0 } }; //round state initialization
    }

    //Player added to room
    rooms[roomId].players[userId] = {
      socketId: socket.id,
      //TODO: hp must be a variable and it depends on player class
      values: { hp: 10, diceOne: null, diceTwo: null },
    };
    socket.join(roomId);

    //Player count
    //TODO: whenever the room has 2 players no other player can join
    //TODO: If there were 2 players but not anymore, player will be routed back to home page
    const playerCount = Object.keys(rooms[roomId].players).length;

    //How many players in room, let f/e know so it can show the game
    io.to(roomId).emit("playerCountUpdate", playerCount);
    //console.dir(rooms[roomId].players, { depth: null });
    //console.log(`${userId} joined room ${roomId}. Players in room: ${playerCount}`);
  });

  //Update values when players roll dice
  socket.on("diceRolled", (dice) => {
    //console.dir(dice);
    if (rooms[dice.roomId]?.players[userId]) {
      rooms[dice.roomId].players[userId].values = {
        ...rooms[dice.roomId].players[userId].values,
        diceOne: dice.diceValueOne,
        diceTwo: dice.diceValueTwo,
      };
    }

    //Tell f/e that values were updated
    io.to(dice.roomId).emit("playerValuesUpdated", {
      players: rooms[dice.roomId].players,
    });
  });

  //Sends defined values (attack/defense/special ability, etc) to start round and send user the results.
  socket.on("sendValues", ({ roomId, values }) => {
    const userId = socket.handshake.query.userId;

    //Save player values
    rooms[roomId].players[userId].values = values;
    rooms[roomId].round.submissions++;

    //If both players sent values, start round
    if (
      rooms[roomId].round.submissions ===
      Object.keys(rooms[roomId].players).length
    ) {
      const allPlayers = Object.values(rooms[roomId].players);

      //1v1
      const [player1, player2] = Object.entries(rooms[roomId].players);
      const [userId1, p1] = player1;
      const [userId2, p2] = player2;

      //Game logic, right now die 1 is attack and die 2 is defense
      if (p1.values.diceOne > p2.values.diceTwo) {
        rooms[roomId].players[userId2].values.hp -=
          p1.values.diceOne - p2.values.diceTwo;
      }
      if (p2.values.diceOne > p1.values.diceTwo) {
        rooms[roomId].players[userId1].values.hp -=
          p2.values.diceOne - p1.values.diceTwo;
      }

      //Resets dice while keeping hp value after round
      for (const player of allPlayers) {
        player.values.diceOne = null;
        player.values.diceTwo = null;
      }

      //Restart submissions so they're 0 again
      rooms[roomId].round.submissions = 0;

      //Check if someone lost during the round
      if (p1.values.hp <= 0 || p2.values.hp <= 0) {
        const results = {};
        Object.entries(rooms[roomId].players).forEach(([id, player]) => {
          results[id] = player.values.hp <= 0 ? "You lose" : "You win";
        });
        //TODO: GAME STATE -  Print message and add button to restart or go back home
        io.to(roomId).emit("endGame", {
          message: "Game has ended! Thank you for playing",
          results,
          gameInfo: rooms[roomId].players,
        });
      }

      //Send back new hp and dice values in 0
      io.to(roomId).emit("roundResult", {
        players: rooms[roomId].players,
      });
    }
  });

  //Player disconnection handle
  //TODO: if one player disconnects from room, remaining player needs to be sent to home page to find new player to play with
  socket.on("disconnect", () => {
    console.log("Player disconnected:", userId);
  });
});

//Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
