const API = "/api";
export async function createRoomApi(payload){
  const r=await fetch(`${API}/rooms`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Room creation failed");
  return d;
}
export async function joinRoomApi(code,name){
  const r=await fetch(`${API}/rooms/${encodeURIComponent(code)}/join`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Unable to join room");
  return d;
}
export function connectRoomSocket(code,playerId,token,onMessage,onStatus){
  const protocol=location.protocol==="https:"?"wss:":"ws:";
  const ws=new WebSocket(`${protocol}//${location.host}${API}/rooms/${encodeURIComponent(code)}/socket?playerId=${encodeURIComponent(playerId)}&token=${encodeURIComponent(token)}`);
  ws.onopen=()=>onStatus("connected");
  ws.onclose=()=>onStatus("disconnected");
  ws.onerror=()=>onStatus("error");
  ws.onmessage=e=>{try{onMessage(JSON.parse(e.data));}catch{}};
  return ws;
}
