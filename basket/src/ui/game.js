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

  // form per avversario
  const opponentForm = el('div','col');
  const opponentLabel = el('label',null,'Nome squadra avversaria:');
  const opponentInp = document.createElement('input'); 
  opponentInp.placeholder='Inserisci nome avversario (es. Lakers, Virtus Bologna...)';
  opponentInp.value = 'Sconosciuto'; // valore di default
  opponentInp.style.marginBottom = '15px';
  opponentForm.appendChild(opponentLabel); 
  opponentForm.appendChild(opponentInp);
  card.appendChild(opponentForm);

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

  // Aggiungi listener per il tasto Enter sui campi di input per aggiungere giocatore
  const handleAddPlayer = async ()=>{
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

  addBtn.onclick = handleAddPlayer;

  // Aggiungi shortcut Enter per aggiungere giocatore
  nameInp.addEventListener('keypress', (e)=>{
    if(e.key === 'Enter') handleAddPlayer();
  });
  numInp.addEventListener('keypress', (e)=>{
    if(e.key === 'Enter') handleAddPlayer();
  });

  // Aggiungi supporto Enter per campo avversario (focus su nome giocatore)
  opponentInp.addEventListener('keypress', (e)=>{
    if(e.key === 'Enter') {
      nameInp.focus();
      e.preventDefault();
    }
  });

  cancelBtn.onclick = ()=>{ window.appNavigate('home'); };

  finishBtn.onclick = async ()=>{
    // save a new game with currently selected roster (even if <12)
    const roster = Array.from(selected);
    const opponentName = opponentInp.value.trim() || 'Sconosciuto';
    const game = {id:'game_'+Date.now(),dateISO:new Date().toISOString(),opponent:opponentName,venue:'home',roster,quarters:4,notes:'partita salvata'};
    await storage.createGame(game);
    toast('Partita salvata');
    window.appNavigate('home');
  };

  startBtn.onclick = async ()=>{
    const roster = Array.from(selected);
    if(roster.length < 6 || roster.length > 12){ toast('Devi selezionare tra 6 e 12 giocatori per iniziare'); return; }
    const opponentName = opponentInp.value.trim() || 'Sconosciuto';
    const game = {id:'game_'+Date.now(),dateISO:new Date().toISOString(),opponent:opponentName,venue:'home',roster,quarters:4,notes:'partita in corso'};
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
  const bStart = el('button','btn','Avvia'); 
  const bPause = el('button','btn--muted','Pausa'); 
  const bNext = el('button','btn','Next Period');
  const bUndo = el('button','btn--muted','↶ Annulla azione');
  controls.appendChild(bStart); 
  controls.appendChild(bPause); 
  controls.appendChild(bNext);
  controls.appendChild(bUndo);
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
  
  // Bottone Undo: annulla l'ultima azione registrata
  bUndo.onclick = async ()=>{ 
    const undone = await undo(state); 
    if(undone){ 
      refreshEvents(); 
      toast(`Azione annullata: ${undone.type}`); 
    } else { 
      toast('Nessuna azione da annullare'); 
    } 
  };

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
  let currentPlayerIndex = -1; // indice del giocatore attualmente "focused" con le frecce

  function clearSelectionVisuals(){
    onwrap.querySelectorAll('.player').forEach(x=>x.classList.remove('player--selected'));
    benchwrap.querySelectorAll('.player').forEach(x=>x.classList.remove('player--selected'));
    selectedPlayer = null; 
    benchSelected = null;
    // Non resettiamo currentPlayerIndex qui per permettere la navigazione continua
  }

  onwrap.querySelectorAll('.player').forEach((n, index) => {
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
      currentPlayerIndex = index; // Sincronizza l'indice per la navigazione con tastiera
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

  // Sistema di navigazione con frecce per scorrere i giocatori del quintetto
  // (currentPlayerIndex già dichiarato sopra con selectedPlayer e benchSelected)

  function selectPlayerByIndex(index){
    // Seleziona il giocatore in campo all'indice specificato
    const playerCards = Array.from(onwrap.querySelectorAll('.player'));
    if(index < 0 || index >= playerCards.length) return;
    
    const card = playerCards[index];
    const pid = card.dataset.id;
    
    clearSelectionVisuals();
    selectedPlayer = pid;
    currentPlayerIndex = index;
    card.classList.add('player--selected');
    
    // Aggiungi una classe temporanea per indicare che è stato selezionato via tastiera
    card.classList.add('player--keyboard-focus');
    setTimeout(() => card.classList.remove('player--keyboard-focus'), 300);
  }

  function navigatePlayer(direction){
    // direction: 1 = avanti (destra/giù), -1 = indietro (sinistra/su)
    const playerCards = Array.from(onwrap.querySelectorAll('.player'));
    
    if(playerCards.length === 0) return;
    
    // Se nessun giocatore è selezionato, inizia dal primo
    if(currentPlayerIndex === -1){
      selectPlayerByIndex(0);
      return;
    }
    
    // Calcola il nuovo indice con wrap-around
    let newIndex = currentPlayerIndex + direction;
    
    // Wrap around: se vai oltre l'ultimo, torna al primo e viceversa
    if(newIndex >= playerCards.length) newIndex = 0;
    if(newIndex < 0) newIndex = playerCards.length - 1;
    
    selectPlayerByIndex(newIndex);
  }

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

  // Sistema di shortcut da tastiera
  const keyboardHandler = (e) => {
    // Ignora se l'utente sta scrivendo in un input
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    // Controlla se c'è un giocatore selezionato per le azioni
    const needsPlayer = ['1', '2', '3', '4', '5', '6', 'q', 'w', 'e', 'r', 't', 'y'];
    if(needsPlayer.includes(e.key.toLowerCase()) && !selectedPlayer) {
      toast('Seleziona un giocatore del quintetto prima di registrare un evento');
      e.preventDefault();
      return;
    }

    let eventType = null;
    let actionDescription = '';

    switch(e.key.toLowerCase()) {
      // Tiri liberi
      case '1':
        eventType = 'FT_MADE';
        actionDescription = 'Tiro libero segnato';
        break;
      case '2':
        eventType = 'FT_MISS';
        actionDescription = 'Tiro libero sbagliato';
        break;
      
      // Tiri da 2 punti
      case '3':
        eventType = '2PT_MADE';
        actionDescription = '2 punti segnato';
        break;
      case '4':
        eventType = '2PT_MISS';
        actionDescription = '2 punti sbagliato';
        break;
      
      // Tiri da 3 punti
      case '5':
        eventType = '3PT_MADE';
        actionDescription = '3 punti segnato';
        break;
      case '6':
        eventType = '3PT_MISS';
        actionDescription = '3 punti sbagliato';
        break;
      
      // Rimbalzi
      case 'q':
        eventType = 'OREB';
        actionDescription = 'Rimbalzo offensivo';
        break;
      case 'w':
        eventType = 'DREB';
        actionDescription = 'Rimbalzo difensivo';
        break;
      
      // Altre azioni
      case 'e':
        eventType = 'ASSIST';
        actionDescription = 'Assist';
        break;
      case 'r':
        eventType = 'TURNOVER';
        actionDescription = 'Palla persa';
        break;
      case 't':
        eventType = 'FOUL';
        actionDescription = 'Fallo';
        break;
      case 'y':
        eventType = 'STEAL';
        actionDescription = 'Palla rubata';
        break;
      
      // Navigazione giocatori con frecce
      case 'arrowdown':
      case 'arrowright':
        e.preventDefault();
        navigatePlayer(1); // Vai al giocatore successivo
        toast('Giocatore successivo');
        return;
      
      case 'arrowup':
      case 'arrowleft':
        e.preventDefault();
        navigatePlayer(-1); // Vai al giocatore precedente
        toast('Giocatore precedente');
        return;
      
      // Undo con tasto U o Ctrl+Z
      case 'u':
        e.preventDefault();
        undo(state).then(undone => {
          if(undone){ 
            refreshEvents(); 
            toast(`Azione annullata: ${undone.type}`); 
          } else { 
            toast('Nessuna azione da annullare'); 
          }
        });
        return;
      
      case 'z':
        // Ctrl+Z per Undo (standard)
        if(e.ctrlKey || e.metaKey) {
          e.preventDefault();
          undo(state).then(undone => {
            if(undone){ 
              refreshEvents(); 
              toast(`Azione annullata: ${undone.type}`); 
            } else { 
              toast('Nessuna azione da annullare'); 
            }
          });
          return;
        }
        break;
      
      // Controlli cronometro
      case ' ': // Spazio
        e.preventDefault();
        if(state.running) {
          pauseClock(state);
          if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
          toast('Cronometro in pausa');
        } else {
          startClock(state);
          if(!rafId) updateClock();
          toast('Cronometro avviato');
        }
        return;
      
      case 's':
        startClock(state);
        if(!rafId) updateClock();
        toast('Cronometro avviato');
        e.preventDefault();
        return;
      
      case 'p':
        pauseClock(state);
        if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
        toast('Cronometro in pausa');
        e.preventDefault();
        return;
    }

    // Se è stata identificata un'azione, registrala
    if(eventType && selectedPlayer) {
      e.preventDefault();
      const evt = {
        gameId: state.game.id,
        playerId: selectedPlayer,
        team: 'us',
        tsMs: Date.now(),
        period: state.period,
        onCourt: true,
        type: eventType,
        meta: {}
      };
      
      addEvent(state, evt).then(() => {
        refreshEvents();
        toast(`${actionDescription} registrato`);
      }).catch(err => {
        console.warn('Errore nel registrare evento:', err);
        toast('Errore nel registrare evento');
      });
    }
  };

  // Aggiungi il listener per i tasti
  document.addEventListener('keydown', keyboardHandler);

  // Cleanup del listener quando si esce dalla partita
  const originalNavigate = window.appNavigate;
  window.appNavigate = (...args) => {
    document.removeEventListener('keydown', keyboardHandler);
    window.appNavigate = originalNavigate;
    return originalNavigate(...args);
  };
  
  // Mostra la guida shortcuts
  const shortcutsCard = el('div', 'card');
  shortcutsCard.innerHTML = `
    <h4>⌨️ Shortcuts da tastiera</h4>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 12px;">
      <div><strong>Azioni giocatori:</strong></div>
      <div><strong>Controlli:</strong></div>
      <div><strong>Navigazione:</strong></div>
      <div>1 = Tiro libero ✓</div>
      <div>SPAZIO = Play/Pausa</div>
      <div>↑/← = Giocatore prec.</div>
      <div>2 = Tiro libero ✗</div>
      <div>S = Start cronometro</div>
      <div>↓/→ = Giocatore succ.</div>
      <div>3 = 2 punti ✓</div>
      <div>P = Pausa cronometro</div>
      <div>U = Annulla azione</div>
      <div>4 = 2 punti ✗</div>
      <div></div>
      <div>CTRL+Z = Annulla azione</div>
      <div>5 = 3 punti ✓</div>
      <div><strong>Altri:</strong></div>
      <div></div>
      <div>6 = 3 punti ✗</div>
      <div>ENTER = Aggiungi giocatore</div>
      <div></div>
      <div>Q = Rimbalzo off.</div>
      <div>(nella schermata setup)</div>
      <div></div>
      <div>W = Rimbalzo dif.</div>
      <div></div>
      <div></div>
      <div>E = Assist</div>
      <div></div>
      <div></div>
      <div>R = Palla persa</div>
      <div></div>
      <div></div>
      <div>T = Fallo</div>
      <div></div>
      <div></div>
      <div>Y = Palla rubata</div>
      <div></div>
      <div></div>
    </div>
    <small style="color: #666; margin-top: 10px; display: block;">
      💡 <strong>Suggerimento:</strong> Usa le frecce ↑↓ per scorrere i giocatori in campo, poi premi i tasti numerici/lettere per registrare le azioni velocemente!
    </small>
  `;
  container.appendChild(shortcutsCard);

}

async function quickEvent(state,type,players,clockEl){
  // request a player via prompt for demo simplicity
  const pid = prompt('ID giocatore (usa id visibili nelle card)'); if(!pid) return;
  const evt = {gameId:state.game.id,playerId:pid,team:'us',tsMs:Date.now(),period:state.period,onCourt:state.onCourt.includes(pid),type,meta:{}};
  await addEvent(state,evt);
  toast('Evento registrato');
}
