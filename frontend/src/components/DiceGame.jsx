import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { rollDice } from "../gameLogic/diceGameLogic";

let userId = localStorage.getItem("userId");
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("userId", userId);
}

// Replace localhost with your deployed Render backend URL
const socket = io("https://dice-and-duels.onrender.com", { query: { userId } });

export default function DiceGame() {
  const [diceValueOne, setDiceValueOne] = useState(0);
  const [diceValueTwo, setDiceValueTwo] = useState(0);
  const [hp, setHp] = useState(10);
  const [playerCount, setPlayerCount] = useState(0);
  const [enemyValues, setEnemyValues] = useState({
    hp: 10,
    diceOne: 0,
    diceTwo: 0,
  });

  let roomId = 1;

  const joinGame = () => socket.emit("joinRoom", roomId);

  const randomDice = () => {
    const newDiceOne = rollDice();
    const newDiceTwo = rollDice();
    setDiceValueOne(newDiceOne);
    setDiceValueTwo(newDiceTwo);

    socket.emit("diceRolled", {
      roomId,
      diceValueOne: newDiceOne,
      diceValueTwo: newDiceTwo,
    });
  };

  const sendValues = () => socket.emit("sendValues", { roomId });

  useEffect(() => {
    socket.on("playerCountUpdate", (count) => setPlayerCount(count));

    socket.on("playerValuesUpdated", ({ players }) => {
      setHp(players[userId].values.hp);
      const enemy = Object.entries(players).find(([id]) => id !== userId);
      if (enemy) setEnemyValues(enemy[1]);
    });

    socket.on("endGame", ({ results }) => {
      Object.entries(results).forEach(([id, result]) => {
        if (id === userId) alert(result);
      });
    });

    return () => socket.off();
  }, []);

  return (
    <div>
      <h2>Dice Game Component</h2>
      {playerCount === 2 ? (
        <>
          <h3>Enemy</h3>
          <p>HP: {enemyValues.hp}</p>
          <p>
            Dices: {enemyValues.diceOne}, {enemyValues.diceTwo}
          </p>

          <h3>Me</h3>
          <p>HP: {hp}</p>
          <p>Attack: {diceValueOne}</p>
          <p>Defense: {diceValueTwo}</p>

          <button onClick={randomDice}>Roll Dice</button>
          <button onClick={sendValues}>Start Round</button>
        </>
      ) : (
        <>
          <button onClick={joinGame}>Join Game</button>
          <p>Join Game and wait for player 2!</p>
        </>
      )}
    </div>
  );
}
