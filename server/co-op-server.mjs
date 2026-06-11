import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';

const PORT=Number(process.env.PORT||process.env.COOP_PORT||8787);
const HOST=process.env.HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1');
const RECONNECT_MS=45_000;
const ROOM_TTL_MS=20*60_000;
const rooms=new Map();

const now=()=>Date.now();
const send=(ws,msg)=>{
  if(ws&&ws.readyState===ws.OPEN)ws.send(JSON.stringify(msg));
};
const roomCode=()=>{
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let tries=0;tries<50;tries++){
    let code='';
    for(let i=0;i<5;i++)code+=alphabet[Math.floor(Math.random()*alphabet.length)];
    if(!rooms.has(code))return code;
  }
  return Math.random().toString(36).slice(2,7).toUpperCase();
};
const publicPeers=room=>[...room.players.values()].map(p=>({
  id:p.id,name:p.name,host:p.id===room.hostId,connected:!!p.ws
}));
const broadcast=(room,msg,exceptId=null)=>{
  for(const p of room.players.values()){
    if(p.id===exceptId)continue;
    send(p.ws,msg);
  }
};
const cleanup=()=>{
  const t=now();
  for(const[code,room]of rooms){
    const connected=[...room.players.values()].some(p=>p.ws);
    if(!connected&&t-room.emptySince>ROOM_TTL_MS)rooms.delete(code);
    else{
      for(const p of room.players.values()){
        if(!p.ws&&t-p.disconnectedAt>RECONNECT_MS&&!p.host)room.players.delete(p.id);
      }
    }
  }
};
setInterval(cleanup,10_000).unref();

function attach(ws,room,player){
  if(player.ws&&player.ws!==ws){
    try{player.ws.close(4000,'superseded by reconnect');}catch(e){}
  }
  player.ws=ws;
  player.disconnectedAt=0;
  room.emptySince=0;
  ws.room=room;
  ws.player=player;
  send(ws,{
    type:'joined',
    room:room.code,
    id:player.id,
    name:player.name,
    host:player.id===room.hostId,
    peers:publicPeers(room),
    lastStart:room.lastStart,
    lastWorld:room.lastWorld,
  });
  broadcast(room,{type:'peers',peers:publicPeers(room)},player.id);
}

function joinRoom(ws,data){
  let room;
  const requested=String(data.room||'').trim().toUpperCase();
  if(data.mode==='create'){
    const code=roomCode();
    room={code,hostId:null,players:new Map(),lastStart:null,lastWorld:null,emptySince:0};
    rooms.set(code,room);
  }else{
    room=rooms.get(requested);
    if(!room){send(ws,{type:'error',message:'ROOM NOT FOUND'});return;}
  }
  const token=String(data.token||crypto.randomUUID());
  let player=[...room.players.values()].find(p=>p.token===token);
  if(!player){
    player={id:crypto.randomUUID(),token,name:String(data.name||'Rifleman').slice(0,24),ws:null,host:false,disconnectedAt:0};
    if(!room.hostId){room.hostId=player.id;player.host=true;}
    room.players.set(player.id,player);
  }else{
    player.name=String(data.name||player.name||'Rifleman').slice(0,24);
  }
  attach(ws,room,player);
}

const http=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});
  res.end('TRENCHFALL co-op relay is running.\n');
});
const wss=new WebSocketServer({server:http});

wss.on('connection',ws=>{
  ws.on('message',raw=>{
    let msg;
    try{msg=JSON.parse(raw);}catch(e){send(ws,{type:'error',message:'BAD MESSAGE'});return;}
    if(msg.type==='join'){joinRoom(ws,msg);return;}
    const room=ws.room,player=ws.player;
    if(!room||!player){send(ws,{type:'error',message:'JOIN FIRST'});return;}
    if(msg.type==='start'&&player.id===room.hostId){
      room.lastStart=msg.start||null;
      broadcast(room,{type:'start',start:room.lastStart},player.id);
      return;
    }
    if(msg.type==='world'&&player.id===room.hostId){
      room.lastWorld=msg.world||null;
      broadcast(room,{type:'world',world:room.lastWorld},player.id);
      return;
    }
    if(msg.type==='action'){
      const outbound={type:'action',from:player.id,action:msg.action};
      if(player.id===room.hostId)broadcast(room,outbound,player.id);
      else{
        const host=room.players.get(room.hostId);
        send(host?.ws,outbound);
      }
      return;
    }
    if(msg.type==='event'&&player.id===room.hostId){
      broadcast(room,{type:'event',event:msg.event},player.id);
      return;
    }
    if(msg.type==='chat'){
      broadcast(room,{type:'chat',from:player.id,text:String(msg.text||'').slice(0,160)});
    }
  });
  ws.on('close',()=>{
    const room=ws.room,player=ws.player;
    if(!room||!player)return;
    if(player.ws===ws){player.ws=null;player.disconnectedAt=now();}
    if(![...room.players.values()].some(p=>p.ws))room.emptySince=now();
    broadcast(room,{type:'peers',peers:publicPeers(room)});
  });
});

http.listen(PORT,HOST,()=>{
  console.log(`TRENCHFALL co-op relay listening on ${HOST}:${PORT}`);
});
