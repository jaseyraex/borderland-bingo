import React, { useEffect, useState, useRef } from "react";
import { card, win } from "./game.js";
import { createRoomApi, joinRoomApi, connectRoomSocket } from "./multiplayer.js";

const patterns = ["Horizontal", "Vertical", "Diagonal", "Corners", "X", "Blackout"];
const letters = ["B", "I", "N", "G", "O"];
const speedChoices = [3, 5, 8, 10, 15, 20, 30];
const ballLabel = (n) => n ? `${letters[Math.floor((n - 1) / 15)]}-${n}` : "—";


function playBallDrawSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    // A quick lottery-ball style rising tone with a soft percussive click.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.24);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.29);
    osc.onended = () => ctx.close();
  } catch {}
}

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
  const [sharedLink, setSharedLink] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [playerId, setPlayerId] = useState("");
  const [playerToken, setPlayerToken] = useState("");
  const [serverState, setServerState] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [kickTarget, setKickTarget] = useState(null);
  const [kickedNotice, setKickedNotice] = useState(false);\n  const [exitConfirm, setExitConfirm] = useState(false);
  const socketRef = useRef(null);
  const lastCallRef = useRef(0);
  const fanfareRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectEnabledRef = useRef(true);

  const selectedWin = win(board, marks, patternsChosen, calls);
  const isHost = serverState?.players?.some(p => p.id === playerId && p.role === "HOST") || false;

  function applySnapshot(s) {
    if (!s) return;
    setServerState(s);
    if (s.myCard) setBoard(s.myCard);
    if (Array.isArray(s.myMarks)) setMarks(s.myMarks);
    setCalls(s.calls || []);
    setRoomName(s.roomName || roomName);
    setCode(s.code || code);
    setRoomCapacity(String(s.capacity ?? roomCapacity));
    setPatternsChosen(s.patterns || patternsChosen);
    setSpeed(s.interval || speed);
    setParticipants((s.players || []).map(p => ({name:p.name,role:p.role,id:p.id})));
    setRunning(Boolean(s.started && !s.paused && !s.announcement));
    setWon(Boolean(s.announcement));
    if (s.announcement && !announcementDismissed) setAnnouncementDismissed(false);
  }

  function handleServerMessage(message) {
    if (message.snapshot) {
      applySnapshot(message.snapshot);
      if (message.snapshot.started) setPage("game");
      else if (message.snapshot.code) setPage("lobby");
    }
    if (message.type === "STARTED") { setPage("game"); setCountdown(3); }
    if (message.type === "NEW_ROUND") { setPage("lobby"); setCountdown(0); }
    if (message.type === "RESET") { setPage("game"); setCountdown(0); }
    if (message.type === "CLAIM_REJECTED") alert(message.message || "Bingo claim rejected.");
    if (message.type === "ERROR") alert(message.message || "Connection error.");
    if (message.type === "KICK_SUCCESS") { /* host receives room snapshot; no browser prompt */ }
    if (message.type === "KICK_FAILED") { alert(message.message || "Unable to remove player."); }
    if (message.type === "KICKED") { reconnectEnabledRef.current = false; if(reconnectTimerRef.current){clearTimeout(reconnectTimerRef.current);reconnectTimerRef.current=null;} if(socketRef.current){socketRef.current.close();socketRef.current=null;} localStorage.removeItem("borderlandBingoSession"); setServerState(null); setPlayerId(""); setPlayerToken(""); setPage("home"); setKickedNotice(true); }
  }

  function attachSocket(roomCode, id, token) {
    reconnectEnabledRef.current = true;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (socketRef.current) {
      const previous = socketRef.current;
      socketRef.current = null;
      previous.close();
    }
    const socket = connectRoomSocket(roomCode, id, token, handleServerMessage, (status) => {
      setConnectionStatus(status);
      if (status === "connected") {
        reconnectAttemptsRef.current = 0;
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      } else if (status === "disconnected" || status === "error") {
        // A dropped connection does NOT remove the player from the Durable Object room.
        // Reconnect automatically and receive the latest room/game snapshot.
        if (!reconnectEnabledRef.current) return;
        const saved = localStorage.getItem("borderlandBingoSession");
        if (!saved) return;
        let session;
        try { session = JSON.parse(saved); } catch { return; }
        if (session.code !== roomCode || session.playerId !== id || session.playerToken !== token) return;
        if (reconnectTimerRef.current) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 15000);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          const latest = localStorage.getItem("borderlandBingoSession");
          if (!reconnectEnabledRef.current || !latest) return;
          try {
            const check = JSON.parse(latest);
            if (check.code === roomCode && check.playerId === id && check.playerToken === token) attachSocket(roomCode, id, token);
          } catch {}
        }, delay);
      }
    });
    socketRef.current = socket;
  }

  useEffect(() => {
    const reconnectWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return;
      const saved = localStorage.getItem("borderlandBingoSession");
      if (!saved) return;
      try {
        const session = JSON.parse(saved);
        if (session?.code && session?.playerId && session?.playerToken) attachSocket(session.code, session.playerId, session.playerToken);
      } catch {}
    };
    window.addEventListener("online", reconnectWhenVisible);
    document.addEventListener("visibilitychange", reconnectWhenVisible);
    return () => {
      window.removeEventListener("online", reconnectWhenVisible);
      document.removeEventListener("visibilitychange", reconnectWhenVisible);
    };
  }, []);

  function sendAction(type, payload = {}) {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({type, ...payload}));
    else alert("Not connected to the room yet. Please wait and try again.");
  }
  useEffect(() => {
    fanfareRef.current = new Audio("/sounds/fanfare.mp3");
    fanfareRef.current.volume = 0.85;
    return () => { if (fanfareRef.current) { fanfareRef.current.pause(); fanfareRef.current = null; } };
  }, []);

  useEffect(() => {
    if (won && soundOn && fanfareRef.current) {
      fanfareRef.current.currentTime = 0;
      fanfareRef.current.play().catch(() => {});
    }
    if (!soundOn && fanfareRef.current) fanfareRef.current.pause();
  }, [won, soundOn]);


  // Shared room links prefill the join screen with the room code.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedRoom = params.get("room");
    if (sharedRoom) {
      setCode(sharedRoom.toUpperCase());
      setSharedLink(true);
      setPage("join");
    }
  }, []);
  // Restore an existing room session after refresh, including the host's session.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("room")) return;
    const saved = localStorage.getItem("borderlandBingoSession");
    if (!saved) return;
    try {
      const session = JSON.parse(saved);
      if (!session?.code || !session?.playerId || !session?.playerToken) return;
      setName(session.name || "");
      setCode(session.code);
      setPlayerId(session.playerId);
      setPlayerToken(session.playerToken);
      setRoomName(session.roomName || "");
      setPage("lobby");
      attachSocket(session.code, session.playerId, session.playerToken);
    } catch {
      localStorage.removeItem("borderlandBingoSession");
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
  async function createRoom() {
    if (!roomName.trim()) return alert("Please enter a room name.");
    if (!patternsChosen.length) return alert("Choose at least one winning pattern.");
    const capacity = Number(roomCapacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) return alert("Set room capacity to any whole number from 1 to 50.");
    try {
      const result = await createRoomApi({hostName:name.trim(),roomName:roomName.trim(),capacity,patterns:patternsChosen,interval:speed});
      const id=result.hostPlayerId || "host";
      setPlayerId(id); setPlayerToken(result.hostToken); applySnapshot(result); setRoomStarted(false); setPage("lobby");
      localStorage.setItem("borderlandBingoSession", JSON.stringify({code:result.code,playerId:id,playerToken:result.hostToken,name:name.trim(),roomName:roomName.trim(),role:"HOST"}));
      attachSocket(result.code,id,result.hostToken);
    } catch (e) { alert(e.message || "Unable to create room. Make sure multiplayer backend is deployed."); }
  }
  function goHome() {
    reconnectEnabledRef.current = false;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
    localStorage.removeItem("borderlandBingoSession");
    setServerState(null); setPlayerId(""); setPlayerToken(""); setPage("home");
  }

  function kickPlayer(targetId) {
    if (!isHost || targetId === playerId) return;
    const target = participants.find(p => p.id === targetId);
    if (target) setKickTarget(target);
  }
  function confirmKick() {
    if (!kickTarget) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) { alert("Host connection is not ready. Please try again."); setKickTarget(null); return; }
    sendAction("KICK", {playerId: kickTarget.id});
    setKickTarget(null);
  }

  function startGame() {
    if (!isHost) return;
    sendAction("START");
  }
  function drawOne() {
    if (!isHost) return;
    sendAction("CALL");
  }
  function toggleMark(index) {
    const value = board[Math.floor(index / 5)][index % 5];
    if (value === "FREE" || !calls.includes(value)) return;
    sendAction("MARK", {index});
  }
  function home() {
    setExitConfirm(true);
  }
  function confirmExitRoom() {
    setExitConfirm(false);
    setRunning(false); setCountdown(0); setRoomStarted(false);
    // Explicitly remove this player from the room. Background/tab disconnects do not remove players.
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "EXIT" }));
      setTimeout(() => {
        if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
        setServerState(null); setPlayerId(""); setPlayerToken(""); localStorage.removeItem("borderlandBingoSession");
        setPage("home");
      }, 120);
    } else {
      if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
      setServerState(null); setPlayerId(""); setPlayerToken(""); localStorage.removeItem("borderlandBingoSession");
      setPage("home");
    }
  }
  function resetCalls() {
    if (confirm("Reset all called numbers and marked tiles for this round?")) {
      sendAction("RESET"); setWon(false); setRunning(false); setCountdown(0); if (fanfareRef.current) { fanfareRef.current.pause(); fanfareRef.current.currentTime = 0; }
    }
  }
  function endRound() {
    if (confirm("End this round and return to the lobby? A fresh card and caller sequence will be created.")) {
      sendAction("NEW_ROUND"); setWon(false); setRunning(false); setCountdown(0); if (fanfareRef.current) { fanfareRef.current.pause(); fanfareRef.current.currentTime = 0; }
    }
  }

  // The 3-second pre-game countdown; the caller begins after it reaches zero.
  useEffect(() => {
    if (page !== "game" || countdown <= 0) return;
    const timer = setTimeout(() => {
      if (countdown === 1) {
        setCountdown(0);
        // Host releases the first shared ball immediately after countdown.
        if (isHost) drawOne();
        setRunning(true);
      }
      else setCountdown((v) => v - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [page, countdown, isHost]);

  // Automatic calls. Changing the speed while running immediately updates the timer.
  useEffect(() => {
    if (page !== "game" || !isHost || !serverState?.started || serverState.paused || serverState.announcement || countdown > 0 || calls.length >= 75) return;
    const timer = setInterval(drawOne, speed * 1000);
    return () => clearInterval(timer);
  }, [page, isHost, serverState?.started, serverState?.paused, serverState?.announcement, countdown, calls.length, speed]);

  useEffect(() => {
    if (calls.length > lastCallRef.current && soundOn) playBallDrawSound();
    lastCallRef.current = calls.length;
  }, [calls.length, soundOn]);

  const speedSelect = <select value={speed} onChange={(e) => { const next=Number(e.target.value); setSpeed(next); if (serverState && playerId) sendAction("SET_INTERVAL",{interval:next}); }}>
    {speedChoices.map((s) => <option key={s} value={s}>Every {s} seconds</option>)}
  </select>;

  return <div className={`shell ${dark ? "dark-mode" : ""}`}>
    <header>
      <button className="logo-home" aria-label="Go to homepage" onClick={goHome}><img src="/borderland-bingo-logo.png" alt="Borderland Bingo" /></button>
      <span>COMMUNITY GAME</span>
      <button className="theme-toggle" onClick={() => setDark((v) => !v)}>{dark ? "☀ LIGHT" : "☾ DARK"}</button><button className="theme-toggle" onClick={() => setSoundOn((v) => !v)}>{soundOn ? "🔊 SOUND ON" : "🔇 SOUND OFF"}</button>
    </header>

    {page === "home" && <main className="hero">
      <img className="hero-logo clickable-logo" onClick={goHome} role="button" tabIndex="0" onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" ")goHome();}} src="/borderland-bingo-logo.png" alt="Borderland Bingo" />
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
      <button className="back" onClick={() => { setPage("home"); setSharedLink(false); }}>← BACK</button><small>PLAYER SETUP</small><h2>Join a game</h2>
      {sharedLink ? <><p className="hint">You're joining room <b>{code}</b>. Enter your player name to continue.</p><label>PLAYER NAME</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your player name" maxLength={24}/></> : <><p className="hint">Joining as <b>{name}</b></p><label>ROOM CODE</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter room code" maxLength={5}/></>}
      <button className="primary-wide" onClick={async () => { if (!name.trim()) return alert("Please enter your player name."); if (!code.trim()) return alert("Please enter the room code."); try { const result=await joinRoomApi(code.trim().toUpperCase(),name.trim()); setPlayerId(result.playerId); setPlayerToken(result.playerToken); applySnapshot(result.snapshot); setPage("lobby");
      localStorage.setItem("borderlandBingoSession", JSON.stringify({code:code.trim().toUpperCase(),playerId:result.playerId,playerToken:result.playerToken,name:name.trim(),roomName:result.snapshot?.roomName || "",role:"PLAYER"}));
      attachSocket(code.trim().toUpperCase(),result.playerId,result.playerToken); } catch(e) { alert(e.message || "Unable to join room."); } }}>JOIN ROOM</button>
      <p className="hint">Players can join only while the host is in the lobby. Once the game starts, joining is closed.</p>
    </main>}

    {page === "lobby" && <main className={`panel lobby ${isHost ? "host-lobby" : "player-lobby"}`}>
      <button className="back" onClick={() => {reconnectEnabledRef.current=false; if(reconnectTimerRef.current){clearTimeout(reconnectTimerRef.current);reconnectTimerRef.current=null;} setPage("home"); if(socketRef.current){socketRef.current.close();socketRef.current=null;} setServerState(null);setPlayerId("");setPlayerToken("");}}>← HOME</button><small>WAITING ROOM</small>
      {isHost ? <><h2>{roomName}</h2><p className="room-label">ROOM CODE</p><div className="code">{code}<button className="copy" onClick={() => navigator.clipboard?.writeText(code)}>COPY CODE</button><button className="copy link-copy" title="Copy shareable joining link" aria-label="Copy shareable joining link" onClick={copyRoomLink}><svg viewBox="0 0 24 24" aria-hidden="true" className="link-icon"><path d="M10 13a5 5 0 0 0 7.07 0l3-3A5 5 0 0 0 13 8.93"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 16.07"/></svg></button></div></> : <div className="player-room-heading"><h2>{roomName}</h2><span className="player-room-code">{code}<button className="copy" onClick={() => navigator.clipboard?.writeText(code)}>COPY</button><button className="copy link-copy" title="Copy shareable joining link" aria-label="Copy shareable joining link" onClick={copyRoomLink}>↗</button></span></div>}
      {isHost ? <><h3>WINNING PATTERNS</h3><div className="patterns">{patterns.map((p) => <button key={p} className={patternsChosen.includes(p) ? "chosen" : ""} disabled={serverState?.started} onClick={() => { const next=patternsChosen.includes(p)?patternsChosen.filter(x=>x!==p):[...patternsChosen,p]; if(next.length){setPatternsChosen(next);sendAction("SET_PATTERNS",{patterns:next});} }}>{p}</button>)}</div><label>CALL INTERVAL</label>{speedSelect}</> : <div className="player-selected-patterns"><strong>WINNING PATTERN{patternsChosen.length>1?"S":""}</strong><span>{patternsChosen.join(" · ")}</span></div>}
      <div className="participant-summary"><strong>PARTICIPANTS: {participants.length}/{roomCapacity}</strong><span>Joining closes when the game starts.</span></div><div className="waiting-grid"><div className="participant-list"><h3>IN THE ROOM</h3>{participants.map((p,i)=><div className="participant" key={p.id||i}><span className="participant-name">♟ {p.name}</span>{p.role === "HOST" && <small className="host-label">HOST</small>}{isHost && p.role!=="HOST" && <button className="kick-mini" title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`} onClick={(e)=>{e.stopPropagation();kickPlayer(p.id);}}>×</button>}</div>)}</div></div>
      {!isHost && <section className="waiting-card-preview"><h3>YOUR BINGO CARD</h3><div className="preview-letters">{letters.map(l=><b key={l}>{l}</b>)}</div><div className="preview-board">{board.flat().map((v,i)=><div key={i} className={v==="FREE"?"free":""}>{v}</div>)}</div><button className="alt refresh-card" onClick={()=>sendAction("REFRESH_CARD")}>↻ REFRESH CARD</button><p className="hint">You can refresh your card until the host starts the game.</p></section>}
      {isHost && <button className="primary-wide" onClick={startGame}>START GAME</button>}<p className="hint">3-second countdown before the first ball. New players cannot join after the game starts.</p>
    </main>}

    {page === "game" && <main className={`game ${!isHost ? "player-game" : "host-game"}`}>
      <section className="board-area">
        <div className={`gamehead ${!isHost ? "player-gamehead" : ""}`}><div><small>ROOM {code}</small><h2>{roomName}</h2>{!isHost && <div className="player-game-pattern"><strong>WINNING PATTERN</strong><span>{patternsChosen.join(" · ")}</span></div>}</div><div className="game-actions">{isHost && <button className="alt small" onClick={() => { setCountdown(0); sendAction(serverState?.paused ? "RESUME" : "PAUSE"); }}>{serverState?.paused ? "RESUME CALLER" : "PAUSE CALLER"}</button>}<button className="alt small" onClick={home}>⌂ HOME</button></div></div>
        <div className="letters">{letters.map((l) => <b key={l}>{l}</b>)}</div>
        <div className="board">{board.flat().map((v, i) => <button key={i} className={`${marks.includes(i) ? "marked " : ""}${calls.includes(v) ? "called " : ""}${v === "FREE" ? "free" : ""}`} onClick={() => toggleMark(i)}>{v}</button>)}</div>
        <button className={`claim ${selectedWin ? "ready" : ""}`} disabled={!selectedWin || Boolean(serverState?.winners?.some(w=>w.playerId===playerId)) || Boolean(serverState?.announcement)} onClick={() => sendAction("CLAIM")}>{serverState?.winners?.some(w=>w.playerId===playerId) ? "CLAIM SUBMITTED" : selectedWin ? "🎉 BINGO — CLAIM YOUR WIN" : "BINGO"}</button>
        <p className="hint">Called numbers highlight. Mark them manually; you can mark called numbers later.</p><div className="game-participants"><strong>PARTICIPANTS {participants.length}/{roomCapacity}</strong><div>{participants.map((p,i)=><span className="game-player-chip" key={p.id||i}>{p.name}{p.role === "HOST" ? " · HOST" : ""}{isHost && p.role!=="HOST" && <button className="kick-mini" title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`} onClick={(e)=>{e.stopPropagation();kickPlayer(p.id);}}>×</button>}</span>)}</div></div>
      </section>
      <aside>
        <small>LAST NUMBER CALLED</small><div className="ball">{ballLabel(calls.at(-1))}</div>
        {countdown > 0 && <div className="countdown">STARTING IN<strong>{countdown}</strong></div>}
        <p className={`caller-status ${!isHost ? "host-only" : ""}`}>{serverState?.announcement ? "CALLER PAUSED — WINNER ANNOUNCED" : running && calls.length < 75 ? `AUTO-CALLING EVERY ${speed} SECONDS` : "CALLER PAUSED"}</p>{isHost && <div className="active-patterns"><strong>WINNING PATTERN{patternsChosen.length>1?"S":""}</strong><span>{patternsChosen.join(" · ")}</span></div>}
        {isHost && <><label className="speed-label">CALL INTERVAL · CHANGE LIVE</label>{speedSelect}</> }
        {isHost && <button className="action-button" onClick={drawOne} disabled={countdown > 0 || calls.length >= 75 || Boolean(serverState?.announcement)}>CALL NEXT MANUALLY</button>}
        {isHost && <button className="alt action-button" onClick={resetCalls}>RESET CALLS</button>}
        <h3>CALL HISTORY <small>{calls.length}/75</small></h3><div className="history">{calls.slice().reverse().map((n) => <span key={n}>{letters[Math.floor((n - 1) / 15)]}{n}</span>)}</div>
        {isHost && <button className="alt action-button end-button" onClick={endRound}>END ROUND / NEW ROUND</button>}
      </aside>
      {serverState?.announcement && !announcementDismissed && <div className="overlay"><div className="confetti" aria-hidden="true">{Array.from({length: 70}, (_, i) => <span key={i} style={{left: `${(i * 37) % 100}%`, animationDelay: `${(i % 17) * -0.23}s`, animationDuration: `${3.2 + (i % 9) * 0.35}s`, transform: `rotate(${(i * 53) % 360}deg`}} />)}</div><div className="winbox"><button className="popup-close" aria-label="Close winner popup" onClick={()=>setAnnouncementDismissed(true)}>×</button><div>🏆</div><small>CONGRATULATIONS!</small><h1>BINGO!</h1><p><b>{serverState.announcement.name}</b> won! (Winner #{serverState.announcement.order})</p><div className="winner-list"><strong>WINNERS IN ORDER</strong>{(serverState.winners||[]).map((w,i)=><div key={w.playerId||i}>{w.name}</div>)}</div>{isHost && <button onClick={() => {setAnnouncementDismissed(false);sendAction("CONTINUE")}}>CONTINUE GAME</button>}</div></div>}
    </main>}
    {exitConfirm && <div className="overlay exit-confirm-overlay" role="dialog" aria-modal="true"><div className="winbox exit-confirm"><h2>LEAVE GAME?</h2><p>This will exit the game and remove you from the room.</p><div className="kick-confirm-actions"><button className="alt" onClick={()=>setExitConfirm(false)}>CANCEL</button><button onClick={confirmExitRoom}>EXIT GAME</button></div></div></div>}
    {kickTarget && <div className="overlay kick-confirm-overlay" role="dialog" aria-modal="true"><div className="winbox kick-confirm"><button className="popup-close" aria-label="Close" onClick={()=>setKickTarget(null)}>×</button><h2>REMOVE PLAYER?</h2><p>Are you sure you want to remove <b>{kickTarget.name}</b> from this room?</p><p className="hint">They will be notified and returned to the homepage.</p><div className="kick-confirm-actions"><button className="alt" onClick={()=>setKickTarget(null)}>CANCEL</button><button className="danger" onClick={confirmKick}>REMOVE PLAYER</button></div></div></div>}
    {kickedNotice && <div className="overlay removed-overlay" role="dialog" aria-modal="true"><div className="winbox removed-box"><h2>SORRY!</h2><p>You have been removed by the host.</p><button onClick={()=>{setKickedNotice(false);goHome();}}>RETURN TO HOMEPAGE</button></div></div>}
    <footer>♠ BORDERLAND BINGO</footer>
  </div>;
}
