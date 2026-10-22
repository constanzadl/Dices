//Import Express along with http and Socket.IO
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");
const characters = require("./characters.json");

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
const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL || "https://dice-and-duels.onrender.com/"
        : "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

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
const waitingQueue = []; //sala en espera para quick match (random)
const timers = {};
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

//Resolve Round
function resolveRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.round.submissions = 2; // bloquea sendValues tardíos

  const entries = Object.entries(room.players);
  if (entries.length !== 2) return;

  const [[userId1, p1], [userId2, p2]] = entries;

  // Apply Rage (Barbarian special1)
  for (const player of [p1, p2]) {
    if (player.character !== "barbarian") continue;
    if (player.values.rageReady) {
      // Rage fires this turn — x2 attack, reset
      player.values.diceOne = (player.values.diceOne || 0) * 2;
      player.values.rageCharges = 0;
      player.values.rageReady = false;
    } else if (player.values.special1 > 0) {
      player.values.rageCharges++;
      if (player.values.rageCharges >= 2) {
        player.values.rageReady = true;
      } else {
        // Still charging: -1 defense
        player.values.diceTwo = Math.max(0, (player.values.diceTwo || 0) - 1);
      }
    }
  }

  // Apply Fireball (Wizard special1)
  const playerPairs = [[p1, p2], [p2, p1]];
  for (const [player, opponent] of playerPairs) {
    if (player.character !== "wizard") continue;
    if (player.values.special1 > 0) {
      if (!player.values.fireballActive) {
        // First use — activates, no damage yet
        player.values.fireballActive = true;
        player.values.fireballPower = 1;
      } else {
        // Already active — fire! Direct damage (bypasses defense)
        opponent.values.hp = Math.max(0, opponent.values.hp - player.values.fireballPower);
        player.values.fireballActive = false;
        player.values.fireballPower = 0;
      }
    } else if (player.values.fireballActive) {
      // Active but not used this turn — accumulate
      player.values.fireballPower++;
    }
  }

  // Apply Hidden Blade (Rogue special1) — daño inminente, ignora defensa
  for (const [player, opponent] of playerPairs) {
    if (player.character !== "rogue") continue;
    if (player.values.special1 > 0) {
      opponent.values.hp = Math.max(0, opponent.values.hp - player.values.special1);
    }
  }

  // Apply Hide (Rogue special2)
  for (const player of [p1, p2]) {
    if (player.character !== "rogue") continue;
    // Bonus de salida del turno anterior
    if (player.values.hideExitBonus) {
      player.values.diceOne = (player.values.diceOne || 0) + 1;
      player.values.hideExitBonus = false;
    }
    if (player.values.special2 > 0) {
      if (player.values.hideActive) {
        // Saliendo de hide → activar bonus para el siguiente turno
        player.values.hideExitBonus = true;
      }
      player.values.hideActive = !player.values.hideActive;
    }
    if (player.values.hideActive) {
      player.values.diceOne = 0;       // no ataque normal mientras está escondido
      player.values.diceTwo = (player.values.diceTwo || 0) + 1; // +1 defensa
    }
  }

  if (p1.values.diceOne > p2.values.diceTwo) {
    const dmg = p1.values.diceOne - p2.values.diceTwo;
    room.players[userId2].values.hp = Math.max(0, room.players[userId2].values.hp - dmg);
  }
  if (p2.values.diceOne > p1.values.diceTwo) {
    const dmg = p2.values.diceOne - p1.values.diceTwo;
    room.players[userId1].values.hp = Math.max(0, room.players[userId1].values.hp - dmg);
  }

  for (const p of Object.values(room.players)) {
    p.values.diceThree = null;
    // Decrement reroll cooldown
    if (p.values.rerollCooldown > 0) p.values.rerollCooldown--;
  }

  io.to(roomId).emit("roundResult", { players: room.players });

  const bothDead = p1.values.hp <= 0 && p2.values.hp <= 0;
  if (p1.values.hp <= 0 || p2.values.hp <= 0) {
    const results = {};
    Object.entries(room.players).forEach(([id, playerObj]) => {
      results[id] = bothDead ? "Tie" : playerObj.values.hp <= 0 ? "You lose" : "You win";
    });
    io.to(roomId).emit("endGame", {
      message: bothDead ? "Game has ended in a tie!" : "Game has ended! Thank you for playing",
      results,
      gameInfo: room.players,
    });
    setTimeout(() => resetMatch(roomId), 2000);
  } else {
    clearInterval(timers[roomId]);
    resetPerRound(roomId);
  }
}

//Timer
function startTimer(roomId) {
  clearInterval(timers[roomId]);
  let seconds = 30;
  io.to(roomId).emit("timerTick", seconds);
  timers[roomId] = setInterval(() => {
    seconds--;
    io.to(roomId).emit("timerTick", seconds);
    if (seconds <= 0) {
      clearInterval(timers[roomId]);
      resolveRound(roomId);
    }
  }, 1000);
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
  room.round.submitted = new Set();
  room.round.number += 1;

  //Avisamos al frontend que inicia nueva ronda
  io.to(roomId).emit("roundStart", { roundNumber: room.round.number });
  startTimer(roomId);
  io.to(roomId).emit("playerValuesUpdated", { players: room.players });
}

