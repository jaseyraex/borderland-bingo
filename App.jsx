import React, { useEffect, useState } from "react";
import { card, draw, win } from "./game.js";

const patterns = ["Horizontal", "Vertical", "Diagonal", "Corners", "X", "Blackout"];
const letters = ["B", "I", "N", "G", "O"];
const speedChoices = [3, 5, 8, 10, 15, 20, 30];
const ballLabel = (n) => n ? `${letters[Math.floor((n - 1) / 15)]}-${n}` : "—";

export default function App() {
  const [page, setPage] = useState("home");
  const [name, setName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [patternsChosen, setPatternsChosen] = useState(["Horizontal"]);
  const [board, setBoard] = useState(card());
  const [calls, setCalls] = useState([]);
  const [marks, setMarks] = useState([12]);
  const [running, setRunning] = useState(false);
  const [won, setWon] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [countdown, setCountdown] = useState(0);
  const [dark, setDark] = useState(false);
  const [roomStarted, setRoomStarted] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [roomCapacity, setRoomCapacity] = useState("");

  const selectedWin = win(board, marks, patternsChosen, calls);

  // Shared room links prefill the join screen with the room code.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedRoom = params.get("room");
    if (sharedRoom) {
      setCode(sharedRoom.toUpperCase());
      setPage("join");
    }
  }, []);

  function copyRoomLink() {
    const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(code)}`;
    navigator.clipboard?.writeText(link).then(() => alert("Room joining link copied!"), () => alert(link));
  }

  function create() {
    if (!name.trim()) return alert("Please enter your player name first.");
    setPage("create");
  }
  function createRoom() {
    if (!roomName.trim()) return alert("Please enter a room name.");
    if (!patternsChosen.length) return alert("Choose at least one winning pattern.");
    const capacity = Number(roomCapacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) return alert("Set room capacity to any whole number from 1 to 50.");
    setCode(Math.random().toString(36).slice(2, 7).toUpperCase());
    setRoomStarted(false);
    setParticipants([{ name, role: "HOST" }]);
    setPage("lobby");
  }
  function startGame() {
    setRoomStarted(true);
    setPage("game");
    setRunning(false);
    setCountdown(3);
  }
  function drawOne() {
    setCalls((prev) => {
      const next = draw(prev);
      return next == null ? prev : [...prev, next];
    });
  }
  function toggleMark(index) {
    const value = board[Math.floor(index / 5)][index % 5];
    if (value === "FREE" || !calls.includes(value)) return;
    setMarks((prev) => prev.includes(index) ? prev.filter((x) => x !== index) : [...prev, index]);
  }
  function home() {
    if (confirm("Return to Home? This will leave the current prototype game.")) {
      setRunning(false); setCountdown(0); setPage("home"); setRoomStarted(false);
    }
  }
  function resetCalls() {
    if (confirm("Reset all called numbers and marked tiles for this round?")) {
      setCalls([]); setMarks([12]); setWon(false); setRunning(false); setCountdown(0);
    }
  }
  function endRound() {
    if (confirm("End this round and return to the lobby? A fresh card and caller sequence will be created.")) {
      setBoard(card()); setCalls([]); setMarks([12]); setWon(false); setRunning(false); setCountdown(0); setPage("lobby");
    }
  }

  // The 3-second pre-game countdown; the caller begins after it reaches zero.
  useEffect(() => {
    if (page !== "game" || countdown <= 0) return;
    const timer = setTimeout(() => {
      if (countdown === 1) { setCountdown(0); setRunning(true); }
      else setCountdown((v) => v - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [page, countdown]);

  // Automatic calls. Changing the speed while running immediately updates the timer.
  useEffect(() => {
    if (page !== "game" || !running || won || calls.length >= 75) return;
    const timer = setInterval(drawOne, speed * 1000);
    return () => clearInterval(timer);
  }, [page, running, won, calls.length, speed]);

  const speedSelect = <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
    {speedChoices.map((s) => <option key={s} value={s}>Every {s} seconds</option>)}
  </select>;

  return <div className={`shell ${dark ? "dark-mode" : ""}`}>
    <header>
      <div className="brand"><img src="/borderland-bingo-logo.png" alt="Borderland Bingo" /></div>
      <span>COMMUNITY GAME</span>
      <button className="theme-toggle" onClick={() => setDark((v) => !v)}>{dark ? "☀ LIGHT" : "☾ DARK"}</button>
    </header>

    {page === "home" && <main className="hero">
      <img className="hero-logo" src="/borderland-bingo-logo.png" alt="Borderland Bingo" />
      <p>Gather your people. Watch the numbers. Mark your card.<br />One call could change everything.</p>
      <div className="home-fields"><label>PLAYER NAME</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your player name" maxLength={24} /></div>
      <div className="home-actions"><button onClick={create}>CREATE A GAME ↗</button><button className="alt" onClick={() => { if (!name.trim()) return alert("Please enter your player name first."); setPage("join"); }}>JOIN A GAME</button></div>
      <div className="tags">75 BALLS　·　5×5 CARDS　·　PLAY TOGETHER</div>
    </main>}

    {page === "create" && <main className="panel">
      <button className="back" onClick={() => setPage("home")}>← BACK</button><small>HOST SETUP</small><h2>Create a game</h2>
      <label>ROOM NAME</label><input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Friday Guild Bingo" maxLength={40} />
      <h3>WINNING PATTERNS</h3><div className="patterns">{patterns.map((p) => <button key={p} className={patternsChosen.includes(p) ? "chosen" : ""} onClick={() => setPatternsChosen((old) => old.includes(p) ? old.filter((x) => x !== p) : [...old, p])}>{p}</button>)}</div>
      <label>CALL INTERVAL</label><p className="hint">Choose the call speed now. You can change it during the game.</p>{speedSelect}
      <label>ROOM CAPACITY</label><p className="hint">Choose any whole number from 1 to 50. The host is included in the capacity.</p><input type="number" min="1" max="50" value={roomCapacity} onChange={(e) => setRoomCapacity(e.target.value)} placeholder="Enter any number (max 50)" />
      <button className="primary-wide" onClick={createRoom}>CREATE ROOM</button>
    </main>}

    {page === "join" && <main className="panel">
      <button className="back" onClick={() => setPage("home")}>← BACK</button><small>PLAYER SETUP</small><h2>Join a game</h2><p className="hint">Joining as <b>{name}</b></p>
      <label>ROOM CODE</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter room code" maxLength={5}/>
      <button className="primary-wide" onClick={() => alert("This prototype is not connected to multiplayer yet. In the multiplayer version, rooms will be listed and started rooms will reject joins.")}>JOIN ROOM</button>
      <p className="hint">Players can join only while the host is in the lobby. Once the game starts, joining is closed.</p>
    </main>}

    {page === "lobby" && <main className="panel lobby">
      <button className="back" onClick={() => setPage("home")}>← HOME</button><small>WAITING ROOM</small><h2>{roomName}</h2>
      <p className="room-label">ROOM CODE</p><div className="code">{code}<button className="copy" onClick={() => navigator.clipboard?.writeText(code)}>COPY CODE</button><button className="copy link-copy" title="Copy shareable joining link" aria-label="Copy shareable joining link" onClick={copyRoomLink}>⛓</button></div>
      <h3>WINNING PATTERNS</h3><div className="patterns">{patterns.map((p) => <button key={p} className={patternsChosen.includes(p) ? "chosen" : ""} onClick={() => setPatternsChosen((old) => old.includes(p) ? old.filter((x) => x !== p) : [...old, p])}>{p}</button>)}</div>
      <label>CALL INTERVAL</label>{speedSelect}<div className="participant-summary"><strong>PARTICIPANTS: {participants.length}/{roomCapacity}</strong><span>Joining closes when the game starts.</span></div><div className="waiting-grid"><div className="participant-list"><h3>IN THE ROOM</h3>{participants.map((p,i)=><div className="participant" key={i}>♟ {p.name}<small>{p.role}</small></div>)}</div></div><button className="primary-wide" onClick={startGame}>START GAME</button><p className="hint">3-second countdown before the first ball. New players cannot join after the game starts.</p>
    </main>}

    {page === "game" && <main className="game">
      <section className="board-area">
        <div className="gamehead"><div><small>ROOM {code}</small><h2>{roomName}</h2></div><div className="game-actions"><button className="alt small" onClick={() => { setRunning((v) => !v); setCountdown(0); }}>{running ? "PAUSE CALLER" : "RESUME CALLER"}</button><button className="alt small" onClick={home}>⌂ HOME</button></div></div>
        <div className="letters">{letters.map((l) => <b key={l}>{l}</b>)}</div>
        <div className="board">{board.flat().map((v, i) => <button key={i} className={`${marks.includes(i) ? "marked " : ""}${calls.includes(v) ? "called " : ""}${v === "FREE" ? "free" : ""}`} onClick={() => toggleMark(i)}>{v}</button>)}</div>
        <button className={`claim ${selectedWin ? "ready" : ""}`} disabled={!selectedWin || won} onClick={() => { setWon(true); setRunning(false); }}>{won ? "CLAIM SUBMITTED" : selectedWin ? "🎉 BINGO — CLAIM YOUR WIN" : "BINGO"}</button>
        <p className="hint">Called numbers highlight. Mark them manually; you can mark called numbers later.</p><div className="game-participants"><strong>PARTICIPANTS {participants.length}/{roomCapacity}</strong><div>{participants.map((p,i)=><span key={i}>{p.name}{p.role === "HOST" ? " · HOST" : ""}</span>)}</div></div>
      </section>
      <aside>
        <small>LAST NUMBER CALLED</small><div className="ball">{ballLabel(calls.at(-1))}</div>
        {countdown > 0 && <div className="countdown">STARTING IN<strong>{countdown}</strong></div>}
        <p className="caller-status">{running && !won && calls.length < 75 ? `AUTO-CALLING EVERY ${speed} SECONDS` : "CALLER PAUSED"}</p>
        <label className="speed-label">CALL INTERVAL · CHANGE LIVE</label>{speedSelect}
        <button className="action-button" onClick={drawOne} disabled={countdown > 0 || calls.length >= 75}>CALL NEXT MANUALLY</button>
        <button className="alt action-button" onClick={resetCalls}>RESET CALLS</button>
        <h3>CALL HISTORY <small>{calls.length}/75</small></h3><div className="history">{calls.slice().reverse().map((n) => <span key={n}>{letters[Math.floor((n - 1) / 15)]}{n}</span>)}</div>
        <button className="alt action-button end-button" onClick={endRound}>END ROUND / NEW ROUND</button>
      </aside>
      {won && <div className="overlay"><div className="winbox"><div>🏆</div><small>CLAIM CONFIRMED — PROTOTYPE</small><h1>BINGO!</h1><button onClick={() => setPage("lobby")}>BACK TO LOBBY</button></div></div>}
    </main>}
    <footer>♠ BORDERLAND BINGO <span>FRONTEND PROTOTYPE</span></footer>
  </div>;
}
