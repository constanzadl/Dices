import React, { useEffect, useState, useMemo, useRef } from "react";
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
import Waiting from "./Waiting";
import EndGame from "./EndGame";
import CharacterSelect from "./CharacterSelect";

//Se genera el ID del jugador
const userId = (() => {
  let id = localStorage.getItem("userId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("userId", id);
  }
  return id;
})();

// URL del backend
const SOCKET_URL = import.meta.env?.VITE_SOCKET_URL || "http://localhost:3000";
export default function DiceGame() {
  const socket = useMemo(() => io(SOCKET_URL, { query: { userId } }), []);
  //Lobby-Room state
  const [mode, setMode] = useState("lobby");
  const [roomId, setRoomId] = useState("");
  const [codeInput, setCodeInput] = useState("");

  //Refs
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  //Player Values
  const [diceValueOne, setDiceValueOne] = useState(0);
  const [diceValueTwo, setDiceValueTwo] = useState(0);
  //Special Skill die
  const [diceValueThree, setDiceValueThree] = useState(0);
  const [diceRolled, setDiceRolled] = useState(false);

  //TODO: listen to this value from backend (hp amount depends on class)
  const [hp, setHp] = useState(10);
  // Clase seleccionada por el jugador
  const [character, setCharacter] = useState(null);
  const [rageCharges, setRageCharges] = useState(0);
  const [rageReady, setRageReady] = useState(false);
  const [fireballActive, setFireballActive] = useState(false);
  const [fireballPower, setFireballPower] = useState(0);
  const [hideActive, setHideActive] = useState(false);
  const [hideExitBonus, setHideExitBonus] = useState(false);
  const [dicePlusOneUsed, setDicePlusOneUsed] = useState(false);
  const [rerollUsed, setRerollUsed] = useState(false);
  const [rerollCooldown, setRerollCooldown] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const [playerCount, setPlayerCount] = useState(0);
  const [selected, setSelected] = useState(null);
  //Track if a die is already placed
  const [used, setUsed] = useState({ one: false, two: false, three: false });
  //Message for user (TO DELETE)
  const [uiMsg, setUiMsg] = useState("");

  //Valores finales para combate (lo que se manda como ataque/defensa)
  const [attack, setAttack] = useState(0);
  const [defense, setDefense] = useState(0);

  //Slots especiales (cuadritos 3 y 4 de la character card)
  const [special1, setSpecial1] = useState(0);
  const [special2, setSpecial2] = useState(0);

  //Resultado final de la partida (lo manda el backend)
  const [endResult, setEndResult] = useState(null);
  //Número de ronda (lo manda el backend)
  const [roundNumber, setRoundNumber] = useState(1);
  //Mensaje global de juego (Round X, You win, Tie, etc.) TO DELETE, se volverá una pantalla
  const [gameMsg, setGameMsg] = useState("");

  //Dice icons SE VOLVERAN ARTE DEL JUEGO
  const diceIcons = {
    0: faSquareFull,
    1: faDiceOne,
    2: faDiceTwo,
    3: faDiceThree,
    4: faDiceFour,
    5: faDiceFive,
    6: faDiceSix,
  };
  //Timer
  const [timeLeft, setTimeLeft] = useState(30);
  //Enemy stats
  const [enemyValues, setEnemyValues] = useState({
    hp: 10,
    diceOne: 0,
    diceTwo: 0,
    diceThree: 0,
    special1: 0,
    special2: 0,
  });

  //Lobby
  const hostRoom = () => socket.emit("hostRoom");
  const joinRandom = () => socket.emit("joinRandom");
  const joinByCode = () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    socket.emit("joinByCode", { roomId: code });
  };
  const leaveRoom = () => socket.emit("leaveRoom");

  //Reset de local state tras cada ronda o al reiniciar partida
  const resetLocalRound = () => {
    setDiceValueOne(0);
    setDiceValueTwo(0);
    setDiceValueThree(0);
    setAttack(0);
    setDefense(0);
    setSpecial1(0);
    setSpecial2(0);
    setUsed({ one: false, two: false, three: false });
    setSelected(null);
    setUiMsg("");
    setDiceRolled(false);
    setSubmitted(false);
    setDicePlusOneUsed(false);
    setRerollUsed(false);
  };

  // Roll dice (preview only, does not start round)
  const randomDice = () => {
    const newDiceOne = rollDice();
    const newDiceTwo = rollDice();
    // Rogue hiding: solo 2 dados
    const newDiceThree = (hideActive && character?.id === "rogue") ? 0 : rollDice();

    // Set new dice values
    setDiceValueOne(newDiceOne);
    setDiceValueTwo(newDiceTwo);
    setDiceValueThree(newDiceThree);

    setDiceRolled(true);
    // Reset placement UI
    setAttack(0);
    setDefense(0);
    setSpecial1(0);
    setSpecial2(0);
    setUsed({ one: false, two: false, three: false });
    setSelected(null);
    setUiMsg("");

    // notify backend for preview (3 dados)
    if (roomId) {
      socket.emit("diceRolled", {
        roomId,
        diceValueOne: newDiceOne,
        diceValueTwo: newDiceTwo,
        diceValueThree: newDiceThree,
      });
    }
  };

  //Submit values and resolve round
  const sendValues = () => {
    if (submitted) return;
    setSubmitted(true);
    roomId &&
      socket.emit("sendValues", {
        roomId,
        values: {
          diceOne: attack,
          diceTwo: defense,
          special1,
          special2,
        },
      });
  };

  //Select the die and check for checks
  //TO CHANGE - SERÁ DRAG AND DROP
  const handleSelectDie = (which /* 'one' | 'two' | 'three' */) => {
    const value =
      which === "one"
        ? diceValueOne
        : which === "two"
          ? diceValueTwo
          : diceValueThree;

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

  //TMBN TO CHANGE SERA DRAG AND DROP
  const handlePlace = (
    slot /* 'attack' | 'defense' | 'special1' | 'special2' */,
  ) => {
    if (!selected) {
      setUiMsg("Select a die first.");
      return;
    }

    const value =
      selected === "one"
        ? diceValueOne
        : selected === "two"
          ? diceValueTwo
          : diceValueThree;

    // Dice +1 (Barbarian special2) — modifica el dado y lo devuelve disponible
    if (slot === "special2" && character?.id === "barbarian") {
      if (dicePlusOneUsed) { setUiMsg("Dice +1 already used this round."); return; }
      if (value >= 6) { setUiMsg("Max number reached."); return; }
      const setters = { one: setDiceValueOne, two: setDiceValueTwo, three: setDiceValueThree };
      setters[selected](value + 1);
      setDicePlusOneUsed(true);
      setSelected(null);
      setUiMsg("");
      return;
    }

    // Reroll (Wizard special2) — rerollea el dado y lo devuelve disponible
    if (slot === "special2" && character?.id === "wizard") {
      if (rerollUsed) { setUiMsg("Re-roll already used this round."); return; }
      if (rerollCooldown > 0) { setUiMsg(`Re-roll on cooldown (${rerollCooldown} turns).`); return; }
      const setters = { one: setDiceValueOne, two: setDiceValueTwo, three: setDiceValueThree };
      setters[selected](rollDice());
      setRerollUsed(true);
      socket.emit("usedReroll", { roomId });
      setSelected(null);
      setUiMsg("");
      return;
    }

    // Fireball solo acepta el dado mágico (die three)
    if (slot === "special1" && character?.id === "wizard" && selected !== "three") {
      setUiMsg("Fireball only accepts the magic die.");
      return;
    }
    // Hidden Blade solo acepta dados de 1 o 2
    if (slot === "special1" && character?.id === "rogue" && value > 2) {
      setUiMsg("Hidden Blade only accepts dice of 1 or 2.");
      return;
    }

    //Se revisa si es ataque o defensa con odd y even
    if (slot === "attack" && !isEven(value)) {
      setUiMsg("Attack accepts even numbers only.");
      return;
    }
    if (slot === "defense" && !isOdd(value)) {
      setUiMsg("Defense accepts odd numbers only.");
      return;
    }

    //Slot already filled?
    if (slot === "attack" && attack) {
      setUiMsg("Attack already set.");
      return;
    }
    if (slot === "defense" && defense) {
      setUiMsg("Defense already set.");
      return;
    }
    if (slot === "special1" && special1) {
      setUiMsg("Special slot 1 already set.");
      return;
    }
    if (slot === "special2" && special2) {
      setUiMsg("Special slot 2 already set.");
      return;
    }

    //Place value
    if (slot === "attack") setAttack(value);
    if (slot === "defense") setDefense(value);
    if (slot === "special1") setSpecial1(value);
    if (slot === "special2") setSpecial2(value);

    //Lock the die (el dado ya no se puede volver a usar)
    setUsed((u) => ({ ...u, [selected]: true }));

    //Clear selection
    setSelected(null);
    setUiMsg("");
  };

  const isEven = (n) => typeof n === "number" && n !== 0 && n % 2 === 0;
  const isOdd = (n) => typeof n === "number" && n !== 0 && n % 2 !== 0;

  // Dice modification helpers
  const hasDiceMod = character?.id === "barbarian" || character?.id === "wizard";

  const applyPlusOne = (which) => {
    if (dicePlusOneUsed) return;
    const setters = { one: setDiceValueOne, two: setDiceValueTwo, three: setDiceValueThree };
    const vals = { one: diceValueOne, two: diceValueTwo, three: diceValueThree };
    const newVal = Math.min(6, (vals[which] || 0) + 1);
    setters[which](newVal);
    setDicePlusOneUsed(true);
  };

  const applyReroll = (which) => {
    if (rerollUsed || rerollCooldown > 0) return;
    const setters = { one: setDiceValueOne, two: setDiceValueTwo, three: setDiceValueThree };
    setters[which](rollDice());
    setRerollUsed(true);
    socket.emit("usedReroll", { roomId });
  };

  //Track num of players, update values to enemy, listen to end of round sequence
  useEffect(() => {
    const onRoomCreated = ({ roomId }) => {
      setRoomId(roomId);
      setMode("waiting");
      setGameMsg(`Room: ${roomId} (waiting opponent)`);
    };

    const onJoinedRoom = ({ roomId }) => {
      setRoomId(roomId);
      setGameMsg(`Room: ${roomId}`);
    };

    const onReturnedToLobby = () => {
      setMode("lobby");
      setRoomId("");
      setPlayerCount(0);
      setGameMsg("");
      setHp(10);
      setEnemyValues({
        hp: 10,
        diceOne: 0,
        diceTwo: 0,
        diceThree: 0,
        special1: 0,
        special2: 0,
      });
      resetLocalRound();
    };

   const onTimerTick = (seconds) => {
  setTimeLeft(seconds);
  if (seconds <= 0 && !submitted) {
    sendValues();
  }
};

    const onOpponentLeft = () => {
      if (modeRef.current === "endGame") return;
      setGameMsg("Your opponent left. Returning to lobby…");
      setTimeout(() => leaveRoom(), 800);
    };

    const onPlayerCountUpdate = (count) => {
      setPlayerCount(count);
    };

    const onBothPlayersJoined = ({ roomId }) => {
      setRoomId(roomId);
      setMode("charSelect");
    };

    const onPlayerValuesUpdated = ({ players }) => {
      if (players[userId]?.values?.hp !== undefined)
        setHp(players[userId].values.hp);
      if (players[userId]?.values?.rageCharges !== undefined)
        setRageCharges(players[userId].values.rageCharges);
      if (players[userId]?.values?.rageReady !== undefined)
        setRageReady(players[userId].values.rageReady);
      if (players[userId]?.values?.fireballActive !== undefined)
        setFireballActive(players[userId].values.fireballActive);
      if (players[userId]?.values?.fireballPower !== undefined)
        setFireballPower(players[userId].values.fireballPower);
      if (players[userId]?.values?.hideActive !== undefined)
        setHideActive(players[userId].values.hideActive);
      if (players[userId]?.values?.hideExitBonus !== undefined)
        setHideExitBonus(players[userId].values.hideExitBonus);
      if (players[userId]?.values?.rerollCooldown !== undefined)
        setRerollCooldown(players[userId].values.rerollCooldown);
      const enemy = Object.entries(players).find(([id]) => id !== userId);
      if (enemy) setEnemyValues(enemy[1].values);
    };

    const onRoundStart = ({ roundNumber, players }) => {
      setRoundNumber(roundNumber);
      setGameMsg(`Round ${roundNumber}`);
      setMode("inRoom");
      if (players) {
        if (players[userId]?.values?.hp !== undefined)
          setHp(players[userId].values.hp);
        if (players[userId]?.values?.rageCharges !== undefined)
          setRageCharges(players[userId].values.rageCharges);
        if (players[userId]?.values?.rageReady !== undefined)
          setRageReady(players[userId].values.rageReady);
        if (players[userId]?.values?.fireballActive !== undefined)
          setFireballActive(players[userId].values.fireballActive);
        if (players[userId]?.values?.fireballPower !== undefined)
          setFireballPower(players[userId].values.fireballPower);
        if (players[userId]?.values?.hideActive !== undefined)
          setHideActive(players[userId].values.hideActive);
        if (players[userId]?.values?.hideExitBonus !== undefined)
          setHideExitBonus(players[userId].values.hideExitBonus);
        const enemy = Object.entries(players).find(([id]) => id !== userId);
        if (enemy) setEnemyValues(enemy[1].values);
      }
    };

    const onRoundResult = ({ players }) => {
      const updatedHp = players[userId]?.values.hp;
      if (updatedHp !== undefined) setHp(updatedHp);
      if (players[userId]?.values?.rageCharges !== undefined)
        setRageCharges(players[userId].values.rageCharges);
      if (players[userId]?.values?.rageReady !== undefined)
        setRageReady(players[userId].values.rageReady);
      if (players[userId]?.values?.fireballActive !== undefined)
        setFireballActive(players[userId].values.fireballActive);
      if (players[userId]?.values?.fireballPower !== undefined)
        setFireballPower(players[userId].values.fireballPower);
      if (players[userId]?.values?.hideActive !== undefined)
        setHideActive(players[userId].values.hideActive);
      if (players[userId]?.values?.hideExitBonus !== undefined)
        setHideExitBonus(players[userId].values.hideExitBonus);
      const enemy = Object.entries(players).find(([id]) => id !== userId);
      if (enemy) setEnemyValues(enemy[1].values);
      resetLocalRound();
    };

    const onEndGame = ({ results }) => {
      Object.entries(results).forEach(([id, result]) => {
        if (id === userId) {
          setGameMsg(result);
          setEndResult(result);
        }
      });
      setMode("endGame");
    };

    const onGameReset = ({ message, roundNumber, players }) => {
      setGameMsg(message);
      setRoundNumber(roundNumber);
      const me = players[userId];
      if (me) setHp(me.values.hp);
      const enemy = Object.entries(players).find(([id]) => id !== userId);
      if (enemy) setEnemyValues(enemy[1].values);
      resetLocalRound();
    };

    const onRoomFull = () => setUiMsg("Room is full. Please try again later.");

    socket.on("roomCreated", onRoomCreated);
    socket.on("joinedRoom", onJoinedRoom);
    socket.on("returnedToLobby", onReturnedToLobby);
    socket.on("opponentLeft", onOpponentLeft);
    socket.on("playerCountUpdate", onPlayerCountUpdate);
    socket.on("bothPlayersJoined", onBothPlayersJoined);
    socket.on("playerValuesUpdated", onPlayerValuesUpdated);
    socket.on("roundStart", onRoundStart);
    socket.on("roundResult", onRoundResult);
    socket.on("endGame", onEndGame);
    socket.on("gameReset", onGameReset);
    socket.on("roomFull", onRoomFull);
    socket.on("timerTick", onTimerTick);

    return () => {
      socket.off("roomCreated", onRoomCreated);
      socket.off("joinedRoom", onJoinedRoom);
      socket.off("returnedToLobby", onReturnedToLobby);
      socket.off("opponentLeft", onOpponentLeft);
      socket.off("playerCountUpdate", onPlayerCountUpdate);
      socket.off("bothPlayersJoined", onBothPlayersJoined);
      socket.off("playerValuesUpdated", onPlayerValuesUpdated);
      socket.off("roundStart", onRoundStart);
      socket.off("roundResult", onRoundResult);
      socket.off("endGame", onEndGame);
      socket.off("gameReset", onGameReset);
      socket.off("roomFull", onRoomFull);
      socket.off("timerTick", onTimerTick);
      socket.disconnect();
    };
  }, []);

  return (
    <div className="gameState">
      {mode === "lobby" && (
        <div className="lobby">
          <h2>Dice and Duels!</h2>

          <div className="lobbyButtons">
            <button onClick={joinRandom}>Quick Match</button>
            <button onClick={hostRoom}>Host</button>
          </div>

          <div className="joinByCode">
            <input
              placeholder="Enter room code"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
            <button onClick={joinByCode}>Join by code</button>
          </div>

          {uiMsg && <p className="messageAlert">{uiMsg}</p>}
        </div>
      )}

      {mode === "waiting" && <Waiting roomId={roomId} onLeave={leaveRoom} />}

      {mode === "charSelect" && (
        <CharacterSelect
          socket={socket}
          roomId={roomId}
          onLeave={leaveRoom}
          onCharacterSelected={setCharacter}
        />
      )}

      {mode === "inRoom" && (
        <>
          <div className="topbar">
            <div className="hud">
              {gameMsg && <p className="messageBanner">{gameMsg}</p>}
            </div>
            <div className="roomInfo">
              <p>Room: {roomId}</p>
              <p>Players: {playerCount}/2</p>
            </div>
            <button onClick={leaveRoom}>Leave</button>
          </div>

          <div className="gameComponent">
            <div className="timer">
              <FontAwesomeIcon icon={faHourglass} size="2x" />
              <span>{timeLeft}s</span>
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
                    <button
                      className={`die extra${character?.dice?.magic > 0 ? " magic" : ""}`}
                      onClick={() => handleSelectDie("three")}
                      disabled={!diceValueThree || used.three}
                    >
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
                      <FontAwesomeIcon icon={faShieldHalved} /> {defense}
                    </p>
                    <p>
                      <FontAwesomeIcon icon={faHatWizard} /> {special1} |{" "}
                      {special2}
                    </p>
                  </div>
                </div>

                <div className="character">
                  <div className="characterCard">
                    <div className="cardButtons">
                      <button
                        onClick={() => handlePlace("attack")}
                        disabled={hideActive && character?.id === "rogue"}
                        className={hideActive && character?.id === "rogue" ? "slot-locked" : ""}
                      >
                        <FontAwesomeIcon icon={faHandFist} size="2x" />
                        <span>
                          Attack
                          {rageReady ? " x2" : ""}
                          {hideExitBonus && character?.id === "rogue" ? " +1" : ""}
                        </span>
                      </button>
                      <button onClick={() => handlePlace("defense")}>
                        <FontAwesomeIcon icon={faShieldHalved} size="2x" />
                        <span>Defense</span>
                      </button>
                      <button
                        onClick={() => handlePlace("special1")}
                        disabled={rageReady}
                        className={rageReady ? "slot-locked" : ""}
                      >
                        <FontAwesomeIcon icon={faStar} size="2x" />
                        <span>
                          {character?.id === "barbarian" && (
                            rageReady ? "Rage (READY)" :
                            rageCharges > 0 ? `Rage (${rageCharges}/2)` : "Rage"
                          )}
                          {character?.id === "wizard" && (
                            fireballActive ? `Fireball (${fireballPower})` : "Fireball"
                          )}
                          {character?.id === "rogue" && "Hidden Blade"}
                          {!character && "Special 1"}
                        </span>
                      </button>
                      <button onClick={() => handlePlace("special2")}>
                        <FontAwesomeIcon icon={faStar} size="2x" />
                        <span>
                          {character?.id === "rogue"
                            ? hideActive ? "Hide (ON)" : "Hide"
                            : character?.skills?.special2?.name ?? "Special 2"}
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="characterProfile">
                    <FontAwesomeIcon icon={faGhost} size="8x" />
                  </div>
                </div>

                <p>
                  <FontAwesomeIcon icon={faHeart} /> {hp}
                </p>
                <button
                  onClick={sendValues}
                  disabled={!diceRolled || submitted}
                >
                  {submitted ? "Waiting..." : "Start Round"}
                </button>
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
                    <button className="die" disabled={true}>
                      <FontAwesomeIcon
                        icon={diceIcons[enemyValues.diceOne ?? 0]}
                        size="3x"
                      />
                    </button>
                    <button className="die" disabled={true}>
                      <FontAwesomeIcon
                        icon={diceIcons[enemyValues.diceTwo ?? 0]}
                        size="3x"
                      />
                    </button>
                    <button className="die" disabled={true}>
                      <FontAwesomeIcon
                        icon={diceIcons[enemyValues.diceThree ?? 0]}
                        size="3x"
                      />
                    </button>
                  </div>
                </div>

                <div className="character">
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
      )}

      {mode === "endGame" && <EndGame result={endResult} onLeave={leaveRoom} />}
    </div>
  );
}
