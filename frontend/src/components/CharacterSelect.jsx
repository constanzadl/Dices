import { useEffect, useState } from "react";

export default function CharacterSelect({ socket, roomId, onLeave, onCharacterSelected }) {
  const [characters, setCharacters] = useState({});
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    socket.emit("getCharacters");

    const onCharactersList = (data) => {
      setCharacters(data);
    };

    socket.on("charactersList", onCharactersList);
    return () => socket.off("charactersList", onCharactersList);
  }, [socket]);

  const handleConfirm = () => {
    if (!selected || confirmed) return;
    setConfirmed(true);
    onCharacterSelected(characters[selected]);
    socket.emit("selectCharacter", { roomId, characterId: selected });
  };

  const charList = Object.values(characters);
  const selectedChar = characters[selected];

  return (
    <div className="charSelect">
      <h2>Choose your class</h2>

      <div className="charGrid">
        {charList.map((char) => (
          <div
            key={char.id}
            className={`charCard ${selected === char.id ? "active" : ""}`}
            onClick={() => !confirmed && setSelected(char.id)}
          >
            <h3>{char.name}</h3>
            <p>HP: {char.hp}</p>
            <p>
              Dice: {char.dice.normal} normal
              {char.dice.magic > 0 ? ` + ${char.dice.magic} magic` : ""}
            </p>
          </div>
        ))}
      </div>

      {selectedChar && (
        <div className="charDetail">
          <h3>{selectedChar.name}</h3>
          <p>{selectedChar.skills.special1.name}: {selectedChar.skills.special1.description}</p>
          <p>{selectedChar.skills.special2.name}: {selectedChar.skills.special2.description}</p>
        </div>
      )}

      <div className="charSelectActions">
        <button onClick={handleConfirm} disabled={!selected || confirmed}>
          {confirmed ? "Waiting for opponent..." : "Confirm"}
        </button>
        <button onClick={onLeave} disabled={confirmed}>Leave</button>
      </div>
    </div>
  );
}
