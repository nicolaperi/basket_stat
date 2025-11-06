import db from './db.js';
import { uid, nowMs } from './models.js';

export async function savePlayer(player){
  if(!player.id) player.id = uid('player');
  await db.put('players', player).catch(async ()=> await db.add('players', player));
  return player;
}

export async function listPlayers(){ return db.getAll('players'); }

export async function createGame(game){ if(!game.id) game.id = uid('game'); await db.put('games',game); return game; }
export async function listGames(){ return db.getAll('games'); }

export async function addEvent(evt){ if(!evt.id) evt.id = uid('evt'); await db.add('events',evt); return evt; }
export async function listEventsByGame(gameId){ return db.queryAll('events', e=>e.gameId===gameId).then(arr=>arr.sort((a,b)=>b.tsMs-a.tsMs)); }

// Save lineup/played minutes summary for a game
export async function saveLineup(gameId, playedMs){
  const rec = {id: uid('lineup'), gameId, playedMs, ts: new Date().toISOString()};
  await db.add('lineups', rec);
  return rec;
}

export async function listLineups(gameId){
  const all = await db.getAll('lineups');
  if(gameId) return all.filter(l=>l.gameId===gameId);
  return all;
}

export async function clearAll(){ await db.clear('players'); await db.clear('games'); await db.clear('events'); await db.clear('lineups'); }

export async function clearHistory(){
  // clears games, events and lineups but preserves players
  await db.clear('games');
  await db.clear('events');
  await db.clear('lineups');
}

export async function seedDemo(){
  await clearAll();
  const players = [];
  for(let i=1;i<=8;i++){ const p = {id:uid('player'),name:`Giocatore ${i}`,jerseyNumber:10+i}; players.push(p); await savePlayer(p);} 
  const game = {id:uid('game'),dateISO:new Date().toISOString(),opponent:'A.S. Demo',venue:'home',roster:players.map(p=>p.id),quarters:4,notes:'Partita demo'};
  await createGame(game);
  // some events
  const now = nowMs();
  await addEvent({id:uid('evt'),gameId:game.id,playerId:players[0].id,tsMs:now-1000*60*8,period:1,type:'2PT_MADE',meta:{}});
  await addEvent({id:uid('evt'),gameId:game.id,playerId:players[1].id,tsMs:now-1000*60*7,period:1,type:'ASSIST',meta:{assistPlayerId:players[0].id}});
  await addEvent({id:uid('evt'),gameId:game.id,playerId:players[2].id,tsMs:now-1000*60*6,period:1,type:'OREB',meta:{}});
  return {players,game};
}

async function deleteEventById(id){ await db.del('events', id); }


// Export entire DB as plain object {players:[], games:[], events:[], lineups:[]}
export async function exportAll(){
  const players = await db.getAll('players');
  const games = await db.getAll('games');
  const events = await db.getAll('events');
  const lineups = await db.getAll('lineups');
  return {meta:{exportedAt:new Date().toISOString()}, stores:{players,games,events,lineups}};
}

// Import entire DB from object produced by exportAll (overwrites target stores)
export async function importAll(data){
  if(!data || !data.stores) throw new Error('Invalid import data');
  const s = data.stores;
  // clear then put
  await db.clear('players');
  await db.clear('games');
  await db.clear('events');
  await db.clear('lineups');
  if(Array.isArray(s.players)){
    for(const p of s.players){ await db.put('players', p); }
  }
  if(Array.isArray(s.games)){
    for(const g of s.games){ await db.put('games', g); }
  }
  if(Array.isArray(s.events)){
    for(const e of s.events){ await db.put('events', e); }
  }
  if(Array.isArray(s.lineups)){
    for(const l of s.lineups){ await db.put('lineups', l); }
  }
}

// Trigger browser download of current DB export (filename optional)
export async function downloadBackup(filename){
  const data = await exportAll();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `basket_backup_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export default {listPlayers,createGame,listGames,addEvent,listEventsByGame,deleteEventById,seedDemo,clearAll,clearHistory,exportAll,importAll,downloadBackup,saveLineup,listLineups};
