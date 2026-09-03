/* VRT PROD IndexedDB storage v3.7
 * Large operational datasets live in IndexedDB. localStorage remains for URLs,
 * UI preferences and one-time legacy migration only.
 */
(function(g){
  'use strict';
  if(g.VRTProdStorage)return;
  const VERSION='3.7.0',locks=new Map();
  function req(q){return new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error||new Error('IndexedDB request failed'))})}
  function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'))})}
  async function inspect(name){const db=await req(indexedDB.open(name));const v=db.version,names=[...db.objectStoreNames];db.close();return{version:v,names}}
  async function ensure(name,spec){
    // Serialize upgrades per database, then give every caller its own connection.
    // This prevents one concurrent CRUD call from closing a connection still in
    // use by another call and lets different stores be added safely in sequence.
    while(locks.has(name))await locks.get(name);
    const gate=(async()=>{const info=await inspect(name),missing=Object.keys(spec||{}).filter(s=>!info.names.includes(s));if(!missing.length)return;
      await new Promise((resolve,reject)=>{const q=indexedDB.open(name,info.version+1);q.onupgradeneeded=()=>{for(const s of missing){if(q.result.objectStoreNames.contains(s))continue;const o=spec[s]||{};q.result.createObjectStore(s,o.keyPath?{keyPath:o.keyPath,autoIncrement:!!o.autoIncrement}:undefined)}};q.onsuccess=()=>{q.result.close();resolve()};q.onerror=()=>reject(q.error);q.onblocked=()=>reject(new Error('IndexedDB upgrade blocked: '+name))})})();
    locks.set(name,gate);try{await gate}finally{if(locks.get(name)===gate)locks.delete(name)}
    const db=await req(indexedDB.open(name));db.onversionchange=()=>db.close();return db;
  }
  async function all(name,store,spec){const db=await ensure(name,{[store]:spec||{keyPath:'id'}});try{return await req(db.transaction(store,'readonly').objectStore(store).getAll())}finally{db.close()}}
  async function get(name,store,key){const db=await ensure(name,{[store]:{}});try{return await req(db.transaction(store,'readonly').objectStore(store).get(key))}finally{db.close()}}
  async function put(name,store,value,key,spec){const db=await ensure(name,{[store]:spec||{}});try{const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store);key===undefined?os.put(value):os.put(value,key);await txDone(tx);return value}finally{db.close()}}
  async function remove(name,store,key,spec){const db=await ensure(name,{[store]:spec||{}});try{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);await txDone(tx)}finally{db.close()}}
  async function clear(name,store,spec){const db=await ensure(name,{[store]:spec||{}});try{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();await txDone(tx)}finally{db.close()}}
  async function replaceAll(name,store,rows,spec){const db=await ensure(name,{[store]:spec||{keyPath:'id'}});try{const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store);os.clear();for(const r of rows||[])os.put(r);await txDone(tx);return (rows||[]).length}finally{db.close()}}
  async function migrateJSON(lsKey,fallback){let v=fallback;try{const raw=localStorage.getItem(lsKey);if(raw!=null)v=JSON.parse(raw)}catch(_){}return v}
  g.VRTProdStorage={version:VERSION,ensure,all,get,put,remove,clear,replaceAll,migrateJSON};
})(window);
