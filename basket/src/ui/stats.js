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
  const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height; ctx.clearRect(0,0,w,h);
  if(!values || values.length===0) return;
  // compute min/max
  const min = Math.min(...values); const max = Math.max(...values); const pad = (max-min)||1;
  // margins
  const m = {l:40,r:10,t:10,b:30}; const gw = w-m.l-m.r, gh = h-m.t-m.b;
  // draw axes
  ctx.strokeStyle = '#444'; ctx.beginPath(); ctx.moveTo(m.l,h-m.b); ctx.lineTo(w-m.r,h-m.b); ctx.stroke(); ctx.beginPath(); ctx.moveTo(m.l,m.t); ctx.lineTo(m.l,h-m.b); ctx.stroke();
  // labels on x
  ctx.fillStyle='#aaa'; ctx.font='12px sans-serif'; const n = values.length;
  for(let i=0;i<n;i++){ const x = m.l + (i/(n-1||1))*gw; ctx.fillText(labels[i]||'', x-20, h-m.b+16); }
  // plot line
  ctx.strokeStyle = opts.color || '#0af'; ctx.lineWidth=2; ctx.beginPath();
  for(let i=0;i<n;i++){ const x = m.l + (i/(n-1||1))*gw; const y = m.t + (1 - ( (values[i]-min)/pad ))*gh; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.stroke();
  // draw points
  ctx.fillStyle = opts.color || '#0af'; for(let i=0;i<n;i++){ const x = m.l + (i/(n-1||1))*gw; const y = m.t + (1 - ( (values[i]-min)/pad ))*gh; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); }
}

export async function renderStats(container){
  container = container || document.getElementById('view');
  if(!container){ console.warn('renderStats: container not found'); return; }
  container.innerHTML='';
  const card = el('div','card'); card.appendChild(el('h2',null,'Statistiche giocatore'));

  const players = await storage.listPlayers();
  const games = await storage.listGames();

  // Preload events per game
  const eventsPerGame = {};
  for(const g of games){ eventsPerGame[g.id] = await storage.listEventsByGame(g.id); }

  // preload lineups (played minutes summaries)
  const lineups = await storage.listLineups();

  // Player selector
  const selWrap = el('div','row'); const sel = document.createElement('select'); sel.appendChild(new Option('Seleziona giocatore','__none'));
  players.forEach(p=> sel.appendChild(new Option(`${p.name} (#${p.jerseyNumber||''})`,p.id)));
  selWrap.appendChild(sel);
  const btn = el('button','btn','Mostra');
  const back = el('button','btn--muted','Torna'); back.onclick = ()=> window.appNavigate && window.appNavigate('home');
  selWrap.appendChild(btn); selWrap.appendChild(back); card.appendChild(selWrap);

  const out = el('div','card'); card.appendChild(out);

  btn.onclick = async ()=>{
    const pid = sel.value; if(!pid || pid==='__none'){ toast('Seleziona un giocatore'); return; }
    out.innerHTML='';
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
    const ftSeries = perGame.map(pg=> pg.ftAtt? Math.round((pg.ftMade/pg.ftAtt)*100):0);
    const twoSeries = perGame.map(pg=> pg.twoAtt? Math.round((pg.twoMade/pg.twoAtt)*100):0);
    const threeSeries = perGame.map(pg=> pg.threeAtt? Math.round((pg.threeMade/pg.threeAtt)*100):0);
    const minsSeries = perGame.map(pg=> +pg.mins.toFixed(2));
    const astSeries = perGame.map(pg=> pg.ast);
    const tovSeries = perGame.map(pg=> pg.tov);
    const stlSeries = perGame.map(pg=> pg.stl);
    const rebSeries = perGame.map(pg=> pg.oreb+pg.dreb);

    const c1 = createCanvasChart('FT % per partita'); chartsWrap.appendChild(c1.wrap); drawLineChart(c1.canvas, labels, ftSeries, {color:'#c36'});
    const c2 = createCanvasChart('2PT % per partita'); chartsWrap.appendChild(c2.wrap); drawLineChart(c2.canvas, labels, twoSeries, {color:'#08a'});
    const c3 = createCanvasChart('3PT % per partita'); chartsWrap.appendChild(c3.wrap); drawLineChart(c3.canvas, labels, threeSeries, {color:'#0a8'});
    const c4 = createCanvasChart('Minuti per partita'); chartsWrap.appendChild(c4.wrap); drawLineChart(c4.canvas, labels, minsSeries, {color:'#a00'});
    const c5 = createCanvasChart('Assist per partita'); chartsWrap.appendChild(c5.wrap); drawLineChart(c5.canvas, labels, astSeries, {color:'#0a0'});
    const c6 = createCanvasChart('Palle perse per partita'); chartsWrap.appendChild(c6.wrap); drawLineChart(c6.canvas, labels, tovSeries, {color:'#aa0'});
    const c7 = createCanvasChart('Palle rubate per partita'); chartsWrap.appendChild(c7.wrap); drawLineChart(c7.canvas, labels, stlSeries, {color:'#0aa'});
    const c8 = createCanvasChart('Rimbalzi per partita'); chartsWrap.appendChild(c8.wrap); drawLineChart(c8.canvas, labels, rebSeries, {color:'#666'});

    out.appendChild(chartsWrap);

    // export CSV
    const csvBtn = el('button','btn','Esporta CSV'); csvBtn.onclick = ()=>{ 
      const rows = perGame.map(pg=>({Game:new Date(pg.game.dateISO).toLocaleDateString(),FT: `${pg.ftMade}-${pg.ftAtt}`,FG2:`${pg.twoMade}-${pg.twoAtt}`,FG3:`${pg.threeMade}-${pg.threeAtt}`,MINS:pg.mins,AST:pg.ast,TOV:pg.tov,STL:pg.stl,REB:pg.oreb+pg.dreb}));
      if(rows.length===0) return; const csv = toCSV(rows); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`stats_${pid}.csv`; a.click(); URL.revokeObjectURL(url); 
    };
    out.appendChild(csvBtn);
  };

  container.appendChild(card);
}
