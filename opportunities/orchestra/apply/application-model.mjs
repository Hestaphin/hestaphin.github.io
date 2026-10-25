export const APPLICATION_SECTIONS=['orchestra','keyboard','windband','choir'];
export const KEYBOARD_INSTRUMENTS=['Piano','Harpsichord','Organ','Accordion'];
export const VOICE_PARTS=['soprano','mezzo-soprano','alto','tenor','bass'];
export const applicationReference=value=>'OA-'+String(value).padStart(6,'0');
export function validateApplication(input) {
 const clean=(value,max,required=false)=>{if(typeof value!=='string')value='';value=value.trim();if((required&&!value)||value.length>max)throw Error('Check the required fields and text lengths.');return value;};
 const out={full_name:clean(input.full_name,120,true),email:clean(input.email,254,true).toLowerCase(),institution:clean(input.institution,240,true),phone_wechat:clean(input.phone_wechat,120,true),gender:clean(input.gender,60),sections:{}};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))throw Error('Enter a valid email address.');
 let selected=0;
 for(const key of APPLICATION_SECTIONS){
  const section=input.sections?.[key];
  if(!section||typeof section.apply!=='boolean')throw Error('Choose the groups you wish to apply for.');
  if(!section.apply){out.sections[key]={apply:false};continue;}
  selected++;
  const result={apply:true,notes:clean(section.notes,2000)};
  if(key==='choir'){
   if(!Array.isArray(section.voice_parts)||!section.voice_parts.length||section.voice_parts.some(v=>!VOICE_PARTS.includes(v)))throw Error('Choose your voice part for Choir.');
   result.voice_parts=[...new Set(section.voice_parts)];
   result.experience=clean(section.experience,2000,true);
  }else if(key==='keyboard'){
   if(!Array.isArray(section.instruments)||!section.instruments.length||section.instruments.some(v=>!KEYBOARD_INSTRUMENTS.includes(v)))throw Error('Choose at least one keyboard instrument.');
   result.instruments=[...new Set(section.instruments)];
  }else{
   result.instruments=clean(section.instruments,500,true);
   result.experience=clean(section.experience,2000,true);
  }
  if(key!=='keyboard'){
   if(typeof section.accept_assignment!=='boolean')throw Error('Choose whether you accept reassignment for each selected group.');
   result.accept_assignment=section.accept_assignment;
  }
  out.sections[key]=result;
 }
 if(!selected)throw Error('Choose at least one group to apply for.');
 return out;
}
