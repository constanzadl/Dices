// frontend/DiceGame.jsx
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { rollDice } from "../gameLogic/diceGameLogic";
import "./../styles/DiceGame.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHandFist,
  faShieldHalved,
  faHeart,
  faDice,
  faDiceOne,
  faDiceTwo,
  faDiceThree,
  faDiceFour,
  faDiceFive,
  faDiceSix,
  faHatWizard,
  faHourglass,
  faSquareFull,
  faGhost,
  faDragon,
} from "@fortawesome/free-solid-svg-icons";
import { faStar } from "@fortawesome/free-regular-svg-icons";

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
  const [diceValueThree, setDiceValueThree] = useState(0);
  const [diceRolled, setDiceRolled] = useState(false);
  //TODO: listen to this value from backend (hp amount depends on class)
  const [hp, setHp] = useState(10);

  const [playerCount, setPlayerCount] = useState(0);
  const [selected, setSelected] = useState(0);
  //Track if a die is already placed
  const [used, setUsed] = useState({ one: false, two: false });
  //Message for user
  const [uiMsg, setUiMsg] = useState("");

  //These values get sent only after you initialize the round
  const [attack, setAttack] = useState(0);
  const [defense, setDefense] = useState(0);

  //Dice
  const diceIcons = {
    0: faSquareFull,
    1: faDiceOne,
    2: faDiceTwo,
    3: faDiceThree,
    4: faDiceFour,
    5: faDiceFive,
    6: faDiceSix,
  };

  //Enemy stats
  const [enemyValues, setEnemyValues] = useState({
    hp: 10,
    diceOne: 0,
    diceTwo: 0,
    diceThree: 0,
  });

  let roomId = 1;

  //Join a room
  const joinGame = () => socket.emit("joinRoom", roomId);

  //Roll dice (preview only, does not start round)
  const randomDice = () => {
    const newDiceOne = rollDice();
    const newDiceTwo = rollDice();

    //Set new dice values
    setDiceValueOne(newDiceOne);
    setDiceValueTwo(newDiceTwo);

    setDiceRolled(true);
    //Reset placement UI
    setAttack(0);
    setDefense(0);
    setUsed({ one: false, two: false });
    setSelected(null);
    setUiMsg("");

    // 3) notify backend for preview
    socket.emit("diceRolled", {
      roomId,
      diceValueOne: newDiceOne,
      diceValueTwo: newDiceTwo,
    });
  };

  //Submit values and resolve round
  //DiceOne will be the attack and diceTwo the defense to avoid changes on backend
  const sendValues = () =>
    socket.emit("sendValues", {
      roomId,
      values: { hp: hp, diceOne: attack, diceTwo: defense },
    });

  //Select the die and check for checks
  const handleSelectDie = (which /* 'one' | 'two' */) => {
    const value = which === "one" ? diceValueOne : diceValueTwo;

    if (!value) {
      setUiMsg("Roll first.");
      return;
    }
    if (used[which]) {
      setUiMsg("That die is already placed.");
      return;
    }

    setSelected(which);
    setUiMsg(`Selected die: ${value}`);
  };

  const handlePlace = (slot /* 'attack' | 'defense' */) => {
    if (!selected) {
      setUiMsg("Select a die first.");
      return;
    }

    const value = selected === "one" ? diceValueOne : diceValueTwo;

    // Parity checks
    if (slot === "attack" && !isEven(value)) {
      setUiMsg("Attack accepts even numbers only.");
      return;
    }
    if (slot === "defense" && !isOdd(value)) {
      setUiMsg("Defense accepts odd numbers only.");
      return;
    }

    // Slot already filled?
    if (slot === "attack" && attack) {
      setUiMsg("Attack already set.");
      return;
    }
    if (slot === "defense" && defense) {
      setUiMsg("Defense already set.");
      return;
    }

    // Place value
    if (slot === "attack") setAttack(value);
    if (slot === "defense") setDefense(value);

    // Lock the die
    setUsed((u) => ({ ...u, [selected]: true }));

    // Clear selection
    setSelected(null);
    setUiMsg("");
  };

  //Track num of players, update values to enemy, listen to end of round sequence
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

      // Reset local dice & placement after each round
      setDiceValueOne(0);
      setDiceValueTwo(0);
      setAttack(0);
      setDefense(0);
      setUsed({ one: false, two: false });
      setSelected(null);
      setUiMsg("");
      setDiceRolled(false);
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

  const isEven = (n) => typeof n === "number" && n !== 0 && n % 2 === 0;
  const isOdd = (n) => typeof n === "number" && n !== 0 && n % 2 !== 0;
  //TODO: FRONTEND - Add buttons to manage choosing which die would be attack and which defense
  //TODO: FRONTEND - Add remaining abilities to f/e
  return (
    <div className="gameState">
      <h2>Dice and Duels!</h2>
      {playerCount === 2 ? (
        <>
          {" "}
          <div className="gameComponent">
            <div className="timer">
              <FontAwesomeIcon icon={faHourglass} size="2x" />
              <span>00:30:00</span>
              <FontAwesomeIcon icon={faHourglass} size="2x" />
            </div>

            {uiMsg && <p className="messageAlert">{uiMsg}</p>}
            <div className="players">
              <div className="playerHub">
                <h3>Your dice</h3>
                <button onClick={randomDice} disabled={diceRolled}>
                  <FontAwesomeIcon icon={faDice} />
                </button>
                <div className="diceValues">
                  <div className="dice">
                    <button
                      className="die"
                      onClick={() => handleSelectDie("one")}
                      disabled={!diceValueOne || used.one}
                    >
                      <FontAwesomeIcon
                        icon={diceIcons[diceValueOne]}
                        size="3x"
                      />
                    </button>
                    <button
                      className="die"
                      onClick={() => handleSelectDie("two")}
                      disabled={!diceValueTwo || used.two}
                    >
                      <FontAwesomeIcon
                        icon={diceIcons[diceValueTwo]}
                        size="3x"
                      />
                    </button>
                    <button className="die extra" disabled="true">
                      <FontAwesomeIcon
                        icon={diceIcons[diceValueThree]}
                        size="3x"
                      />
                    </button>
                  </div>
                  <div className="values">
                    <p>
                      <FontAwesomeIcon icon={faHandFist} /> {attack}
                    </p>
                    <p>
                      <FontAwesomeIcon icon={faShieldHalved} />
                      {defense}
                    </p>
                  </div>
                </div>
                <div className="character">
                  <div className="characterCard">
                    <div className="cardButtons">
                      <button onClick={() => handlePlace("attack")}>
                        <FontAwesomeIcon icon={faHandFist} size="2x" />
                      </button>
                      <button onClick={() => handlePlace("defense")}>
                        <FontAwesomeIcon icon={faShieldHalved} size="2x" />
                      </button>
                      <button onClick={() => handlePlace("attack")}>
                        <FontAwesomeIcon icon={faStar} size="2x" />
                      </button>
                      <button onClick={() => handlePlace("attack")}>
                        <FontAwesomeIcon icon={faStar} size="2x" />
                      </button>
                    </div>
                  </div>
                  <div className="characterProfile">
                    {" "}
                    <FontAwesomeIcon icon={faGhost} size="8x" />
                  </div>
                </div>
                <p>
                  <FontAwesomeIcon icon={faHeart} /> {hp}
                </p>
                <button onClick={sendValues}>Start Round</button>
              </div>
              <div className="enemyHub">
                <h3>Opponent's Dice</h3>
                <div className="diceValues">
                  <div className="values">
                    <p>
                      <FontAwesomeIcon icon={faHandFist} />
                    </p>
                    <p>
                      <FontAwesomeIcon icon={faShieldHalved} />
                    </p>
                  </div>
                  <div className="dice">
                    <button className="die" disabled="true">
                      <FontAwesomeIcon
                        icon={diceIcons[enemyValues.diceOne]}
                        size="3x"
                      />
                    </button>
                    <button className="die" disabled="true">
                      <FontAwesomeIcon
                        icon={diceIcons[enemyValues.diceTwo]}
                        size="3x"
                      />
                    </button>
                    <button className="die" disabled="true">
                      <FontAwesomeIcon
                        icon={diceIcons[enemyValues.diceThree]}
                        size="3x"
                      />
                    </button>
                  </div>
                </div>
                <div class="character">
                  <div className="characterProfile">
                    <FontAwesomeIcon icon={faDragon} size="7x" />
                  </div>
                  <div className="characterCard">
                    <h4>Character card</h4>
                    <div className="cardButtons">
                      <button>
                        <FontAwesomeIcon icon={faHandFist} size="2x" />
                      </button>
                      <button>
                        <FontAwesomeIcon icon={faShieldHalved} size="2x" />
                      </button>
                      <button>
                        <FontAwesomeIcon icon={faStar} size="2x" />
                      </button>
                      <button>
                        <FontAwesomeIcon icon={faStar} size="2x" />
                      </button>
                    </div>
                  </div>
                </div>

                <p>
                  <FontAwesomeIcon icon={faHeart} /> {enemyValues.hp}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <></>
          <button onClick={joinGame}>Join Game</button>
          <p>Join Game and wait for player 2!</p>
        </>
      )}
    </div>
  );
}
