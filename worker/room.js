import { DurableObject } from "cloudflare:workers";

const PATTERNS = ["Horizontal","Vertical","Diagonal","Corners","X","Blackout"];
function makeCard() {
  const board=[];
  for (let c=0;c<5;c++) {
    const nums=Array.from({length:15},(_,i)=>i+1+c*15).sort(()=>Math.random()-.5).slice(0,5);
    for(let r=0;r<5;r++){board[r]??=[];board[r][c]=nums[r];}
  }
  board[2][2]="FREE";return board;
}
function draw(calls) {
  const remaining=Array.from({length:75},(_,i)=>i+1).filter(n=>!calls.includes(n));
  return remaining.length?remaining[Math.floor(Math.random()*remaining.length)]:null;
}
function lines(patterns){
  const out=[];
  if(patterns.includes("Horizontal"))for(let r=0;r<5;r++)out.push(Array.from({length:5},(_,c)=>r*5+c));
  if(patterns.includes("Vertical"))for(let c=0;c<5;c++)out.push(Array.from({length:5},(_,r)=>r*5+c));
  if(patterns.includes("Diagonal"))out.push([0,6,12,18,24],[4,8,12,16,20]);
  if(patterns.includes("X"))out.push([0,6,12,18,24],[4,8,12,16,20]);
  if(patterns.includes("Corners"))out.push([0,4,20,24]);
  if(patterns.includes("Blackout"))out.push(Array.from({length:25},(_,i)=>i));
  return out;
}
function validClaim(player,calls,patterns){
  return lines(patterns).some(line=>line.every(i=>i===12||(player.marks.includes(i)&&calls.includes(player.card[Math.floor(i/5)][i%5]))));
}
export class BingoRoom extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.state=null;this.sockets=new Map();}
  async load(){if(!this.state)this.state=await this.ctx.storage.get("state");return this.state;}
  async save(){await this.ctx.storage.put("state",this.state);}
  publicSnapshot(){const s=this.state;return s?{code:s.code,roomName:s.roomName,capacity:s.capacity,patterns:s.patterns,interval:s.interval,started:s.started,paused:s.paused,calls:s.calls,round:s.round,winners:s.winners,announcement:s.announcement,players:s.players.map(p=>({id:p.id,name:p.name,role:p.role,marks:p.marks}))}:null;}
  personalSnapshot(id){const pub=this.publicSnapshot();const p=this.state?.players.find(x=>x.id===id);return p?{...pub,playerId:id,myCard:p.card,myMarks:p.marks}:pub;}
  send(ws,type,extra={}){const id=this.sockets.get(ws);try{ws.send(JSON.stringify({type,...extra,snapshot:this.personalSnapshot(id)}))}catch{}}
  broadcast(type,extra={}){for(const ws of this.sockets.keys())this.send(ws,type,extra);}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname.endsWith("/check"))return new Response(null,{status:(await this.load())?200:404});
    if(url.pathname.endsWith("/init")&&request.method==="POST"){
      if(await this.load())return new Response("Exists",{status:409});
      const b=await request.json();const hostId="host",hostToken=crypto.randomUUID();
      this.state={code:b.code,roomName:b.roomName,capacity:b.capacity,patterns:b.patterns.filter(x=>PATTERNS.includes(x)),interval:b.interval,started:false,paused:true,calls:[],round:0,winners:[],announcement:null,players:[{id:hostId,token:hostToken,name:b.hostName,role:"HOST",card:makeCard(),marks:[12]}]};
      await this.save();return Response.json({...this.personalSnapshot(hostId),hostPlayerId:hostId,hostToken});
    }
    if(url.pathname.endsWith("/snapshot")){const s=await this.load();return s?Response.json(this.publicSnapshot()):Response.json({error:"Room not found."},{status:404});}
    if(url.pathname.endsWith("/join")&&request.method==="POST"){
      const s=await this.load();if(!s)return Response.json({error:"Room not found."},{status:404});
      const b=await request.json();if(s.started)return Response.json({error:"This game has already started."},{status:409});
      if(s.players.length>=s.capacity)return Response.json({error:"Room is full."},{status:409});
      if(!b.name?.trim())return Response.json({error:"Player name is required."},{status:400});
      const id=crypto.randomUUID(),token=crypto.randomUUID();s.players.push({id,token,name:b.name.trim().slice(0,24),role:"PLAYER",card:makeCard(),marks:[12]});await this.save();this.broadcast("PLAYER_JOINED");return Response.json({playerId:id,playerToken:token,snapshot:this.personalSnapshot(id)},{status:201});
    }
    if(url.pathname.endsWith("/socket")){
      const s=await this.load();if(!s)return new Response("Room not found",{status:404});
      if(request.headers.get("Upgrade")!=="websocket")return new Response("Expected websocket",{status:426});
      const playerId=url.searchParams.get("playerId"),token=url.searchParams.get("token");if(!s.players.some(p=>p.id===playerId&&p.token===token))return new Response("Player session not authorized",{status:403});
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();this.sockets.set(server,playerId);
      this.send(server,"SNAPSHOT");
      server.addEventListener("message",async ev=>{try{await this.handleMessage(server,JSON.parse(ev.data));}catch(e){this.send(server,"ERROR",{message:e.message||"Action failed"});}});
      server.addEventListener("close",()=>this.sockets.delete(server));server.addEventListener("error",()=>this.sockets.delete(server));
      return new Response(null,{status:101,webSocket:client});
    }
    return new Response("Not found",{status:404});
  }
  async handleMessage(ws,msg){
    const s=await this.load(),id=this.sockets.get(ws),p=s?.players.find(x=>x.id===id);if(!p)return;
    if(msg.type==="MARK"){
      const idx=Number(msg.index);if(!Number.isInteger(idx)||idx<0||idx>24)return;
      const value=p.card[Math.floor(idx/5)][idx%5];if(value==="FREE"||!s.calls.includes(value))return;
      p.marks=p.marks.includes(idx)?p.marks.filter(i=>i!==idx):[...p.marks,idx];await this.save();this.broadcast("MARK_UPDATED");
    }else if(msg.type==="REFRESH_CARD"){
      if(s.started)return;
      p.card=makeCard();p.marks=[12];await this.save();this.send(ws,"CARD_REFRESHED");
    }else if(msg.type==="START"){
      if(p.role!=="HOST"||s.started)return;
      s.started=true;s.paused=false;s.calls=[];s.winners=[];s.announcement=null;s.round++;
      // Keep the waiting-room cards: players' final refreshed cards become their game cards.
      s.players.forEach(pl=>{pl.marks=[12]});await this.save();this.broadcast("STARTED");
    }else if(msg.type==="CALL"){
      if(p.role!=="HOST"||!s.started||s.announcement||s.calls.length>=75)return;
      const n=draw(s.calls);if(n==null)return;s.calls.push(n);await this.save();this.broadcast("BALL_CALLED",{number:n});
    }else if(msg.type==="PAUSE"||msg.type==="RESUME"){
      if(p.role!=="HOST"||!s.started)return;s.paused=msg.type==="PAUSE";await this.save();this.broadcast(msg.type);
    }else if(msg.type==="SET_INTERVAL"){
      if(p.role!=="HOST")return;const n=Number(msg.interval);if(![3,5,8,10,15,20,30].includes(n))return;s.interval=n;await this.save();this.broadcast("INTERVAL_CHANGED");
    }else if(msg.type==="SET_PATTERNS"){
      if(p.role!=="HOST"||s.started||!Array.isArray(msg.patterns))return;const next=msg.patterns.filter(x=>PATTERNS.includes(x));if(!next.length)return;s.patterns=next;await this.save();this.broadcast("PATTERNS_CHANGED");
    }else if(msg.type==="CLAIM"){
      if(!s.started||s.winners.some(w=>w.playerId===p.id))return;
      if(!validClaim(p,s.calls,s.patterns)){this.send(ws,"CLAIM_REJECTED",{message:"Your marked card does not contain a valid Bingo yet."});return;}
      const winner={playerId:p.id,name:p.name,order:s.winners.length+1};s.winners.push(winner);s.paused=true;s.announcement=winner;await this.save();this.broadcast("WINNER",{winner});
    }else if(msg.type==="CONTINUE"){
      if(p.role!=="HOST"||!s.started)return;s.paused=false;s.announcement=null;await this.save();this.broadcast("CONTINUE");
    }else if(msg.type==="RESET"){
      if(p.role!=="HOST")return;s.calls=[];s.winners=[];s.announcement=null;s.paused=true;s.players.forEach(pl=>pl.marks=[12]);await this.save();this.broadcast("RESET");
    }else if(msg.type==="EXIT"){
      // Only an explicit exit removes a player. Socket disconnects (background tabs/mobile sleep)
      // intentionally retain room membership so reconnecting players are not left behind.
      s.players=s.players.filter(x=>x.id!==id);
      await this.save();
      this.broadcast("PLAYER_LEFT");
    }else if(msg.type==="KICK"){
      if(p.role!=="HOST"){this.send(ws,"KICK_FAILED",{message:"Only the host can remove players."});return;}
      const targetId=msg.playerId;
      if(!targetId||targetId===p.id){this.send(ws,"KICK_FAILED",{message:"Invalid player selected."});return;}
      const target=s.players.find(x=>x.id===targetId&&x.role!=="HOST");
      if(!target){this.send(ws,"KICK_FAILED",{message:"Player is no longer in this room."});return;}
      for(const [sock,sid] of [...this.sockets.entries()]){
        if(sid===targetId){this.send(sock,"KICKED");try{sock.close(1000,"Removed by host");}catch{}this.sockets.delete(sock);}
      }
      s.players=s.players.filter(x=>x.id!==targetId);
      await this.save();
      this.broadcast("PLAYER_REMOVED");
      this.send(ws,"KICK_SUCCESS",{message:`${target.name} was removed from the room.`});
    }else if(msg.type==="NEW_ROUND"){
      if(p.role!=="HOST")return;s.started=false;s.paused=true;s.calls=[];s.winners=[];s.announcement=null;s.round++;s.players.forEach(pl=>{pl.card=makeCard();pl.marks=[12]});await this.save();this.broadcast("NEW_ROUND");
    }
  }
}
