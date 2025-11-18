//Import Express along with http and Socket.IO
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

//Create the Express app
const app = express();

//Serve frontend build with Vite (so we can deploy by only deploying backend on Render)
app.use(express.static(path.join(__dirname, "../frontend/dist")));

//Any not known route will go to index.html / Para evitar 404 etc segun yo
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

//Create the HTTP server from Express (para que Socket.IO se monte sobre el mismo server)
const server = http.createServer(app);

//Initialize Socket.io
const io = new Server(server, { cors: { origin: "*" } });

/**
 * TO ADD: Clase y de ahí derivan mil cosas xD
 * Estructura de rooms:
 * rooms = {
 *   [roomId]: {
 *     players: {
 *       [userId]: {
 *         socketId,
 *         values: {
 *           hp,
 *           diceOne,   //ataque final
 *           diceTwo,   //defensa final
 *           diceThree, //valor puro del 3er dado TODO: CAMBIAR A UN DADO NORMAL
 *           special1,  //slot especial 1
 *           special2   //slot especial 2
 *         }
 *       }
 *     },
 *     round: {
 *       submissions: number,  //cuántos jugadores ya mandaron sendValues
 *       number: number        //número de ronda actual
 *     }
 *   }
 * }
 */
const rooms = {};
const userRoom = new Map(); //userId -> roomId
let waitingRoomId = null; //sala en espera para quick match (random)

//Escoger room ID para el host o random
function genRoomId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function ensureRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: {},
      round: { submissions: 0, number: 1 },
    };
  }
}

function getPlayerCount(roomId) {
  const room = rooms[roomId];
  return room ? Object.keys(room.players).length : 0;
}

//Resetea SOLO cosas de la ronda (dados y slots especiales) y avanza el contador de rondas
function resetPerRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const allPlayers = Object.values(room.players);

  //Reset de dados y slots especiales, pero NO del HP
  for (const player of allPlayers) {
    player.values.diceOne = null;
    player.values.diceTwo = null;
    player.values.diceThree = null;
    player.values.special1 = null;
    player.values.special2 = null;
  }

  //Preparamos siguiente ronda
  room.round.submissions = 0;
  room.round.number += 1;

  //Avisamos al frontend que inicia nueva ronda
  io.to(roomId).emit("roundStart", { roundNumber: room.round.number });
}

//Resetea TODA la partida (HP y dados) pero mantiene a los jugadores en la misma sala // TO DO: REVISAR PARA QUE HAYA LA OPCION DE QUEDARSE O IRSE
function resetMatch(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const allPlayers = Object.values(room.players);

  //Reiniciamos HP y dados
  for (const player of allPlayers) {
    player.values.hp = 10; //TODO: en el futuro dependerá de la clase elegida
    player.values.diceOne = null;
    player.values.diceTwo = null;
    player.values.diceThree = null;
    player.values.special1 = null;
    player.values.special2 = null;
  }

  //Reinicio de estado de ronda
  room.round.submissions = 0;
  room.round.number = 1;

  //Avisamos al frontend del reset
  io.to(roomId).emit("gameReset", {
    message: "New match starting!",
    roundNumber: room.round.number,
    players: room.players,
  });

  //Anunciamos inicio de la nueva ronda 1
  io.to(roomId).emit("roundStart", { roundNumber: room.round.number });
}

//Remueve al jugador de su sala y limpia estados según corresponda
function leaveRoom(userId) {
  const roomId = userRoom.get(userId);
  if (!roomId || !rooms[roomId]) return null;

  const room = rooms[roomId];
  delete room.players[userId];
  userRoom.delete(userId);

  //Avisar a los que queden
  io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));

  //Si se quedó solo uno, avisar y limpiar ronda
  if (getPlayerCount(roomId) === 1) {
    io.to(roomId).emit("opponentLeft", { roomId });
    room.round.submissions = 0;
  }

  //Si ya no hay nadie, borrar sala
  if (getPlayerCount(roomId) === 0) {
    if (waitingRoomId === roomId) waitingRoomId = null;
    delete rooms[roomId];
  }
  return roomId;
}

