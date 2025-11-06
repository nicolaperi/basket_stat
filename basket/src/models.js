// Tipi, costanti e funzioni di utilità per il dominio
// Canonical event type constants. Keys include some Italian aliases for backwards compatibility.
export const EVENT_TYPES = {
  // Free throws
  FT_MADE: 'FT_MADE',
  FT_MISS: 'FT_MISS',
  // Field goals
  '2PT_MADE': '2PT_MADE',
  '2PT_MISS': '2PT_MISS',
  '3PT_MADE': '3PT_MADE',
  '3PT_MISS': '3PT_MISS',
  // Rebounds
  OREB: 'OREB',
  DREB: 'DREB',
  // Other actions
  ASSIST: 'ASSIST',
  TURNOVER: 'TURNOVER',
  FOUL: 'FOUL',
  STEAL: 'STEAL',
  // Substitutions
  SUB_IN: 'SUB_IN',
  SUB_OUT: 'SUB_OUT'
};

// Backwards-compatible Italian keys / legacy names
EVENT_TYPES['1PT_MADE'] = EVENT_TYPES.FT_MADE;
EVENT_TYPES['1PT_MISS'] = EVENT_TYPES.FT_MISS;
EVENT_TYPES['FALLO'] = EVENT_TYPES.FOUL;
EVENT_TYPES['PALLA_PERSA'] = EVENT_TYPES.TURNOVER;
EVENT_TYPES['PALLA_RUBATA'] = EVENT_TYPES.STEAL;
EVENT_TYPES['RIMB_OFF'] = EVENT_TYPES.OREB;
EVENT_TYPES['RIMB_DIF'] = EVENT_TYPES.DREB;
EVENT_TYPES['CAMBIO_IN'] = EVENT_TYPES.SUB_IN;
EVENT_TYPES['CAMBIO_OUT'] = EVENT_TYPES.SUB_OUT;

export function uid(prefix='id'){ return prefix + '_' + Math.random().toString(36).slice(2,9); }

export function validateStartingFive(ids){
  if(!Array.isArray(ids)) return false;
  return ids.length===5 && ids.every(id=>typeof id==='string');
}

export function nowMs(){ return Date.now(); }