import { EVENT_TYPES } from '../models.js';

// aggregazioni pure per statistiche
export function sum(arr,fn){ return arr.reduce((s,x)=>s+fn(x),0); }

export function playerStats(events, playerId){
  const p = e => e.playerId===playerId;
  const made2 = events.filter(e=>p(e) && e.type===EVENT_TYPES['2PT_MADE']).length;
  const att2 = events.filter(e=>p(e) && (e.type==='2PT_MADE' || e.type==='2PT_MISS')).length;
  const made3 = events.filter(e=>p(e) && e.type===EVENT_TYPES['3PT_MADE']).length;
  const att3 = events.filter(e=>p(e) && (e.type==='3PT_MADE' || e.type==='3PT_MISS')).length;
  const ftm = events.filter(e=>p(e) && e.type===EVENT_TYPES.FT_MADE).length;
  const fta = events.filter(e=>p(e) && (e.type===EVENT_TYPES.FT_MADE || e.type===EVENT_TYPES.FT_MISS)).length;
  const oreb = events.filter(e=>p(e) && e.type===EVENT_TYPES.OREB).length;
  const dreb = events.filter(e=>p(e) && e.type===EVENT_TYPES.DREB).length;
  const ast = events.filter(e=>p(e) && e.type===EVENT_TYPES.ASSIST).length;
  const tov = events.filter(e=>p(e) && e.type===EVENT_TYPES.TURNOVER).length;
  const pf = events.filter(e=>p(e) && e.type===EVENT_TYPES.FOUL).length;
  const stl = events.filter(e=>p(e) && e.type===EVENT_TYPES.STEAL).length;
  const pts = 2*made2 + 3*made3 + 1*ftm;
  return {playerId,pts,FG2:`${made2}-${att2}`,FG3:`${made3}-${att3}`,FT:`${ftm}-${fta}`,OREB:oreb,DREB:dreb,REB:oreb+dreb,AST:ast,TOV:tov,PF:pf,STL:stl};
}

// semplice CSV exporter
export function toCSV(rows){
  const keys = Object.keys(rows[0]||{});
  const lines=[keys.join(',')];
  for(const r of rows) lines.push(keys.map(k=>String(r[k]??'')).map(v=>`"${v.replace(/"/g,'""')}"`).join(','));
  return lines.join('\n');
}

// Inline tests (semplici) — verranno eseguiti in console se importato
if(typeof window !== 'undefined'){
  console.log('utils/math loaded — test quick assert');
  const evts = [ {playerId:'p1',type:EVENT_TYPES['2PT_MADE']},{playerId:'p1',type:EVENT_TYPES['3PT_MADE']},{playerId:'p1',type:EVENT_TYPES.FT_MADE} ];
  const s = playerStats(evts,'p1');
  console.assert(s.pts===6, 'PTS should be 6');
}

export default {playerStats, toCSV};
