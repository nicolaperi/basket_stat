// wrapper IndexedDB semplice e promisificato
const DB_NAME = 'basket_analytics_v1';
const DB_VERSION = 1;
const STORES = ['players','games','events','lineups'];

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      STORES.forEach(s=>{ if(!db.objectStoreNames.contains(s)) db.createObjectStore(s,{keyPath:'id'}) });
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}

async function withStore(storeName, mode, callback){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store);
    tx.oncomplete = ()=>resolve(result);
    tx.onerror = ()=>reject(tx.error||new Error('tx error'));
  });
}

export async function add(store, item){
  await withStore(store, 'readwrite', s=>s.add(item));
  return item;
}
export async function put(store,item){
  await withStore(store,'readwrite',s=>s.put(item));
  return item;
}
export async function get(store,id){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(store,'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
export async function getAll(store){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(store,'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
export async function del(store,id){
  await withStore(store,'readwrite',s=>s.delete(id));
}
export async function clear(store){
  await withStore(store,'readwrite',s=>s.clear());
}

// helper: query index-less filter (client-side)
export async function queryAll(store, predicate){
  const all = await getAll(store);
  return all.filter(predicate);
}

export default {openDB,add,put,get,getAll,del,clear,queryAll};