//Listen for connections
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  //HOST: crea una sala y queda en espera
  socket.on("hostRoom", () => {
    const roomId = genRoomId();
    ensureRoom(roomId);

    rooms[roomId].players[userId] = {
      socketId: socket.id,
      values: {
        hp: 10,
        diceOne: null,
        diceTwo: null,
        diceThree: null,
        special1: null,
        special2: null,
      },
    };

    userRoom.set(userId, roomId);
    socket.join(roomId);
    waitingRoomId = roomId;
    socket.emit("roomCreated", { roomId });
    io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));
  });

  //JOIN por código
  socket.on("joinByCode", ({ roomId }) => {
    ensureRoom(roomId);
    const room = rooms[roomId];

    //Límite de 2 jugadores por sala
    if (Object.keys(room.players).length >= 2 && !room.players[userId]) {
      socket.emit("roomFull", { roomId });
      return;
    }

    if (!room.players[userId]) {
      room.players[userId] = {
        socketId: socket.id,
        values: {
          hp: 10,
          diceOne: null,
          diceTwo: null,
          diceThree: null,
          special1: null,
          special2: null,
        },
      };
    } else {
      room.players[userId].socketId = socket.id;
    }

    userRoom.set(userId, roomId);
    socket.join(roomId);
    socket.emit("joinedRoom", { roomId });
    io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));

    //Si ya hay 2 jugadores, empezamos en Round 1
    if (getPlayerCount(roomId) === 2) {
      room.round.submissions = 0;
      room.round.number = 1;
      if (waitingRoomId === roomId) waitingRoomId = null;
      io.to(roomId).emit("roundStart", { roundNumber: room.round.number });
    }
  });

  //QUICK MATCH (random)
  socket.on("joinRandom", () => {
    //Si hay una sala esperando con 1 jugador, únete
    if (
      waitingRoomId &&
      rooms[waitingRoomId] &&
      getPlayerCount(waitingRoomId) === 1
    ) {
      const roomId = waitingRoomId;
      const room = rooms[roomId];

      room.players[userId] = {
        socketId: socket.id,
        values: {
          hp: 10,
          diceOne: null,
          diceTwo: null,
          diceThree: null,
          special1: null,
          special2: null,
        },
      };
      userRoom.set(userId, roomId);
      socket.join(roomId);
      socket.emit("joinedRoom", { roomId });
      io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));

      //Ya hay 2 → empezar
      room.round.submissions = 0;
      room.round.number = 1;
      waitingRoomId = null;
      io.to(roomId).emit("roundStart", { roundNumber: 1 });
    } else {
      //Crea nueva y queda esperando
      const roomId = genRoomId();
      ensureRoom(roomId);
      rooms[roomId].players[userId] = {
        socketId: socket.id,
        values: {
          hp: 10,
          diceOne: null,
          diceTwo: null,
          diceThree: null,
          special1: null,
          special2: null,
        },
      };
      userRoom.set(userId, roomId);
      socket.join(roomId);
      waitingRoomId = roomId;
      socket.emit("roomCreated", { roomId });
      io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));
    }
  });

  //Salida voluntaria (volver a lobby)
  socket.on("leaveRoom", () => {
    const leftRoom = leaveRoom(userId);
    if (leftRoom) socket.leave(leftRoom);
    socket.emit("returnedToLobby");
  });

  //JoinRoom simple (testing local)
  socket.on("joinRoom", (roomId) => {
    ensureRoom(roomId);
    const room = rooms[roomId];

    if (Object.keys(room.players).length >= 2 && !room.players[userId]) {
      socket.emit("roomFull", { roomId });
      return;
    }

    if (!room.players[userId]) {
      room.players[userId] = {
        socketId: socket.id,
        values: {
          hp: 10,
          diceOne: null,
          diceTwo: null,
          diceThree: null,
          special1: null,
          special2: null,
        },
      };
    } else {
      room.players[userId].socketId = socket.id;
    }

    socket.join(roomId);
    userRoom.set(userId, roomId);

    io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));

    if (getPlayerCount(roomId) === 2) {
      room.round.submissions = 0;
      room.round.number = 1;
      io.to(roomId).emit("roundStart", { roundNumber: room.round.number });
    }
  });

  //Game logic

  //Update values when players roll dice
  socket.on("diceRolled", (dice) => {
    const { roomId, diceValueOne, diceValueTwo, diceValueThree } = dice;
    const room = rooms[roomId];
    if (!room || !room.players[userId]) return;

    //Guardamos los resultados de los dados tirados
    const player = room.players[userId];
    player.values.diceOne = diceValueOne;
    player.values.diceTwo = diceValueTwo;
    player.values.diceThree = diceValueThree;

    //Tell frontend that values were updated
    io.to(roomId).emit("playerValuesUpdated", {
      players: room.players,
    });
  });

  //Sends defined values (attack/defense/special slots, etc)
  socket.on("sendValues", ({ roomId, values }) => {
    const room = rooms[roomId];
    if (!room || !room.players[userId]) return;

    //Extraemos solo los dados finales (ataque/defensa) y slots especiales
    const { diceOne, diceTwo, special1, special2 } = values;

    //Actualizamos los valores finales de este jugador (hp NO viene del frontend)
    const player = room.players[userId];
    player.values.diceOne = diceOne;
    player.values.diceTwo = diceTwo;
    player.values.special1 = special1 ?? null;
    player.values.special2 = special2 ?? null;

    //Marcamos que este jugador ya envió sus valores para esta ronda
    room.round.submissions++;

    //Avisamos al frontend del estado actual de todos los jugadores
    io.to(roomId).emit("playerValuesUpdated", {
      players: room.players,
    });

    //If both players sent values, start round
    if (room.round.submissions === Object.keys(room.players).length) {
      const entries = Object.entries(room.players);
      if (entries.length !== 2) return; //safety check

      const [[userId1, p1], [userId2, p2]] = entries;

      //Game logic, right now die 1 is attack and die 2 is defense
      if (p1.values.diceOne > p2.values.diceTwo) {
        room.players[userId2].values.hp -=
          p1.values.diceOne - p2.values.diceTwo;
      }
      if (p2.values.diceOne > p1.values.diceTwo) {
        room.players[userId1].values.hp -=
          p2.values.diceOne - p1.values.diceTwo;
      }

      //Mandamos resultado de la ronda (HP actualizados)
      io.to(roomId).emit("roundResult", {
        players: room.players,
      });

      //Check if someone lost during the round (incluyendo empate)
      if (p1.values.hp <= 0 || p2.values.hp <= 0) {
        const bothDead = p1.values.hp <= 0 && p2.values.hp <= 0;

        const results = {};
        Object.entries(room.players).forEach(([id, playerObj]) => {
          if (bothDead) {
            results[id] = "Tie";
          } else {
            results[id] = playerObj.values.hp <= 0 ? "You lose" : "You win";
          }
        });

        io.to(roomId).emit("endGame", {
          message: bothDead
            ? "Game has ended in a tie!"
            : "Game has ended! Thank you for playing",
          results,
          gameInfo: room.players,
        });

        //Reinicio automático de partida después de 2 segundos
        setTimeout(() => resetMatch(roomId), 2000);
      } else {
        //Si nadie perdió, reseteamos la ronda y avanzamos el contador
        resetPerRound(roomId);
      }
    }
  });

  //Player disconnection handle
  socket.on("disconnect", () => {
    const leftRoom = leaveRoom(userId);
    if (leftRoom) socket.leave(leftRoom);
  });
});

//Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
