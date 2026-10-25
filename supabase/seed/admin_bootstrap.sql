-- Replace email, then run after the future admin signs in once.
update public.users set role='admin', is_active=true where lower(email)=lower('coordinator@school.edu');
insert into public.school_years(label,is_active) values('2026-2027',true) on conflict(label) do update set is_active=true;
insert into public.blocks(school_year_id,label,status) select id,'Block 1','setup' from public.school_years where is_active=true on conflict do nothing;
