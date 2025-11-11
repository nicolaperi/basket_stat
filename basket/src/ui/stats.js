import * as storage from '../storage.js';
import { el, tableFromRows, toast } from './components.js';
import { toCSV } from '../utils/math.js';
import { formatMs } from '../utils/time.js';
import { EVENT_TYPES } from '../models.js';

function safePct(made, att){ if(att===0) return '—'; return `${Math.round((made/att)*100)}% (${made}/${att})`; }

function createCanvasChart(title){
  const wrap = el('div','card'); wrap.appendChild(el('h4',null,title));
  const c = document.createElement('canvas'); c.width = 700; c.height = 200; c.style.width='100%'; c.style.height='200px'; wrap.appendChild(c);
  return {wrap,canvas:c};
}

function drawLineChart(canvas, labels, values, opts={color:'#00a'}){
  const ctx = canvas.getContext('2d'); 
  const w = canvas.width, h = canvas.height; 
  ctx.clearRect(0,0,w,h);
  
  if(!values || values.length===0) return;
  
  // compute min/max
  const min = Math.min(...values); 
  const max = Math.max(...values); 
  const pad = (max-min)||1;
  
  // margins - aumentato margine sinistro per le etichette Y
  const m = {l:60,r:20,t:25,b:30}; 
  const gw = w-m.l-m.r, gh = h-m.t-m.b;
  
  // draw axes
  ctx.strokeStyle = '#444'; 
  ctx.lineWidth = 1;
  ctx.beginPath(); 
  ctx.moveTo(m.l,h-m.b); 
  ctx.lineTo(w-m.r,h-m.b); 
  ctx.stroke(); 
  ctx.beginPath(); 
  ctx.moveTo(m.l,m.t); 
  ctx.lineTo(m.l,h-m.b); 
  ctx.stroke();
  
  // Etichette asse Y (valori delle statistiche)
  ctx.fillStyle='#aaa'; 
  ctx.font='11px sans-serif';
  ctx.textAlign = 'right';
  
  // Calcola il numero di tacche sull'asse Y (circa 5-6 valori)
  const ySteps = 5;
  for(let i=0; i<=ySteps; i++){
    const value = min + (pad * i / ySteps);
    const y = h - m.b - (i / ySteps) * gh;
    
    // Disegna la linea della griglia (opzionale, rende più leggibile)
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(m.l, y);
    ctx.lineTo(w-m.r, y);
    ctx.stroke();
    
    // Disegna il valore
    ctx.fillStyle='#aaa';
    ctx.fillText(Math.round(value).toString(), m.l-8, y+4);
  }
  
  // Reset text align per le altre etichette
  ctx.textAlign = 'center';
  
  // labels on x (date delle partite)
  ctx.fillStyle='#aaa'; 
  ctx.font='12px sans-serif'; 
  const n = values.length;
  for(let i=0;i<n;i++){ 
    const x = m.l + (i/(n-1||1))*gw; 
    ctx.fillText(labels[i]||'', x, h-m.b+16); 
  }
  
  // plot line
  ctx.strokeStyle = opts.color || '#0af'; 
  ctx.lineWidth=2; 
  ctx.beginPath();
  for(let i=0;i<n;i++){ 
    const x = m.l + (i/(n-1||1))*gw; 
    const y = m.t + (1 - ( (values[i]-min)/pad ))*gh; 
    if(i===0) ctx.moveTo(x,y); 
    else ctx.lineTo(x,y); 
  }
  ctx.stroke();
  
  // draw points and value labels
  ctx.fillStyle = opts.color || '#0af'; 
  ctx.font='bold 12px sans-serif';
  
  for(let i=0;i<n;i++){ 
    const x = m.l + (i/(n-1||1))*gw; 
    const y = m.t + (1 - ( (values[i]-min)/pad ))*gh; 
    
    // Disegna il punto (pallino)
    ctx.beginPath(); 
    ctx.arc(x,y,4,0,Math.PI*2); 
    ctx.fill();
    
    // Disegna il valore della statistica sopra il punto
    // Sfondo semi-trasparente per migliorare la leggibilità
    const valueText = values[i].toString();
    const textWidth = ctx.measureText(valueText).width;
    
    ctx.fillStyle = 'rgba(11, 11, 13, 0.8)'; // Background scuro semi-trasparente
    ctx.fillRect(x - textWidth/2 - 3, y - 20, textWidth + 6, 16);
    
    // Testo del valore
    ctx.fillStyle = opts.color || '#0af';
    ctx.fillText(valueText, x, y - 8);
  }
}