//Resetea TODA la partida (HP y dados) pero mantiene a los jugadores en la misma sala // TO DO: REVISAR PARA QUE HAYA LA OPCION DE QUEDARSE O IRSE
function resetMatch(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const allPlayers = Object.values(room.players);

  //Reiniciamos HP y dados
  for (const player of allPlayers) {
    const charData = player.character ? characters[player.character] : null;
    player.values.hp = charData ? charData.hp : 10;
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
    const idx = waitingQueue.indexOf(roomId);
    if (idx !== -1) waitingQueue.splice(idx, 1);
    delete rooms[roomId];
  }
  return roomId;
}

//Creae Player
function createPlayer(socketId) {
  return {
    socketId,
    character: null,
    values: {
      hp: 10, // se sobreescribe en selectCharacter con el HP de la clase
      diceOne: null,
      diceTwo: null,
      diceThree: null,
      special1: null,
      special2: null,
      rageCharges: 0,
      rageReady: false,
      fireballActive: false,
      fireballPower: 0,
      hideActive: false,
      hideExitBonus: false,
      rerollCooldown: 0,
    },
  };
}
//Listen for connections
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  //HOST: crea una sala y queda en espera
  socket.on("hostRoom", () => {
    const roomId = genRoomId();
    ensureRoom(roomId);

    rooms[roomId].players[userId] = createPlayer(socket.id);

    userRoom.set(userId, roomId);
    socket.join(roomId);
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
      rooms[roomId].players[userId] = createPlayer(socket.id);
    } else {
      room.players[userId].socketId = socket.id;
    }

    userRoom.set(userId, roomId);
    socket.join(roomId);
    socket.emit("joinedRoom", { roomId });
    io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));

    //Si ya hay 2 jugadores, empezamos en Round 1
    if (getPlayerCount(roomId) === 2) {
      io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));
      io.to(roomId).emit("bothPlayersJoined", { roomId });
    }
  });

  //QUICK MATCH (random)
  socket.on("joinRandom", () => {
    // Buscar sala en espera
    const existingRoomId = waitingQueue.shift(); // saca el primero de la fila
    //Si hay una sala esperando con 1 jugador, únete
    if (
      existingRoomId &&
      rooms[existingRoomId] &&
      getPlayerCount(existingRoomId) === 1
    ) {
      const room = rooms[existingRoomId];
      room.players[userId] = createPlayer(socket.id);
      userRoom.set(userId, existingRoomId);
      socket.join(existingRoomId);
      socket.emit("joinedRoom", { roomId: existingRoomId });
      io.to(existingRoomId).emit(
        "playerCountUpdate",
        getPlayerCount(existingRoomId),
      );

      //Ya hay 2 → empezar
      room.round.submissions = 0;
      room.round.number = 1;

      io.to(existingRoomId).emit(
        "playerCountUpdate",
        getPlayerCount(existingRoomId),
      );
      io.to(existingRoomId).emit("bothPlayersJoined", {
        roomId: existingRoomId,
      });
    } else {
      //Crea nueva y queda esperando
      const roomId = genRoomId();
      ensureRoom(roomId);
      rooms[roomId].players[userId] = createPlayer(socket.id);
      waitingQueue.push(roomId); // ← push en lugar de asignar
      userRoom.set(userId, roomId);
      socket.join(roomId);
      socket.emit("roomCreated", { roomId });
      io.to(roomId).emit("playerCountUpdate", getPlayerCount(roomId));
    }
  });
  //CHARACTER SELECT
  socket.on("getCharacters", () => {
    socket.emit("charactersList", characters);
  });

  socket.on("selectCharacter", ({ roomId, characterId }) => {
    const room = rooms[roomId];
    if (!room || !room.players[userId]) return;

    const char = characters[characterId];
    if (!char) return;

    room.players[userId].character = characterId;
    room.players[userId].values.hp = char.hp;

    const allChosen = Object.values(room.players).every((p) => p.character);

    if (allChosen && getPlayerCount(roomId) === 2) {
      room.round.submissions = 0;
      room.round.number = 1;
      io.to(roomId).emit("roundStart", {
        roundNumber: 1,
        players: room.players,
      });
      startTimer(roomId);
    }
  });
  //Salida voluntaria (volver a lobby)
  socket.on("leaveRoom", () => {
    const leftRoom = leaveRoom(userId);
    if (leftRoom) socket.leave(leftRoom);
    socket.emit("returnedToLobby");
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

  // Wizard used reroll — set cooldown
  socket.on("usedReroll", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.players[userId]) return;
    room.players[userId].values.rerollCooldown = 2;
  });

  //Sends defined values (attack/defense/special slots, etc)
  socket.on("sendValues", ({ roomId, values }) => {
    const room = rooms[roomId];
    if (!room || !room.players[userId]) return;
    if (room.round.submitted?.has(userId)) return;
    if (!room.round.submitted) room.round.submitted = new Set();
    room.round.submitted.add(userId);
    //Extraemos solo los dados finales (ataque/defensa) y slots especiales
    const { diceOne, diceTwo, special1, special2 } = values;

    //Actualizamos los valores finales de este jugador (hp NO viene del frontend)
    const player = room.players[userId];
    player.values.diceOne = diceOne;
    player.values.diceTwo = diceTwo;
    player.values.special1 = special1 ?? null;
    player.values.special2 = special2 ?? null;

    if (room.round.submissions >= 2) return;
    //Marcamos que este jugador ya envió sus valores para esta ronda
    room.round.submissions++;

    //Avisamos al frontend del estado actual de todos los jugadores
    /*io.to(roomId).emit("playerValuesUpdated", {
      players: room.players,
    });*/

    //If both players sent values, resolve round
    if (room.round.submissions === Object.keys(room.players).length) {
      resolveRound(roomId);
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
