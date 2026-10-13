export default function EndGame({ onLeave, result }) {
  return (
    <div className="endGame">
      <p>Game Over</p>
      <p>{result}</p>
      <button onClick={onLeave}>Leave</button>
    </div>
  );
}