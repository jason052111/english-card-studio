create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  word text not null,
  pronunciation text not null default '',
  meaning text not null default '',
  explanation text not null default '',
  example_sentence text not null default '',
  note text not null default '',
  favorite boolean not null default false,
  seen_count integer not null default 0 check (seen_count >= 0),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists groups_user_name_unique
  on public.groups (user_id, lower(btrim(name)));

create unique index if not exists words_user_group_word_unique
  on public.words (user_id, group_id, lower(btrim(word)));

create index if not exists groups_user_created_idx
  on public.groups (user_id, created_at);

create index if not exists words_user_group_seen_idx
  on public.words (user_id, group_id, seen_count, last_seen_at);

create index if not exists words_user_favorite_seen_idx
  on public.words (user_id, favorite, seen_count, last_seen_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists words_set_updated_at on public.words;
create trigger words_set_updated_at
before update on public.words
for each row execute function public.set_updated_at();

alter table public.groups enable row level security;
alter table public.words enable row level security;

revoke all on table public.groups from anon, authenticated;
revoke all on table public.words from anon, authenticated;

grant select, insert, update, delete on table public.groups to authenticated;
grant select, insert, update, delete on table public.words to authenticated;

drop policy if exists "Users can read their groups" on public.groups;
create policy "Users can read their groups"
on public.groups for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can create their groups" on public.groups;
create policy "Users can create their groups"
on public.groups for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their groups" on public.groups;
create policy "Users can update their groups"
on public.groups for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their groups" on public.groups;
create policy "Users can delete their groups"
on public.groups for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can read their words" on public.words;
create policy "Users can read their words"
on public.words for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can create their words" on public.words;
create policy "Users can create their words"
on public.words for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.groups
    where groups.id = words.group_id
      and groups.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can update their words" on public.words;
create policy "Users can update their words"
on public.words for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.groups
    where groups.id = words.group_id
      and groups.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can delete their words" on public.words;
create policy "Users can delete their words"
on public.words for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