export async function renderStats(container){
  container = container || document.getElementById('view');
  if(!container){ console.warn('renderStats: container not found'); return; }
  container.innerHTML='';
  const card = el('div','card'); card.appendChild(el('h2',null,'Statistiche'));

  const players = await storage.listPlayers();
  const games = await storage.listGames();

  // Preload events per game
  const eventsPerGame = {};
  for(const g of games){ eventsPerGame[g.id] = await storage.listEventsByGame(g.id); }

  // preload lineups (played minutes summaries)
  const lineups = await storage.listLineups();

  // Selettore modalità: Giocatore o Squadra
  const modeWrap = el('div','row');
  const modeLabel = el('strong', null, 'Visualizza: ');
  const modeSelect = document.createElement('select');
  modeSelect.appendChild(new Option('Statistiche Giocatore', 'player'));
  modeSelect.appendChild(new Option('Statistiche Squadra', 'team'));
  modeWrap.appendChild(modeLabel);
  modeWrap.appendChild(modeSelect);
  card.appendChild(modeWrap);

  // Player selector (solo per modalità giocatore)
  const playerSelWrap = el('div','row'); 
  const playerSelLabel = el('label', null, 'Giocatore: ');
  const sel = document.createElement('select'); 
  sel.appendChild(new Option('Seleziona giocatore','__none'));
  players.forEach(p=> sel.appendChild(new Option(`${p.name} (#${p.jerseyNumber||''})`,p.id)));
  playerSelWrap.appendChild(playerSelLabel);
  playerSelWrap.appendChild(sel);
  const btn = el('button','btn','Mostra');
  const back = el('button','btn--muted','Torna'); back.onclick = ()=> window.appNavigate && window.appNavigate('home');
  playerSelWrap.appendChild(btn); playerSelWrap.appendChild(back); 
  card.appendChild(playerSelWrap);

  const out = el('div','card'); card.appendChild(out);

  // Gestione cambio modalità
  modeSelect.onchange = ()=>{
    const mode = modeSelect.value;
    if(mode === 'player'){
      playerSelWrap.style.display = 'flex';
      out.innerHTML = '';
    } else if(mode === 'team'){
      playerSelWrap.style.display = 'none';
      out.innerHTML = '';
      // Mostra automaticamente le statistiche di squadra
      renderTeamStats(out, games, eventsPerGame, lineups, players);
    }
  };

  btn.onclick = async ()=>{
    const pid = sel.value; if(!pid || pid==='__none'){ toast('Seleziona un giocatore'); return; }
    out.innerHTML='';
    renderPlayerStats(out, pid, games, eventsPerGame, lineups, players);
  };

  container.appendChild(card);
}

