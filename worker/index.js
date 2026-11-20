import { BingoRoom } from "./room.js";

export { BingoRoom };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
});

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:5}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {status:204, headers:{
        "access-control-allow-origin":"*", "access-control-allow-methods":"GET,POST,OPTIONS",
        "access-control-allow-headers":"content-type"
      }});
    }
    if (url.pathname.startsWith("/api/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[1] === "rooms" && parts.length === 2 && request.method === "POST") {
        const body = await request.json().catch(()=>({}));
        if (!body.hostName || !body.roomName) return json({error:"Player name and room name are required."},400);
        const capacity = Number(body.capacity);
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) return json({error:"Capacity must be 1–50."},400);
        const patterns = Array.isArray(body.patterns) ? body.patterns : ["Horizontal"];
        if (!patterns.length) return json({error:"Choose at least one winning pattern."},400);
        let code;
        for (let i=0;i<10;i++) {
          code = makeCode();
          const id = env.BINGO_ROOMS.idFromName(code);
          const stub = env.BINGO_ROOMS.get(id);
          const check = await stub.fetch("https://room/internal/check");
          if (check.status === 404) {
            const init = await stub.fetch("https://room/internal/init", {method:"POST",body:JSON.stringify({code,roomName:body.roomName,hostName:body.hostName,capacity,patterns,interval:Number(body.interval)||10})});
            if (init.ok) return json(await init.json(),201);
          }
        }
        return json({error:"Could not create a room. Try again."},503);
      }
      if (parts[1] === "rooms" && parts[2]) {
        const code = parts[2].toUpperCase();
        const stub = env.BINGO_ROOMS.get(env.BINGO_ROOMS.idFromName(code));
        if (parts.length === 3 && request.method === "GET") return stub.fetch("https://room/internal/snapshot");
        if (parts.length === 4 && parts[3] === "join" && request.method === "POST") return stub.fetch(new Request("https://room/internal/join",{method:"POST",body:request.body,headers:request.headers}));
        if (parts.length === 4 && parts[3] === "socket") return stub.fetch(request);
      }
      return json({error:"API route not found."},404);
    }
    return env.ASSETS.fetch(request);
  }
};
