// frontend/DiceGame.jsx
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { rollDice } from "../gameLogic/diceGameLogic";

let userId = localStorage.getItem("userId");
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("userId", userId);
}

//Connect to backend for Render to deplot frontend automatically
const socket = io("https://dice-and-duels.onrender.com", { query: { userId } });

export default function DiceGame() {
  const [diceValueOne, setDiceValueOne] = useState(0);
  const [diceValueTwo, setDiceValueTwo] = useState(0);
  const [hp, setHp] = useState(10);
  const [playerCount, setPlayerCount] = useState(0);

  //Enemy stats
  const [enemyValues, setEnemyValues] = useState({
    hp: 10,
    diceOne: 0,
    diceTwo: 0,
  });

  let roomId = 1;

  //Join a room
  const joinGame = () => socket.emit("joinRoom", roomId);

  //Roll dice (preview only, does not start round)
  const randomDice = () => {
    const newDiceOne = rollDice();
    const newDiceTwo = rollDice();
    setDiceValueOne(newDiceOne);
    setDiceValueTwo(newDiceTwo);

    //Send dice preview to backend
    socket.emit("diceRolled", {
      roomId,
      diceValueOne: newDiceOne,
      diceValueTwo: newDiceTwo,
    });
  };

  //Submit values and resolve round
  const sendValues = () =>
    socket.emit("sendValues", {
      roomId,
      values: { hp: hp, diceOne: diceValueOne, diceTwo: diceValueTwo },
    });

  useEffect(() => {
    //Track number of players in room
    socket.on("playerCountUpdate", (count) => setPlayerCount(count));

    //Sync dice and HP values from backend
    socket.on("playerValuesUpdated", ({ players }) => {
      setHp(players[userId].values.hp);
      const enemy = Object.entries(players).find(([id]) => id !== userId);
      if (enemy) setEnemyValues(enemy[1].values);
    });

    //Round results: update HP, reset dice
    socket.on("roundResult", ({ players }) => {
      const updatedHp = players[userId]?.values.hp;
      if (updatedHp !== undefined) setHp(updatedHp);

      const enemy = Object.entries(players).find(([id]) => id !== userId);
      if (enemy) setEnemyValues(enemy[1].values);

      //Reset local dice after each round
      setDiceValueOne(0);
      setDiceValueTwo(0);
    });

    //End game event
    //TODO: this would change the state of the game and would print message and add buttons to restart/go to home
    socket.on("endGame", ({ results }) => {
      Object.entries(results).forEach(([id, result]) => {
        if (id === userId) alert(result); // "You win" or "You lose"
      });
    });

    return () => socket.off();
  }, []);

  //TODO: FRONTEND - Add buttons to manage choosing which die would be attack and which defense
  //TODO: FRONTEND - Add remaining abilities to f/e
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