// Funzione per renderizzare le statistiche di un singolo giocatore
async function renderPlayerStats(out, pid, games, eventsPerGame, lineups, players){
    // build per-game stats array
    const perGame = [];
    for(const g of games){ const evs = eventsPerGame[g.id] || []; const playerEvents = evs.filter(e=>e.playerId===pid);
      // counts
      const ftMade = playerEvents.filter(e=>e.type===EVENT_TYPES.FT_MADE).length;
      const ftAtt = playerEvents.filter(e=>e.type===EVENT_TYPES.FT_MADE || e.type===EVENT_TYPES.FT_MISS).length;
      const twoMade = playerEvents.filter(e=>e.type===EVENT_TYPES['2PT_MADE']).length;
      const twoAtt = playerEvents.filter(e=>e.type===EVENT_TYPES['2PT_MADE'] || e.type===EVENT_TYPES['2PT_MISS']).length;
      const threeMade = playerEvents.filter(e=>e.type===EVENT_TYPES['3PT_MADE']).length;
      const threeAtt = playerEvents.filter(e=>e.type===EVENT_TYPES['3PT_MADE'] || e.type===EVENT_TYPES['3PT_MISS']).length;
      const ast = playerEvents.filter(e=>e.type===EVENT_TYPES.ASSIST).length;
      const tov = playerEvents.filter(e=>e.type===EVENT_TYPES.TURNOVER).length;
      const stl = playerEvents.filter(e=>e.type===EVENT_TYPES.STEAL).length;
      const pf = playerEvents.filter(e=>e.type===EVENT_TYPES.FOUL).length;
      const oreb = playerEvents.filter(e=>e.type===EVENT_TYPES.OREB).length;
      const dreb = playerEvents.filter(e=>e.type===EVENT_TYPES.DREB).length;
      // minutes from lineups
      const lu = lineups.find(l=>l.gameId===g.id);
      const mins = lu && lu.playedMs && lu.playedMs[pid] ? (lu.playedMs[pid]/60000) : 0;
      perGame.push({game:g,ftMade,ftAtt,twoMade,twoAtt,threeMade,threeAtt,ast,tov,stl,pf,oreb,dreb,mins});
    }

    // Aggregate across games where player had any game (or all games?) we'll average over games played (>0 minutes or >0 events)
    const playedGames = perGame.filter(pg=>pg.mins>0 || (pg.ftAtt+pg.twoAtt+pg.threeAtt+pg.ast+pg.tov+pg.stl+pg.pf+pg.oreb+pg.dreb)>0);
    const gamesCount = playedGames.length || perGame.length;

    const totals = playedGames.reduce((acc,pg)=>{
      acc.ftMade+=pg.ftMade; acc.ftAtt+=pg.ftAtt; acc.twoMade+=pg.twoMade; acc.twoAtt+=pg.twoAtt; acc.threeMade+=pg.threeMade; acc.threeAtt+=pg.threeAtt;
      acc.ast+=pg.ast; acc.tov+=pg.tov; acc.stl+=pg.stl; acc.pf+=pg.pf; acc.oreb+=pg.oreb; acc.dreb+=pg.dreb; acc.mins+=pg.mins; return acc;
    }, {ftMade:0,ftAtt:0,twoMade:0,twoAtt:0,threeMade:0,threeAtt:0,ast:0,tov:0,stl:0,pf:0,oreb:0,dreb:0,mins:0});

    const summaryRows = [];
    summaryRows.push({Metric:'FT %',Value: safePct(totals.ftMade, totals.ftAtt)});
    summaryRows.push({Metric:'2PT %',Value: safePct(totals.twoMade, totals.twoAtt)});
    summaryRows.push({Metric:'3PT %',Value: safePct(totals.threeMade, totals.threeAtt)});
    summaryRows.push({Metric:'Media falli',Value: (totals.pf / gamesCount).toFixed(2)});
    summaryRows.push({Metric:'Minuti medi',Value: (totals.mins / gamesCount).toFixed(2) + ' min'});
    summaryRows.push({Metric:'Media assist',Value: (totals.ast / gamesCount).toFixed(2)});
    summaryRows.push({Metric:'Media palle perse',Value: (totals.tov / gamesCount).toFixed(2)});
    summaryRows.push({Metric:'Media palle rubate',Value: (totals.stl / gamesCount).toFixed(2)});
    summaryRows.push({Metric:'Media rimbalzi',Value: ((totals.oreb+totals.dreb) / gamesCount).toFixed(2)});

    out.appendChild(el('h3',null,`Riepilogo: ${players.find(p=>p.id===pid)?.name || pid}`));
    out.appendChild(tableFromRows(summaryRows));

    // Charts area
    const chartsWrap = el('div',null);
    
    // prepare labels and series
    const labels = perGame.map(pg=> new Date(pg.game.dateISO).toLocaleDateString());
    
    // Serie con valori assoluti invece di percentuali
    const ftMadeSeries = perGame.map(pg=> pg.ftMade);
    const twoMadeSeries = perGame.map(pg=> pg.twoMade);
    const threeMadeSeries = perGame.map(pg=> pg.threeMade);
    const minsSeries = perGame.map(pg=> +pg.mins.toFixed(2));
    const astSeries = perGame.map(pg=> pg.ast);
    const tovSeries = perGame.map(pg=> pg.tov);
    const stlSeries = perGame.map(pg=> pg.stl);
    const rebSeries = perGame.map(pg=> pg.oreb+pg.dreb);

    const c1 = createCanvasChart('Tiri liberi segnati per partita'); 
    chartsWrap.appendChild(c1.wrap); 
    drawLineChart(c1.canvas, labels, ftMadeSeries, {color:'#c36'});
    
    const c2 = createCanvasChart('2 punti segnati per partita'); 
    chartsWrap.appendChild(c2.wrap); 
    drawLineChart(c2.canvas, labels, twoMadeSeries, {color:'#08a'});
    
    const c3 = createCanvasChart('3 punti segnati per partita'); 
    chartsWrap.appendChild(c3.wrap); 
    drawLineChart(c3.canvas, labels, threeMadeSeries, {color:'#0a8'});
    
    const c4 = createCanvasChart('Minuti per partita'); 
    chartsWrap.appendChild(c4.wrap); 
    drawLineChart(c4.canvas, labels, minsSeries, {color:'#a00'});
    
    const c5 = createCanvasChart('Assist per partita'); 
    chartsWrap.appendChild(c5.wrap); 
    drawLineChart(c5.canvas, labels, astSeries, {color:'#0a0'});
    
    const c6 = createCanvasChart('Palle perse per partita'); 
    chartsWrap.appendChild(c6.wrap); 
    drawLineChart(c6.canvas, labels, tovSeries, {color:'#aa0'});
    
    const c7 = createCanvasChart('Palle rubate per partita'); 
    chartsWrap.appendChild(c7.wrap); 
    drawLineChart(c7.canvas, labels, stlSeries, {color:'#0aa'});
    
    const c8 = createCanvasChart('Rimbalzi per partita'); 
    chartsWrap.appendChild(c8.wrap); 
    drawLineChart(c8.canvas, labels, rebSeries, {color:'#666'});

    out.appendChild(chartsWrap);

    // export CSV
    const csvBtn = el('button','btn','Esporta CSV'); csvBtn.onclick = ()=>{ 
      const rows = perGame.map(pg=>({Game:new Date(pg.game.dateISO).toLocaleDateString(),FT: `${pg.ftMade}-${pg.ftAtt}`,FG2:`${pg.twoMade}-${pg.twoAtt}`,FG3:`${pg.threeMade}-${pg.threeAtt}`,MINS:pg.mins,AST:pg.ast,TOV:pg.tov,STL:pg.stl,REB:pg.oreb+pg.dreb}));
      if(rows.length===0) return; const csv = toCSV(rows); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`stats_${pid}.csv`; a.click(); URL.revokeObjectURL(url); 
    };
    out.appendChild(csvBtn);
}

