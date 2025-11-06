// cronometro semplice che restituisce ms trascorsi
export function formatMs(ms){
  if(ms==null) return '00:00';
  const total = Math.max(0,Math.round(ms/1000));
  const mm = Math.floor(total/60).toString().padStart(2,'0');
  const ss = (total%60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
}

export function nowMs(){ return Date.now(); }

// calcola delta e restituisce ms
export function deltaMs(start, end){ return Math.max(0, (end - start)); }
