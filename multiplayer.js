export async function createRoomApi(data){
  const r=await fetch("/api/rooms",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
  const b=await r.json();if(!r.ok)throw new Error(b.error||"Could not create room.");return b;
}
export async function joinRoomApi(code,name){
  const r=await fetch(`/api/rooms/${encodeURIComponent(code)}/join`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})});
  const b=await r.json();if(!r.ok)throw new Error(b.error||"Could not join room.");return b;
}
export function connectRoomSocket(code,playerId,playerToken,onMessage,onStatus){
  const proto=location.protocol==="https:"?"wss:":"ws:";
  const ws=new WebSocket(`${proto}//${location.host}/api/rooms/${encodeURIComponent(code)}/socket?playerId=${encodeURIComponent(playerId)}&token=${encodeURIComponent(playerToken)}`);
  ws.onopen=()=>onStatus?.("connected");ws.onclose=()=>onStatus?.("disconnected");ws.onerror=()=>onStatus?.("error");
  ws.onmessage=e=>{try{onMessage(JSON.parse(e.data))}catch{}};
  return ws;
}
