import storage from '../storage.js';

export function el(tag,cls,txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }

export function playerCard(player, opts={selected:false}){
  const div = el('div','player'); if(opts.selected) div.classList.add('player--on');
  div.dataset.id = player.id;
  div.innerHTML = `<strong>${player.name}</strong><div class="footer-note">#${player.jerseyNumber}</div>`;
  return div;
}

export function toast(msg){ const t = el('div','toast',msg); document.body.appendChild(t); setTimeout(()=>t.remove(),2500); }

export async function confirmModal(title,body){ return confirm(title+'\n\n'+body); }

export function tableFromRows(rows){
  const table = el('table','table');
  if(!rows||rows.length===0) return table;
  const thead = document.createElement('thead'), tr=document.createElement('tr'); Object.keys(rows[0]).forEach(k=>{ const th=document.createElement('th'); th.textContent=k; tr.appendChild(th); }); thead.appendChild(tr);
  table.appendChild(thead);
  const tbody=document.createElement('tbody'); rows.forEach(r=>{ const tr2=document.createElement('tr'); Object.keys(r).forEach(k=>{ const td=document.createElement('td'); td.textContent = r[k]; tr2.appendChild(td); }); tbody.appendChild(tr2); }); table.appendChild(tbody);
  return table;
}
