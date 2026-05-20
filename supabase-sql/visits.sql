-- Jalankan SEKALI di Supabase SQL Editor (project plwythqedzgmsfnjqznp)

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  visited_at timestamptz not null default now(),
  purpose text not null default 'visit', -- 'visit' atau 'borrow'
  note text
);

alter table public.visits enable row level security;

create policy "visits read own or teacher" on public.visits
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'teacher'));

create policy "teacher manage visits" on public.visits
  for all to authenticated
  using (public.has_role(auth.uid(), 'teacher'))
  with check (public.has_role(auth.uid(), 'teacher'));

create index if not exists visits_user_id_idx on public.visits(user_id);
create index if not exists visits_visited_at_idx on public.visits(visited_at desc);