// Funzione per renderizzare le statistiche di squadra
// Calcola la somma di tutte le statistiche di tutti i giocatori per ogni partita
async function renderTeamStats(out, games, eventsPerGame, lineups, players){
  out.innerHTML = '';
  out.appendChild(el('h3',null,'📊 Statistiche di Squadra'));
  
  if(games.length === 0){
    out.appendChild(el('div', null, 'Nessuna partita disponibile. Crea una partita per visualizzare le statistiche.'));
    return;
  }

  // Array per contenere le statistiche aggregate per ogni partita
  const perGameTeam = [];
  
  for(const g of games){
    const evs = eventsPerGame[g.id] || [];
    
    // Calcola statistiche di squadra per questa partita (somma di tutti i giocatori)
    const ftMade = evs.filter(e=>e.type===EVENT_TYPES.FT_MADE && e.team==='us').length;
    const ftAtt = evs.filter(e=>(e.type===EVENT_TYPES.FT_MADE || e.type===EVENT_TYPES.FT_MISS) && e.team==='us').length;
    const twoMade = evs.filter(e=>e.type===EVENT_TYPES['2PT_MADE'] && e.team==='us').length;
    const twoAtt = evs.filter(e=>(e.type===EVENT_TYPES['2PT_MADE'] || e.type===EVENT_TYPES['2PT_MISS']) && e.team==='us').length;
    const threeMade = evs.filter(e=>e.type===EVENT_TYPES['3PT_MADE'] && e.team==='us').length;
    const threeAtt = evs.filter(e=>(e.type===EVENT_TYPES['3PT_MADE'] || e.type===EVENT_TYPES['3PT_MISS']) && e.team==='us').length;
    const ast = evs.filter(e=>e.type===EVENT_TYPES.ASSIST && e.team==='us').length;
    const tov = evs.filter(e=>e.type===EVENT_TYPES.TURNOVER && e.team==='us').length;
    const stl = evs.filter(e=>e.type===EVENT_TYPES.STEAL && e.team==='us').length;
    const pf = evs.filter(e=>e.type===EVENT_TYPES.FOUL && e.team==='us').length;
    const oreb = evs.filter(e=>e.type===EVENT_TYPES.OREB && e.team==='us').length;
    const dreb = evs.filter(e=>e.type===EVENT_TYPES.DREB && e.team==='us').length;
    
    // Calcola i punti totali segnati dalla squadra
    const points = ftMade + (twoMade * 2) + (threeMade * 3);
    
    perGameTeam.push({
      game: g,
      ftMade, ftAtt,
      twoMade, twoAtt,
      threeMade, threeAtt,
      ast, tov, stl, pf,
      oreb, dreb,
      points
    });
  }

  // Calcola i totali aggregati su tutte le partite
  const totals = perGameTeam.reduce((acc, pg) => {
    acc.ftMade += pg.ftMade;
    acc.ftAtt += pg.ftAtt;
    acc.twoMade += pg.twoMade;
    acc.twoAtt += pg.twoAtt;
    acc.threeMade += pg.threeMade;
    acc.threeAtt += pg.threeAtt;
    acc.ast += pg.ast;
    acc.tov += pg.tov;
    acc.stl += pg.stl;
    acc.pf += pg.pf;
    acc.oreb += pg.oreb;
    acc.dreb += pg.dreb;
    acc.points += pg.points;
    return acc;
  }, {ftMade:0, ftAtt:0, twoMade:0, twoAtt:0, threeMade:0, threeAtt:0, ast:0, tov:0, stl:0, pf:0, oreb:0, dreb:0, points:0});

  const gamesCount = games.length;

  // Tabella riepilogo con medie e percentuali di squadra
  const summaryRows = [];
  summaryRows.push({Metric:'Partite giocate', Value: gamesCount});
  summaryRows.push({Metric:'Punti totali', Value: totals.points});
  summaryRows.push({Metric:'Media punti per partita', Value: (totals.points / gamesCount).toFixed(1)});
  summaryRows.push({Metric:'FT %', Value: safePct(totals.ftMade, totals.ftAtt)});
  summaryRows.push({Metric:'2PT %', Value: safePct(totals.twoMade, totals.twoAtt)});
  summaryRows.push({Metric:'3PT %', Value: safePct(totals.threeMade, totals.threeAtt)});
  summaryRows.push({Metric:'FG % (field goal)', Value: safePct(totals.twoMade + totals.threeMade, totals.twoAtt + totals.threeAtt)});
  summaryRows.push({Metric:'Media assist', Value: (totals.ast / gamesCount).toFixed(1)});
  summaryRows.push({Metric:'Media palle perse', Value: (totals.tov / gamesCount).toFixed(1)});
  summaryRows.push({Metric:'Media palle rubate', Value: (totals.stl / gamesCount).toFixed(1)});
  summaryRows.push({Metric:'Media falli', Value: (totals.pf / gamesCount).toFixed(1)});
  summaryRows.push({Metric:'Media rimbalzi offensivi', Value: (totals.oreb / gamesCount).toFixed(1)});
  summaryRows.push({Metric:'Media rimbalzi difensivi', Value: (totals.dreb / gamesCount).toFixed(1)});
  summaryRows.push({Metric:'Media rimbalzi totali', Value: ((totals.oreb + totals.dreb) / gamesCount).toFixed(1)});

  out.appendChild(el('h4', null, 'Riepilogo Globale'));
  out.appendChild(tableFromRows(summaryRows));

  // Grafici per le statistiche di squadra nel tempo
  const chartsWrap = el('div', null);
  const labels = perGameTeam.map(pg => new Date(pg.game.dateISO).toLocaleDateString());
  
  // Serie di dati per i grafici (valori assoluti invece di percentuali)
  const pointsSeries = perGameTeam.map(pg => pg.points);
  const ftMadeSeries = perGameTeam.map(pg => pg.ftMade);
  const twoMadeSeries = perGameTeam.map(pg => pg.twoMade);
  const threeMadeSeries = perGameTeam.map(pg => pg.threeMade);
  const astSeries = perGameTeam.map(pg => pg.ast);
  const tovSeries = perGameTeam.map(pg => pg.tov);
  const stlSeries = perGameTeam.map(pg => pg.stl);
  const rebSeries = perGameTeam.map(pg => pg.oreb + pg.dreb);
  const pfSeries = perGameTeam.map(pg => pg.pf);

  // Crea i grafici utilizzando la stessa funzione delle statistiche giocatore
  const c0 = createCanvasChart('Punti per partita');
  chartsWrap.appendChild(c0.wrap);
  drawLineChart(c0.canvas, labels, pointsSeries, {color:'#f90'});

  const c1 = createCanvasChart('Tiri liberi segnati per partita');
  chartsWrap.appendChild(c1.wrap);
  drawLineChart(c1.canvas, labels, ftMadeSeries, {color:'#c36'});

  const c2 = createCanvasChart('2 punti segnati per partita');
  chartsWrap.appendChild(c2.wrap);
  drawLineChart(c2.canvas, labels, twoMadeSeries, {color:'#08a'});

  const c3 = createCanvasChart('3 punti segnati per partita');
  chartsWrap.appendChild(c3.wrap);
  drawLineChart(c3.canvas, labels, threeMadeSeries, {color:'#0a8'});

  const c4 = createCanvasChart('Assist per partita');
  chartsWrap.appendChild(c4.wrap);
  drawLineChart(c4.canvas, labels, astSeries, {color:'#0a0'});

  const c5 = createCanvasChart('Palle perse per partita');
  chartsWrap.appendChild(c5.wrap);
  drawLineChart(c5.canvas, labels, tovSeries, {color:'#aa0'});

  const c6 = createCanvasChart('Palle rubate per partita');
  chartsWrap.appendChild(c6.wrap);
  drawLineChart(c6.canvas, labels, stlSeries, {color:'#0aa'});

  const c7 = createCanvasChart('Rimbalzi per partita');
  chartsWrap.appendChild(c7.wrap);
  drawLineChart(c7.canvas, labels, rebSeries, {color:'#666'});

  const c8 = createCanvasChart('Falli per partita');
  chartsWrap.appendChild(c8.wrap);
  drawLineChart(c8.canvas, labels, pfSeries, {color:'#c33'});

  out.appendChild(chartsWrap);

  // Export CSV per statistiche di squadra
  const csvBtn = el('button','btn','Esporta CSV Squadra');
  csvBtn.onclick = () => {
    const rows = perGameTeam.map(pg => ({
      Partita: new Date(pg.game.dateISO).toLocaleDateString(),
      Avversario: pg.game.opponent || 'N/A',
      Punti: pg.points,
      FT: `${pg.ftMade}-${pg.ftAtt}`,
      FG2: `${pg.twoMade}-${pg.twoAtt}`,
      FG3: `${pg.threeMade}-${pg.threeAtt}`,
      AST: pg.ast,
      TOV: pg.tov,
      STL: pg.stl,
      REB: pg.oreb + pg.dreb,
      PF: pg.pf
    }));
    
    if(rows.length === 0) return;
    const csv = toCSV(rows);
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team_stats_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  out.appendChild(csvBtn);
}

