//Import React and Socket.IO client
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { rollDice } from "../gameLogic/diceGameLogic";

let userId = localStorage.getItem("userId");
if (!userId) {
  userId = crypto.randomUUID(); // or any unique generator
  localStorage.setItem("userId", userId);
}

//Connect to the backend and point to it
const socket = io("http://localhost:3000", {
  query: { userId }, // send to server
});

//save the user so it doesnt generate a new one each refresh
console.log("iD: " + userId);

//Confirm the connection
export default function DiceGame() {
  const [diceValueOne, setDiceValueOne] = useState(0);
  const [diceValueTwo, setDiceValueTwo] = useState(0);
  const [hp, setHp] = useState(10);
  const [playerCount, setPlayerCount] = useState(0);
  let roomId = 1;
  const randomDice = () => {
    const newDiceOne = rollDice();
    const newDiceTwo = rollDice();

    setDiceValueOne(newDiceOne);
    setDiceValueTwo(newDiceTwo);

    socket.emit("diceRolled", {
      diceValueOne: newDiceOne,
      diceValueTwo: newDiceTwo,
    });
  };

  const joinGame = () => {
    socket.emit("joinRoom", roomId);
  };

  const sendValues = () => {
    socket.emit("sendValues", {
      roomId,
      values: { hp: hp, diceOne: diceValueOne, diceTwo: diceValueTwo },
    });
  };

  //get dice rolled back
  useEffect(() => {
    socket.on("diceResult", (data) => {
      console.log("Player", data.player, "rolled", data.value);
      // You could also update state with other players' rolls
    });

    return () => {
      socket.off("diceResult");
    };
  }, []);

  useEffect(() => {
    // Log when connected
    socket.on("connect", () => {
      console.log("Connected to server:", userId);
    });

    // Log any test messages from server
    socket.on("message", (msg) => {
      console.log("Message from server:", msg);
    });

    // Cleanup on unmount
    return () => socket.off();
  }, []);

  //Round Result
  useEffect(() => {
    socket.on("roundResult", ({ players }) => {
      console.log("Round result:", players);

      // Update your HP from the server copy
      const updatedHp = players[userId]?.values.hp;
      if (updatedHp !== undefined) {
        setHp(updatedHp);
      }
      setDiceValueOne(0);
      setDiceValueTwo(0);
    });

    return () => {
      socket.off("roundResult");
    };
  }, []);

  //count players in room
  useEffect(() => {
    // Listen for updates from the backend
    socket.on("playerCountUpdate", (count) => {
      console.log("Players in room:", count);
      setPlayerCount(count);
    });

    return () => {
      socket.off("playerCountUpdate");
    };
  }, []);

  //win or lose
  //check if you won or not
  useEffect(() => {
    socket.on("endGame", ({ message, results, gameInfo }) => {
      console.log(message);

      Object.entries(results).forEach(([id, result]) => {
        if (id === userId) {
          alert(result); // or update state to show it in the UI
          console.log("Your HP:", gameInfo[id].values.hp);
        }
      });
    });

    return () => {
      socket.off("endGame");
    };
  }, []);
  return (
    <div>
      <h2>Dice Game Component</h2>
      {playerCount == 2 ? (
        <>
          {" "}
          <p>{hp}</p>
          <p>{diceValueOne}</p>
          <p>{diceValueTwo}</p>
          <button onClick={randomDice}>Roll Dice</button>
          <button onClick={sendValues}>Play</button>
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
