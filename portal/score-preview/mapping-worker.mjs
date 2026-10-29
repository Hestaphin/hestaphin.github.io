// SPDX-License-Identifier: GPL-3.0-only
import {createMappingEngine} from './mapping-engine.mjs?v=1.37';
const engine=createMappingEngine();let loaded=false,queue=Promise.resolve();
self.onmessage=({data})=>{
 if(!data||!Number.isSafeInteger(data.id))return;
 queue=queue.then(async()=>{try{
  let value;if(data.method==='load'&&!loaded){value=await engine.load(data.buffer);loaded=true;}else if(data.method==='page'&&loaded)value=await engine.page(data.index);else throw Error('NOTE_MAP_UNAVAILABLE');
  self.postMessage({id:data.id,value});
 }catch{self.postMessage({id:data.id,error:'NOTE_MAP_UNAVAILABLE'});}});
};
