export const UNIFORM_FILTER_FIELDS=['department','occupation_type','instrument','classification','rank','member_status'];
export const UNIFORM_DEFAULT_CATEGORIES=['Service uniform','Service trousers','Service shirt','Service shoes','Coat','Socks','Belt','Service cap'];
export const uniformStatusLabel=value=>({issued:'Issued',ready:'Ready to collect',pending:'Pending',none:'Not issued'}[value]||'Not issued');
export function uniformRecordName(record,items=[]){
 return items.find(item=>item.id===record?.item_id)?.name||record?.item_snapshot?.name||'—';
}
export function uniformCatalogueItems(categoryId,items=[],records=[],target=null){
 const shown=items.filter(item=>item.category_id===categoryId&&!item.archived_at);
 if(target?.category!==categoryId||!target.item||shown.some(item=>item.id===target.item))return shown;
 const current=items.find(item=>item.id===target.item);
 if(current){if(current.category_id===categoryId)shown.push(current);return shown;}
 // A saved record can restore a removed item's details only in its own
 // classification. It is historical data, so it cannot open the live editor.
 const record=records.find(row=>row.item_id===target.item&&row.category_id===categoryId),snapshot=record?.item_snapshot;
 if(snapshot&&(!snapshot.category_id||snapshot.category_id===categoryId))shown.push({...snapshot,id:record.item_id,category_id:record.category_id,historical:true});
 return shown;
}
export function uniformApplicationModes(itemId,holdings=[],pending=[]){
 if(pending.some(line=>line.item_id===itemId||(line.mode==='exchange'&&line.previous_record?.item_id===itemId)))return [];
 const record=holdings.find(h=>h.item_id===itemId);
 return !record?['new']:record.status==='issued'?['exchange']:[];
}
export function uniformMemberRows(categories,items,holdings,pending){
 return categories.flatMap(category=>{
  const ids=[...new Set([...holdings,...pending].filter(row=>row.category_id===category.id).map(row=>row.item_id))];
  if(!ids.length)return [{category,holding:null,pending:null,shown:null}];
  return ids.map(id=>{const h=holdings.find(row=>row.item_id===id),p=pending.find(row=>row.item_id===id);return {category,holding:h||null,pending:p||null,shown:p||h};}).sort((a,b)=>uniformRecordName(a.shown,items).localeCompare(uniformRecordName(b.shown,items),undefined,{numeric:true}));
 });
}
export function validateUniformItem(input) {
 const name=String(input.name||'').trim(),measurements=input.measurements,sizes=input.sizes;
 if(!name||name.length>80)throw Error('Enter a uniform type of at most 80 characters.');
 if(!Array.isArray(measurements)||measurements.length>12||measurements.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>40||['__proto__','prototype','constructor'].includes(v.trim().toLowerCase()))||new Set(measurements.map(v=>v.trim().toLowerCase())).size!==measurements.length)throw Error('Use up to twelve distinct measurement names.');
 const fields=measurements.map(v=>v.trim());
 if(!Array.isArray(sizes)||!sizes.length||sizes.length>40)throw Error('Add between one and forty sizes.');
 const seen=new Set(),clean=sizes.map(size=>{
  const label=String(size.label||'').trim();if(!label||label.length>30||seen.has(label.toLowerCase()))throw Error('Give every size a distinct name.');seen.add(label.toLowerCase());
  const values={};for(const field of fields){const value=String(size.values?.[field]??'').trim();if(!value||value.length>60)throw Error('Fill every measurement for every size.');values[field]=value;}
  return {label,values};
 });return {name,measurements:fields,sizes:clean};
}
export function validateUniformFilters(filters={}) {
 if(!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).some(k=>!UNIFORM_FILTER_FIELDS.includes(k)))throw Error('Check the member group filters.');
 return Object.fromEntries(UNIFORM_FILTER_FIELDS.map(key=>{const list=filters[key]||[];if(!Array.isArray(list)||list.length>100||list.some(v=>typeof v!=='string'||v.length>120))throw Error('Check the member group filters.');return [key,[...new Set(list)]];}));
}
export const uniformTemplateMatches=(template,member)=>UNIFORM_FILTER_FIELDS.every(key=>!template.filters?.[key]?.length||template.filters[key].includes(member[key]||''));
export function eligibleUniformItems(items,templates,member,category) {
 const active=items.filter(i=>!i.archived_at&&i.category_id===category),ids=new Set(active.map(i=>i.id));
 const matches=templates.filter(t=>!t.archived_at&&uniformTemplateMatches(t,member)&&t.item_ids.some(id=>ids.has(id)));
 if(!matches.length)return [];
 const specificity=t=>UNIFORM_FILTER_FIELDS.filter(key=>t.filters?.[key]?.length).length;
 matches.sort((a,b)=>(b.priority||0)-(a.priority||0)||specificity(b)-specificity(a));
 const best=matches.filter(t=>(t.priority||0)===(matches[0].priority||0)&&specificity(t)===specificity(matches[0])),allowed=new Set(best.flatMap(t=>t.item_ids));
 return active.filter(i=>allowed.has(i.id));
}

export const UNIFORM_REASON_CODES=['unfit_size','worn','other'];
export function uniformApplicationReason(line) {
 if(!['new','exchange'].includes(line.mode))throw Error('Choose a valid application type.');
 if(line.mode==='new')return {reason_code:null,reason:''};
 const code=line.reason_code||null;
 if(code!==null&&!UNIFORM_REASON_CODES.includes(code))throw Error('Choose a listed exchange reason.');
 if(line.reason!=null&&typeof line.reason!=='string')throw Error('Check the exchange reason.');
 const text=String(line.reason||'').trim();if(text.length>2000)throw Error('Use at most 2000 characters for the reason.');
 return {reason_code:code,reason:code==='other'?text:code==='unfit_size'?'Unfit size':code==='worn'?'Worn':''};
}
