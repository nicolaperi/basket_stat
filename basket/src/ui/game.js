import storage from '../storage.js';
import { savePlayer as savePlayerNamed } from '../storage.js';
import { el, playerCard, toast } from './components.js';
import { createGameState, startClock, pauseClock, addEvent, undo, redo, finalizeGame, substitutePlayers, finalizeGameAndSaveLineup } from '../state.js';
import { formatMs } from '../utils/time.js';
import { EVENT_TYPES } from '../models.js';

export async function renderGame(container, params={}){
  container = container || document.getElementById('view');
  if(!container){ console.warn('renderGame: container not found'); return; }

  // If params.gameId provided, load game; else new form
  const players = await storage.listPlayers();
  const card = el('div','card');
  card.appendChild(el('h2',null,'Configura nuova partita'));

  // selection info
  const info = el('div',null,`Seleziona fino a 12 giocatori per la partita (al momento: ${players.length} salvati)`);
  card.appendChild(info);

  // form to add new player
  const addForm = el('div','col');
  const nameInp = document.createElement('input'); nameInp.placeholder='Nome giocatore';
  const numInp = document.createElement('input'); numInp.placeholder='Numero maglia'; numInp.type='number';
  const addBtn = el('button','btn','Aggiungi giocatore');
  addForm.appendChild(nameInp); addForm.appendChild(numInp); addForm.appendChild(addBtn);
  card.appendChild(addForm);

  const rosterWrap = el('div','players');
  // selected roster set
  const selected = new Set();

  function renderPlayers(){
    rosterWrap.innerHTML='';
    players.forEach(p=>{
      const pc = playerCard(p);
      pc.dataset.id = p.id;
      if(selected.has(p.id)) pc.classList.add('player--selected');
      pc.addEventListener('click', ()=>{
        if(selected.has(p.id)) { selected.delete(p.id); pc.classList.remove('player--selected'); }
        else {
          if(selected.size>=12){ toast('Massimo 12 giocatori selezionabili'); return; }
          selected.add(p.id); pc.classList.add('player--selected');
        }
        countSpan.textContent = `${selected.size}/12`;
        // enable start when between 6 and 12 players selected
        startBtn.disabled = !(selected.size>=6 && selected.size<=12);
      });
      // show id small
      const strong = pc.querySelector('strong');
      if(strong) strong.insertAdjacentHTML('beforeend',` <small class="footer-note">(${p.id})</small>`);
      rosterWrap.appendChild(pc);
    });
  }

  card.appendChild(rosterWrap);
  const countSpan = el('div',null,`0/12`);
  card.appendChild(countSpan);

  const startBtn = el('button','btn','Avvia partita (richiede 12 giocatori)'); startBtn.disabled = true;
  const cancelBtn = el('button','btn--muted','Annulla');
  const finishBtn = el('button','btn--muted','Partita terminata (salva e torna)');
  const actions = el('div','row'); actions.appendChild(startBtn); actions.appendChild(cancelBtn); actions.appendChild(finishBtn);
  card.appendChild(actions);

  container.appendChild(card);

  if(players.length===0) { rosterWrap.appendChild(el('div',null,'Nessun giocatore; carica demo da Home o aggiungi nuovo')); }

  renderPlayers();

  addBtn.onclick = async ()=>{
    const name = nameInp.value && nameInp.value.trim();
    const num = numInp.value && String(numInp.value).trim();
    if(!name){ toast('Inserisci il nome'); return; }
    const p = {name,jerseyNumber: num || ''};
    // use named export savePlayer if available, else default
    try{
      if(typeof savePlayerNamed === 'function'){
        await savePlayerNamed(p);
      } else {
        await storage.savePlayer(p);
      }
    }catch(e){ console.warn('save player failed',e); }
    // reload players list
    const all = await storage.listPlayers();
    players.length = 0; all.forEach(x=>players.push(x));
    renderPlayers();
    nameInp.value=''; numInp.value='';
  };

  cancelBtn.onclick = ()=>{ window.appNavigate('home'); };

  finishBtn.onclick = async ()=>{
    // save a new game with currently selected roster (even if <12)
    const roster = Array.from(selected);
    const game = {id:'game_'+Date.now(),dateISO:new Date().toISOString(),opponent:'Sconosciuto',venue:'home',roster,quarters:4,notes:'partita salvata'};
    await storage.createGame(game);
    toast('Partita salvata');
    window.appNavigate('home');
  };

  startBtn.onclick = async ()=>{
    const roster = Array.from(selected);
    if(roster.length < 6 || roster.length > 12){ toast('Devi selezionare tra 6 e 12 giocatori per iniziare'); return; }
    const game = {id:'game_'+Date.now(),dateISO:new Date().toISOString(),opponent:'Sconosciuto',venue:'home',roster,quarters:4,notes:'partita in corso'};
    await storage.createGame(game);
    const state = createGameState(game);
    renderLive(container,state,players);
  };
}

