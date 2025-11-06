import storage from '../storage.js';
import { el, playerCard, toast } from './components.js';

export async function renderHome(container){
  container = container || document.getElementById('view');
  if(!container){ console.warn('renderHome: container not found'); return; }
  const card = el('div','card');
  const row = el('div','row');
  const bNew = el('button','btn big','Nuova partita');
  const bStats = el('button','btn big','Statistiche');
  const bDemo = el('button','btn--muted','Carica dati demo');
  bNew.onclick = ()=> window.appNavigate('new');
  bStats.onclick = ()=> window.appNavigate('stats');
  bDemo.onclick = async ()=>{ await storage.seedDemo(); toast('Dati demo creati'); renderHome(container); };
  row.appendChild(bNew); row.appendChild(bStats); row.appendChild(bDemo);
  card.appendChild(row);

  const historyCard = el('div','card');
  historyCard.appendChild(el('h3',null,'Storico partite'));
  const games = await storage.listGames();
  if(games.length===0){ historyCard.appendChild(el('div',null,'Nessuna partita. Usa "Carica dati demo" o crea una nuova partita.')); }
  else{
    const table = document.createElement('table'); table.className='table';
    const thead = document.createElement('thead'); thead.innerHTML = '<tr><th>Data</th><th>Avversario</th><th>Campo</th><th>Azioni</th></tr>'; table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for(const g of games){ const tr=document.createElement('tr'); tr.innerHTML = `<td>${new Date(g.dateISO).toLocaleString()}</td><td>${g.opponent}</td><td>${g.venue}</td><td><button class="btn" data-id="${g.id}">Apri</button></td>`; tbody.appendChild(tr); }
    table.appendChild(tbody); historyCard.appendChild(table);
    historyCard.querySelectorAll('button').forEach(b=>b.addEventListener('click', e=>{ const id = e.target.dataset.id; window.appNavigate('new',{gameId:id}); }));
  }

  container.appendChild(card); container.appendChild(historyCard);
}
