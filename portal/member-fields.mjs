export const DEPARTMENTS = ['Orchestra','Windband','Choir','Keyboard','Transportation','Safety & Security','Internal affairs','Medic','Scientific research','Special operation','Investigation & Statistics','Intelligence','Editorial board','Logistics & support'];
export const OCCUPATIONS = {Orchestra:['orchestra-strings','orchestra-woodwind','orchestra-brasswind','percussion'],Windband:['windband-woodwind','windband-brasswind','percussion'],Choir:['soprano','mezzo-soprano','alto','tenor','bass'],Keyboard:['none']};
export const INSTRUMENTS = {
 'orchestra-strings':['Violin','Viola','Cello','Contrabass'],
 woodwind:['Flute','Clarinet','Oboe','English horn','Saxophone','Bassoon'],
 brasswind:['Trumpet','French horn','Trombone','Tenor horn','Baritone','Tuba'],
 percussion:['Timpani','Cymbals','Snare drum','Bass drum'],
 none:['Piano','Harpsichord','Accordion']
};
export const CLASSIFICATIONS = ['enlist','officer','instructor','civilian'];
export const RANKS = {
 enlist:['Trainee','Private','Private First Class','Corporal','Sergeant','Staff Sergeant','Third Sergeant Major','Second Sergeant Major','First Sergeant Major'],
 officer:['Cadet','Second Lieutenant','First Lieutenant','Captain','Major','Lieutenant Colonel','Colonel','Major General','Lieutenant General','General'],
 civilian:['Level 3 Junior Staff','Level 2 Junior Staff','Level 1 Junior Staff','Level 3 Intermediate Staff','Level 2 Intermediate Staff','Level 1 Intermediate Staff','Level 3 Senior Staff','Level 2 Senior Staff','Level 1 Senior Staff'],
 instructor:['Junior instructor','Intermediate instructor','Senior instructor']
};
export const MEMBER_STATUSES=['active','reserve','probationary','retired'];
export const occupationsFor=department=>OCCUPATIONS[department]||(DEPARTMENTS.includes(department)?['other']:[]);
export const instrumentsFor=occupation=>INSTRUMENTS[occupation]||INSTRUMENTS[String(occupation).split('-').at(-1)]||[];
export const titleCase=value=>value?value[0].toUpperCase()+value.slice(1):'Not assigned';
export function validateMember(input,{creating=false}={}) {
 const text=n=>String(input[n]??'').trim();
 const member={full_name:text('full_name'),email:text('email').toLowerCase(),username:text('username').toLowerCase()||null,department:text('department')||null,occupation_type:text('occupation_type')||null,instrument:text('instrument')||null,classification:text('classification')||null,rank:text('rank')||null,member_status:text('member_status')||'active'};
 if(!member.full_name||member.full_name.length>120)throw Error('Enter a name of at most 120 characters.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)||member.email.length>254)throw Error('Enter a valid email address.');
 if((creating&&!member.username)||(member.username&&!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(member.username)))throw Error('Username must have 3–40 letters, numbers, dots, underscores or hyphens, and start with a letter or number.');
 if(creating&&!member.department)throw Error('Choose a department.');
 if(member.department&&!DEPARTMENTS.includes(member.department))throw Error('Choose a listed department.');
 if(member.department){if(!occupationsFor(member.department).includes(member.occupation_type))throw Error('Choose an occupation for this department.');const allowed=instrumentsFor(member.occupation_type);if(allowed.length?!allowed.includes(member.instrument):member.instrument!==null)throw Error('Choose a specific for this occupation, or None for other occupations.');}
 else if(member.occupation_type||member.instrument)throw Error('Choose the department before its occupation and specific.');
 if((creating&&!member.classification)||(member.classification&&!CLASSIFICATIONS.includes(member.classification)))throw Error('Choose a classification.');
 if(member.classification?!RANKS[member.classification].includes(member.rank):Boolean(member.rank))throw Error('Choose a rank for this classification.');
 if(['Trainee','Cadet'].includes(member.rank))member.member_status='probationary';
 if(!MEMBER_STATUSES.includes(member.member_status))throw Error('Choose a listed member status.');
 return member;
}

export const isTrainingRank=rank=>['Trainee','Cadet'].includes(rank);
export const MEMBER_FILTER_FIELDS=['department','occupation_type','instrument','classification','rank','member_status'];
export const filterMembers=(members,filters)=>members.filter(member=>MEMBER_FILTER_FIELDS.every(key=>!filters[key]?.length||filters[key].includes(member[key]||'')));
