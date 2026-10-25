create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.users(id,email,full_name,role)
  values(new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', new.email), 'student')
  on conflict(id) do update set email=excluded.email, full_name=excluded.full_name, updated_at=now();
  update public.students set linked_user_id=new.id where lower(student_email)=lower(new.email) and linked_user_id is null;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update on auth.users for each row execute function public.handle_new_user();
