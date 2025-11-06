import { renderHome } from './home.js';
import { renderGame } from './game.js';
import { renderStats } from './stats.js';
import storage from '../storage.js';

let view = null;
function clear(){ if(view) view.innerHTML=''; }

// Show a small modal at startup to choose import vs fresh start.
// The modal buttons open the file-picker from a direct click handler so
// browsers won't block the input dialog.
export async function showStartupModal(){
  return new Promise((resolve)=>{
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.display='flex'; overlay.style.alignItems='center'; overlay.style.justifyContent='center'; overlay.style.background='rgba(0,0,0,0.5)'; overlay.style.zIndex='9999';
    const card = document.createElement('div'); card.className='card'; card.style.minWidth='320px';
    const title = document.createElement('h3'); title.textContent = 'Import storico o prima partita?';
    const p = document.createElement('div'); p.textContent = 'Scegli se importare un file JSON con lo storico o iniziare senza dati.';
    const actions = document.createElement('div'); actions.className='row'; actions.style.marginTop='12px';
    const importBtn = document.createElement('button'); importBtn.className='btn'; importBtn.textContent='Importa storico';
    const freshBtn = document.createElement('button'); freshBtn.className='btn--muted'; freshBtn.textContent='Prima partita (vuota)';
    actions.appendChild(importBtn); actions.appendChild(freshBtn);
    card.appendChild(title); card.appendChild(p); card.appendChild(actions); overlay.appendChild(card); document.body.appendChild(overlay);

    importBtn.addEventListener('click', ()=>{
      const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
      inp.onchange = async (ev)=>{
        const f = ev.target.files[0]; if(!f) return; try{ const txt = await f.text(); const data = JSON.parse(txt); await storage.importAll(data); console.info('Imported backup from file'); }catch(err){ console.warn('import failed',err); alert('Import fallito: file non valido'); }
        document.body.removeChild(overlay);
        resolve('imported');
      };
      inp.click();
    });

    freshBtn.addEventListener('click', async ()=>{ try{ await storage.clearAll(); console.info('Storage cleared for fresh start'); }catch(e){ console.warn('clearAll failed',e); } document.body.removeChild(overlay); resolve('fresh'); });
  });
}

export async function navigateTo(route, params){
  try{
    clear();
    if(route==='home') await renderHome(view);
    else if(route==='new') await renderGame(view, params);
    else if(route==='stats') await renderStats(view, params);
  }catch(err){
    if(view) view.innerHTML = `<div class="card">Errore: ${String(err)}</div>`;
    console.error('navigate error',err);
  }
}

window.addEventListener('DOMContentLoaded', async ()=>{
  view = document.getElementById('view');
  try{
    await showStartupModal();
  }catch(e){ console.warn('startup import flow failed',e); }
  // Start at home
  navigateTo('home');
  // expose navigate globally for dev/testing
  window.appNavigate = navigateTo;
});

// If script executed after DOMContentLoaded already fired, initialize immediately
if(document.readyState !== 'loading'){
  (async ()=>{
    view = document.getElementById('view');
    try{ await showStartupModal(); }catch(e){ console.warn('startup import flow failed',e); }
    navigateTo('home');
    window.appNavigate = navigateTo;
  })();
}
// Startup import/first-match flow implemented above.
