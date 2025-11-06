import { nowMs, EVENT_TYPES } from './models.js';
import * as storage from './storage.js';

// Stato minimale in-memory con undo/redo
export function createGameState(game){
  const state = {
    game: {...game},
    onCourt: (game.roster||[]).slice(0,5),
    bench: (game.roster||[]).slice(5),
    period:1,
    running:false,
    clockStart:null, // ms
    periodElapsedMs: 0, // ms accumulated in current period
    playedMs: {}, // playerId -> ms cumulato
    events: [],
    undoStack: [],redoStack:[]
  };
  state.onCourt.forEach(id=> state.playedMs[id]=0);
  state.bench.forEach(id=> state.playedMs[id]=0);
  return state;
}

export function startClock(state){ if(state.running) return; state.running=true; state.clockStart = nowMs(); }
export function pauseClock(state){ if(!state.running) return; const now = nowMs(); const delta = now - state.clockStart; state.clockStart = null; state.running=false;
  // accumulate period elapsed and add delta to onCourt players
  state.periodElapsedMs = (state.periodElapsedMs||0) + delta;
  state.onCourt.forEach(pid=> state.playedMs[pid] = (state.playedMs[pid]||0) + delta);
}

export function nextPeriod(state){ if(state.running) pauseClock(state); state.period +=1; state.periodElapsedMs = 0; }

export async function addEvent(state, evt){
  evt.tsMs = evt.tsMs || nowMs();
  state.events.unshift(evt);
  state.undoStack.push(evt);
  state.redoStack = [];
  try{ await storage.addEvent(evt); }catch(e){ console.warn('saveEvent failed',e); }
}

// substitute outId (onCourt) with inId (from bench).
// Handles playedMs bookkeeping: if clock running, adds elapsed to current onCourt before swap
export async function substitutePlayers(state, outId, inId){
  if(!outId || !inId) return;
  // ensure outId is currently on court and inId is on bench
  const outIdx = state.onCourt.indexOf(outId);
  const inIdxBench = state.bench.indexOf(inId);
  if(outIdx === -1 || inIdxBench === -1) return;

  const now = nowMs();
  // if running, add elapsed since clockStart to all current onCourt, then reset clockStart
  if(state.running && state.clockStart){
    const delta = now - state.clockStart;
    state.onCourt.forEach(pid=> state.playedMs[pid] = (state.playedMs[pid]||0) + delta);
    // continue clock from now
    state.clockStart = now;
    // also accumulate period elapsed
    state.periodElapsedMs = (state.periodElapsedMs||0) + delta;
  }

  // perform swap in arrays
  state.onCourt.splice(outIdx,1,inId);
  state.bench.splice(inIdxBench,1,outId);

  // ensure playedMs keys
  state.playedMs[inId] = state.playedMs[inId] || 0;
  state.playedMs[outId] = state.playedMs[outId] || 0;

  // record substitution events (OUT then IN)
  try{
    await addEvent(state, {gameId: state.game.id, playerId: outId, tsMs: now, period: state.period, type: EVENT_TYPES.SUB_OUT, meta: {in: inId}});
    await addEvent(state, {gameId: state.game.id, playerId: inId, tsMs: now, period: state.period, type: EVENT_TYPES.SUB_IN, meta: {out: outId}});
  }catch(e){ console.warn('substitute event save failed', e); }
}

export async function undo(state){
  const last = state.undoStack.pop(); if(!last) return null; state.redoStack.push(last);
  const idx = state.events.findIndex(e=>e.id===last.id); if(idx>=0) state.events.splice(idx,1);
  try{ await storage.deleteEventById(last.id); }catch(e){ console.warn('undo db delete failed',e); }
  return last;
}

export function redo(state){ const itm = state.redoStack.pop(); if(!itm) return null; state.undoStack.push(itm); state.events.unshift(itm); return itm; }

export async function finalizeGame(state){ state.running=false; if(state.clockStart) pauseClock(state); try{ await storage.createGame(state.game); }catch(e){ console.warn('saveGame failed',e); } }

export async function finalizeGameAndSaveLineup(state){
  state.running=false; if(state.clockStart) pauseClock(state);
  try{
    await storage.createGame(state.game);
    // save played minutes summary
    try{ await storage.saveLineup(state.game.id, state.playedMs); }catch(e){ console.warn('saveLineup failed', e); }
  }catch(e){ console.warn('saveGame failed',e); }
}

export default {createGameState,startClock,pauseClock,nextPeriod,addEvent,undo,redo,finalizeGame};
