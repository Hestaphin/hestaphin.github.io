-- Orchestra project: applications and Choir/Keyboard personnel.
begin;
create or replace function public.portal_validate_member_fields() returns trigger language plpgsql set search_path='' as $$
begin
 if new.username is not null and new.username !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then raise exception 'Invalid username'; end if;
 if new.department is not null and not(new.department=any(array['Orchestra','Windband','Choir','Keyboard','Transportation','Safety & Security','Internal affairs','Medic','Scientific research','Special operation','Investigation & Statistics','Intelligence','Editorial board','Logistics & support'])) then raise exception 'Invalid department'; end if;
 if new.department is null and (new.occupation_type is not null or new.instrument is not null) then raise exception 'Department is required'; end if;
 if new.department='Orchestra' and (new.occupation_type is null or not(new.occupation_type=any(array['orchestra-strings','orchestra-woodwind','orchestra-brasswind','percussion']))) then raise exception 'Invalid occupation'; end if;
 if new.department='Windband' and (new.occupation_type is null or not(new.occupation_type=any(array['windband-woodwind','windband-brasswind','percussion']))) then raise exception 'Invalid occupation'; end if;
 if new.department is not null and new.department not in ('Orchestra','Windband','Choir','Keyboard') and new.occupation_type is distinct from 'other' then raise exception 'Invalid occupation'; end if;
 if new.department='Choir' and (new.occupation_type is null or not(new.occupation_type=any(array['soprano','mezzo-soprano','alto','tenor','bass'])) or new.instrument is not null) then raise exception 'Invalid Choir occupation or instrument'; end if;
 if new.department='Keyboard' and (new.occupation_type is distinct from 'none' or new.instrument is null or not(new.instrument=any(array['Piano','Harpsichord','Accordion']))) then raise exception 'Invalid Keyboard occupation or instrument'; end if;
 if new.occupation_type='orchestra-strings' and (new.instrument is null or not(new.instrument=any(array['Violin','Viola','Cello','Contrabass']))) then raise exception 'Invalid instrument'; end if;
 if new.occupation_type in ('orchestra-woodwind','windband-woodwind') and (new.instrument is null or not(new.instrument=any(array['Flute','Clarinet','Oboe','English horn','Saxophone','Bassoon']))) then raise exception 'Invalid instrument'; end if;
 if new.occupation_type in ('orchestra-brasswind','windband-brasswind') and (new.instrument is null or not(new.instrument=any(array['Trumpet','French horn','Trombone','Tenor horn','Baritone','Tuba']))) then raise exception 'Invalid instrument'; end if;
 if new.occupation_type='percussion' and (new.instrument is null or not(new.instrument=any(array['Timpani','Cymbals','Snare drum','Bass drum']))) then raise exception 'Invalid instrument'; end if;
 if new.occupation_type='other' and new.instrument is not null then raise exception 'Other occupations have no instrument'; end if;
 if new.classification is not null and not(new.classification=any(array['enlist','officer','instructor','civilian'])) then raise exception 'Invalid classification'; end if;
 if new.classification is null and new.rank is not null then raise exception 'Classification is required'; end if;
 if new.classification='enlist' and (new.rank is null or not(new.rank=any(array['Trainee','Private','Private First Class','Corporal','Sergeant','Staff Sergeant','Third Sergeant Major','Second Sergeant Major','First Sergeant Major']))) then raise exception 'Invalid rank'; end if;
 if new.classification='officer' and (new.rank is null or not(new.rank=any(array['Cadet','Second Lieutenant','First Lieutenant','Captain','Major','Lieutenant Colonel','Colonel','Major General','Lieutenant General','General']))) then raise exception 'Invalid rank'; end if;
 if new.classification='civilian' and (new.rank is null or not(new.rank=any(array['Level 3 Junior Staff','Level 2 Junior Staff','Level 1 Junior Staff','Level 3 Intermediate Staff','Level 2 Intermediate Staff','Level 1 Intermediate Staff','Level 3 Senior Staff','Level 2 Senior Staff','Level 1 Senior Staff']))) then raise exception 'Invalid rank'; end if;
 if new.classification='instructor' and (new.rank is null or not(new.rank=any(array['Junior instructor','Intermediate instructor','Senior instructor']))) then raise exception 'Invalid rank'; end if;
 if not(new.member_status=any(array['active','reserve','probationary','retired'])) then raise exception 'Invalid member status'; end if;
 return new;
end $$;
revoke all on function public.portal_validate_member_fields() from public,anon,authenticated;

commit;
