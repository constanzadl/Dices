export default function Waiting({ roomId, onLeave }) {
  return (
    <div className="waiting">
      <p>Waiting for opponent...</p>
      <div>{roomId}</div>
      <button onClick={onLeave}>Leave</button>
    </div>
  );
}