function startDemo(players,container){
  const roster = players.map(p=>p.id);
  const game = {id:'tmp_'+Date.now(),dateISO:new Date().toISOString(),opponent:'Sconosciuto',venue:'home',roster,quarters:4,notes:''};
  const state = createGameState(game);
  renderLive(container,state,players);
}

function renderLive(container,state,players){
  container.innerHTML='';
  const header = el('div','card'); header.appendChild(el('h3',null,`Partita vs ${state.game.opponent}`));
  container.appendChild(header);

  const mainWrap = el('div','game-container');
  const main = el('div','game-main');
  const sidebar = el('div','bench-sidebar');

  // Quintetto sopra la toolbar
  const lineup = el('div','card'); lineup.appendChild(el('h4',null,'Quintetto in campo'));
  const onwrap = el('div','players');
  state.onCourt.forEach(pid=>{ const p = players.find(x=>x.id===pid); const pc = playerCard(p,{selected:true}); pc.dataset.id = pid; onwrap.appendChild(pc); });
  lineup.appendChild(onwrap);

  // controls area
  const controlsCard = el('div','card');
  const q = el('div',null,`Periodo: ${state.period}`);
  const clock = el('div','clock',formatMs(0));
  controlsCard.appendChild(q); controlsCard.appendChild(clock);
  const controls = el('div','toolbar');
  const bStart = el('button','btn','Avvia'); const bPause = el('button','btn--muted','Pausa'); const bNext = el('button','btn','Next Period');
  controls.appendChild(bStart); controls.appendChild(bPause); controls.appendChild(bNext);
  controlsCard.appendChild(controls);

  // quick actions
  const evCard = el('div','card'); evCard.appendChild(el('h4',null,'Eventi rapidi'));
  const grid = el('div','grid-3');
  // Use EVENT_TYPES as source of truth for button types (preserves your renamed values)
  const types = Object.keys(EVENT_TYPES || {});
  types.forEach(t=>{ const label = (EVENT_TYPES[t]||t).replace(/_/g,' '); const b = el('button','btn',label); grid.appendChild(b); b.dataset.type = t; });
  evCard.appendChild(grid);

  const eventsList = el('div','card events'); eventsList.appendChild(el('h4',null,'Log eventi'));

  main.appendChild(lineup); main.appendChild(controlsCard); main.appendChild(evCard); main.appendChild(eventsList);

  // bench sidebar vertical
  const benchCard = el('div','card'); benchCard.appendChild(el('h4',null,'Panchina'));
  const benchwrap = el('div','players players--vertical');
  state.bench.forEach(pid=>{ const p=players.find(x=>x.id===pid); const pc = playerCard(p); pc.dataset.id = pid; benchwrap.appendChild(pc); });
  benchCard.appendChild(benchwrap);
  sidebar.appendChild(benchCard);

  mainWrap.appendChild(main); mainWrap.appendChild(sidebar);
  container.appendChild(mainWrap);

  // controls actions
  let rafId=null;
  function updateClock(){
    let elapsed = (state.periodElapsedMs||0);
    if(state.running && state.clockStart) elapsed += (Date.now()-state.clockStart);
    clock.textContent = formatMs(elapsed);
    rafId = requestAnimationFrame(updateClock);
  }
  bStart.onclick = ()=>{ startClock(state); if(!rafId) updateClock(); toast('Cronometro avviato'); };
  bPause.onclick = ()=>{ pauseClock(state); if(rafId){ cancelAnimationFrame(rafId); rafId=null; } toast('Cronometro in pausa'); };
  bNext.onclick = ()=>{ pauseClock(state); state.period+=1; q.textContent = `Periodo: ${state.period}`; toast('Nuovo periodo'); };

  // event rendering
  function refreshEvents(){
    const list = eventsList.querySelectorAll('.event'); list.forEach(n=>n.remove());
    state.events.forEach(evt=>{
      const row = el('div','event'); row.innerHTML = `<div>${evt.type} — ${evt.playerId||''}</div><div>${new Date(evt.tsMs).toLocaleTimeString()}</div>`;
      eventsList.appendChild(row);
    });
  }
  refreshEvents();

  // selection of on-court player only
  // selection flow: select on-court player for events or perform substitutions
  let selectedPlayer = null; // on-court selected for events or swap
  let benchSelected = null; // bench selected for swap

  function clearSelectionVisuals(){
    onwrap.querySelectorAll('.player').forEach(x=>x.classList.remove('player--selected'));
    benchwrap.querySelectorAll('.player').forEach(x=>x.classList.remove('player--selected'));
    selectedPlayer = null; benchSelected = null;
  }

  onwrap.querySelectorAll('.player').forEach(n=>{
    n.addEventListener('click', async ()=>{
      const pid = n.dataset.id;
      // if a bench player was selected previously -> perform swap (benchSelected -> inId)
      if(benchSelected){
        const outId = pid, inId = benchSelected;
        try{ await substitutePlayers(state, outId, inId); }catch(e){ console.warn('substitute failed',e); }
        renderLive(container,state,players);
        return;
      }
      // otherwise select this on-court player for events
      clearSelectionVisuals();
      selectedPlayer = pid;
      n.classList.add('player--selected');
    });
  });

  benchwrap.querySelectorAll('.player').forEach(n=>{
    n.addEventListener('click', async ()=>{
      const pid = n.dataset.id;
      // if an on-court player is selected -> perform swap (selectedPlayer -> outId)
      if(selectedPlayer){
        const outId = selectedPlayer, inId = pid;
        try{ await substitutePlayers(state, outId, inId); }catch(e){ console.warn('substitute failed',e); }
        renderLive(container,state,players);
        return;
      }
      // otherwise toggle bench selection for swap
      if(benchSelected === pid){ benchSelected = null; n.classList.remove('player--selected'); }
      else { clearSelectionVisuals(); benchSelected = pid; n.classList.add('player--selected'); }
    });
  });

  // wire quick event buttons
  grid.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', async (e)=>{
      const type = e.currentTarget.dataset.type;
      if(!selectedPlayer){ toast('Seleziona un giocatore del quintetto prima di registrare un evento'); return; }
      const evt = {gameId:state.game.id,playerId:selectedPlayer,team:'us',tsMs:Date.now(),period:state.period,onCourt:true,type,meta:{}};
      await addEvent(state,evt);
      refreshEvents();
      toast('Evento registrato');
    });
  });

  // provide a 'Termina partita' in live UI (styled as red danger button)
  const endBtn = el('button','btn btn--danger','Termina partita');
  endBtn.onclick = async ()=>{
    // finalize and persist to IndexedDB (also save played minutes)
    await finalizeGameAndSaveLineup(state);
    // export all and trigger download
    try{
      await storage.downloadBackup();
      toast('Backup scaricato (salva il file dove preferisci)');
    }catch(err){
      console.warn('download backup failed',err);
      toast('Errore nel creare il backup.');
    }
    window.appNavigate('home');
  };
  controlsCard.appendChild(endBtn);

}

async function quickEvent(state,type,players,clockEl){
  // request a player via prompt for demo simplicity
  const pid = prompt('ID giocatore (usa id visibili nelle card)'); if(!pid) return;
  const evt = {gameId:state.game.id,playerId:pid,team:'us',tsMs:Date.now(),period:state.period,onCourt:state.onCourt.includes(pid),type,meta:{}};
  await addEvent(state,evt);
  toast('Evento registrato');
}
